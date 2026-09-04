import { supabase } from '../supabase';
import { getNextDocumentNumberViaStaff, allocateDocumentNumberViaStaff } from './staff-actions';

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
 *
 * @deprecated Use allocateDocumentNumber (Issue 17). The old per-doc-type
 * counter splits invoice/act into independent sequences and was the root
 * cause of mismatched numbers in printed PDFs. Kept for legacy code/tests.
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
 * Issue 17 — allocate or lookup ONE document_number for a worksheet.
 *
 * Use case: invoice and act for the SAME (organization_id, fiscal_year,
 * fiscal_month, service_type) tuple must always render the same number.
 * Calling this helper for both callsites (invoice PDF, invoice DOCX,
 * act PDF, act DOCX) of one SummaryPage state guarantees identical
 * numbers across all four documents.
 *
 * Idempotent: re-invoking for the same tuple returns the saved number
 * without incrementing the global counter. Source of truth is the
 * `document_assignments` table in Postgres.
 */
export async function allocateDocumentNumber(
  organizationId: string,
  month: number,
  year: number,
  serviceType: 'carwash' | 'tire',
): Promise<number> {
  return await allocateDocumentNumberViaStaff(organizationId, month, year, serviceType);
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
