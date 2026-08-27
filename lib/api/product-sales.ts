/**
 * API функции для работы с продажами товаров
 */

import { supabase } from '@/lib/supabase';
import {
  deductFromInventoryViaStaff,
  restockInventoryViaStaff,
} from './staff-actions';

// ============================================
// ТИПЫ
// ============================================

export interface ProductSale {
  id: string;
  product_name: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  sale_date: string;
  inventory_item_id?: string;
  created_by: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  last_price_per_unit?: number;
}

// ============================================
// ПРОДАЖИ ТОВАРОВ
// ============================================

/**
 * Создать продажу товара
 * @param data - Данные продажи
 * @param userId - ID пользователя, создающего продажу
 * @returns Созданная продажа
 */
export async function createProductSale(
  data: {
    product_name: string;
    quantity: number;
    price_per_unit: number;
    inventory_item_id?: string;
  },
  userId: string
): Promise<ProductSale> {
  console.log('[createProductSale] Creating product sale:', data, 'userId:', userId);

  // Если товар выбран со склада, списываем его
  if (data.inventory_item_id) {
    await deductFromInventory(data.inventory_item_id, data.quantity, userId);
  }

  const { data: saleData, error } = await supabase
    .from('product_sales')
    .insert({
      product_name: data.product_name,
      quantity: data.quantity,
      price_per_unit: data.price_per_unit,
      inventory_item_id: data.inventory_item_id || null,
      created_by: userId
    })
    .select()
    .single();

  if (error) {
    console.error('[createProductSale] Error:', error);
    throw error;
  }

  console.log('[createProductSale] Product sale created:', saleData);
  return saleData;
}

/**
 * Получить продажи за дату
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив продаж
 */
export async function getProductSalesByDate(date: string): Promise<ProductSale[]> {
  console.log('[getProductSalesByDate] Fetching sales for date:', date);

  const { data, error } = await supabase
    .from('product_sales')
    .select('*')
    .eq('sale_date', date)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getProductSalesByDate] Error:', error);
    throw error;
  }

  console.log('[getProductSalesByDate] Sales fetched:', data?.length || 0);
  return data || [];
}

/**
 * Получить продажи за период
 * @param startDate - Начальная дата (YYYY-MM-DD)
 * @param endDate - Конечная дата (YYYY-MM-DD)
 * @returns Массив продаж
 */
export async function getProductSalesByPeriod(
  startDate: string,
  endDate: string
): Promise<ProductSale[]> {
  console.log('[getProductSalesByPeriod] Fetching sales for period:', startDate, 'to', endDate);

  const { data, error } = await supabase
    .from('product_sales')
    .select('*')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getProductSalesByPeriod] Error:', error);
    throw error;
  }

  console.log('[getProductSalesByPeriod] Sales fetched:', data?.length || 0);
  return data || [];
}

/**
 * Удалить продажу
 * @param saleId - ID продажи
 */
export async function deleteProductSale(saleId: string): Promise<void> {
  console.log('[deleteProductSale] Deleting product sale:', saleId);

  // Сначала получаем продажу, чтобы вернуть товар на склад
  const { data: sale } = await supabase
    .from('product_sales')
    .select('inventory_item_id, quantity')
    .eq('id', saleId)
    .single();

  if (sale?.inventory_item_id) {
    // Возвращаем товар на склад
    await addToInventory(sale.inventory_item_id, sale.quantity);
  }

  const { error } = await supabase
    .from('product_sales')
    .delete()
    .eq('id', saleId);

  if (error) {
    console.error('[deleteProductSale] Error:', error);
    throw error;
  }

  console.log('[deleteProductSale] Product sale deleted:', saleId);
}

// ============================================
// ТОВАРЫ СО СКЛАДА
// ============================================

/**
 * Получить товары со склада для селектора
 * @returns Массив товаров
 */
export async function getInventoryItems(): Promise<InventoryItem[]> {
  console.log('[getInventoryItems] Fetching inventory items');

  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      id,
      name,
      unit,
      current_quantity,
      last_price_per_unit
    `)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[getInventoryItems] Error:', error);
    throw error;
  }

  console.log('[getInventoryItems] Items fetched:', data?.length || 0);
  return data || [];
}

/**
 * Списать товар со склада
 *
 * Slice #3d Step 0: dispatcher proxy. Server-stamps p_created_by from JWT;
 * browser no longer passes userId.
 * @param itemId - ID товара
 * @param quantity - Количество для списания
 * @param _userId - DEPRECATED (server-stamped from JWT); kept for signature compat
 */
async function deductFromInventory(
  itemId: string,
  quantity: number,
  _userId: string
): Promise<void> {
  console.log('[deductFromInventory] Deducting from inventory:', itemId, 'quantity:', quantity);
  await deductFromInventoryViaStaff(itemId, quantity, 'Продажа товара');
  console.log('[deductFromInventory] Inventory updated');
}

/**
 * Вернуть товар на склад (при удалении продажи)
 *
 * Slice #3d Step 0: dispatcher proxy.
 * @param itemId - ID товара
 * @param quantity - Количество для возврата
 */
async function addToInventory(
  itemId: string,
  quantity: number
): Promise<void> {
  console.log('[addToInventory] Adding to inventory:', itemId, 'quantity:', quantity);
  await restockInventoryViaStaff(itemId, quantity, 'Отмена продажи товара');
  console.log('[addToInventory] Inventory updated');
}
