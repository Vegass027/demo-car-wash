import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, User, Phone, Smartphone, Calendar as CalendarIcon, CreditCard, Wallet, ArrowDown, History, ChevronDown, ChevronUp, Trash2, Copy, Edit, Check, ArrowUpRight, ArrowRight, Clock, DollarSign, TrendingUp, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import { formatDate } from '../../shared/utils/date';
import type { Worker, WorkingMode } from '../../lib/api/workers';
import type { TireWorker } from '../../lib/api/tire-workers';
import type { Booking } from '../../lib/api/bookings';
import type { TireBooking } from '../../lib/api/tire-bookings';
import type { Admin } from '../../lib/types/admin';
import type { Service } from '../../lib/api/services';
import { AddWorkerModal } from './AddWorkerModal';
import { WorkerBookingsList } from './WorkerBookingsList';
import { TireTechnicians } from './TireTechnicians';
import { Admins } from './Admins';
import { WORKER_CONFIG } from '../../shared/config/worker';
import {
  transferDailyEarningsToBalance,
  payoutSalary,
  giveAdvance,
  formatBalance,
  getBalanceColor,
  validatePayout,
  revertWorkerPayoutTransaction,
} from '../../features/salary/manageBalance';
import { getTransactionsByWorkerAndType, getWorkerTransfersForPeriod, type SalaryTransaction } from '../../lib/api/salary-transactions';
import { getSalarySettings, getWorkerBaseRate, getWorkerCommission } from '../../lib/api/salary';
import type { SalarySettings } from '../../lib/types/salary';

interface WorkersProps {
  onBack: () => void;
  workers: Worker[];
  setWorkers: (workers: Worker[]) => void;
  bookings: Booking[];
  quickBookings?: Booking[];
  services?: Service[];
  onToggleWorkerWorking?: (workerId: string, isWorking: boolean) => void;
  // onToggleWorkerWorkingMode удалён - обрабатываем переключение режима локально
  tireTechnicians?: TireWorker[];
  setTireTechnicians?: (technicians: TireWorker[]) => void;
  onToggleTechnicianWorking?: (technicianId: string, isWorking: boolean) => void;
  tireBookings?: TireBooking[];
  admins?: Admin[];
  setAdmins?: (admins: Admin[]) => void;
  salarySettings?: SalarySettings | null;
  userRole?: 'admin' | 'owner';
}

