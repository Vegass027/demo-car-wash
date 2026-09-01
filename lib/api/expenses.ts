import { supabase } from '../supabase';
import { getSessionToken } from '../_supabase-wrapper';

/**
 * Тип профиля пользователя
 */
export interface UserProfile {
  id: string;
  role: string;
  full_name: string | null;
  phone: string;
  created_at: string;
  updated_at: string;
}

/**
 * Типы сущности "Расход"
 * Соответствует таблице expenses в базе данных
 */
export interface Expense {
  id: string;
  category: 'tea_coffee' | 'repair' | 'utilities' | 'stationery' | 'other';
  amount: number;
  comment: string | null;
  receipt_url: string | null;
  expense_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Расход с информацией о создателе и редакторе (для владельца)
 */
export interface ExpenseWithCreator extends Expense {
  creator_role: string | null;      // 'admin' | 'owner'
  creator_phone: string | null;
  creator_full_name: string | null; // для будущего использования
  updater_role: string | null;      // 'admin' | 'owner'
  updater_phone: string | null;
  updater_full_name: string | null; // для будущего использования
}

// =====================================================================
// Slice #3f (Issue 3) — server-side dispatcher writes
// =====================================================================
//
// All WRITE operations (create/update/delete expense, upload/delete/get
// receipt URL) go through /api/staff dispatcher. The browser-direct
// supabase.from / supabase.storage paths are no longer used for writes.
//
// READ operation (getExpenses) stays browser-direct because RLS
// staff_select_expenses policy already gates by app_role ∈ {admin, owner},
// so the read is safe and the dispatcher round-trip is unnecessary.

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

// =====================================================================
// READ (browser-direct, RLS-gated by staff_select_expenses)
// =====================================================================

/**
 * Получить расходы с учётом роли пользователя
 * @param userId - ID текущего пользователя
 * @param role - Роль пользователя ('admin' или 'owner')
 * @param date - Дата расходов (YYYY-MM-DD), по умолчанию сегодня
 * @param startDate - Начальная дата интервала (YYYY-MM-DD)
 * @param endDate - Конечная дата интервала (YYYY-MM-DD)
 * @returns Массив расходов
 */
export async function getExpenses(
  userId: string,
  role: 'admin' | 'owner',
  date?: string,
  startDate?: string,
  endDate?: string
): Promise<ExpenseWithCreator[]> {
  let query = supabase
    .from('expenses')
    .select(`
      *,
      creator:profiles!created_by(role, phone, full_name),
      updater:profiles!updated_by(role, phone, full_name)
    `);

  if (startDate && endDate) {
    query = query.gte('expense_date', startDate).lte('expense_date', endDate);
  } else if (date) {
    query = query.eq('expense_date', date);
  } else {
    const expenseDate = new Date().toISOString().split('T')[0];
    query = query.eq('expense_date', expenseDate);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error('[getExpenses] Ошибка загрузки расходов:', error);
    throw error;
  }

  return (data || []).map(expense => ({
    ...expense,
    creator_role: (expense.creator as any)?.role || null,
    creator_phone: (expense.creator as any)?.phone || null,
    creator_full_name: (expense.creator as any)?.full_name || null,
    updater_role: (expense.updater as any)?.role || null,
    updater_phone: (expense.updater as any)?.phone || null,
    updater_full_name: (expense.updater as any)?.full_name || null,
  })) as ExpenseWithCreator[];
}

// =====================================================================
// WRITES (dispatcher-only)
// =====================================================================

/**
 * Создать новый расход
 * @param data - Данные расхода
 * @param userId - ID текущего пользователя (server-stamps created_by on dispatcher)
 * @returns Созданный расход
 */
export async function createExpense(data: {
  category: 'tea_coffee' | 'repair' | 'utilities' | 'stationery' | 'other';
  amount: number;
  comment?: string;
  receipt_url?: string;
  expense_date?: string;
}, userId: string): Promise<Expense> {
  const res = await dispatchStaff<{ expense: Expense }>('create-expense', {
    category: data.category,
    amount: data.amount,
    comment: data.comment ?? null,
    receipt_url: data.receipt_url ?? null,
    expense_date: data.expense_date ?? null,
  });
  return res.expense;
}

/**
 * Обновить расход
 * @param id - ID расхода
 * @param data - Данные для обновления
 * @param userId - ID текущего пользователя (server-stamps updated_by on dispatcher)
 * @returns Обновленный расход
 */
export async function updateExpense(
  id: string,
  data: Partial<Omit<Expense, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'updated_by'>>,
  userId: string
): Promise<Expense> {
  const res = await dispatchStaff<{ expense: Expense }>('update-expense', {
    id,
    category: data.category,
    amount: data.amount,
    comment: data.comment,
    receipt_url: data.receipt_url,
    expense_date: data.expense_date,
  });
  return res.expense;
}

/**
 * Удалить расход (best-effort receipt cleanup happens server-side)
 * @param id - ID расхода
 */
export async function deleteExpense(id: string): Promise<void> {
  await dispatchStaff<{ ok: true; receipt_deleted: boolean }>('delete-expense', { id });
}

/**
 * Загрузить чек в Storage (base64 in JSON via dispatcher; 3MB cap)
 * @param file - Файл чека
 * @param userId - ID пользователя (used by server for path prefix)
 * @returns Путь к файлу в Storage
 */
export async function uploadReceipt(file: File, userId: string): Promise<string> {
  // Client-side early validation (UX hint). Server is authoritative.
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('invalid_mime');
  }
  if (file.size > 3 * 1024 * 1024) {
    throw new Error('file_too_large');
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });

  const res = await dispatchStaff<{ path: string }>('upload-receipt', {
    filename: file.name,
    mime: file.type,
    base64,
  });
  return res.path;
}

