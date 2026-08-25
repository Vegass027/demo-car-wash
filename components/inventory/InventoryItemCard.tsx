/**
 * Компонент карточки товара для аккордеона склада
 */

import React, { useState, useEffect, useRef } from 'react';
import { Package, ChartPie, PackageOpen, Trash2, History } from 'lucide-react';
import { InventoryItemUI, InventoryAction, InventoryFormData } from '@/entities/inventory/model';
import { calculateInventoryStats, getStatusIndicator } from '@/features/inventory/lib/calculateStats.tsx';
import { LiquidProgressBar } from '@/components/ui/liquid-progress-bar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getUnitDeclension } from '@/shared/utils/unitDeclension';
import { generateUUID } from '@/shared/utils/uuid';

// Константы для валидации файлов
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

interface InventoryItemCardProps {
  item: InventoryItemUI;
  isOpen: boolean;
  onToggle: () => void;
  onSave: (itemId: string, data: InventoryFormData) => void;
  onDelete?: (categoryId: string) => void;
  onOpenHistory?: () => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  item,
  isOpen,
  onToggle,
  onSave,
  onDelete,
  onOpenHistory,
}) => {
  const stats = calculateInventoryStats(item.currentQuantity, item.baseQuantity);
  const statusIndicator = getStatusIndicator(stats.status);
  const contentRef = useRef<HTMLDivElement>(null);

  // Форма
  const [action, setAction] = useState<InventoryAction>('arrival');
  const [quantity, setQuantity] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingDebounced, setIsSavingDebounced] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Автоматический скроллинг к контенту при раскрытии
  useEffect(() => {
    // Не скроллим если body заблокирован
    if (document.body.style.position === 'fixed') {
      return;
    }

    const isBodyLocked =
      document.body.style.position === 'fixed' ||
      document.body.hasAttribute('data-scroll-locked');

    if (isOpen && contentRef.current && !isBodyLocked) {
      const timer = setTimeout(() => {
        if (!contentRef.current) return;

        // Плавный скролл
        contentRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });

        // Даем Safari время завершить анимацию скролла (300ms)
        // Это предотвращает рассинхронизацию координат
        setTimeout(() => {
          // Принудительный repaint после скролла
          if (contentRef.current) {
            contentRef.current.style.transform = 'translateZ(0)';
            requestAnimationFrame(() => {
              if (contentRef.current) {
                contentRef.current.style.transform = '';
              }
            });
          }
        }, 300); // Ждем завершения smooth анимации

      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Расчет цены за единицу
  const pricePerUnit = quantity && totalPrice && Number(quantity) > 0
    ? (Number(totalPrice) / Number(quantity)).toFixed(2)
    : null;

  // Валидация
  const isQuantityValid = quantity !== '' && Number(quantity) > 0;
  const isPriceValid = action === 'arrival' ? totalPrice !== '' && Number(totalPrice) > 0 : true;
  const isDeliveryDateValid = action === 'arrival' ? deliveryDate !== '' : true;
  const isFormValid = isQuantityValid && isPriceValid && isDeliveryDateValid;

  // Сбрасываем успешное сохранение при изменении полей формы
  useEffect(() => {
    setSaveSuccess(false);
  }, [quantity, totalPrice, deliveryDate, action]);

  // Обработчики
  const handleQuantityChange = (value: string) => {
    // Разрешаем целые и дробные числа (например, 0.5, 3.7)
    if (/^\d*\.?\d*$/.test(value)) {
      setQuantity(value);
    }
  };

  const handlePriceChange = (value: string) => {
    // Разрешаем только числа
    if (/^\d*$/.test(value)) {
      setTotalPrice(value);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    
    // Проверка количества файлов
    if (photos.length + files.length > MAX_FILES) {
      alert(`Максимум ${MAX_FILES} фото. Удалите старые фото.`);
      return;
    }

    // Проверяем формат и размер файлов (только JPG/PNG, максимум 10MB)
    const validFiles = files.filter((file: File) => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      const isValidType = validTypes.includes(file.type);
      const isValidSize = file.size <= MAX_FILE_SIZE;
      
      if (!isValidType) {
        alert(`Файл "${file.name}" имеет неподдерживаемый формат. Только JPG/PNG.`);
      }
      if (!isValidSize) {
        alert(`Файл "${file.name}" слишком большой. Максимум 10MB.`);
      }
      
      return isValidType && isValidSize;
    });

    setPhotos(prev => [...prev, ...validFiles]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!isFormValid) return;

    // Защита от двойных кликов (debounce 500ms)
    if (isSavingDebounced) {
      console.log('[handleSave] Save already in progress, ignoring click');
      return;
    }

    setIsSavingDebounced(true);
    setTimeout(() => setIsSavingDebounced(false), 500);

    setIsSaving(true);
    setSaveSuccess(false);

    // ✅ Генерируем UUID только если его ещё нет (для retry)
    const opId = operationId || generateUUID();
    console.log('[handleSave] Using operationId:', opId, 'isNew:', !operationId);
    
    if (!operationId) {
      setOperationId(opId); // Сохраняем для retry
    }

    try {
      await onSave(item.id, {
        action,
        quantity: Number(quantity),
        totalPrice: action === 'arrival' ? Number(totalPrice) : undefined,
        deliveryDate: action === 'arrival' && deliveryDate ? new Date(deliveryDate) : undefined,
        photos,
        operationId: opId, // ✅ Используем тот же UUID для retry
      });

      // ✅ Успешно - сбрасываем всё
      setOperationId(null);
      setRetryCount(0);
      setSaveSuccess(true);

      // Сбрасываем успешное сохранение через 3 секунды
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);

      // Сбрасываем форму, но НЕ сбрасываем действие на 'arrival'
      setQuantity('');
      setTotalPrice('');
      setDeliveryDate('');
      setPhotos([]);
      // setAction('arrival');  // ← Убрано, чтобы не переключалось на Приход
    } catch (error) {
      console.error('Failed to save inventory:', error);
      
      // ✅ Проверяем лимит retry
      if (retryCount >= 3) {
        alert('Превышен лимит попыток. Попробуйте позже.');
        setOperationId(null); // Сбрасываем UUID
        setRetryCount(0);
      } else {
        setRetryCount(prev => prev + 1);
        alert(`Ошибка сохранения (попытка ${retryCount + 1}/3). Попробуйте снова.`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      {/* Заголовок карточки */}
      <div
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-lg">{item.name}</span>
            {statusIndicator && (
              <>
                <span className="text-gray-300 mx-1">|</span>
                <span className="text-lg">{statusIndicator}</span>
              </>
            )}
            {onDelete && (
              <>
                <span className="text-gray-300 mx-1">|</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.categoryId);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
          
          {/* Прогресс-бар с эффектом воды и пузырьками */}
          <div className="mt-2">
            <LiquidProgressBar
              value={stats.percentage}
              showPercentage={true}
              color="teal"
            />
          </div>
          
          {/* Бейдж с количеством */}
          <div className="mt-2 flex items-center justify-center">
            <Badge variant="outline" className="text-sm font-semibold">
              <PackageOpen className="w-4 h-4 mr-1" />
              В наличии: {item.currentQuantity % 1 === 0 ? item.currentQuantity : item.currentQuantity.toFixed(2).replace(/\.?0+$/, '')} {getUnitDeclension(item.currentQuantity, item.unit)}
            </Badge>
          </div>
        </div>

        {/* Стрелка */}
        <div className="ml-4 text-gray-400">
          {isOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {/* Раскрытая форма */}
      {isOpen && (
        <div ref={contentRef} className="px-4 pb-4 bg-gray-50">
          <div className="border-t border-gray-200 pt-4">
            {/* Кнопки выбора действия */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Button
                type="button"
                variant={action === 'arrival' ? 'default' : 'outline'}
                onClick={() => setAction('arrival')}
                className="w-full"
              >
                <Package className="w-4 h-4 mr-2" />
                Приход
              </Button>
              <Button
                type="button"
                variant={action === 'restock' ? 'default' : 'outline'}
                onClick={() => setAction('restock')}
                className="w-full"
              >
                <ChartPie className="w-4 h-4 mr-2" />
                Остаток
              </Button>
            </div>

            {/* Поле количества */}
            <div className="mb-4">
              <Label htmlFor={`quantity-${item.id}`} className="text-sm font-medium">
                Количество: <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id={`quantity-${item.id}`}
                  type="number"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  placeholder="0"
                  className="flex-1"
                  inputMode="decimal"
                />
                <span className="text-sm text-gray-600 whitespace-nowrap">{getUnitDeclension(Number(quantity) || 0, item.unit)}</span>
              </div>
            </div>

            {/* Поле даты поставки (только для "Приход") */}
            {action === 'arrival' && (
              <div className="mb-4">
                <Label htmlFor={`delivery-date-${item.id}`} className="text-sm font-medium">
                  Дата поставки: <span className="text-red-500">*</span>
                </Label>
                <Input
                  id={`delivery-date-${item.id}`}
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="mt-1"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}

            {/* Поле суммы (только для "Привезли товар") */}
            {action === 'arrival' && (
              <>
                <div className="mb-4">
                  <Label htmlFor={`price-${item.id}`} className="text-sm font-medium">
                    Сумма по накладной: <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id={`price-${item.id}`}
                      type="number"
                      value={totalPrice}
                      onChange={(e) => handlePriceChange(e.target.value)}
                      placeholder="0"
                      className="flex-1"
                      inputMode="numeric"
                    />
                    <span className="text-sm text-gray-600 whitespace-nowrap">₽</span>
                  </div>
                  {/* Подсказка с ценой за единицу */}
                  {pricePerUnit && (
                    <div className="mt-1 text-sm text-blue-600">
                      💡 {pricePerUnit} ₽ за {getUnitDeclension(1, item.unit)}
                    </div>
                  )}
                </div>

                {/* Загрузка фото и история */}
                <div className="mb-4">
                  <Label className="text-sm font-medium mb-2 block">Фото накладной:</Label>
                  <div className="flex gap-2 items-center">
                    <label className="cursor-pointer flex-1">
                      <Input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        multiple
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Загрузить
                      </div>
                    </label>
                    {onOpenHistory && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenHistory()}
                        className="gap-2 h-11 px-3"
                      >
                        <History className="w-4 h-4" />
                        <span className="text-sm">История</span>
                      </Button>
                    )}
                  </div>

                  {/* Превью фото */}
                  {photos.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {photos.map((photo, index) => (
                        <div key={index} className="flex items-center gap-2 bg-white p-2 rounded-lg border">
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="flex-1 text-sm truncate">{photo.name}</span>
                          <button
                            onClick={() => handleRemovePhoto(index)}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Кнопка сохранения */}
            <Button
              onClick={handleSave}
              disabled={!isFormValid || isSaving || isSavingDebounced || retryCount >= 3}
              className="w-full"
              variant={isFormValid ? 'default' : 'secondary'}
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8 0 018 8 0 018-8z"></path>
                  </svg>
                  Сохранение...
                </>
              ) : saveSuccess ? (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Сохранено!
                </>
              ) : (
                'СОХРАНИТЬ'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
