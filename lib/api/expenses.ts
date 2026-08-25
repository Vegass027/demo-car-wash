import { supabase } from '../supabase';

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
  console.log('[getExpenses] Загрузка расходов:', { userId, role, date, startDate, endDate });
  
  let query;
 
  if (role === 'admin') {
    // Админ видит все расходы с информацией о создателе и редакторе
    query = supabase
      .from('expenses')
      .select(`
        *,
        creator:profiles!created_by(role, phone, full_name),
        updater:profiles!updated_by(role, phone, full_name)
      `);
  } else {
    // Владелец видит все расходы с информацией о создателе и редакторе
    query = supabase
      .from('expenses')
      .select(`
        *,
        creator:profiles!created_by(role, phone, full_name),
        updater:profiles!updated_by(role, phone, full_name)
      `);
  }

  // Если указан интервал дат, фильтруем по интервалу
  if (startDate && endDate) {
    query = query.gte('expense_date', startDate).lte('expense_date', endDate);
  } else if (date) {
    // Иначе фильтруем по одной дате
    query = query.eq('expense_date', date);
  } else {
    // По умолчанию - сегодня
    const expenseDate = new Date().toISOString().split('T')[0];
    query = query.eq('expense_date', expenseDate);
  }

  query = query.order('created_at', { ascending: false });
 
  const { data, error } = await query;
  console.log('[getExpenses] Результат запроса:', { data, error });
 
  if (error) {
    console.error('[getExpenses] Ошибка загрузки расходов:', error);
    throw error;
  }
 
  // Преобразуем данные (и для админа, и для владельца)
  const result = (data || []).map(expense => ({
    ...expense,
    creator_role: (expense.creator as any)?.role || null,
    creator_phone: (expense.creator as any)?.phone || null,
    creator_full_name: (expense.creator as any)?.full_name || null,
    updater_role: (expense.updater as any)?.role || null,
    updater_phone: (expense.updater as any)?.phone || null,
    updater_full_name: (expense.updater as any)?.full_name || null,
  }));
  console.log('[getExpenses] Преобразованные данные:', result);
  return result;
}

/**
 * Создать новый расход
 * @param data - Данные расхода
 * @param userId - ID текущего пользователя
 * @returns Созданный расход
 */
export async function createExpense(data: {
  category: 'tea_coffee' | 'repair' | 'utilities' | 'stationery' | 'other';
  amount: number;
  comment?: string;
  receipt_url?: string;
  expense_date?: string;
}, userId: string): Promise<Expense> {
 
  console.log('[createExpense] Создание расхода:', data);
 
  const expenseDate = data.expense_date || new Date().toISOString().split('T')[0];
  const expenseData = {
    category: data.category,
    amount: data.amount,
    comment: data.comment || null,
    receipt_url: data.receipt_url || null,
    expense_date: expenseDate,
    created_by: userId, // ✅ Используем userId из параметров
  };
  console.log('[createExpense] Данные для вставки:', expenseData);
 
  const { data: newExpense, error } = await supabase
    .from('expenses')
    .insert(expenseData)
    .select()
    .single();
 
  console.log('[createExpense] Результат вставки:', { data: newExpense, error });
 
  if (error) {
    console.error('[createExpense] Ошибка создания расхода:', error);
    console.error('[createExpense] Детали ошибки:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    throw error;
  }
 
  return newExpense;
}

/**
 * Обновить расход
 * @param id - ID расхода
 * @param data - Данные для обновления
 * @param userId - ID текущего пользователя
 * @returns Обновленный расход
 */
export async function updateExpense(
  id: string,
  data: Partial<Omit<Expense, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'updated_by'>>,
  userId: string
): Promise<Expense> {
  const { data: updatedExpense, error } = await supabase
    .from('expenses')
    .update({
      category: data.category,
      amount: data.amount,
      comment: data.comment !== undefined ? data.comment : undefined,
      receipt_url: data.receipt_url !== undefined ? data.receipt_url : undefined,
      expense_date: data.expense_date,
      updated_by: userId, // ✅ Используем userId из параметров
    })
    .eq('id', id)
    .select()
    .single();
 
  if (error) {
    console.error(`[updateExpense] Ошибка обновления расхода ${id}:`, error);
    throw error;
  }
 
  return updatedExpense;
}

/**
 * Удалить расход
 * @param id - ID расхода
 */
export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`[deleteExpense] Ошибка удаления расхода ${id}:`, error);
    throw error;
  }
}

/**
 * Загрузить чек в Storage
 * @param file - Файл чека
 * @param userId - ID пользователя
 * @returns Путь к файлу в Storage
 */
