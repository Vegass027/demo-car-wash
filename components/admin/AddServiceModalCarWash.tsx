import React, { useState } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Calculator, CheckCircle, Circle, Tag, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getServicePrice, Service } from '../../lib/api/services';
import { CarType } from '../../types';

interface AddServiceModalCarWashProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (serviceIds: string[], discount: number) => void;
  existingServices: string[];
  services?: Service[];
  carType: CarType;
}

export const AddServiceModalCarWash: React.FC<AddServiceModalCarWashProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingServices,
  services = [],
  carType,
}) => {
  // Для автомойки используем просто массив ID (выбран/не выбран)
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Переключение услуги (просто да/нет, без количества)
  const handleToggleService = (serviceId: string, price: number) => {
    if (selectedServices.includes(serviceId)) {
      // Убираем услугу из списка
      setSelectedServices(prev => prev.filter(id => id !== serviceId));
      setTotalPrice(p => p - price);
    } else {
      // Добавляем услугу в список
      setSelectedServices(prev => [...prev, serviceId]);
      setTotalPrice(p => p + price);
    }
  };

  // Добавить выбранные услуги (просто массив ID, quantity добавит родительский компонент)
  const handleAddServices = () => {
    // Для автомойки передаем просто массив ID услуг и скидку
    // Родительский компонент сам добавит quantity: 1 для каждой услуги
    onAdd(selectedServices, discountAmount);
    // Очищаем список выбранных услуг
    setSelectedServices([]);
    setTotalPrice(0);
    setDiscountAmount(0);
    // Закрываем модальное окно
    onClose();
  };

  // Сбросить выбор при закрытии
  const handleClose = () => {
    setSelectedServices([]);
    setTotalPrice(0);
    setDiscountAmount(0);
    onClose();
  };

  const availableServices = services
    .filter(s => 
      s.allow_multiple ? true : !existingServices.includes(s.id)
    )
    .filter(s => 
      // Исключаем незамерзайки - их можно добавлять только через мастер заказа
      !['antifreeze-org', 'antifreeze-umc'].includes(s.service_id)
    );

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-transparent data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md gap-4 border bg-white p-6 shadow-lg rounded-lg z-[160] flex flex-col max-h-[90vh] overflow-hidden pointer-events-auto">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-bold">Добавить услугу / скидку</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4 flex-1 overflow-y-auto min-h-0">
          {/* Инпут для скидки - в самом начале */}
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <Label className="text-sm font-medium text-purple-800 mb-2 block flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Скидка (опционально)
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0"
                value={discountAmount || ''}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setDiscountAmount(value >= 0 ? value : 0);
                }}
                className="flex-1"
                min="0"
              />
              {discountAmount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDiscountAmount(0)}
                  className="flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              )}
            </div>
          </div>

          <Label className="text-gray-500 text-xs uppercase tracking-wider block">Выберите услуги</Label>

          {/* Простой список для услуг автомойки (без категорий, просто галочки) */}
          <div className="space-y-3">
            {availableServices.map((service) => {
              const servicePrice = getServicePrice(service, carType);
              const isSelected = selectedServices.includes(service.id);
              return (
                <div
                  key={service.id}
                  onClick={() => handleToggleService(service.id, servicePrice)}
                  className={cn(
                    "flex items-center justify-between border p-3 rounded-lg transition-colors cursor-pointer",
                    isSelected ? "border-primary bg-blue-50" : "hover:border-primary hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {/* Галочка: выбрано/не выбрано */}
                    {isSelected ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="text-sm font-medium">{service.name}</div>
                      <div className="text-xs text-gray-500">{servicePrice} ₽</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {availableServices.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                Все услуги уже добавлены
              </div>
            )}
          </div>
        </div>

        {(selectedServices.length > 0 || discountAmount > 0) && (
          <div className="space-y-3 pt-4 border-t mt-4 flex-shrink-0">
            {/* Показать скидку если есть */}
            {discountAmount > 0 && (
              <div className="flex justify-between items-center text-purple-600 bg-purple-50 p-3 rounded-lg">
                <span className="font-medium flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Скидка:
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">-{discountAmount} ₽</span>
                  <button
                    onClick={() => setDiscountAmount(0)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Финальная цена */}
            <div className="bg-black text-white p-4 rounded-xl flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                <span className="font-medium">Всего:</span>
              </div>
              <span className="text-xl font-bold">{Math.max(0, totalPrice - discountAmount)} ₽</span>
            </div>

            <Button className="w-full h-12" onClick={handleAddServices}>
              {selectedServices.length > 0
                ? `Добавить (${selectedServices.length} шт)`
                : 'Применить скидку'}
            </Button>
          </div>
        )}

        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          ✕
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
