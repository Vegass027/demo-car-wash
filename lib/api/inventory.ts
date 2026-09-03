/**
 * API функции для работы со складом
 *
 * Issue 9: photo upload moved server-side (api/staff.ts:inventoryArrivalAction).
 * The browser-direct uploadInventoryPhotos() was deleted because storage RLS
 * (auth.jwt() ->> 'app_role') cannot read our custom staff JWT's app_role
 * claim — Supabase Auth does not surface claims from JWTs minted by
 * api/login.ts:signJwt. Server-side upload through service_role bypasses RLS
 * (mirroring Issue 3 for expense-receipts).
 */

import { supabase } from '@/lib/supabase';
import { generateUUID } from '@/shared/utils/uuid';
import {
  addInventoryCategoryViaStaff,
  deleteInventoryCategoryViaStaff,
  restockInventoryViaStaff,
  recordInventoryArrivalViaStaff,
  signInventoryPhotosViaStaff,
} from './staff-actions';

// ============================================
// КАТЕГОРИИ
// ============================================

export async function getInventoryCategories() {
  const { data, error } = await supabase
    .from('inventory_categories')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data;
}

export async function addInventoryCategory(name: string, unit: string) {
  return await addInventoryCategoryViaStaff(name, unit);
}

export async function deleteInventoryCategory(categoryId: string) {
  return await deleteInventoryCategoryViaStaff(categoryId);
}

// ============================================
// ТОВАРЫ
// ============================================

export async function getInventoryItems() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      category:inventory_categories(*)
    `)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data;
}

export async function getInventoryItem(itemId: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      category:inventory_categories(*)
    `)
    .eq('id', itemId)
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// ПРИХОД ТОВАРА
// ============================================

export async function recordInventoryArrival(params: {
  itemId: string;
  quantity: number;
  totalPrice: number;
  deliveryDate: string;
  photos?: File[];
  notes?: string;
  operationId?: string;
  userId: string; // server-stamps p_created_by from JWT, ignored here
}) {
  // Генерируем или используем переданный operationId
  const opId = params.operationId || generateUUID();

  // 1. Идемпотентность-проверка через SELECT inventory_arrivals (browser-direct).
  //    RLS позволяет SELECT для admin/owner через staff_select_inventory_arrivals.
  //    PGRST116 (406) = нормальный путь, записи ещё нет.
  try {
    const { data: existing } = await supabase
      .from('inventory_arrivals')
      .select('id')
      .eq('operation_id', opId)
      .single();

    if (existing) {
      console.log('[recordInventoryArrival] Operation already exists:', opId);
      return existing;
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
      console.log('[recordInventoryArrival] Operation not found (expected), proceeding...');
    } else if (error) {
      console.error('[recordInventoryArrival] Error checking existing operation:', error);
      throw error;
    }
  }

  // 2. Issue 9: convert File objects to base64 for server-side upload via
  //    dispatcher. The dispatcher (api/staff.ts:inventoryArrivalAction)
  //    validates mime + magic bytes + size, then uploads through
  //    supabaseAdmin (service_role, bypasses storage RLS) using
  //    api/_lib/inventory-photos.mjs helpers.
  //
  //    Replaces the browser-direct uploadInventoryPhotos() that was deleted
  //    (see module header comment).
  const photosB64: Array<{ mime: string; base64: string }> = [];
  if (params.photos && params.photos.length > 0) {
    for (const file of params.photos) {
      // Prefer file.type (browser-detected MIME); fallback to octet-stream.
      const mime = file.type && file.type.length > 0 ? file.type : 'application/octet-stream';
      const buf = await file.arrayBuffer();
      const base64 = bytesToBase64(new Uint8Array(buf));
      photosB64.push({ mime, base64 });
    }
  }

  // 3. Dispatcher proxy: uploads photos server-side, then writes inventory_arrivals row.
  const result = await recordInventoryArrivalViaStaff({
    itemId: params.itemId,
    quantity: params.quantity,
    totalPrice: params.totalPrice,
    deliveryDate: params.deliveryDate,
    photosB64: photosB64.length > 0 ? photosB64 : null,
    notes: params.notes || null,
    operationId: opId,
  });

  return result.arrival;
}

// ============================================
// ПЕРЕСЧЁТ ОСТАТКОВ
// ============================================

export async function recordInventoryRestock(params: {
  itemId: string;
  quantity: number;
  notes?: string;
  userId: string; // DEPRECATED in Slice #3d Step 0 — server-stamped from JWT
}) {
  return await restockInventoryViaStaff(
    params.itemId,
    params.quantity,
    params.notes || null
  );
}

// ============================================
// ИСТОРИЯ ПРИХОДА
// ============================================

export async function getInventoryArrivals(
  itemId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  let query = supabase
    .from('inventory_arrivals')
    .select('*')
    .order('delivery_date', { ascending: false });

  if (itemId) {
    query = query.eq('item_id', itemId);
  }

  if (dateFrom) {
    query = query.gte('delivery_date', dateFrom);
  }

  if (dateTo) {
    query = query.lte('delivery_date', dateTo);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

// ============================================
// ЛОГ ОПЕРАЦИЙ
// ============================================

export async function getInventoryOperations(
  itemId?: string,
  limit: number = 50
) {
  let query = supabase
    .from('inventory_operations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (itemId) {
    query = query.eq('item_id', itemId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

// ============================================
// HELPERS
// ============================================

// Uint8Array → base64 string. Browser-only (uses btoa + String.fromCharCode).
// Kept local — no other call site needs it. If reused, lift to shared/utils.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(binary);
}

// ============================================
// PHOTO URLS (Issue 9 Variant B)
// ============================================
//
// Server-stored inventory_arrivals.photos ARRAY contains storage PATHS
// (not signed URLs). The UI fetches fresh signed URLs on demand via the
// sign-inventory-photos dispatcher endpoint. This wrapper is what UI
// components call — it hides the dispatcher plumbing and gives back
// ready-to-use <img src> urls.
//
// On any error we return [] so the UI can degrade gracefully (show the
// "Нет чека" placeholder instead of crashing).
export async function getInventoryArrivalPhotoUrls(arrivalId: string): Promise<string[]> {
  try {
    return await signInventoryPhotosViaStaff(arrivalId);
  } catch (error) {
    console.error('[getInventoryArrivalPhotoUrls] failed:', error);
    return [];
  }
}
