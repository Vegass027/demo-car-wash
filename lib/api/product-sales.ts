/**
 * API функции для работы с продажами товаров
 *
 * Issue 4 (Slice #3g): write-операции (create/delete) идут через
 * /api/staff dispatcher, который вызывает SECURITY DEFINER функции
 * create_product_sale_atomic / delete_product_sale_atomic (migration 038).
 *
 * Read-операции (getProductSalesByDate, getProductSalesByPeriod,
 * getInventoryItems) остаются browser-direct — RLS staff_select_* уже
 * гейтит по app_role ∈ {admin, owner}, и dispatcher round-trip не нужен.
 */

import { supabase } from '@/lib/supabase';
import { getSessionToken } from '../_supabase-wrapper';

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
// DISPATCHER HELPER (Issue 4 pattern, mirrors lib/api/expenses.ts)
// ============================================

const STAFF_ENDPOINT = '/api/staff';

async function dispatchStaff<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getSessionToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${STAFF_ENDPOINT}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json?.error as string) || `${action}_failed`;
    throw new Error(`${err} (HTTP ${res.status})`);
  }
  const data = json?.data as Record<string, unknown> | undefined;
  return (data ?? (json as Record<string, unknown>)) as T;
}

// ============================================
// WRITES (dispatcher-only)
// ============================================

/**
 * Создать продажу товара (атомарно).
 *
 * @param data - Данные продажи
 * @param _userId - DEPRECATED: server-stamps created_by из JWT claims;
 *                  параметр оставлен для совместимости сигнатуры с
 *                  components/admin/ProductSalesForm.tsx
 * @returns Созданная продажа (с серверным total_price)
 *
 * Server-side:
 *   - Списывает inventory_items.current_quantity (если inventory_item_id есть)
 *   - Пишет строку в inventory_operations (operation_type='usage')
 *   - Создаёт product_sales row
 *   - Всё одной транзакцией (SECURITY DEFINER plpgsql).
 *   - product_sales.total_price НЕ передаётся — на DEMO это GENERATED
 *     колонка, наш сервер не пишет туда.
 *   - Если inventory_item_id IS NULL → manual-mode: просто INSERT,
 *     без склада, без операций.
 */
export async function createProductSale(
  data: {
    product_name: string;
    quantity: number;
    price_per_unit: number;
    inventory_item_id?: string;
  },
  _userId: string
): Promise<ProductSale> {
  const res = await dispatchStaff<{
    sale_id: string;
    total_price: number;
    inventory_item_id: string | null;
    quantity: number;
    new_current_quantity: number | null;
    product_name: string | null;
  }>('create-product-sale', {
    product_name: data.product_name,
    quantity: data.quantity,
    price_per_unit: data.price_per_unit,
    inventory_item_id: data.inventory_item_id ?? null,
  });

  // Dispatcher возвращает sale_id + total_price, но фронту нужен полный объект
  // ProductSale. После успешного create читаем через anon SELECT (RLS open для
  // staff). Делаем единичный запрос — никакого N+1.
  //
  // Если readback падает (временная сеть/RLS-сбой), sale row УЖЕ создана в БД
  // server-side атомарно — бросать exception из UI было бы дезинформацией
  // ("не сохранилось" при том что сохранилось). Возвращаем минимальный объект,
  // собранный из полей RPC-ответа + body. UI увидит успех, и при следующем
  // reload (например getProductSalesByDate) полный объект появится естественно.
  try {
    const { data: row, error } = await supabase
      .from('product_sales')
      .select('*')
      .eq('id', res.sale_id)
      .single();

    if (error || !row) {
      console.warn('[createProductSale] post-insert readback failed (returning minimal object):', error?.message);
      return {
        id: res.sale_id,
        product_name: res.product_name ?? data.product_name,
        quantity: res.quantity,
        price_per_unit: data.price_per_unit,
        total_price: res.total_price,
        sale_date: new Date().toISOString().slice(0, 10),
        inventory_item_id: res.inventory_item_id ?? undefined,
        created_by: '',
        created_at: new Date().toISOString(),
      };
    }
    return row as ProductSale;
  } catch (readbackErr) {
    console.warn('[createProductSale] post-insert readback threw (returning minimal object):', readbackErr);
    return {
      id: res.sale_id,
      product_name: res.product_name ?? data.product_name,
      quantity: res.quantity,
      price_per_unit: data.price_per_unit,
      total_price: res.total_price,
      sale_date: new Date().toISOString().slice(0, 10),
      inventory_item_id: res.inventory_item_id ?? undefined,
      created_by: '',
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * Удалить продажу (атомарно).
 *
 * Внутри dispatcher:
 *   - SELECT product_sales → читает inventory_item_id + quantity ИЗ ROW
 *   - Если inventory_item_id есть → restock (UPDATE inventory_items +
 *     INSERT inventory_operations operation_type='restock')
 *   - DELETE FROM product_sales
 *   - Всё одной транзакцией.
 *
 * @param saleId - UUID продажи
 */
export async function deleteProductSale(saleId: string): Promise<void> {
  await dispatchStaff<{
    deleted: boolean;
    restocked: boolean;
    inventory_item_id: string | null;
    quantity: number | null;
    new_current_quantity: number | null;
    warning: string | null;
  }>('delete-product-sale', { id: saleId });
}

// ============================================
// READS (browser-direct, RLS-gated)
// ============================================

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
