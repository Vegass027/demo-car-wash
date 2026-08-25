/**
 * Страница управления складом для администратора
 */

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { InventoryItemUI, InventoryFormData, InventoryCategory, InventoryArrivalHistory } from '@/entities/inventory/model';
import { inventoryItemToUI, inventoryArrivalToHistory } from '@/entities/inventory/model';
import { InventoryItemCard } from '@/components/inventory/InventoryItemCard';
import { AddCategoryModal } from '@/components/inventory/AddCategoryModal';
import { InventoryHistoryModal } from '@/components/inventory/InventoryHistoryModal';
import { Button } from '@/components/ui/button';
import {
  getInventoryItems,
  getInventoryCategories,
  recordInventoryArrival,
  recordInventoryRestock,
  addInventoryCategory,
  deleteInventoryCategory,
  getInventoryArrivals,
} from '@/lib/api/inventory';

export const Inventory: React.FC<{ userId: string }> = ({ userId }) => {
  const [items, setItems] = useState<InventoryItemUI[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [arrivalHistory, setArrivalHistory] = useState<InventoryArrivalHistory[]>([]);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Загрузка данных
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Показываем loading только при первой загрузке
      if (isInitialLoad) {
        setLoading(true);
      }

      const [itemsData, categoriesData] = await Promise.all([
        getInventoryItems(),
        getInventoryCategories()
      ]);

      // Конвертируем из snake_case в camelCase для UI
      const itemsUI = itemsData.map(inventoryItemToUI);
      setItems(itemsUI);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  // Обработка открытия/закрытия карточки
  const handleToggle = (itemId: string) => {
    if (openItemId === itemId) {
      setOpenItemId(null);
    } else {
      setOpenItemId(itemId);
    }
  };

  // Обработка сохранения данных
  const handleSave = async (itemId: string, data: InventoryFormData) => {
    try {
      // Оптимистичное обновление UI
      const itemIndex = items.findIndex(i => i.id === itemId);
      if (itemIndex !== -1) {
        const updatedItem = { ...items[itemIndex] };
        if (data.action === 'arrival') {
          updatedItem.currentQuantity += data.quantity;
          updatedItem.baseQuantity = updatedItem.currentQuantity;
        } else {
          updatedItem.currentQuantity = data.quantity;
        }
        const newItems = [...items];
        newItems[itemIndex] = updatedItem;
        setItems(newItems);
      }

      if (data.action === 'arrival') {
        // Приход товара
        await recordInventoryArrival({
          itemId,
          quantity: data.quantity,
          totalPrice: data.totalPrice!,
          deliveryDate: data.deliveryDate!.toISOString().split('T')[0],
          photos: data.photos,
          userId, // ✅ Передаем userId
        });
      } else {
        // Пересчёт остатков
        await recordInventoryRestock({
          itemId,
          quantity: data.quantity,
          userId, // ✅ Передаем userId
        });
      }

      // Перезагружаем данные в фоне для синхронизации
      loadData().catch(console.error);
    } catch (error) {
      console.error('Failed to save inventory:', error);
      
      // Показываем детальное сообщение об ошибке
      if (error instanceof Error) {
        alert(`Ошибка сохранения:\n${error.message}\n\nПопробуйте снова или уменьшите размер фото.`);
      } else {
        alert('Ошибка сохранения. Попробуйте снова.');
      }
      
      // При ошибке перезагружаем данные
      loadData();
    }
  };

  // Обработка добавления категории
  const handleAddCategory = async (category: Omit<InventoryCategory, 'id' | 'created_at' | 'updated_at' | 'is_active'>) => {
    try {
      await addInventoryCategory(category.name, category.unit);
      await loadData();
    } catch (error) {
      console.error('Failed to add category:', error);
      alert('Ошибка добавления категории. Попробуйте снова.');
    }
  };

  // Обработка удаления категории
  const handleDeleteItem = async (categoryId: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту категорию?')) {
      return;
    }

    try {
      // Оптимистичное обновление UI - удаляем товары этой категории
      const newItems = items.filter(i => i.categoryId !== categoryId);
      setItems(newItems);

      await deleteInventoryCategory(categoryId);

      // Перезагружаем данные в фоне для синхронизации
      loadData().catch(console.error);
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Ошибка удаления категории. Попробуйте снова.');
      // При ошибке перезагружаем данные
      loadData();
    }
  };

  // Обработка открытия истории
  const handleOpenHistory = async (itemId: string) => {
    try {
      const arrivals = await getInventoryArrivals(itemId);
      const history = arrivals.map(inventoryArrivalToHistory);
      setArrivalHistory(history);
      setHistoryItemId(itemId);
      setIsHistoryModalOpen(true);
      setHistoryKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  // Получаем название товара для модального окна
  const historyItemName = React.useMemo(() => {
    if (!historyItemId) return '';
    const item = items.find(i => i.id === historyItemId);
    return item?.name || '';
  }, [historyItemId, items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="pb-20 pt-safe telegram-safe-area-top animate-in fade-in">
      {/* Заголовок с кнопкой добавления категории */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Склад</h2>
        <Button
          onClick={() => setIsAddCategoryModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Добавить категорию
        </Button>
      </div>

      {/* Аккордеон с товарами */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {items.map(item => (
          <InventoryItemCard
            key={item.id}
            item={item}
            isOpen={openItemId === item.id}
            onToggle={() => handleToggle(item.id)}
            onSave={handleSave}
            onDelete={handleDeleteItem}
            onOpenHistory={() => handleOpenHistory(item.id)}
          />
        ))}
      </div>

      {/* Модальное окно добавления категории */}
      <AddCategoryModal
        isOpen={isAddCategoryModalOpen}
        onClose={() => setIsAddCategoryModalOpen(false)}
        onAdd={handleAddCategory}
      />

      {/* Модальное окно истории прихода */}
      <InventoryHistoryModal
        key={historyKey}
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
        }}
        history={arrivalHistory}
        itemName={historyItemName}
      />
    </div>
  );
};
