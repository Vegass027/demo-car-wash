/**
 * Сущности для управления складом расходных материалов
 */

export type InventoryAction = 'arrival' | 'restock';

export type InventoryUnit = 'штуки' | 'литры' | 'канистры' | 'граммы' | 'килограммы';

// ============================================
// ТИПЫ ДЛЯ SUPABASE (snake_case)
// ============================================

export interface InventoryCategory {
  id: string;
  name: string;
  unit: 'штуки' | 'литры' | 'канистры' | 'граммы' | 'килограммы';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  current_quantity: number;
  base_quantity: number;
  min_threshold: number;
  last_price_per_unit: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryArrival {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  total_price: number;
  price_per_unit: number;
  delivery_date: string;
  photos: string[] | null;
  notes: string | null;
  created_by: string | null;
  operation_id: string | null; // UUID операции для идемпотентности
  created_at: string;
}

export interface InventoryOperation {
  id: string;
  item_id: string;
  item_name: string;
  operation_type: 'arrival' | 'restock' | 'usage' | 'revision';
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  base_quantity_before: number | null;
  base_quantity_after: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ============================================
// ТИПЫ ДЛЯ UI (camelCase - для совместимости)
// ============================================

export interface InventoryItemUI {
  id: string;
  name: string;
  categoryId: string;
  unit: string;
  currentQuantity: number;
  baseQuantity: number;
  minThreshold: number;
  lastPricePerUnit?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryArrivalHistory {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  totalPrice: number;
  pricePerUnit: number;
  photos?: string[];
  notes?: string;
  createdBy?: string;
  receiptUrl?: string;
  deliveryDate?: Date;
  createdAt: Date;
}

export interface InventoryFormData {
  action: InventoryAction;
  quantity: number;
  totalPrice?: number;
  photos: File[];
  deliveryDate?: Date;
  operationId?: string; // UUID для идемпотентности операций
}

export interface InventoryStats {
  percentage: number;
  status: 'critical' | 'low' | 'normal' | 'good';
  displayText: string;
}

// ============================================
// КОНВЕРТЕРЫ Supabase → UI
// ============================================

export function inventoryItemToUI(item: InventoryItem): InventoryItemUI {
  return {
    id: item.id,
    name: item.name,
    categoryId: item.category_id,
    unit: item.unit,
    currentQuantity: item.current_quantity,
    baseQuantity: item.base_quantity,
    minThreshold: item.min_threshold,
    lastPricePerUnit: item.last_price_per_unit ?? undefined,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  };
}

export function inventoryArrivalToHistory(arrival: InventoryArrival): InventoryArrivalHistory {
  return {
    id: arrival.id,
    itemId: arrival.item_id,
    itemName: arrival.item_name,
    quantity: arrival.quantity,
    totalPrice: arrival.total_price,
    pricePerUnit: arrival.price_per_unit,
    photos: arrival.photos ?? undefined,
    notes: arrival.notes ?? undefined,
    createdBy: arrival.created_by ?? undefined,
    receiptUrl: arrival.photos && arrival.photos.length > 0 ? arrival.photos[0] : undefined,
    deliveryDate: arrival.delivery_date ? new Date(arrival.delivery_date) : undefined,
    createdAt: new Date(arrival.created_at),
  };
}