export async function uploadReceipt(file: File, userId: string): Promise<string> {
  console.log('[uploadReceipt] Загрузка чека:', { fileName: file.name, fileSize: file.size, fileType: file.type, userId });
  
  // Валидация файла
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    console.error('[uploadReceipt] Неверный формат файла:', file.type);
    throw new Error('Неверный формат файла. Разрешены: jpeg, jpg, png, pdf');
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    console.error('[uploadReceipt] Размер файла превышает 5MB:', file.size);
    throw new Error('Размер файла превышает 5MB');
  }

  // Генерируем уникальное имя файла
  const timestamp = Date.now();
  // Очищаем имя файла от недопустимых символов для Storage
  const cleanFileName = file.name
    .replace(/[^\w.-]/g, '_') // Заменяем все кроме букв, цифр, _, ., - на _
    .replace(/_{2,}/g, '_') // Заменяем множественные подчёркивания на одно
    .replace(/^_+|_+$/g, ''); // Убираем подчёркивания в начале и конце
  const fileName = `${timestamp}_${cleanFileName}`;
  const filePath = `${userId}/${fileName}`;
  console.log('[uploadReceipt] Путь к файлу:', { originalName: file.name, cleanFileName, filePath });

  // Загружаем файл в Storage
  const { data, error } = await supabase.storage
    .from('expense-receipts')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  console.log('[uploadReceipt] Результат загрузки:', { data, error });

  if (error) {
    console.error('[uploadReceipt] Ошибка загрузки чека:', error);
    throw error;
  }

  return data.path;
}

/**
 * Получить подписанный URL для просмотра чека
 * @param filePath - Путь к файлу в Storage
 * @param expiresIn - Время жизни ссылки в секундах (по умолчанию 1 час)
 * @returns Подписанный URL
 */
export async function getReceiptUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('expense-receipts')
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    console.error('[getReceiptUrl] Ошибка получения URL чека:', error);
    throw error;
  }

  return data.signedUrl;
}

/**
 * Удалить чек из Storage
 * @param filePath - Путь к файлу в Storage
 */
export async function deleteReceipt(filePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from('expense-receipts')
    .remove([filePath]);

  if (error) {
    console.error('[deleteReceipt] Ошибка удаления чека:', error);
    throw error;
  }
}

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
  return CATEGORIES_WITH_REQUIRED_COMMENT.includes(category as any);
}

/**
 * Форматировать имя создателя/редактора расхода
 * @param expense - Расход с информацией о создателе и редакторе
 * @returns Отформатированное имя для отображения
 */
export function formatCreatorName(expense: ExpenseWithCreator): string {
  // Приоритет: updater_role > creator_role
  const role = expense.updater_role || expense.creator_role;

  if (role === 'owner') {
    return 'Владелец';
  }

  if (role === 'admin') {
    // Если у админа есть имя - показываем его, иначе просто "Админ"
    const fullName = expense.updater_full_name || expense.creator_full_name;
    return fullName || 'Админ';
  }

  return role || 'Неизвестно';
}

/**
 * Получить профиль пользователя по номеру телефона
 * @param phone - Номер телефона (формат +7XXXXXXXXXX или 8XXXXXXXXXX)
 * @returns Профиль пользователя или null
 */
export async function getUserProfileByPhone(phone: string): Promise<UserProfile | null> {
  console.log('[getUserProfileByPhone] Входящий телефон:', phone);
  
  // Нормализуем номер телефона (удаляем все кроме цифр)
  const normalizedPhone = phone.replace(/\D/g, '');
  console.log('[getUserProfileByPhone] Нормализованный телефон:', normalizedPhone);

  // Проверяем, начинается ли номер с 7 или 8 (российский формат)
  const firstDigit = normalizedPhone.charAt(0);
  console.log('[getUserProfileByPhone] Первая цифра:', firstDigit);

  // Создаем варианты для поиска
  let phoneVariants: string[] = [];
  
  if (firstDigit === '7') {
    // Номер начинается с 7 -> пробуем +7... (убираем первую цифру 7)
    phoneVariants.push(`+7${normalizedPhone.substring(1)}`);
  } else if (firstDigit === '8') {
    // Номер начинается с 8 -> пробуем +8... (убираем первую цифру 8)
    phoneVariants.push(`+8${normalizedPhone.substring(1)}`);
  } else {
    // Неизвестный формат -> пробуем оба варианта
    phoneVariants.push(`+7${normalizedPhone}`);
    phoneVariants.push(`+8${normalizedPhone}`);
  }
  
  console.log('[getUserProfileByPhone] Варианты для поиска:', phoneVariants);

  // Ищем профиль по каждому варианту
  for (const phoneVariant of phoneVariants) {
    const { data, error } = await supabase.rpc('search_profile_by_phone', {
      phone_number: phoneVariant
    });
    console.log('[getUserProfileByPhone] Результат поиска по варианту', phoneVariant, ':', { data, error });

    if (data && data.length > 0) {
      console.log('[getUserProfileByPhone] Профиль найден:', data[0]);
      return data[0] as UserProfile;
    }
  }

  // Если ни один вариант не подошел
  console.log('[getUserProfileByPhone] Профиль не найден');
  return null;
}
