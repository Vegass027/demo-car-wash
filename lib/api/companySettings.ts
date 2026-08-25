import { supabase } from '../supabase';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import type { CompanySettings, CompanySettingsInput } from '../../entities/companySettings/model';

/**
 * Получить активные юридические данные компании
 * @returns Активная запись или null
 */
export async function getCompanySettings(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('[getCompanySettings] Error:', error);
    return null;
  }

  return data as CompanySettings;
}

/**
 * Создать новые юридические данные компании
 * При создании автоматически деактивирует старые записи
 * @param data Данные для создания
 * @returns Созданная запись или null
 */
export async function createCompanySettings(data: CompanySettingsInput): Promise<CompanySettings | null> {
  try {
    // Нормализуем телефон перед сохранением
    const normalizedData = {
      ...data,
      phone: data.phone ? normalizePhoneNumber(data.phone) : data.phone,
    };

    // Деактивируем все старые записи
    await supabase
      .from('company_settings')
      .update({ is_active: false })
      .eq('is_active', true);

    // Создаем новую активную запись
    const { data: newSettings, error } = await supabase
      .from('company_settings')
      .insert({
        ...normalizedData,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return newSettings as CompanySettings;
  } catch (error) {
    console.error('[createCompanySettings] Error:', error);
    return null;
  }
}

/**
 * Обновить существующие юридические данные компании
 * @param id ID записи
 * @param data Данные для обновления
 * @returns Обновленная запись или null
 */
export async function updateCompanySettings(
  id: string,
  data: Partial<CompanySettingsInput>
): Promise<CompanySettings | null> {
  try {
    // Нормализуем телефон перед сохранением
    const normalizedData = {
      ...data,
      phone: data.phone ? normalizePhoneNumber(data.phone) : data.phone,
    };

    const { data: updatedSettings, error } = await supabase
      .from('company_settings')
      .update({
        ...normalizedData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return updatedSettings as CompanySettings;
  } catch (error) {
    console.error('[updateCompanySettings] Error:', error);
    return null;
  }
}
