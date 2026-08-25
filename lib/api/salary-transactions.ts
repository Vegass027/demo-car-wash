import { supabase } from '../supabase';

/**
 * Тип работника
 */
export type WorkerType = 'worker' | 'tire_worker' | 'admin';

/**
 * Тип транзакции
 */
export type TransactionType = 'EARNING' | 'PAYOUT' | 'ADVANCE' | 'TRANSFER';

/**
 * Интерфейс транзакции зарплаты
 * Соответствует таблице salary_transactions в базе данных
 */
export interface SalaryTransaction {
  id: string;                  // UUID
  worker_type: WorkerType;     // Тип работника
  worker_id: string;           // UUID работника
  worker_name: string;         // Имя работника
  transaction_type: TransactionType; // Тип транзакции
  amount: number;              // Сумма
  balance_after: number;        // Баланс после транзакции
  description?: string;        // Описание (опционально)
  notes?: string;              // Заметки (опционально)
  created_at: string;           // TIMESTAMP
}

/**
 * Базовый запрос для получения транзакций с фильтрами
 */
async function getTransactionsWithFilters(filters: Record<string, any> = {}): Promise<SalaryTransaction[]> {
  let query = supabase
    .from('salary_transactions')
    .select('*');

  // Применяем фильтры
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'startDate') {
      query = query.gte('created_at', value);
    } else if (key === 'endDate') {
      query = query.lte('created_at', value);
    } else {
      query = query.eq(key, value);
    }
  });

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('[SalaryTransactions] Ошибка при получении транзакций:', error);
    throw new Error(`Не удалось получить транзакции: ${error.message}`);
  }

  return data as SalaryTransaction[];
}

/**
 * Получить все транзакции
 */
export async function getSalaryTransactions(): Promise<SalaryTransaction[]> {
  return getTransactionsWithFilters();
}

/**
 * Получить транзакции для конкретного работника
 */
export async function getWorkerTransactions(workerId: string): Promise<SalaryTransaction[]> {
  return getTransactionsWithFilters({ worker_id: workerId });
}

/**
 * Получить транзакции для конкретного работника по типу
 */
export async function getTransactionsByWorkerAndType(
  workerType: WorkerType,
  workerId: string
): Promise<SalaryTransaction[]> {
  return getTransactionsWithFilters({ worker_type: workerType, worker_id: workerId });
}

/**
 * Получить транзакции по типу работника
 */
export async function getTransactionsByWorkerType(workerType: WorkerType): Promise<SalaryTransaction[]> {
  return getTransactionsWithFilters({ worker_type: workerType });
}

/**
 * Получить транзакции по типу транзакции
 */
export async function getTransactionsByType(transactionType: TransactionType): Promise<SalaryTransaction[]> {
  return getTransactionsWithFilters({ transaction_type: transactionType });
}

/**
 * Получить транзакции за период
 */
export async function getTransactionsByDateRange(
  startDate: string,
  endDate: string
): Promise<SalaryTransaction[]> {
  return getTransactionsWithFilters({ startDate, endDate });
}

/**
 * Создать транзакцию (общая функция)
 */
async function createTransaction(
  workerType: WorkerType,
  workerId: string,
  workerName: string,
  transactionType: TransactionType,
  amount: number,
  balanceAfter: number,
  description?: string,
  notes?: string
): Promise<SalaryTransaction> {
  const { data, error } = await supabase
    .from('salary_transactions')
    .insert({
      worker_type: workerType,
      worker_id: workerId,
      worker_name: workerName,
      transaction_type: transactionType,
      amount,
      balance_after: balanceAfter,
      description,
      notes,
    })
    .select()
    .single();

  if (error) {
    console.error('[SalaryTransactions] Ошибка при создании транзакции:', error);
    throw new Error(`Не удалось создать транзакцию: ${error.message}`);
  }

  return data as SalaryTransaction;
}

/**
 * Создать транзакцию заработка
 */
export async function createEarningTransaction(
  workerType: WorkerType,
  workerId: string,
  workerName: string,
  amount: number,
  balanceAfter: number,
  description?: string
): Promise<SalaryTransaction> {
  return createTransaction(
    workerType,
    workerId,
    workerName,
    'EARNING',
    amount,
    balanceAfter,
    description || 'Заработок за заказ'
  );
}

