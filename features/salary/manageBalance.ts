/**
 * Функции для управления балансом и выплатами сотрудникам
 * Работают с БД через API функции
 */

import { Worker, updateWorker } from '@/lib/api/workers';
import { TireWorker, updateTireWorker } from '@/lib/api/tire-workers';
import {
  type SalaryTransaction,
} from '@/lib/api/salary-transactions';
import {
  createStaffAdvanceTransaction,
  createStaffPayoutTransaction,
  createStaffTransferTransaction,
  deleteStaffSalaryTransaction,
  updateStaffAdmin,
} from '@/lib/api/staff-actions';

/**
 * Проверяет, можно ли выплатить указанную сумму
 * @param currentBalance - текущий баланс
 * @param isAdvanceTaken - взят ли аванс
 * @param amount - сумма для выплаты
 * @returns объект с результатом проверки и сообщением об ошибке
 */
export function validatePayout(
  currentBalance: number,
  isAdvanceTaken: boolean,
  amount: number
): { valid: boolean; error?: string } {
  // Проверяем на отрицательную сумму
  if (amount <= 0) {
    return { valid: false, error: 'Сумма должна быть положительной' };
  }

  // Разрешаем уходить в минус в любом случае
  return { valid: true };
}

/**
 * Переносит дневной заработок мойщика в баланс и создает транзакцию
 * @param worker - мойщик
 * @returns обновленный мойщик (через API)
 */
export async function transferDailyEarningsToBalance(worker: Worker): Promise<Worker> {
  console.log('[transferDailyEarningsToBalance] Начало выполнения для worker:', worker.full_name, 'id:', worker.id);
  console.log('[transferDailyEarningsToBalance] Текущее состояние:', {
    earned_today: worker.earned_today,
    current_balance: worker.current_balance,
  });

  // Если дневной заработок равен 0, ничего не делаем
  if (worker.earned_today === 0) {
    console.log('[transferDailyEarningsToBalance] earned_today = 0, ничего не делаем');
    return worker;
  }

  const newBalance = worker.current_balance + worker.earned_today;
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fullDateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  console.log('[transferDailyEarningsToBalance] Переносим заработок:', {
    amount: worker.earned_today,
    oldBalance: worker.current_balance,
    newBalance: newBalance,
  });

  // Создаем транзакцию перевода с ежедневного на итоговый баланс
  await createStaffTransferTransaction({
    worker_type: 'worker',
    worker_id: worker.id,
    worker_name: worker.full_name,
    amount: worker.earned_today,
    balance_after: newBalance,
    description: `Перевод с ежедневного баланса за:\n${dateStr}, ${timeStr}`,
  });

  // Обновляем мойщика в БД
  const updatedWorker = await updateWorker(worker.id, {
    current_balance: newBalance,
    earned_today: 0,
  });

  console.log('[transferDailyEarningsToBalance] Обновленное состояние:', {
    earned_today: updatedWorker.earned_today,
    current_balance: updatedWorker.current_balance,
  });

  return updatedWorker;
}

/**
 * Переносит дневной заработок мастера в баланс и создает транзакцию
 * @param technician - мастер
 * @returns обновленный мастер (через API)
 */
export async function transferDailyEarningsToBalanceForTechnician(
  technician: TireWorker
): Promise<TireWorker> {
  // Если дневной заработок равен 0, ничего не делаем
  if (technician.earned_today === 0) {
    return technician;
  }

  const newBalance = technician.current_balance + technician.earned_today;
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fullDateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Создаем транзакцию перевода с ежедневного на итоговый баланс
  await createStaffTransferTransaction({
    worker_type: 'tire_worker',
    worker_id: technician.id,
    worker_name: technician.full_name,
    amount: technician.earned_today,
    balance_after: newBalance,
    description: `Перевод с ежедневного баланса за:\n${dateStr}, ${timeStr}`,
  });

  // Обновляем мастера в БД
  const updatedTechnician = await updateTireWorker(technician.id, {
    current_balance: newBalance,
    earned_today: 0,
  });

  return updatedTechnician;
}

/**
 * Выплачивает зарплату мойщику и создает транзакцию
 * @param worker - мойщик
 * @param amount - сумма выплаты
 * @returns обновленный мойщик (через API) или null при ошибке
 */
