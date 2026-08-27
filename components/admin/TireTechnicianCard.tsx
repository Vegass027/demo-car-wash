import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { User, Phone, Smartphone, Calendar as CalendarIcon, CreditCard, Wallet, ArrowDown, History, ChevronDown, ChevronUp, Copy, Edit, Check, Trash2, ArrowUpRight, ArrowRight, Clock, DollarSign, TrendingUp, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import { formatDate } from '../../shared/utils/date';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TireWorker } from '../../lib/api/tire-workers';
import { TireBooking } from '../../lib/api/tire-bookings';
import { TIRE_TECHNICIAN_CONFIG } from '../../shared/config/worker';
import { stopStaffTireWorkerShift } from '../../lib/api/staff-actions';
import {
  transferDailyEarningsToBalanceForTechnician,
  payoutSalaryForTechnician,
  giveAdvanceForTechnician,
  formatBalance,
  getBalanceColor,
  validatePayout,
  revertTireWorkerPayoutTransaction,
} from '../../features/salary/manageBalance';
import { SalaryTransaction, getTransactionsByWorkerAndType, getWorkerTransfersForPeriod } from '../../lib/api/salary-transactions';
import type { SalarySettings } from '../../lib/types/salary';

interface TireTechnicianCardProps {
  technician: TireWorker;
  bookings: TireBooking[];
  onToggleWorking: (technicianId: string, isWorking: boolean) => void;
  onViewBookings: (technician: TireWorker) => void;
  onUpdateTechnician: (technicianId: string, updatedTechnician: TireWorker) => void;
  onDelete?: (technicianId: string) => void;
  salarySettings?: SalarySettings | null;
  userRole?: 'admin' | 'owner';
}

