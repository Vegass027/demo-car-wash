import { supabase } from '../supabase';
import { getNextDocumentNumberViaStaff } from './staff-actions';

/**
 * Типы сущности "Номер документа"
 */
export interface DocumentNumber {
  id: string;
  document_type: 'invoice' | 'act';
  current_number: number;
  created_at: string;
  updated_at: string;
}

/**
 * Получить следующий номер документа (атомарная операция)
 * Использует PostgreSQL функцию get_next_document_number()
 * @param documentType Тип документа ('invoice' или 'act')
 * @param month Месяц документа (1-12)
 * @param year Год документа
 * @returns Следующий номер документа (1-999)
 */
export async function getNextDocumentNumber(
  documentType: 'invoice' | 'act',
  month: number,
  year: number
): Promise<number> {
  // Slice #3d Step 0: dispatcher proxy. 3-arg overload uniquely resolved.
  return await getNextDocumentNumberViaStaff(documentType, month, year);
}

/**
 * Получить текущий номер документа (без инкремента)
 * @param documentType Тип документа ('invoice' или 'act')
 * @returns Текущий номер документа
 */
export async function getCurrentDocumentNumber(documentType: 'invoice' | 'act'): Promise<number> {
  const { data, error } = await supabase
    .from('document_numbers')
    .select('current_number')
    .eq('document_type', documentType)
    .single();

  if (error) {
    console.error(`[getCurrentDocumentNumber] Ошибка получения текущего номера для ${documentType}:`, error);
    throw error;
  }

  return data?.current_number || 0;
}

/**
 * Сбросить номер документа на указанное значение
 * @param documentType Тип документа ('invoice' или 'act')
 * @param newNumber Новое значение номера
 */
export async function resetDocumentNumber(
  documentType: 'invoice' | 'act',
  newNumber: number
): Promise<void> {
  const { error } = await supabase
    .from('document_numbers')
    .update({ current_number: newNumber })
    .eq('document_type', documentType);

  if (error) {
    console.error(`[resetDocumentNumber] Ошибка сброса номера для ${documentType}:`, error);
    throw error;
  }
}

/**
 * Получить все номера документов
 */
export async function getAllDocumentNumbers(): Promise<DocumentNumber[]> {
  const { data, error } = await supabase
    .from('document_numbers')
    .select('*')
    .order('document_type', { ascending: true });

  if (error) {
    console.error('[getAllDocumentNumbers] Ошибка получения номеров документов:', error);
    throw error;
  }

  return data || [];
}