export async function payoutSalary(
  worker: Worker,
  amount: number
): Promise<Worker | null> {
  // Валидация
  const validation = validatePayout(worker.current_balance, worker.is_advance_taken, amount);
  if (!validation.valid) {
    return null;
  }

  const newBalance = worker.current_balance - amount;
  
  // Если amount > balance, то разделяем на выплату и аванс
  if (amount > worker.current_balance) {
    const payoutAmount = worker.current_balance; // Обычная выплата
    const advanceAmount = amount - worker.current_balance; // Аванс

    // Создаем транзакцию обычной выплаты
    await createStaffPayoutTransaction({
      worker_type: 'worker',
      worker_id: worker.id,
      worker_name: worker.full_name,
      amount: payoutAmount,
      balance_after: newBalance,
      description: 'Выплата зарплаты',
    });

    // Создаем транзакцию аванса
    await createStaffAdvanceTransaction({
      worker_type: 'worker',
      worker_id: worker.id,
      worker_name: worker.full_name,
      amount: advanceAmount,
      balance_after: newBalance,
      description: 'Выдача аванса',
    });
  } else {
    // Просто обычная выплата
    await createStaffPayoutTransaction({
      worker_type: 'worker',
      worker_id: worker.id,
      worker_name: worker.full_name,
      amount,
      balance_after: newBalance,
      description: 'Выплата зарплаты',
    });
  }
  
  // Обновляем мойщика в БД
  const updatedWorker = await updateWorker(worker.id, {
    current_balance: newBalance,
  });

  return updatedWorker;
}

/**
 * Выплачивает зарплату мастеру и создает транзакцию
 * @param technician - мастер
 * @param amount - сумма выплаты
 * @returns обновленный мастер (через API) или null при ошибке
 */
export async function payoutSalaryForTechnician(
  technician: TireWorker,
  amount: number
): Promise<TireWorker | null> {
  // Валидация
  const validation = validatePayout(
    technician.current_balance,
    technician.is_advance_taken,
    amount
  );
  if (!validation.valid) {
    return null;
  }

  const newBalance = technician.current_balance - amount;
  
  // Если amount > balance, то разделяем на выплату и аванс
  if (amount > technician.current_balance) {
    const payoutAmount = technician.current_balance; // Обычная выплата
    const advanceAmount = amount - technician.current_balance; // Аванс

    // Создаем транзакцию обычной выплаты
    await createStaffPayoutTransaction({
      worker_type: 'tire_worker',
      worker_id: technician.id,
      worker_name: technician.full_name,
      amount: payoutAmount,
      balance_after: newBalance,
      description: 'Выплата зарплаты',
    });

    // Создаем транзакцию аванса
    await createStaffAdvanceTransaction({
      worker_type: 'tire_worker',
      worker_id: technician.id,
      worker_name: technician.full_name,
      amount: advanceAmount,
      balance_after: newBalance,
      description: 'Выдача аванса',
    });
  } else {
    // Просто обычная выплата
    await createStaffPayoutTransaction({
      worker_type: 'tire_worker',
      worker_id: technician.id,
      worker_name: technician.full_name,
      amount,
      balance_after: newBalance,
      description: 'Выплата зарплаты',
    });
  }
  
  // Обновляем мастера в БД
  const updatedTechnician = await updateTireWorker(technician.id, {
    current_balance: newBalance,
  });

  return updatedTechnician;
}

/**
 * Выдает аванс мойщику и создает транзакцию
 * @param worker - мойщик
 * @param amount - сумма аванса
 * @returns обновленный мойщик (через API) или null при ошибке
 */
export async function giveAdvance(
  worker: Worker,
  amount: number
): Promise<Worker | null> {
  // Проверяем на отрицательную сумму
  if (amount <= 0) {
    return null;
  }

  const newBalance = worker.current_balance - amount;

  // Создаем транзакцию аванса
  await createStaffAdvanceTransaction({
    worker_type: 'worker',
    worker_id: worker.id,
    worker_name: worker.full_name,
    amount,
    balance_after: newBalance,
    description: 'Выдача аванса',
  });

  // Обновляем мойщика в БД
  const updatedWorker = await updateWorker(worker.id, {
    current_balance: newBalance,
    is_advance_taken: true,
  });

  return updatedWorker;
}

/**
 * Выдает аванс мастеру и создает транзакцию
 * @param technician - мастер
 * @param amount - сумма аванса
 * @returns обновленный мастер (через API) или null при ошибке
 */
