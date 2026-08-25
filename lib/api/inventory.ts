/**
 * API функции для работы со складом
 */

import { supabase } from '@/lib/supabase';
import { generateUUID } from '@/shared/utils/uuid';

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
  const { data, error } = await supabase.rpc('add_inventory_category', {
    p_name: name,
    p_unit: unit
  });

  if (error) throw error;
  return data;
}

export async function deleteInventoryCategory(categoryId: string) {
  const { data, error } = await supabase.rpc('delete_inventory_category', {
    p_category_id: categoryId
  });

  if (error) throw error;
  return data;
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
  userId: string; // ✅ Добавляем userId как обязательный параметр
}) {
  // Генерируем или используем переданный operationId
  const opId = params.operationId || generateUUID();

  // 1. Проверяем, не была ли уже сохранена эта операция (идемпотентность)
  try {
    const { data: existing } = await supabase
      .from('inventory_arrivals')
      .select('id')
      .eq('operation_id', opId)
      .single();

    if (existing) {
      console.log('[recordInventoryArrival] Operation already exists:', opId);
      return existing; // Просто выходим, не создаём дубликат
    }
  } catch (error) {
    // Ошибка 406 (Not Found) - это нормально, записи ещё нет
    // Игнорируем и продолжаем создание записи
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
      console.log('[recordInventoryArrival] Operation not found (expected), proceeding...');
    } else if (error) {
      console.error('[recordInventoryArrival] Error checking existing operation:', error);
      throw error;
    }
  }

  // 2. Загружаем фото (если есть) с тем же operationId
  let photoUrls: string[] = [];

  if (params.photos && params.photos.length > 0) {
    photoUrls = await uploadInventoryPhotos(params.itemId, params.photos, opId);
  }

  // 3. Вызываем RPC функцию с userId из параметров
  const { data, error } = await supabase.rpc('inventory_arrival', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_total_price: params.totalPrice,
    p_delivery_date: params.deliveryDate,
    p_photos: photoUrls.length > 0 ? photoUrls : null,
    p_notes: params.notes || null,
    p_created_by: params.userId, // ✅ Используем userId из параметров
    p_operation_id: opId
  });

  // ✅ Обрабатываем race condition (два параллельных запроса)
  if (error?.code === '23505') {
    console.log('[recordInventoryArrival] Race condition detected, fetching existing record:', opId);
    const { data: existing } = await supabase
      .from('inventory_arrivals')
      .select('*')
      .eq('operation_id', opId)
      .single();
    return existing;
  }

  if (error) throw error;
  return data;
}

// ============================================
// ПЕРЕСЧЁТ ОСТАТКОВ
// ============================================

export async function recordInventoryRestock(params: {
  itemId: string;
  quantity: number;
  notes?: string;
  userId: string; // ✅ Добавляем userId как обязательный параметр
}) {
  const { data, error } = await supabase.rpc('inventory_restock', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_notes: params.notes || null,
    p_created_by: params.userId // ✅ Используем userId из параметров
  });

  if (error) throw error;
  return data;
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
// РАБОТА С ФОТО
// ============================================

async function uploadInventoryPhotos(itemId: string, files: File[], operationId?: string): Promise<string[]> {
  const urls: string[] = [];
  const errors: string[] = [];

  console.log('[uploadInventoryPhotos] Starting upload for item:', itemId, 'files:', files.length, 'operationId:', operationId);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    
    // Используем operationId + индекс вместо timestamp для идемпотентности
    const fileName = operationId 
      ? `${itemId}/${operationId}_${i}.${extension}`
      : `${itemId}/${Date.now()}.${extension}`;

    console.log('[uploadInventoryPhotos] Uploading file:', fileName, 'size:', file.size, 'type:', file.type);

    // Retry логика с экспоненциальной задержкой
    let lastError: any;
    let uploadSuccess = false;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.storage
          .from('inventory-photos')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true  // Перезаписывает файлы вместо ошибки
          });

        if (!error) {
          console.log(`[uploadInventoryPhotos] Upload successful on attempt ${attempt}/${maxRetries}`);
          uploadSuccess = true;

          // Получаем публичный URL
          const { data: urlData } = supabase.storage
            .from('inventory-photos')
            .getPublicUrl(fileName);

          console.log('[uploadInventoryPhotos] Public URL:', urlData.publicUrl);
          urls.push(urlData.publicUrl);
          break;
        }

        lastError = error;
        console.log(`[uploadInventoryPhotos] Attempt ${attempt}/${maxRetries} failed:`, error.message);

        // Если это последняя попытка - выходим
        if (attempt === maxRetries) break;

        // Экспоненциальная задержка: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[uploadInventoryPhotos] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (error) {
        lastError = error;
        console.log(`[uploadInventoryPhotos] Attempt ${attempt}/${maxRetries} exception:`, error);

        if (attempt === maxRetries) break;

        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[uploadInventoryPhotos] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!uploadSuccess) {
      console.error('[uploadInventoryPhotos] Photo upload error after all retries:', lastError);
      errors.push(`${file.name}: ${lastError?.message || 'Неизвестная ошибка'}`);
    }
  }

  console.log('[uploadInventoryPhotos] Completed. URLs:', urls, 'Errors:', errors);

  // Если есть ошибки - выбрасываем исключение с деталями
  if (errors.length > 0) {
    throw new Error(
      `Не удалось загрузить ${errors.length} фото:\n${errors.join('\n')}`
    );
  }

  return urls;
}

export async function deleteInventoryPhoto(photoUrl: string) {
  // Извлекаем путь файла из URL
  const path = photoUrl.split('/inventory-photos/')[1];

  if (!path) throw new Error('Invalid photo URL');

  const { error } = await supabase.storage
    .from('inventory-photos')
    .remove([path]);

  if (error) throw error;
}
