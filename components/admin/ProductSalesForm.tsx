import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Trash2, Plus, Minus, Package, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { createProductSale, getProductSalesByDate, deleteProductSale, getInventoryItems, type InventoryItem } from '../../lib/api/product-sales';
import { formatDate } from '../../shared/utils/date';

interface ProductSaleItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  inventoryItemId?: string | null;
}

interface ProductSalesFormProps {
  userId?: string;
  selectedDate?: string;
  onSalesChange?: () => void;
}

export const ProductSalesForm: React.FC<ProductSalesFormProps> = ({
  userId = '',
  selectedDate = formatDate(new Date()),
  onSalesChange,
}) => {
  const [inputMode, setInputMode] = useState<'inventory' | 'manual'>('inventory');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<string>('');
  const [manualProductName, setManualProductName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');

  // Сохраненные продажи (из БД)
  const [savedSalesItems, setSavedSalesItems] = useState<ProductSaleItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Загрузка товаров со склада
  const loadInventoryItems = async () => {
    try {
      const items = await getInventoryItems();
      setInventoryItems(items.filter((item) => item.current_quantity > 0));
    } catch (error) {
      console.error('[ProductSalesForm] Ошибка загрузки товаров:', error);
    }
  };

  useEffect(() => {
    loadInventoryItems();
  }, []);

  // Загрузка сохраненных продаж за день
  const loadSavedSales = async () => {
    setLoading(true);
    try {
      const sales = await getProductSalesByDate(selectedDate);
      setSavedSalesItems(sales.map((s) => ({
        id: s.id,
        productName: s.product_name,
        quantity: s.quantity,
        price: s.price_per_unit,
        inventoryItemId: s.inventory_item_id || undefined,
      })));
    } catch (error) {
      console.error('[ProductSalesForm] Ошибка загрузки продаж:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSavedSales();
  }, [selectedDate]);

  // Сброс формы при смене режима ввода
  useEffect(() => {
    setSelectedInventoryItem('');
    setManualProductName('');
    setQuantity(1);
    setPrice('');
  }, [inputMode]);

  // Сохранение продажи (сразу в БД)
  const handleSaveSale = async () => {
    if (!userId) {
      alert('Необходимо авторизоваться');
      return;
    }

    const productName = inputMode === 'inventory'
      ? inventoryItems.find(item => item.id === selectedInventoryItem)?.name || ''
      : manualProductName;

    if (!productName.trim()) {
      alert('Введите название товара');
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Введите корректную цену');
      return;
    }

    setSaving(true);
    try {
      // Сохраняем продажу
      await createProductSale({
        product_name: productName,
        quantity: quantity,
        price_per_unit: priceNum,
        inventory_item_id: inputMode === 'inventory' ? selectedInventoryItem : undefined,
      }, userId);

      // Перезагружаем сохраненные продажи
      await loadSavedSales();

      // Перезагружаем товары со склада (обновились остатки)
      await loadInventoryItems();

      // Сброс формы
      setSelectedInventoryItem('');
      setManualProductName('');
      setQuantity(1);
      setPrice('');

      // Уведомляем родительский компонент об изменениях
      onSalesChange?.();

      alert('Продажа успешно сохранена!');
    } catch (error) {
      console.error('[ProductSalesForm] Ошибка сохранения продажи:', error);
      alert('Не удалось сохранить продажу');
    } finally {
      setSaving(false);
    }
  };

  // Удаление сохраненной продажи из БД
  const handleDeleteSavedSale = async (id: string) => {
    if (!confirm('Удалить эту продажу?')) return;

    try {
      await deleteProductSale(id);
      setSavedSalesItems(savedSalesItems.filter(item => item.id !== id));
      // Перезагружаем товары со склада (товар вернулся на склад)
      await loadInventoryItems();
      // Уведомляем родительский компонент об изменениях
      onSalesChange?.();
    } catch (error) {
      console.error('[ProductSalesForm] Ошибка удаления продажи:', error);
      alert('Не удалось удалить продажу');
    }
  };

  // Форматирование суммы
  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  // Общая сумма всех продаж
  const totalAmount = savedSalesItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  return (
    <div className="space-y-4">
      {/* Переключатель режима ввода */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={inputMode === 'inventory' ? 'default' : 'outline'}
          onClick={() => setInputMode('inventory')}
          className="flex-1 gap-2"
        >
          <Package className="w-4 h-4" />
          Выбор со склада
        </Button>
        <Button
          type="button"
          variant={inputMode === 'manual' ? 'default' : 'outline'}
          onClick={() => setInputMode('manual')}
          className="flex-1 gap-2"
        >
          <ShoppingCart className="w-4 h-4" />
          Ручной ввод
        </Button>
      </div>

      {/* Форма добавления товара */}
      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="space-y-4">
          {/* Выбор товара */}
          {inputMode === 'inventory' ? (
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Товар со склада</label>
              <Select value={selectedInventoryItem} onValueChange={setSelectedInventoryItem}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите товар" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} (ост: {item.current_quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Название товара</label>
              <Input
                placeholder="Введите название товара"
                value={manualProductName}
                onChange={(e) => setManualProductName(e.target.value)}
              />
            </div>
          )}

          {/* Количество */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Количество</label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Цена */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Цена за единицу (₽)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-gray-500 font-medium">₽</span>
            </div>
          </div>

          {/* Кнопка сохранения продажи */}
          <Button
            type="button"
            onClick={handleSaveSale}
            className="w-full"
            disabled={saving || loading || !((inputMode === 'inventory' ? selectedInventoryItem : manualProductName) && price)}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Сохранение...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Сохранить продажу
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Сохраненные продажи */}
      {savedSalesItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-3"
        >
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Продажи за день:</h3>
            {savedSalesItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{item.productName}</div>
                  <div className="text-sm text-gray-600">
                    {formatMoney(item.price)}₽ × {item.quantity} = {formatMoney(item.quantity * item.price)}₽
                  </div>
                </div>
                <Badge variant="secondary" className="px-3 py-1">
                  {item.quantity}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteSavedSale(item.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* ИТОГО за день */}
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-purple-600" />
                <span className="text-lg font-semibold text-gray-900">ИТОГО за день:</span>
              </div>
              <span className="text-2xl font-bold text-purple-600">{formatMoney(totalAmount)}₽</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Загрузка */}
      {loading && savedSalesItems.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      )}

      {/* Нет товаров */}
      {!loading && savedSalesItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <div className="font-medium">Нет продаж за этот день</div>
        </div>
      )}
    </div>
  );
};