export async function giveAdvanceForTechnician(
  technician: TireWorker,
  amount: number
): Promise<TireWorker | null> {
  // Проверяем на отрицательную сумму
  if (amount <= 0) {
    return null;
  }

  const newBalance = technician.current_balance - amount;

  // Создаем транзакцию аванса
  await createStaffAdvanceTransaction({
    worker_type: 'tire_worker',
    worker_id: technician.id,
    worker_name: technician.full_name,
    amount,
    balance_after: newBalance,
    description: 'Выдача аванса',
  });

  // Обновляем мастера в БД
  const updatedTechnician = await updateTireWorker(technician.id, {
    current_balance: newBalance,
    is_advance_taken: true,
  });

  return updatedTechnician;
}

/**
 * Форматирует баланс для отображения
 * @param balance - баланс
 * @returns отформатированная строка с балансом
 */
export function formatBalance(balance: number): string {
  return balance.toLocaleString('ru-RU') + ' ₽';
}

/**
 * Получает цвет для отображения баланса
 * @param balance - баланс
 * @returns CSS класс цвета
 */
export function getBalanceColor(balance: number): string {
  if (balance < 0) return 'text-red-600';
  if (balance === 0) return 'text-gray-600';
  return 'text-green-600';
}

/**
 * Отменяет транзакцию выплаты/аванса мойщика и восстанавливает баланс
 * Используется при ошибочной двойной выдаче зарплаты
 * @param transaction - транзакция для отмены (только PAYOUT или ADVANCE)
 * @returns обновленный мойщик (через API) или null при ошибке
 */
export async function revertWorkerPayoutTransaction(
  transaction: SalaryTransaction
): Promise<Worker | null> {
  // Только PAYOUT и ADVANCE можно удалять
  if (transaction.transaction_type !== 'PAYOUT' && transaction.transaction_type !== 'ADVANCE') {
    console.error('[revertWorkerPayoutTransaction] Можно удалять только транзакции выплат и авансов');
    return null;
  }

  // Удаляем транзакцию
  await deleteStaffSalaryTransaction(transaction.id);

  // Восстанавливаем баланс: добавляем сумму выплаты обратно
  const restoreAmount = Math.abs(transaction.amount);
  const newBalance = transaction.balance_after + restoreAmount;

  // Обновляем мойщика в БД
  const updatedWorker = await updateWorker(transaction.worker_id, {
    current_balance: newBalance,
  });

  return updatedWorker;
}

/**
 * Отменяет транзакцию выплаты/аванса мастера шиномонтажа и восстанавливает баланс
 * Используется при ошибочной двойной выдаче зарплаты
 * @param transaction - транзакция для отмены (только PAYOUT или ADVANCE)
 * @returns обновленный мастер (через API) или null при ошибке
 */
export async function revertTireWorkerPayoutTransaction(
  transaction: SalaryTransaction
): Promise<TireWorker | null> {
  // Только PAYOUT и ADVANCE можно удалять
  if (transaction.transaction_type !== 'PAYOUT' && transaction.transaction_type !== 'ADVANCE') {
    console.error('[revertTireWorkerPayoutTransaction] Можно удалять только транзакции выплат и авансов');
    return null;
  }

  // Удаляем транзакцию
  await deleteStaffSalaryTransaction(transaction.id);

  // Восстанавливаем баланс: добавляем сумму выплаты обратно
  const restoreAmount = Math.abs(transaction.amount);
  const newBalance = transaction.balance_after + restoreAmount;

  // Обновляем мастера в БД
  const updatedTechnician = await updateTireWorker(transaction.worker_id, {
    current_balance: newBalance,
  });

  return updatedTechnician;
}

/**
 * Отменяет транзакцию выплаты/аванса админа и восстанавливает баланс
 * Используется при ошибочной двойной выдаче зарплаты
 * @param transaction - транзакция для отмены (только PAYOUT или ADVANCE)
 * @returns обновленный админ (через API) или null при ошибке
 */
export async function revertAdminPayoutTransaction(
  transaction: SalaryTransaction
): Promise<void> {
  // Только PAYOUT и ADVANCE можно удалять
  if (transaction.transaction_type !== 'PAYOUT' && transaction.transaction_type !== 'ADVANCE') {
    console.error('[revertAdminPayoutTransaction] Можно удалять только транзакции выплат и авансов');
    return;
  }

  // Удаляем транзакцию
  await deleteStaffSalaryTransaction(transaction.id);

  // Восстанавливаем баланс: добавляем сумму выплаты обратно
  const restoreAmount = Math.abs(transaction.amount);
  const newBalance = transaction.balance_after + restoreAmount;

  // Обновляем админа в БД
  await updateStaffAdmin(transaction.worker_id, {
    current_balance: newBalance,
  });
}