/**
 * Получить подписанный URL для просмотра чека (1h TTL via dispatcher).
 *
 * @param expenseId - ID расхода. Storage path читается server-side из
 *                    таблицы expenses — клиент не передаёт path.
 *                    (Безопасность: client не может попросить signed URL
 *                    для чужого чека, угадав path.)
 * @returns Подписанный URL
 */
export async function getReceiptUrl(expenseId: string): Promise<string> {
  const res = await dispatchStaff<{ url: string }>('get-receipt-url', { expense_id: expenseId });
  return res.url;
}

/**
 * Удалить чек из Storage (via dispatcher).
 *
 * @param expenseId - ID расхода. Storage path читается server-side из
 *                    таблицы expenses. После successful storage remove
 *                    server очищает `expenses.receipt_url`.
 */
export async function deleteReceipt(expenseId: string): Promise<void> {
  await dispatchStaff<{ ok: true }>('delete-receipt', { expense_id: expenseId });
}

// =====================================================================
// UI constants (unchanged from prod)
// =====================================================================

/**
 * Категории расходов для UI
 */
export const EXPENSE_CATEGORIES = {
  tea_coffee: 'Чай/кофе',
  repair: 'Ремонт',
  utilities: 'Коммуналка',
  stationery: 'Канцелярия',
  other: 'Прочее',
} as const;

/**
 * Категории, для которых обязателен комментарий
 */
export const CATEGORIES_WITH_REQUIRED_COMMENT = ['repair', 'utilities', 'other'] as const;

/**
 * Проверить, обязателен ли комментарий для категории
 * @param category - Категория расхода
 * @returns true, если комментарий обязателен
 */
export function isCommentRequired(category: string): boolean {
  return (CATEGORIES_WITH_REQUIRED_COMMENT as readonly string[]).includes(category as any);
}

/**
 * Форматировать имя создателя/редактора расхода
 * @param expense - Расход с информацией о создателе и редакторе
 * @returns Отформатированное имя для отображения
 */
export function formatCreatorName(expense: ExpenseWithCreator): string {
  const role = expense.updater_role || expense.creator_role;

  if (role === 'owner') {
    return 'Владелец';
  }

  if (role === 'admin') {
    const fullName = expense.updater_full_name || expense.creator_full_name;
    return fullName || 'Админ';
  }

  return role || 'Неизвестно';
}

// =====================================================================
// Unrelated: getUserProfileByPhone uses RPC (out of scope for Issue 3)
// =====================================================================

/**
 * Получить профиль пользователя по номеру телефона
 * @param phone - Номер телефона (формат +7XXXXXXXXXX или 8XXXXXXXXXX)
 * @returns Профиль пользователя или null
 */
export async function getUserProfileByPhone(phone: string): Promise<UserProfile | null> {
  const normalizedPhone = phone.replace(/\D/g, '');
  const firstDigit = normalizedPhone.charAt(0);

  let phoneVariants: string[] = [];
  if (firstDigit === '7') {
    phoneVariants.push(`+7${normalizedPhone.substring(1)}`);
  } else if (firstDigit === '8') {
    phoneVariants.push(`+8${normalizedPhone.substring(1)}`);
  } else {
    phoneVariants.push(`+7${normalizedPhone}`);
    phoneVariants.push(`+8${normalizedPhone}`);
  }

  for (const phoneVariant of phoneVariants) {
    const { data, error } = await supabase.rpc('search_profile_by_phone', {
      phone_number: phoneVariant
    });
    if (data && data.length > 0) {
      return data[0] as UserProfile;
    }
  }
  return null;
}