export const Workers: React.FC<WorkersProps> = ({
  onBack,
  workers,
  setWorkers,
  bookings,
  quickBookings = [],
  services = [],
  onToggleWorkerWorking,
  onToggleWorkerWorkingMode,
  tireTechnicians = [],
  setTireTechnicians,
  onToggleTechnicianWorking,
  tireBookings = [],
  admins = [],
  setAdmins,
  salarySettings,
  userRole,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedWorkerForBookings, setSelectedWorkerForBookings] = useState<Worker | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<{ [worker_id: string]: string }>({});
  const [payoutAmounts, setPayoutAmounts] = useState<{ [worker_id: string]: string }>({});
  const [showTransactions, setShowTransactions] = useState<{ [worker_id: string]: boolean }>({});
  const [editingCardWorkerId, setEditingCardWorkerId] = useState<string | null>(null);
  const [editingCardDetails, setEditingCardDetails] = useState<string>('');
  const [editingPaymentWorkerId, setEditingPaymentWorkerId] = useState<string | null>(null);
  const [editingPaymentPhone, setEditingPaymentPhone] = useState<string>('');
  const [editingPaymentComment, setEditingPaymentComment] = useState<string>('');
  const [editingSalaryCommentWorkerId, setEditingSalaryCommentWorkerId] = useState<string | null>(null);
  const [editingSalaryComment, setEditingSalaryComment] = useState<string>('');
  const [copiedCardWorkerId, setCopiedCardWorkerId] = useState<string | null>(null);
  const [salaryTransactions, setSalaryTransactions] = useState<{ [worker_id: string]: SalaryTransaction[] }>({});
  const [loadingTransactions, setLoadingTransactions] = useState<{ [worker_id: string]: boolean }>({});
  const [startingShiftWorkerId, setStartingShiftWorkerId] = useState<string | null>(null);

  // Доход за период
  const [showEarningsPeriod, setShowEarningsPeriod] = useState<{ [worker_id: string]: boolean }>({});
  const [earningsDateRange, setEarningsDateRange] = useState<{ [worker_id: string]: { from: Date | undefined; to: Date | undefined } }>({});
  const [earningsForPeriod, setEarningsForPeriod] = useState<{ [worker_id: string]: number }>({});
  const [loadingEarnings, setLoadingEarnings] = useState<{ [worker_id: string]: boolean }>({});
  const [isEarningsCalendarOpen, setIsEarningsCalendarOpen] = useState<{ [worker_id: string]: boolean }>({});

  // Форматирование суммы
  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  // Загрузить транзакции для работника
  const loadWorkerTransactions = async (workerId: string) => {
    setLoadingTransactions(prev => ({ ...prev, [workerId]: true }));
    try {
      const transactions = await getTransactionsByWorkerAndType('worker', workerId);
      setSalaryTransactions(prev => ({ ...prev, [workerId]: transactions }));
    } catch (error) {
      console.error('Ошибка при загрузке транзакций:', error);
    } finally {
      setLoadingTransactions(prev => ({ ...prev, [workerId]: false }));
    }
  };

  // Обработчик открытия/закрытия истории транзакций
  const handleToggleTransactions = async (workerId: string) => {
    const isOpen = !showTransactions[workerId];
    setShowTransactions(prev => ({ ...prev, [workerId]: isOpen }));

    if (isOpen && !salaryTransactions[workerId]) {
      await loadWorkerTransactions(workerId);
    }
  };

  // Загрузить доход работника за период
  const loadWorkerEarningsForPeriod = async (workerId: string, dateRange?: { from: Date; to: Date }) => {
    // Если диапазон не передан, читаем из состояния
    const range = dateRange || earningsDateRange[workerId];
    if (!range?.from) return;

    setLoadingEarnings(prev => ({ ...prev, [workerId]: true }));
    try {
      const startDate = formatDate(range.from);
      const endDate = range.to ? formatDate(range.to) : startDate;

      const transfers = await getWorkerTransfersForPeriod(workerId, startDate, endDate);
      setEarningsForPeriod(prev => ({ ...prev, [workerId]: transfers }));
    } catch (error) {
      console.error('Ошибка при загрузке дохода за период:', error);
    } finally {
      setLoadingEarnings(prev => ({ ...prev, [workerId]: false }));
    }
  };

  const handleAddWorker = async (newWorkerData: { name: string; phone: string; cardDetails?: string; paymentPhone?: string; paymentComment?: string }) => {
    try {
      const { createWorker } = await import('../../lib/api/workers');
      const newWorker = await createWorker({
        full_name: newWorkerData.name,
        phone: normalizePhoneNumber(newWorkerData.phone),
        card_number: newWorkerData.cardDetails,
        payment_phone: newWorkerData.paymentPhone ? normalizePhoneNumber(newWorkerData.paymentPhone) : null,
        payment_comment: newWorkerData.paymentComment,
        is_active: true,
        working_mode: null,
        working_mode_status: 'waiting',
        partner_id: null,
        base_rate_amount: 0,
        is_working_today: false,
        cars_today: 0,
        earned_today: 0,
        current_balance: 0,
        is_advance_taken: false,
        base_rate_taken_today: false,
        completed_bookings: [],
        status: 'available',
        current_booking_id: null,
      });
      setWorkers([...workers, newWorker]);
    } catch (error) {
      console.error('Ошибка при создании мойщика:', error);
      alert('Не удалось создать мойщика');
    }
  };

  const handleTransferEarnings = async (worker_id: string) => {
    console.log('[handleTransferEarnings] Кнопка нажата для worker_id:', worker_id);

    const worker = workers.find(w => w.id === worker_id);
    if (!worker) {
      console.log('[handleTransferEarnings] Worker not found');
      return;
    }

    console.log('[handleTransferEarnings] Worker данные:', {
      id: worker.id,
      full_name: worker.full_name,
      earned_today: worker.earned_today,
      current_balance: worker.current_balance,
    });

    try {
      console.log('[handleTransferEarnings] Начинаем перевод...');
      const updatedWorker = await transferDailyEarningsToBalance(worker);
      console.log('[handleTransferEarnings] Перевод выполнен, обновленный работник:', updatedWorker);
      setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
      console.log('[handleTransferEarnings] Состояние обновлено');
      // Перезагружаем транзакции для отображения нового начисления
      await loadWorkerTransactions(worker_id);
      console.log('[handleTransferEarnings] Транзакции перезагружены');
    } catch (error) {
      console.error('[handleTransferEarnings] Ошибка при переносе заработка:', error);
      alert('Ошибка при переносе заработка: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handlePayoutSalary = async (worker_id: string) => {
    const amount = parseInt(payoutAmounts[worker_id] || '0', 10);
    if (isNaN(amount) || amount <= 0) return;

    const worker = workers.find(w => w.id === worker_id);
    if (!worker) return;

    try {
      const updatedWorker = await payoutSalary(worker, amount);
      if (updatedWorker) {
        setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
        setPayoutAmounts(prev => ({ ...prev, [worker_id]: '' }));
        // Перезагружаем транзакции для отображения новой выплаты
        await loadWorkerTransactions(worker_id);
      }
    } catch (error) {
      console.error('Ошибка при выплате зарплаты:', error);
    }
  };

  const handleGiveAdvance = async (worker_id: string) => {
    const amount = parseInt(payoutAmounts[worker_id] || '0', 10);
    if (isNaN(amount) || amount <= 0) return;

    const worker = workers.find(w => w.id === worker_id);
    if (!worker) return;

    try {
      const updatedWorker = await giveAdvance(worker, amount);
      if (updatedWorker) {
        setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
        setPayoutAmounts(prev => ({ ...prev, [worker_id]: '' }));
        // Перезагружаем транзакции для отображения нового аванса
        await loadWorkerTransactions(worker_id);
      }
    } catch (error) {
      console.error('Ошибка при выдаче аванса:', error);
    }
  };

  // Удаление транзакции выплаты/аванса (только для owner)
  const handleDeleteTransaction = async (workerId: string, transaction: SalaryTransaction) => {
    if (userRole !== 'owner') return;
    if (transaction.transaction_type !== 'PAYOUT' && transaction.transaction_type !== 'ADVANCE') return;

    if (!window.confirm('Удалить эту транзакцию и восстановить баланс?')) return;

    try {
      const updatedWorker = await revertWorkerPayoutTransaction(transaction);
      if (updatedWorker) {
        setWorkers(workers.map(w => w.id === workerId ? updatedWorker : w));
        // Перезагружаем транзакции
        await loadWorkerTransactions(workerId);
      }
    } catch (error) {
      console.error('Ошибка при удалении транзакции:', error);
      alert('Не удалось удалить транзакцию');
    }
  };

  const handleToggleWorkingMode = async (worker_id: string, mode: WorkingMode) => {
    console.log('[handleToggleWorkingMode] Начало выполнения для worker_id:', worker_id, 'mode:', mode);

    const worker = workers.find(w => w.id === worker_id);
    if (!worker) {
      console.log('[handleToggleWorkingMode] Worker not found');
      return;
    }

    if (!worker.is_working_today) {
      console.log('[handleToggleWorkingMode] Worker is not working today');
      return;
    }

    console.log('[handleToggleWorkingMode] Worker данные:', {
      id: worker.id,
      full_name: worker.full_name,
      working_mode: worker.working_mode,
      working_mode_status: worker.working_mode_status,
      earned_today: worker.earned_today,
      current_balance: worker.current_balance,
    });

    if (mode === 'solo') {
      // СОЛО: базовая ставка 500₽ + 40% от заказа
      let updatedWorker: Worker | null = null;
      let updatedPartner: Worker | null = null;

      if (worker.working_mode_status === 'waiting') {
        console.log('[handleToggleWorkingMode] Первый выбор режима SOLO - фиксируем базу');
        // Первый выбор - фиксируем базу!
        try {
          const { selectWorkerModeSolo } = await import('../../lib/api/workers');
          updatedWorker = await selectWorkerModeSolo(worker_id);
        } catch (error) {
          console.error('Ошибка при выборе режима solo:', error);
          alert('Не удалось выбрать режим solo');
          return;
        }
      } else if (worker.working_mode_status === 'locked') {
        console.log('[handleToggleWorkingMode] Переключение на SOLO - только режим, БЕЗ базы');
        // Переключение в течение дня - только режим, БЕЗ базы!
        try {
          const { changeWorkerMode } = await import('../../lib/api/workers');
          updatedWorker = await changeWorkerMode(worker_id, 'solo');
        } catch (error) {
          console.error('Ошибка при переключении на solo:', error);
          alert('Не удалось переключить режим');
          return;
        }
      }

      // Если у работника есть партнёр, переключаем его тоже в СОЛО
      if (worker.partner_id) {
        console.log('[handleToggleWorkingMode] У работника есть партнёр, переключаем его тоже в SOLO');
        const partner = workers.find(w => w.id === worker.partner_id);
        if (partner) {
          try {
            const { changeWorkerMode } = await import('../../lib/api/workers');
            updatedPartner = await changeWorkerMode(worker.partner_id, 'solo');
          } catch (error) {
            console.error('Ошибка при переключении партнёра на solo:', error);
            alert('Не удалось переключить партнёра');
            return;
          }
        }
      }

      // Обновляем состояние ОДИН РАЗ для обоих мойщиков
      if (updatedWorker || updatedPartner) {
        setWorkers(workers.map(w => {
          if (updatedWorker && w.id === worker_id) return updatedWorker;
          if (updatedPartner && w.id === worker.partner_id) return updatedPartner;
          return w;
        }));
      }

      // Очищаем selectedPartnerId для обоих (работника и его бывшего партнёра)
      setSelectedPartnerId(prev => {
        const newState = { ...prev };
        delete newState[worker_id];
        if (worker.partner_id) {
          delete newState[worker.partner_id];
        }
        return newState;
      });
    } else if (mode === 'pair') {
      // ПАРА: базовая ставка 250₽ + 20% от заказа
      let updatedWorker: Worker | null = null;

      if (worker.working_mode_status === 'locked') {
        console.log('[handleToggleWorkingMode] Переключение на PAIR - только режим, БЕЗ базы');
        // Переключение в течение дня - только режим, БЕЗ базы!
        try {
          const { changeWorkerMode } = await import('../../lib/api/workers');
          updatedWorker = await changeWorkerMode(worker_id, 'pair');
        } catch (error) {
          console.error('Ошибка при переключении на pair:', error);
          alert('Не удалось переключить режим');
          return;
        }
      } else {
        // ПЕРВЫЙ выбор - сохраняем working_mode = 'pair' в БД, БЕЗ базы!
        console.log('[handleToggleWorkingMode] Первый выбор режима PAIR - сохраняем в БД');
        try {
          const { updateWorker } = await import('../../lib/api/workers');
          updatedWorker = await updateWorker(worker_id, {
            working_mode: 'pair'
          });
        } catch (error) {
          console.error('Ошибка при выборе режима pair:', error);
          alert('Не удалось выбрать режим pair');
          return;
        }
      }

      // Обновляем состояние ОДИН РАЗ
      if (updatedWorker) {
        setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
      }
    }
  };

  const handleSelectPartner = (worker_id: string, partner_id: string) => {
    setSelectedPartnerId(prev => ({ ...prev, [worker_id]: partner_id }));
  };

  const handleConfirmPair = async (worker_id: string) => {
    console.log('[handleConfirmPair] Начало выполнения для worker_id:', worker_id);

    const partner_id = selectedPartnerId[worker_id];
    if (partner_id) {
      const worker = workers.find(w => w.id === worker_id);
      const partner = workers.find(w => w.id === partner_id);

      if (!worker || !partner) {
        alert('Мойщик или партнёр не найдены');
        return;
      }

      console.log('[handleConfirmPair] Worker данные:', {
        id: worker.id,
        full_name: worker.full_name,
        working_mode: worker.working_mode,
        working_mode_status: worker.working_mode_status,
        earned_today: worker.earned_today,
        current_balance: worker.current_balance,
      });

      console.log('[handleConfirmPair] Partner данные:', {
        id: partner.id,
        full_name: partner.full_name,
        working_mode: partner.working_mode,
        working_mode_status: partner.working_mode_status,
        earned_today: partner.earned_today,
        current_balance: partner.current_balance,
      });

      try {
        // Проверяем: оба мойщика работают сегодня И оба в режиме pair
        const workerValid = worker.is_working_today && worker.working_mode === 'pair';
        const partnerValid = partner.is_working_today && partner.working_mode === 'pair';

        if (!workerValid || !partnerValid) {
          alert('Нельзя создать пару: оба мойщика должны работать сегодня и быть в режиме "Пара"');
          return;
        }

        if (worker.working_mode_status === 'waiting' && partner.working_mode_status === 'waiting') {
          console.log('[handleConfirmPair] Первый выбор режима PAIR - фиксируем базу для обоих');
          // Первый выбор - фиксируем базу для обоих!
          const { selectWorkerPairMode } = await import('../../lib/api/workers');
          const [updatedWorker, updatedPartner] = await selectWorkerPairMode(worker_id, partner_id);
          setWorkers(workers.map(w =>
            w.id === worker_id ? updatedWorker :
            w.id === partner_id ? updatedPartner : w
          ));
          // Очищаем selectedPartnerId после успешного создания пары
          setSelectedPartnerId(prev => {
            const newState = { ...prev };
            delete newState[worker_id];
            delete newState[partner_id];
            return newState;
          });
        } else if (
          (worker.working_mode_status === 'locked' && partner.working_mode_status === 'waiting') ||
          (worker.working_mode_status === 'waiting' && partner.working_mode_status === 'locked')
        ) {
          console.log('[handleConfirmPair] Смешанный статус: один locked, другой waiting');
          // Один уже зафиксировал базу, другой ещё нет

          // ✅ Commit 1 UX-guard: waiting-worker confirm-with-base-rate bypass
          //    (multi-field updateWorker call below) was using 4 blacklisted
          //    salary fields. After fix in БД (migration 026 RPC whitelist),
          //    this path returns 500. Will be properly fixed in commit 7 via
          //    select_worker_mode_pair RPC. Until then: explicit message.
          const waitingOne = worker.working_mode_status === 'waiting' ? worker : partner;
          if (!waitingOne.base_rate_taken_today) {
            alert(
              `Подтверждение пары невозможно: у мойщика ${waitingOne.full_name} ` +
              `не начислена базовая ставка. Сначала переключите обоих мойщиков в ` +
              `режим "Соло" (для начисления базы), затем повторите выбор пары.`
            );
            return;
          }
          const { updateWorker } = await import('../../lib/api/workers');
          const { getSalarySettings } = await import('../../lib/api/salary');
          const settings = await getSalarySettings();
          if (!settings) {
            alert('Настройки зарплаты не найдены');
            return;
          }

          const baseRateAmount = settings.worker_pair_base; // 250₽

          // Определяем, кто locked, а кто waiting
          const lockedWorker = worker.working_mode_status === 'locked' ? worker : partner;
          const waitingWorker = worker.working_mode_status === 'waiting' ? worker : partner;

          console.log('[handleConfirmPair] Locked worker:', lockedWorker.full_name, 'Waiting worker:', waitingWorker.full_name);

          // Для locked: просто обновляем partner_id (база уже есть!)
          const updatedLocked = await updateWorker(lockedWorker.id, {
            partner_id: waitingWorker.id
          });

          // Для waiting: фиксируем базу и устанавливаем partner_id
          // Проверяем, была ли уже начислена база сегодня
          const newEarnedToday = waitingWorker.base_rate_taken_today
            ? waitingWorker.earned_today
            : waitingWorker.earned_today + baseRateAmount;
          const updatedWaiting = await updateWorker(waitingWorker.id, {
            working_mode: 'pair',
            working_mode_status: 'locked',
            partner_id: lockedWorker.id,
            base_rate_amount: baseRateAmount,
            base_rate_taken_today: true,
            earned_today: newEarnedToday,
          });

          // Обновляем состояние
          setWorkers(workers.map(w =>
            w.id === lockedWorker.id ? updatedLocked :
            w.id === waitingWorker.id ? updatedWaiting : w
          ));

          // Очищаем selectedPartnerId после успешного создания пары
          setSelectedPartnerId(prev => {
            const newState = { ...prev };
            delete newState[worker_id];
            delete newState[partner_id];
            return newState;
          });
        } else if (worker.working_mode_status === 'locked' && partner.working_mode_status === 'locked') {
          console.log('[handleConfirmPair] Переключение на PAIR - только режим, БЕЗ базы');
          // Переключение в течение дня - только режим, БЕЗ базы!
          const { changeWorkerMode } = await import('../../lib/api/workers');
          const [updatedWorker, updatedPartner] = await Promise.all([
            changeWorkerMode(worker_id, 'pair', partner_id),
            changeWorkerMode(partner_id, 'pair', worker_id)
          ]);
          setWorkers(workers.map(w =>
            w.id === worker_id ? updatedWorker :
            w.id === partner_id ? updatedPartner : w
          ));
          // Очищаем selectedPartnerId после успешного создания пары
          setSelectedPartnerId(prev => {
            const newState = { ...prev };
            delete newState[worker_id];
            delete newState[partner_id];
            return newState;
          });
        } else {
          alert('Нельзя создать пару: у мойщиков разные статусы режима работы');
          return;
        }
      } catch (error) {
        console.error('Ошибка при подтверждении пары:', error);
        alert('Не удалось подтвердить пару');
      }
    }
  };

  const handleDeleteWorker = async (worker_id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этого работника?')) {
      try {
        const { deleteWorker } = await import('../../lib/api/workers');
        await deleteWorker(worker_id);
        setWorkers(workers.filter(w => w.id !== worker_id));
      } catch (error) {
        console.error('Ошибка при удалении работника:', error);
        alert('Не удалось удалить работника');
      }
    }
  };

  const handleDeleteTechnician = async (technicianId: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этого шиномонтажника?')) {
      try {
        const { deleteTireWorker } = await import('../../lib/api/tire-workers');
        await deleteTireWorker(technicianId);
        setTireTechnicians?.(tireTechnicians.filter(t => t.id !== technicianId));
      } catch (error) {
        console.error('Ошибка при удалении шиномонтажника:', error);
        alert('Не удалось удалить шиномонтажника');
      }
    }
  };

  const handleCopyCardDetails = (worker_id: string, cardDetails: string) => {
    navigator.clipboard.writeText(cardDetails);
    setCopiedCardWorkerId(worker_id);
    setTimeout(() => {
      setCopiedCardWorkerId(null);
    }, 2000);
  };

  const handleStartEditCard = (worker_id: string, cardDetails: string) => {
    setEditingCardWorkerId(worker_id);
    setEditingCardDetails(cardDetails);
  };

  const handleSaveCardDetails = async (worker_id: string) => {
    try {
      const { updateWorker } = await import('../../lib/api/workers');
      const updatedWorker = await updateWorker(worker_id, {
        card_number: editingCardDetails,
      });
      setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
      setEditingCardWorkerId(null);
      setEditingCardDetails('');
    } catch (error) {
      console.error('Ошибка при сохранении реквизитов:', error);
      alert('Не удалось сохранить реквизиты');
    }
  };

  const handleCancelEditCard = () => {
    setEditingCardWorkerId(null);
    setEditingCardDetails('');
  };

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    const limitedDigits = digits.slice(0, 11);

    if (limitedDigits.length === 0) return '+7 ';
    if (limitedDigits.length <= 1) return `+${limitedDigits}`;
    if (limitedDigits.length <= 4) return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1)}`;
    if (limitedDigits.length <= 7) return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1, 4)}) ${limitedDigits.slice(4)}`;
    if (limitedDigits.length <= 9) return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1, 4)}) ${limitedDigits.slice(4, 7)}-${limitedDigits.slice(7)}`;
    return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1, 4)}) ${limitedDigits.slice(4, 7)}-${limitedDigits.slice(7, 9)}-${limitedDigits.slice(9)}`;
  };

  const handleStartEditPayment = (worker_id: string, paymentPhone: string, paymentComment: string) => {
    setEditingPaymentWorkerId(worker_id);
    const formattedPhone = formatPhoneNumber(paymentPhone || '+7 ');
    setEditingPaymentPhone(formattedPhone);
    setEditingPaymentComment(paymentComment || '');
  };

  const handlePaymentPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    if (formatted.startsWith('+7 ') || formatted === '+7') {
      setEditingPaymentPhone(formatted);
    } else if (formatted === '') {
      setEditingPaymentPhone('+7 ');
    }
  };

  const handleSavePayment = async (worker_id: string) => {
    try {
      const { updateWorker } = await import('../../lib/api/workers');
      const updatedWorker = await updateWorker(worker_id, {
        payment_phone: normalizePhoneNumber(editingPaymentPhone),
        payment_comment: editingPaymentComment,
      });
      setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
      setEditingPaymentWorkerId(null);
      setEditingPaymentPhone('');
      setEditingPaymentComment('');
    } catch (error) {
      console.error('Ошибка при сохранении телефона и комментария:', error);
      alert('Не удалось сохранить телефон и комментарий');
    }
  };

  const handleCancelEditPayment = () => {
    setEditingPaymentWorkerId(null);
    setEditingPaymentPhone('');
    setEditingPaymentComment('');
  };

  const handleStartEditSalaryComment = (worker_id: string, salaryComment: string) => {
    setEditingSalaryCommentWorkerId(worker_id);
    setEditingSalaryComment(salaryComment || '');
  };

  const handleSaveSalaryComment = async (worker_id: string) => {
    try {
      const { updateWorker } = await import('../../lib/api/workers');
      const updatedWorker = await updateWorker(worker_id, {
        salary_comment: editingSalaryComment,
      });
      setWorkers(workers.map(w => w.id === worker_id ? updatedWorker : w));
      setEditingSalaryCommentWorkerId(null);
      setEditingSalaryComment('');
    } catch (error) {
      console.error('Ошибка при сохранении комментария к выплате:', error);
      alert('Не удалось сохранить комментарий');
    }
  };

  const handleCancelEditSalaryComment = () => {
    setEditingSalaryCommentWorkerId(null);
    setEditingSalaryComment('');
  };

  // Локальный обработчик для кнопки "Работает сегодня" с блокировкой
  const handleToggleWorkingToday = async (worker_id: string, isWorking: boolean) => {
    if (!isWorking) {
      // Включаем смену - блокируем кнопку
      try {
        setStartingShiftWorkerId(worker_id);
        const { startWorkerShift } = await import('../../lib/api/workers');
        await startWorkerShift(worker_id);
        // Перезагружаем работников через onToggleWorkerWorking
        onToggleWorkerWorking?.(worker_id, true);
      } catch (error) {
        console.error('Ошибка при начале смены:', error);
        alert('Не удалось начать смену');
      } finally {
        setStartingShiftWorkerId(null);
      }
    } else {
      // Выключаем смену - просто вызываем пропс
      onToggleWorkerWorking?.(worker_id, false);
    }
  };

  const getAvailablePartners = (worker: Worker): Worker[] => {
    return workers.filter(w =>
      w.id !== worker.id &&
      w.is_working_today &&
      w.working_mode === 'pair' &&  // Тоже выбрал режим "Пара"
      !w.partner_id  // Ещё не имеет партнёра
    );
  };

  return (
    <div className="pb-20 pt-safe telegram-safe-area-top animate-in fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Персонал</h2>
      </div>

      {/* Раздел Мойщики */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Мойщики</h3>
          <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Добавить
          </Button>
        </div>

      {/* Список мойщиков */}
      <div className="space-y-4">
        {workers.map((worker) => (
          <Card key={worker.id} className="hover:shadow-md transition-shadow border-2 border-gray-300">
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <div className="font-bold text-lg flex items-center gap-2">
                      {worker.full_name}
                      <span className="text-gray-400">|</span>
                      <button
                        onClick={() => handleDeleteWorker(worker.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {worker.phone}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-4 mb-3 items-center">
                <div>
                  <div className="text-xs text-gray-500 uppercase">Машин сегодня</div>
                  <div className="font-bold text-lg">{worker.cars_today}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 uppercase">Заработано</div>
                  <div className="font-bold text-lg text-green-600">
                    {worker.earned_today.toLocaleString()} ₽
                  </div>
                </div>
              </div>

              {/* Кнопка перевода на весь контейнер */}
              {worker.earned_today > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs mb-3"
                  onClick={() => handleTransferEarnings(worker.id)}
                >
                  <ArrowDown className="w-3 h-3 mr-1" />
                  Перевести на итоговый баланс
                </Button>
              )}

              {/* Отображение условий с базовой ставкой */}
              {worker.working_mode_status === 'locked' && salarySettings && worker.working_mode === 'solo' && (
                <div className="text-xs text-gray-400 mb-3">
                  Условия: {worker.base_rate_amount}₽ выход + {(salarySettings.worker_solo_commission * 100).toFixed(0)}% от заказа
                </div>
              )}
              {worker.working_mode_status === 'locked' && salarySettings && worker.working_mode === 'pair' && (
                <div className="text-xs text-gray-400 mb-3">
                  Условия: {worker.base_rate_amount}₽ выход + {(salarySettings.worker_pair_commission * 100).toFixed(0)}% от заказа
                </div>
              )}
              {worker.working_mode_status === 'waiting' && (
                <div className="text-xs text-gray-400 mb-3">
                  Выберите режим работы (Один или Пара)
                </div>
              )}
              {!salarySettings && (
                <div className="text-xs text-gray-400 mb-3">
                  Загрузка условий...
                </div>
              )}

              <div className="border-t border-gray-200 mb-3"></div>

              {/* Селектор режима работы */}
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">Режим работы:</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleWorkingMode(worker.id, 'solo')}
                    disabled={!worker.is_working_today}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-md transition-colors",
                      worker.working_mode === 'solo'
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                      !worker.is_working_today && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    Один
                  </button>
                  <button
                    onClick={() => handleToggleWorkingMode(worker.id, 'pair')}
                    disabled={!worker.is_working_today}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-md transition-colors",
                      worker.working_mode === 'pair'
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                      !worker.is_working_today && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    Пара
                  </button>
                </div>
              </div>

              {/* Выбор партнёра для режима Pair (только если нет партнёра) */}
              {worker.working_mode === 'pair' && !worker.partner_id && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-2">Партнёр:</div>
                  <Select
                    value={selectedPartnerId[worker.id] || worker.partner_id || ''}
                    onValueChange={(value) => handleSelectPartner(worker.id, value)}
                  >
                    <SelectTrigger className="w-full h-10">
                      <SelectValue placeholder="Выберите мойщика..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailablePartners(worker).map(partner => (
                        <SelectItem key={partner.id} value={partner.id}>
                          {partner.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPartnerId[worker.id] && selectedPartnerId[worker.id] !== worker.partner_id && (
                    <Button
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => handleConfirmPair(worker.id)}
                    >
                      Подтвердить пару
                    </Button>
                  )}
                </div>
              )}

              {/* Отображение текущего партнёра (если база зафиксирована) */}
              {worker.working_mode === 'pair' && worker.working_mode_status === 'locked' && worker.partner_id && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">Партнёр:</div>
                  <div className="text-sm font-medium">
                    {workers.find(w => w.id === worker.partner_id)?.full_name || 'Неизвестно'}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-300 mb-3"></div>

              {/* Toggle Switch - работает сегодня */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Работает сегодня</span>
                <button
                  onClick={() => handleToggleWorkingToday(worker.id, !worker.is_working_today)}
                  disabled={startingShiftWorkerId === worker.id}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
                    worker.is_working_today ? "bg-green-500" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      worker.is_working_today ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Кнопка заказов за сегодня */}
              <Button
                size="sm"
                className="w-full mb-3 bg-black hover:bg-gray-800 text-white"
                onClick={() => setSelectedWorkerForBookings(worker)}
              >
                <CalendarIcon className="w-4 h-4 mr-1.5 text-white" />
                Заказы за сегодня
              </Button>

              {/* Разделитель */}
              <div className="border-t border-gray-300 mb-3"></div>

              {/* Актуальный баланс */}
              <div className="bg-blue-50 rounded-lg p-3 mb-3">
                <div className="flex flex-col">
                  {/* Заголовок и сумма на одной линии */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-gray-600 uppercase">Итоговый баланс</span>
                    </div>
                    <div className={`font-bold text-lg ${getBalanceColor(worker.current_balance)}`}>
                      {formatBalance(worker.current_balance)}
                    </div>
                  </div>

                  {/* Горизонтальный разделитель */}
                  <div className="w-full border-t border-gray-300 mb-2"></div>

                  {/* Реквизиты */}
                  {editingCardWorkerId === worker.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCardDetails}
                        onChange={(e) => setEditingCardDetails(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border rounded"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs px-2 py-1"
                        onClick={() => handleSaveCardDetails(worker.id)}
                      >
                        ✓
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs px-2 py-1"
                        onClick={handleCancelEditCard}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : worker.card_number || worker.payment_phone ? (
                    <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:gap-2">
                      {/* Номер карты */}
                      {worker.card_number && (
                        <>
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-blue-600" />
                            <span className="text-xs text-gray-600">{worker.card_number}</span>
                            <button onClick={() => handleCopyCardDetails(worker.id, worker.card_number)} className="text-gray-400 hover:text-gray-600">
                              {copiedCardWorkerId === worker.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <button onClick={() => handleStartEditCard(worker.id, worker.card_number)} className="text-gray-400 hover:text-gray-600">
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                          {/* Разделитель между картой и телефоном */}
                          {worker.payment_phone && (
                            <>
                              <span className="md:hidden w-full border-t border-gray-200 my-2"></span>
                              <span className="hidden md:inline text-gray-400">|</span>
                            </>
                          )}
                        </>
                      )}
                      {/* Телефон */}
                      {worker.payment_phone && (
                        <>
                          {editingPaymentWorkerId === worker.id ? (
                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex items-center gap-2">
                                <Smartphone className="w-3 h-3 text-gray-500" />
                                <input
                                  type="text"
                                  value={editingPaymentPhone}
                                  onChange={handlePaymentPhoneChange}
                                  className="flex-1 px-2 py-1 text-xs border rounded"
                                  placeholder="+7 (___) ___-__-__"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-3 h-3 text-gray-500" />
                                <input
                                  type="text"
                                  value={editingPaymentComment}
                                  onChange={(e) => setEditingPaymentComment(e.target.value)}
                                  className="flex-1 px-2 py-1 text-xs border rounded"
                                  placeholder="Комментарий (например: Сбер, Тинькофф)"
                                />
                                <Button size="sm" variant="outline" className="text-xs px-2 py-1" onClick={() => handleSavePayment(worker.id)}>✓</Button>
                                <Button size="sm" variant="outline" className="text-xs px-2 py-1" onClick={handleCancelEditPayment}>✕</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-gray-600">{worker.payment_phone}</span>
                              {worker.payment_comment && (
                                <span className="text-xs text-gray-400 italic">({worker.payment_comment})</span>
                              )}
                              <button onClick={() => { navigator.clipboard.writeText(worker.payment_phone); setCopiedCardWorkerId(worker.id); setTimeout(() => setCopiedCardWorkerId(null), 2000); }} className="text-gray-400 hover:text-gray-600">
                                {copiedCardWorkerId === worker.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                              <button onClick={() => handleStartEditPayment(worker.id, worker.payment_phone, worker.payment_comment || '')} className="text-gray-400 hover:text-gray-600">
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Секция выплат */}
              <div className="border-t border-gray-200 pt-3 mb-3">
                {/* Комментарий к выплате зарплаты */}
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-3">
                  <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-yellow-600" />
                    Комментарий к выплате
                  </div>
                  {editingSalaryCommentWorkerId === worker.id ? (
                    <div className="flex items-start gap-2">
                      <input
                        type="text"
                        value={editingSalaryComment}
                        onChange={(e) => setEditingSalaryComment(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border-2 border-yellow-400 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                        placeholder="Комментарий к выплате (заметки)"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs px-3 py-2 bg-green-500 hover:bg-green-600 text-white border-green-600"
                          onClick={() => handleSaveSalaryComment(worker.id)}
                        >
                          ✓
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs px-3 py-2 bg-red-500 hover:bg-red-600 text-white border-red-600"
                          onClick={handleCancelEditSalaryComment}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        {worker.salary_comment ? (
                          <p className="text-sm text-gray-800 bg-white p-3 rounded-md border border-gray-200">
                            {worker.salary_comment}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">Нет комментария</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleStartEditSalaryComment(worker.id, worker.salary_comment || '')}
                        className="text-gray-500 hover:text-yellow-600 transition-colors"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4" />
                  Выплата зарплаты
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Сумма"
                    className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={payoutAmounts[worker.id] || ''}
                    onChange={(e) => setPayoutAmounts(prev => ({ ...prev, [worker.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => handlePayoutSalary(worker.id)}
                    disabled={!payoutAmounts[worker.id]}
                  >
                    Выдать
                  </Button>
                </div>
              </div>

              {/* Доход за период */}
              <div className="border-t border-gray-300 pt-3 mb-3">
                <button
                  onClick={() => setShowEarningsPeriod(prev => ({ ...prev, [worker.id]: !showEarningsPeriod[worker.id] }))}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Доход за период</span>
                  {showEarningsPeriod[worker.id] ? (
                    <ChevronUp className="w-4 h-4 ml-auto" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  )}
                </button>

                {showEarningsPeriod[worker.id] && (
                  <div className="space-y-3">
                    <Popover
                      open={isEarningsCalendarOpen[worker.id]}
                      onOpenChange={(open) => setIsEarningsCalendarOpen(prev => ({ ...prev, [worker.id]: open }))}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !earningsDateRange[worker.id]?.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {earningsDateRange[worker.id]?.from ? (
                            earningsDateRange[worker.id]?.to ? (
                              <>
                                {format(earningsDateRange[worker.id].from, 'dd.MM.yyyy', { locale: ru })} -{" "}
                                {format(earningsDateRange[worker.id].to, 'dd.MM.yyyy', { locale: ru })}
                              </>
                            ) : (
                              format(earningsDateRange[worker.id].from, 'dd.MM.yyyy', { locale: ru })
                            )
                          ) : (
                            <span>Выберите период</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={earningsDateRange[worker.id]}
                          onSelect={(range) => {
                            console.log('[Calendar] Выбран диапазон:', range);

                            if (!range?.from) {
                              // Сброс - ничего не выбрано
                              setEarningsDateRange(prev => ({ ...prev, [worker.id]: { from: undefined, to: undefined } }));
                              setEarningsForPeriod(prev => ({ ...prev, [worker.id]: undefined }));
                              console.log('[Calendar] Сброс диапазона');
                              return;
                            }

                            // Сохраняем диапазон (если to не выбран, to = from для одной даты)
                            const newRange = {
                              from: range.from,
                              to: range.to || range.from
                            };

                            console.log('[Calendar] Сохраняем диапазон:', newRange);
                            setEarningsDateRange(prev => ({ ...prev, [worker.id]: newRange }));

                            // Загружаем данные - передаём диапазон напрямую, чтобы избежать проблем с асинхронностью setState
                            loadWorkerEarningsForPeriod(worker.id, newRange);
                          }}
                          locale={ru}
                          showOutsideDays={false}
                          disabled={{ after: new Date() }}
                        />
                      </PopoverContent>
                    </Popover>

                    {loadingEarnings[worker.id] ? (
                      <div className="text-center text-gray-500 text-xs py-2">Загрузка...</div>
                    ) : earningsForPeriod[worker.id] !== undefined ? (
                      earningsForPeriod[worker.id] > 0 ? (
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-green-600" />
                              <span className="text-sm font-medium text-gray-700">Доход за период:</span>
                            </div>
                            <span className="text-lg font-bold text-green-600">
                              {formatMoney(earningsForPeriod[worker.id])}₽
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
                            <TrendingUp className="w-4 h-4" />
                            <span>Нет переводов за выбранный период</span>
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>
                )}
              </div>

              {/* История транзакций */}
              <div className="border-t border-gray-300 pt-3 mb-3">
                <button
                  onClick={() => handleToggleTransactions(worker.id)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
                >
                  <History className="w-4 h-4" />
                  <span>История выплат</span>
                  {showTransactions[worker.id] ? (
                    <ChevronUp className="w-4 h-4 ml-auto" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  )}
                </button>

                {showTransactions[worker.id] && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {loadingTransactions[worker.id] ? (
                      <div className="text-center text-gray-500 text-xs py-2">Загрузка...</div>
                    ) : !salaryTransactions[worker.id] || salaryTransactions[worker.id].length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-4">Нет транзакций</div>
                    ) : (
                      salaryTransactions[worker.id]
                        .filter(t => t.transaction_type === 'PAYOUT' || t.transaction_type === 'ADVANCE' || t.transaction_type === 'TRANSFER')
                        .slice(0, 10)
                        .map((transaction) => {
                          const operationDate = new Date(transaction.created_at).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          });

                          return (
                            <div key={transaction.id} className={cn(
                              "rounded border p-2 text-xs",
                              transaction.transaction_type === 'TRANSFER'
                                ? "bg-green-50 border-green-200"
                                : "bg-gray-50 border-gray-200"
                            )}>
                              {transaction.transaction_type === 'TRANSFER' ? (
                                // TRANSFER: Перевод с ежедневного баланса
                                <>
                                  <div className="flex items-center gap-1 mb-1">
                                    <ArrowRight className="w-3 h-3 text-green-600" />
                                    <span className="font-medium text-green-700">Перевод с ежедневного баланса</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-gray-600">
                                    <Clock className="w-3 h-3" />
                                    <span>Дата операции: {operationDate}</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t border-green-200">
                                    <span className="font-bold text-green-600">
                                      {transaction.amount > 0 ? '+' : ''}{formatBalance(transaction.amount)}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                // PAYOUT и ADVANCE: Выплата зарплаты/Аванс
                                <>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                      {transaction.transaction_type === 'PAYOUT' ? (
                                        <DollarSign className="w-3 h-3 text-blue-600" />
                                      ) : (
                                        <ArrowUpRight className="w-3 h-3 text-orange-600" />
                                      )}
                                      <span className="font-medium">
                                        {transaction.transaction_type === 'PAYOUT' ? 'Выплата зарплаты' : 'Аванс'}
                                      </span>
                                    </div>
                                    {/* Кнопка удаления только для owner */}
                                    {userRole === 'owner' && (
                                      <button
                                        onClick={() => handleDeleteTransaction(worker.id, transaction)}
                                        className="text-gray-400 hover:text-red-600 transition-colors"
                                        title="Удалить транзакцию"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-gray-600">
                                    <Clock className="w-3 h-3" />
                                    <span>Дата операции: {operationDate}</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                    <span className="font-bold text-red-600">
                                      -{formatBalance(Math.abs(transaction.amount))}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
      </div>

      {/* Разделитель */}
      <div className="my-8 border-t-2 border-gray-200"></div>

      {/* Раздел Шиномонтажники */}
      <TireTechnicians
        technicians={tireTechnicians}
        setTechnicians={setTireTechnicians || (() => {})}
        tireBookings={tireBookings}
        onToggleTechnicianWorking={onToggleTechnicianWorking || (() => {})}
        onDeleteTechnician={handleDeleteTechnician}
        salarySettings={salarySettings}
        userRole={userRole}
      />

      {/* Разделитель */}
      <div className="my-8 border-t-2 border-gray-200"></div>

      {/* Раздел Админы */}
      <Admins
        admins={admins}
        setAdmins={setAdmins || (() => {})}
        userRole={userRole}
      />

      {/* Modals */}
      <AddWorkerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddWorker}
      />

      <WorkerBookingsList
        worker={selectedWorkerForBookings!}
        allBookings={[...bookings, ...quickBookings]}
        allWorkers={workers}
        services={services}
        isOpen={selectedWorkerForBookings !== null}
        onClose={() => setSelectedWorkerForBookings(null)}
        salarySettings={salarySettings}
      />
    </div>
  );
};