export const TireTechnicianCard: React.FC<TireTechnicianCardProps> = ({
  technician,
  bookings,
  onToggleWorking,
  onViewBookings,
  onUpdateTechnician,
  onDelete,
  salarySettings,
  userRole,
}) => {
  const [payoutAmount, setPayoutAmount] = useState('');
  const [showTransactions, setShowTransactions] = useState(false);
  const [salaryTransactions, setSalaryTransactions] = useState<SalaryTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [editingCardWorkerId, setEditingCardWorkerId] = useState<string | null>(null);
  const [editingCardDetails, setEditingCardDetails] = useState<string>('');
  const [editingPaymentWorkerId, setEditingPaymentWorkerId] = useState<string | null>(null);
  const [editingPaymentPhone, setEditingPaymentPhone] = useState<string>('');
  const [editingPaymentComment, setEditingPaymentComment] = useState<string>('');
  const [editingSalaryCommentWorkerId, setEditingSalaryCommentWorkerId] = useState<string | null>(null);
  const [editingSalaryComment, setEditingSalaryComment] = useState<string>('');
  const [copiedCardWorkerId, setCopiedCardWorkerId] = useState<string | null>(null);
  const [startingShiftTechnicianId, setStartingShiftTechnicianId] = useState<string | null>(null);

  // Доход за период
  const [showEarningsPeriod, setShowEarningsPeriod] = useState(false);
  const [earningsDateRange, setEarningsDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({});
  const [earningsForPeriod, setEarningsForPeriod] = useState<number | undefined>();
  const [loadingEarnings, setLoadingEarnings] = useState(false);
  const [isEarningsCalendarOpen, setIsEarningsCalendarOpen] = useState(false);

  // Загружаем транзакции при открытии секции
  useEffect(() => {
    if (showTransactions && !loadingTransactions && salaryTransactions.length === 0) {
      loadWorkerTransactions();
    }
  }, [showTransactions]);

  const loadWorkerTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const transactions = await getTransactionsByWorkerAndType('tire_worker', technician.id);
      // Фильтруем: показываем только PAYOUT, ADVANCE, TRANSFER (не EARNING)
      const filteredTransactions = transactions.filter(
        t => t.transaction_type === 'PAYOUT' || t.transaction_type === 'ADVANCE' || t.transaction_type === 'TRANSFER'
      );
      setSalaryTransactions(filteredTransactions);
    } catch (error) {
      console.error('Ошибка при загрузке транзакций:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleTransferEarnings = async () => {
    try {
      const updatedTechnician = await transferDailyEarningsToBalanceForTechnician(technician);
      onUpdateTechnician(technician.id, updatedTechnician);
      // Перезагружаем транзакции для отображения нового перевода
      loadWorkerTransactions();
    } catch (error) {
      console.error('Ошибка при переносе заработка:', error);
      alert('Не удалось перенести заработок: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handlePayoutSalary = async () => {
    const amount = parseInt(payoutAmount, 10);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const updatedTechnician = await payoutSalaryForTechnician(technician, amount);
      onUpdateTechnician(technician.id, updatedTechnician);
      setPayoutAmount('');
      // Перезагружаем транзакции для отображения новой выплаты
      loadWorkerTransactions();
    } catch (error) {
      console.error('Ошибка при выплате зарплаты:', error);
      alert('Не удалось выплатить зарплату: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleGiveAdvance = async () => {
    const amount = parseInt(payoutAmount, 10);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const updatedTechnician = await giveAdvanceForTechnician(technician, amount);
      onUpdateTechnician(technician.id, updatedTechnician);
      setPayoutAmount('');
      // Перезагружаем транзакции для отображения нового аванса
      loadWorkerTransactions();
    } catch (error) {
      console.error('Ошибка при выдаче аванса:', error);
      alert('Не удалось выдать аванс: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Удаление транзакции выплаты/аванса (только для owner)
  const handleDeleteTransaction = async (transaction: SalaryTransaction) => {
    if (userRole !== 'owner') return;
    if (transaction.transaction_type !== 'PAYOUT' && transaction.transaction_type !== 'ADVANCE') return;

    if (!window.confirm('Удалить эту транзакцию и восстановить баланс?')) return;

    try {
      const updatedTechnician = await revertTireWorkerPayoutTransaction(transaction);
      if (updatedTechnician) {
        onUpdateTechnician(technician.id, updatedTechnician);
      }
      // Перезагружаем транзакции
      loadWorkerTransactions();
    } catch (error) {
      console.error('Ошибка при удалении транзакции:', error);
      alert('Не удалось удалить транзакцию');
    }
  };

  const handleCopyCardDetails = (workerId: string, cardDetails: string) => {
    navigator.clipboard.writeText(cardDetails);
    setCopiedCardWorkerId(workerId);
    setTimeout(() => {
      setCopiedCardWorkerId(null);
    }, 2000);
  };

  const handleStartEditCard = (workerId: string, cardDetails: string) => {
    setEditingCardWorkerId(workerId);
    setEditingCardDetails(cardDetails);
  };

  const handleSaveCardDetails = async (workerId: string) => {
    try {
      const { updateTireWorker } = await import('../../lib/api/tire-workers');
      const updatedTechnician = await updateTireWorker(technician.id, {
        card_number: editingCardDetails,
      });
      onUpdateTechnician(technician.id, updatedTechnician);
      setEditingCardWorkerId(null);
      setEditingCardDetails('');
    } catch (error) {
      console.error('Ошибка при обновлении реквизитов:', error);
      alert('Не удалось обновить реквизиты');
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

  const handleStartEditPayment = (workerId: string, paymentPhone: string, paymentComment: string) => {
    setEditingPaymentWorkerId(workerId);
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

  const handleSavePayment = async (workerId: string) => {
    try {
      const { updateTireWorker } = await import('../../lib/api/tire-workers');
      const updatedTechnician = await updateTireWorker(technician.id, {
        payment_phone: normalizePhoneNumber(editingPaymentPhone),
        payment_comment: editingPaymentComment,
      });
      onUpdateTechnician(technician.id, updatedTechnician);
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

  const handleStartEditSalaryComment = (technicianId: string, salaryComment: string) => {
    setEditingSalaryCommentWorkerId(technicianId);
    setEditingSalaryComment(salaryComment || '');
  };

  const handleSaveSalaryComment = async (technicianId: string) => {
    try {
      const { updateTireWorker } = await import('../../lib/api/tire-workers');
      const updatedTechnician = await updateTireWorker(technician.id, {
        salary_comment: editingSalaryComment,
      });
      onUpdateTechnician(technician.id, updatedTechnician);
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

  // Загрузить доход техника за период
  const loadTechnicianEarningsForPeriod = async (dateRange?: { from: Date; to: Date }) => {
    const range = dateRange || earningsDateRange;
    if (!range?.from) return;

    setLoadingEarnings(true);
    try {
      const startDate = formatDate(range.from);
      const endDate = range.to ? formatDate(range.to) : startDate;

      const transfers = await getWorkerTransfersForPeriod(technician.id, startDate, endDate);
      setEarningsForPeriod(transfers);
    } catch (error) {
      console.error('Ошибка при загрузке дохода за период:', error);
    } finally {
      setLoadingEarnings(false);
    }
  };

  // Форматирование суммы
  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  // Локальный обработчик для кнопки "Работает сегодня" с блокировкой
  // Slice #3d Step 0 fix: ON and OFF both go through the JWT-protected
  // dispatcher proxy (api/staff.ts stop-tire-worker-shift). The direct
  // `updateTireWorker` path is no longer used because Category B RLS in
  // migration 020 will anon/authenticated REVOKE UPDATE on tire_workers.
  const handleToggleWorkingToday = async (isWorking: boolean) => {
    setStartingShiftTechnicianId(technician.id);
    try {
      if (!isWorking) {
        // ON: server-stamped via dispatcher
        const { startTireWorkerShift } = await import('../../lib/api/tire-workers');
        await startTireWorkerShift(technician.id);
        onToggleWorking(technician.id, true);
      } else {
        // OFF: atomic via dispatcher (last_shift_date PRESERVED inside RPC)
        await stopStaffTireWorkerShift(technician.id);
        onToggleWorking(technician.id, false);
      }
    } catch (error) {
      console.error('Ошибка при переключении смены:', error);
      alert('Не удалось переключить смену');
    } finally {
      setStartingShiftTechnicianId(null);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow border-2 border-gray-300">
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-gray-500" />
            </div>
            <div>
              <div className="font-bold text-lg flex items-center gap-2">
                {technician.full_name}
                {onDelete && (
                  <>
                    <span className="text-gray-400">|</span>
                    <button
                      onClick={() => onDelete(technician.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <Phone className="w-3 h-3" /> {technician.phone}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="text-xs text-gray-500 uppercase">Заказов сегодня</div>
            <div className="font-bold text-lg">{technician.cars_today || 0}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase">Заработано</div>
            <div className="font-bold text-lg text-green-600">
              {technician.earned_today.toLocaleString()} ₽
            </div>
          </div>
        </div>

        {/* Кнопка перевода на весь контейнер */}
        {technician.earned_today > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs mb-3"
            onClick={handleTransferEarnings}
          >
            <ArrowDown className="w-3 h-3 mr-1" />
            Перевести на итоговый баланс
          </Button>
        )}

        {/* Отображение условий */}
        <div className="text-xs text-gray-400 mb-3">
          Условия: {(salarySettings?.tire_worker_commission || 0.5) * 100}% от чека, {salarySettings?.tire_worker_storage_fee || 300}₽ за хранение резины
        </div>

        <div className="border-t border-gray-300 mb-3"></div>

        {/* Toggle Switch - работает сегодня */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600">Работает сегодня</span>
          <button
            onClick={() => handleToggleWorkingToday(!technician.is_working_today)}
            disabled={startingShiftTechnicianId === technician.id}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
              technician.is_working_today ? "bg-green-500" : "bg-gray-300"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                technician.is_working_today ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {/* Кнопка заказов за сегодня */}
        <Button
          size="sm"
          className="w-full mb-3 bg-black hover:bg-gray-800 text-white"
          onClick={() => onViewBookings(technician)}
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
              <div className={`font-bold text-lg ${getBalanceColor(technician.current_balance)}`}>
                {formatBalance(technician.current_balance)}
              </div>
            </div>

            {/* Горизонтальный разделитель */}
            <div className="w-full border-t border-gray-300 mb-2"></div>

            {/* Реквизиты */}
            {editingCardWorkerId === technician.id ? (
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
                  onClick={() => handleSaveCardDetails(technician.id)}
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
            ) : technician.card_number || technician.payment_phone ? (
              <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:gap-2">
                {/* Номер карты */}
                {technician.card_number && (
                  <>
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-gray-600">{technician.card_number}</span>
                      <button onClick={() => handleCopyCardDetails(technician.id, technician.card_number)} className="text-gray-400 hover:text-gray-600">
                        {copiedCardWorkerId === technician.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button onClick={() => handleStartEditCard(technician.id, technician.card_number)} className="text-gray-400 hover:text-gray-600">
                        <Edit className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Разделитель между картой и телефоном */}
                    {technician.payment_phone && (
                      <>
                        <span className="md:hidden w-full border-t border-gray-200 my-2"></span>
                        <span className="hidden md:inline text-gray-400">|</span>
                      </>
                    )}
                  </>
                )}
                {/* Телефон */}
                {technician.payment_phone && (
                  <>
                    {editingPaymentWorkerId === technician.id ? (
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
                          <Button size="sm" variant="outline" className="text-xs px-2 py-1" onClick={() => handleSavePayment(technician.id)}>✓</Button>
                          <Button size="sm" variant="outline" className="text-xs px-2 py-1" onClick={handleCancelEditPayment}>✕</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-gray-600">{technician.payment_phone}</span>
                        {technician.payment_comment && (
                          <span className="text-xs text-gray-400 italic">({technician.payment_comment})</span>
                        )}
                        <button onClick={() => { navigator.clipboard.writeText(technician.payment_phone); setCopiedCardWorkerId(technician.id); setTimeout(() => setCopiedCardWorkerId(null), 2000); }} className="text-gray-400 hover:text-gray-600">
                          {copiedCardWorkerId === technician.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button onClick={() => handleStartEditPayment(technician.id, technician.payment_phone, technician.payment_comment || '')} className="text-gray-400 hover:text-gray-600">
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
            {editingSalaryCommentWorkerId === technician.id ? (
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
                    onClick={() => handleSaveSalaryComment(technician.id)}
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
                  {technician.salary_comment ? (
                    <p className="text-sm text-gray-800 bg-white p-3 rounded-md border border-gray-200">
                      {technician.salary_comment}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Нет комментария</p>
                  )}
                </div>
                <button
                  onClick={() => handleStartEditSalaryComment(technician.id, technician.salary_comment || '')}
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
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
            />
            <Button
              size="sm"
              onClick={handlePayoutSalary}
              disabled={!payoutAmount}
            >
              Выдать
            </Button>
          </div>
        </div>

        {/* Доход за период */}
        <div className="border-t border-gray-300 pt-3 mb-3">
          <button
            onClick={() => setShowEarningsPeriod(!showEarningsPeriod)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Доход за период</span>
            {showEarningsPeriod ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
          </button>

          {showEarningsPeriod && (
            <div className="space-y-3">
              <Popover
                open={isEarningsCalendarOpen}
                onOpenChange={setIsEarningsCalendarOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !earningsDateRange?.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {earningsDateRange?.from ? (
                      earningsDateRange?.to ? (
                        <>
                          {format(earningsDateRange.from, 'dd.MM.yyyy', { locale: ru })} -{" "}
                          {format(earningsDateRange.to, 'dd.MM.yyyy', { locale: ru })}
                        </>
                      ) : (
                        format(earningsDateRange.from, 'dd.MM.yyyy', { locale: ru })
                      )
                    ) : (
                      <span>Выберите период</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={earningsDateRange}
                    onSelect={(range) => {
                      console.log('[Calendar] Выбран диапазон:', range);

                      if (!range?.from) {
                        // Сброс - ничего не выбрано
                        setEarningsDateRange({ from: undefined, to: undefined });
                        setEarningsForPeriod(undefined);
                        console.log('[Calendar] Сброс диапазона');
                        return;
                      }

                      // Сохраняем диапазон (если to не выбран, to = from для одной даты)
                      const newRange = {
                        from: range.from,
                        to: range.to || range.from
                      };

                      console.log('[Calendar] Сохраняем диапазон:', newRange);
                      setEarningsDateRange(newRange);

                      // Загружаем данные - передаём диапазон напрямую, чтобы избежать проблем с асинхронностью setState
                      loadTechnicianEarningsForPeriod(newRange);
                    }}
                    locale={ru}
                    showOutsideDays={false}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>

              {loadingEarnings ? (
                <div className="text-center text-gray-500 text-xs py-2">Загрузка...</div>
              ) : earningsForPeriod !== undefined ? (
                earningsForPeriod > 0 ? (
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-gray-700">Доход за период:</span>
                      </div>
                      <span className="text-lg font-bold text-green-600">
                        {formatMoney(earningsForPeriod)}₽
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
            onClick={() => setShowTransactions(!showTransactions)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
          >
            <History className="w-4 h-4" />
            <span>История выплат</span>
            {showTransactions ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
          </button>
          
          {showTransactions && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {loadingTransactions ? (
                <div className="text-xs text-gray-500 text-center py-4">Загрузка...</div>
              ) : salaryTransactions.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-4">Нет транзакций</div>
              ) : (
                salaryTransactions.slice(0, 10).map((transaction) => {
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
                          <div className="flex items-center gap-1 mb-1">
                            {transaction.transaction_type === 'PAYOUT' ? (
                              <DollarSign className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3 text-orange-600" />
                            )}
                            <span className="font-medium">
                              {transaction.transaction_type === 'PAYOUT' ? 'Выплата зарплаты' : 'Аванс'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Clock className="w-3 h-3" />
                            <span>Дата операции: {operationDate}</span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <span className="font-bold text-red-600">
                              -{formatBalance(Math.abs(transaction.amount))}
                            </span>
                            {/* Кнопка удаления только для owner */}
                            {userRole === 'owner' && (
                              <button
                                onClick={() => handleDeleteTransaction(transaction)}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                title="Удалить транзакцию"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
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
  );
};