/**
 * Создать транзакцию выплаты
 */
export async function createPayoutTransaction(
  workerType: WorkerType,
  workerId: string,
  workerName: string,
  amount: number,
  balanceAfter: number,
  description?: string,
  notes?: string
): Promise<SalaryTransaction> {
  return createTransaction(
    workerType,
    workerId,
    workerName,
    'PAYOUT',
    amount,
    balanceAfter,
    description || 'Выплата зарплаты',
    notes
  );
}

/**
 * Создать транзакцию аванса
 */
export async function createAdvanceTransaction(
  workerType: WorkerType,
  workerId: string,
  workerName: string,
  amount: number,
  balanceAfter: number,
  description?: string,
  notes?: string
): Promise<SalaryTransaction> {
  return createTransaction(
    workerType,
    workerId,
    workerName,
    'ADVANCE',
    amount,
    balanceAfter,
    description || 'Выдача аванса',
    notes
  );
}

/**
 * Создать транзакцию перевода с ежедневного на итоговый баланс
 */
export async function createTransferTransaction(
  workerType: WorkerType,
  workerId: string,
  workerName: string,
  amount: number,
  balanceAfter: number,
  description?: string
): Promise<SalaryTransaction> {
  return createTransaction(
    workerType,
    workerId,
    workerName,
    'TRANSFER',
    amount,
    balanceAfter,
    description || 'Перевод с ежедневного на итоговый баланс'
  );
}

/**
 * Удалить транзакцию
 */
export async function deleteSalaryTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('salary_transactions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[SalaryTransactions] Ошибка при удалении транзакции:', error);
    throw new Error(`Не удалось удалить транзакцию: ${error.message}`);
  }
}

/**
 * Получить сумму транзакций работника за период
 */
async function getTransactionSumForPeriod(
  workerId: string,
  transactionType: TransactionType,
  startDate: string,
  endDate: string
): Promise<number> {
  // Добавляем время к датам для корректного поиска по TIMESTAMP (без суффикса Z для локального времени)
  const startDateTime = `${startDate}T00:00:00`;
  const endDateTime = `${endDate}T23:59:59`;

  const { data, error } = await supabase
    .from('salary_transactions')
    .select('amount')
    .eq('worker_id', workerId)
    .eq('transaction_type', transactionType)
    .gte('created_at', startDateTime)
    .lte('created_at', endDateTime);

  if (error) {
    console.error('[SalaryTransactions] Ошибка при получении суммы транзакций:', error);
    throw new Error(`Не удалось получить сумму транзакций: ${error.message}`);
  }

  return data.reduce((sum, transaction) => {
    const amount = Number(transaction.amount);
    return amount > 0 ? sum + amount : sum; // Только положительные трансферы!
  }, 0);
}

/**
 * Получить сумму заработка работника за период
 */
export async function getWorkerEarningsForPeriod(
  workerId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  return getTransactionSumForPeriod(workerId, 'EARNING', startDate, endDate);
}

/**
 * Получить сумму выплат работника за период
 */
export async function getWorkerPayoutsForPeriod(
  workerId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  return getTransactionSumForPeriod(workerId, 'PAYOUT', startDate, endDate);
}

/**
 * Получить сумму переводов работника за период (TRANSFER)
 */
export async function getWorkerTransfersForPeriod(
  workerId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  return getTransactionSumForPeriod(workerId, 'TRANSFER', startDate, endDate);
}

/**
 * Получить транзакции выплат и авансов за конкретную дату (для Итогового отчёта)
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив транзакций типа PAYOUT и ADVANCE за указанную дату
 */
export async function getPayoutsAndAdvancesByDate(date: string): Promise<SalaryTransaction[]> {
  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;

  const { data, error } = await supabase
    .from('salary_transactions')
    .select('*')
    .in('transaction_type', ['PAYOUT', 'ADVANCE'])
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[SalaryTransactions] Ошибка при получении выплат и авансов за дату:', date, error);
    throw new Error(`Не удалось получить транзакции: ${error.message}`);
  }

  return data as SalaryTransaction[];
}
