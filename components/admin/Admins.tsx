import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { User, Phone, Smartphone, Wallet, ArrowUpRight, ArrowRight, History, ChevronDown, ChevronUp, Trash2, Copy, Edit, Check, Calendar as CalendarIcon, TrendingUp, ArrowDown, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import { formatDate } from '../../shared/utils/date';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Admin } from '../../lib/types/admin';
import { getAdmins, getAdminById } from '../../lib/api/admins';
import {
  createStaffAdmin,
  updateStaffAdmin,
  deleteStaffAdmin,
  startStaffAdminShift,
  adminGiveAdvance,
  adminPayoutSalary,
  adminTransferBalance,
} from '../../lib/api/staff-actions';
import { getSalarySettings } from '../../lib/api/salary';
import { getTransactionsByWorkerAndType, getWorkerTransfersForPeriod, type SalaryTransaction } from '../../lib/api/salary-transactions';
import { getWorkShiftsByWorker } from '../../lib/api/work-shifts';
import { formatBalance, getBalanceColor, revertAdminPayoutTransaction } from '../../features/salary/manageBalance';
import type { SalarySettings } from '../../lib/types/salary';
import type { WorkShift } from '../../lib/types/work-shift';
import { AddAdminModal } from './AddAdminModal';

interface AdminsProps {
  admins: Admin[];
  setAdmins: (admins: Admin[]) => void;
  userRole?: 'admin' | 'owner';
}

export const Admins: React.FC<AdminsProps> = ({
  admins,
  setAdmins,
  userRole,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [payoutAmounts, setPayoutAmounts] = useState<{ [admin_id: string]: string }>({});
  const [showTransactions, setShowTransactions] = useState<{ [admin_id: string]: boolean }>({});
  const [showEarnings, setShowEarnings] = useState<{ [admin_id: string]: boolean }>({});
  const [editingCardAdminId, setEditingCardAdminId] = useState<string | null>(null);
  const [editingCardDetails, setEditingCardDetails] = useState<string>('');
  const [editingPaymentAdminId, setEditingPaymentAdminId] = useState<string | null>(null);
  const [editingPaymentPhone, setEditingPaymentPhone] = useState<string>('');
  const [editingPaymentComment, setEditingPaymentComment] = useState<string>('');
  const [editingSalaryCommentAdminId, setEditingSalaryCommentAdminId] = useState<string | null>(null);
  const [editingSalaryComment, setEditingSalaryComment] = useState<string>('');
  const [copiedCardAdminId, setCopiedCardAdminId] = useState<string | null>(null);
  const [salaryTransactions, setSalaryTransactions] = useState<{ [admin_id: string]: SalaryTransaction[] }>({});
  const [loadingTransactions, setLoadingTransactions] = useState<{ [admin_id: string]: boolean }>({});
  const [workShifts, setWorkShifts] = useState<{ [admin_id: string]: WorkShift[] }>({});
  const [salarySettings, setSalarySettings] = useState<SalarySettings | null>(null);
  const [startingShiftAdminId, setStartingShiftAdminId] = useState<string | null>(null);
  
  // Доход за период
  const [showEarningsPeriod, setShowEarningsPeriod] = useState<{ [admin_id: string]: boolean }>({});
  const [earningsDateRange, setEarningsDateRange] = useState<{ [admin_id: string]: { from: Date | undefined; to: Date | undefined } }>({});
  const [earningsForPeriod, setEarningsForPeriod] = useState<{ [admin_id: string]: number | undefined }>({});
  const [loadingEarnings, setLoadingEarnings] = useState<{ [admin_id: string]: boolean }>({});
  const [isEarningsCalendarOpen, setIsEarningsCalendarOpen] = useState<{ [admin_id: string]: boolean }>({});

  // Загрузить транзакции для админа
  const loadAdminTransactions = async (adminId: string) => {
    setLoadingTransactions(prev => ({ ...prev, [adminId]: true }));
    try {
      const transactions = await getTransactionsByWorkerAndType('admin', adminId);
      setSalaryTransactions(prev => ({ ...prev, [adminId]: transactions }));
    } catch (error) {
      console.error('Ошибка при загрузке транзакций:', error);
    } finally {
      setLoadingTransactions(prev => ({ ...prev, [adminId]: false }));
    }
  };

  // Загрузить смены для админа
  const loadAdminWorkShifts = async (adminId: string) => {
    try {
      const shifts = await getWorkShiftsByWorker('admin', adminId);
      setWorkShifts(prev => ({ ...prev, [adminId]: shifts }));
    } catch (error) {
      console.error('Ошибка при загрузке смен:', error);
    }
  };

  // Загрузить настройки зарплаты
  useEffect(() => {
    const loadSalarySettings = async () => {
      const settings = await getSalarySettings();
      setSalarySettings(settings);
    };
    loadSalarySettings();
  }, []);

  // Обработчик открытия/закрытия истории транзакций
  const handleToggleTransactions = async (adminId: string) => {
    const isOpen = !showTransactions[adminId];
    setShowTransactions(prev => ({ ...prev, [adminId]: isOpen }));

    if (isOpen) {
      await loadAdminTransactions(adminId);
      await loadAdminWorkShifts(adminId);
    }
  };

  // Обработчик открытия/закрытия истории начислений
  const handleToggleEarnings = async (adminId: string) => {
    const isOpen = !showEarnings[adminId];
    setShowEarnings(prev => ({ ...prev, [adminId]: isOpen }));

    if (isOpen) {
      await loadAdminTransactions(adminId);
      await loadAdminWorkShifts(adminId);
    }
  };

  // Загрузить админов при монтировании
  useEffect(() => {
    const loadAdmins = async () => {
      const loadedAdmins = await getAdmins();
      setAdmins(loadedAdmins);
    };
    loadAdmins();
  }, [setAdmins]);

  const handleAddAdmin = async (adminData: { name: string; phone: string; cardDetails?: string; paymentPhone?: string; paymentComment?: string }) => {
    try {
      // Slice #3c: server-stamped action via dispatcher.
      // Server ignores browser-supplied numeric/balance/date fields
      // (server zeros them on INSERT) — only full_name + contact fields
      // are accepted.
      const newAdmin = await createStaffAdmin({
        full_name: adminData.name,
        phone: normalizePhoneNumber(adminData.phone),
        card_number: adminData.cardDetails || null,
        payment_phone: adminData.paymentPhone ? normalizePhoneNumber(adminData.paymentPhone) : null,
      });
      setAdmins([...admins, newAdmin]);
      setIsAddModalOpen(false);
    } catch (error) {
      console.error('Ошибка при создании админа:', error);
      alert('Не удалось создать админа');
    }
  };

  const handleToggleWorkingToday = async (adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return;

    // Если уже работает сегодня - не позволяем отключить
    if (admin.is_working_today) {
      return;
    }

    try {
      setStartingShiftAdminId(adminId); // 🔒 УРОВЕНЬ 3: Блокируем кнопку
      // Slice #3c: dispatcher proxy for INVOKER start_admin_shift RPC.
      // After migration 017 (REVOKE INSERT/UPDATE on admins), direct
      // supabase.rpc('start_admin_shift', ...) from anon/authenticated
      // fails. Dispatcher calls RPC with service_role (bypasses grant).
      await startStaffAdminShift(adminId);
      // Перезагружаем админа из БД для получения актуальных данных
      const updatedAdmin = await getAdminById(adminId);
      if (updatedAdmin) {
        setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      }
    } catch (error) {
      console.error('Ошибка при переключении статуса:', error);
      alert(error instanceof Error ? error.message : 'Не удалось изменить статус');
    } finally {
      setStartingShiftAdminId(null); // Разблокируем кнопку
    }
  };

  const handleTransferAdminEarnings = async (adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    if (!admin) {
      console.log('[handleTransferAdminEarnings] Admin not found');
      return;
    }

    console.log('[handleTransferAdminEarnings] Admin данные:', {
      id: admin.id,
      full_name: admin.full_name,
      earned_today: admin.earned_today,
      current_balance: admin.current_balance,
    });

    try {
      const updatedAdmin = await adminTransferBalance(adminId);
      setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      // Перезагружаем транзакции для отображения нового начисления
      await loadAdminTransactions(adminId);
    } catch (error) {
      console.error('Ошибка при переносе заработка:', error);
      alert(error instanceof Error ? error.message : 'Не удалось перенести заработок');
    }
  };

  const handlePayoutSalary = async (adminId: string) => {
    const amount = parseInt(payoutAmounts[adminId] || '0', 10);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const updatedAdmin = await adminPayoutSalary(adminId, amount);
      setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      setPayoutAmounts(prev => ({ ...prev, [adminId]: '' }));
      // Перезагружаем транзакции для отображения новой выплаты
      await loadAdminTransactions(adminId);
    } catch (error) {
      console.error('Ошибка при выплате зарплаты:', error);
      alert(error instanceof Error ? error.message : 'Не удалось выплатить зарплату');
    }
  };

  const handleGiveAdvance = async (adminId: string) => {
    const amount = parseInt(payoutAmounts[adminId] || '0', 10);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const updatedAdmin = await adminGiveAdvance(adminId, amount);
      setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      setPayoutAmounts(prev => ({ ...prev, [adminId]: '' }));
      // Перезагружаем транзакции для отображения нового аванса
      await loadAdminTransactions(adminId);
    } catch (error) {
      console.error('Ошибка при выдаче аванса:', error);
      alert(error instanceof Error ? error.message : 'Не удалось выдать аванс');
    }
  };

  // Удаление транзакции выплаты/аванса (только для owner)
  const handleDeleteTransaction = async (adminId: string, transaction: SalaryTransaction) => {
    if (userRole !== 'owner') return;
    if (transaction.transaction_type !== 'PAYOUT' && transaction.transaction_type !== 'ADVANCE') return;

    if (!window.confirm('Удалить эту транзакцию и восстановить баланс?')) return;

    try {
      await revertAdminPayoutTransaction(transaction);
      // Перезагружаем админа из БД для получения актуального баланса
      const updatedAdmin = await getAdminById(adminId);
      if (updatedAdmin) {
        setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      }
      // Перезагружаем транзакции
      await loadAdminTransactions(adminId);
    } catch (error) {
      console.error('Ошибка при удалении транзакции:', error);
      alert('Не удалось удалить транзакцию');
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этого админа?')) {
      try {
        await deleteStaffAdmin(adminId);
        setAdmins(admins.filter(a => a.id !== adminId));
      } catch (error) {
        console.error('Ошибка при удалении админа:', error);
        alert(error instanceof Error ? error.message : 'Не удалось удалить админа');
      }
    }
  };

  const handleCopyCardDetails = (adminId: string, cardDetails: string) => {
    navigator.clipboard.writeText(cardDetails);
    setCopiedCardAdminId(adminId);
    setTimeout(() => {
      setCopiedCardAdminId(null);
    }, 2000);
  };

  const handleStartEditCard = (adminId: string, cardDetails: string) => {
    setEditingCardAdminId(adminId);
    setEditingCardDetails(cardDetails);
  };

  const handleSaveCardDetails = async (adminId: string) => {
    try {
      const updatedAdmin = await updateStaffAdmin(adminId, {
        card_number: editingCardDetails,
      });
      setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      setEditingCardAdminId(null);
      setEditingCardDetails('');
    } catch (error) {
      console.error('Ошибка при сохранении реквизитов:', error);
      alert(error instanceof Error ? error.message : 'Не удалось сохранить реквизиты');
    }
  };

  const handleCancelEditCard = () => {
    setEditingCardAdminId(null);
    setEditingCardDetails('');
  };

  const handleStartEditPayment = (adminId: string, paymentPhone: string, paymentComment: string) => {
    setEditingPaymentAdminId(adminId);
    // Форматируем телефон при открытии редактирования
    const formattedPhone = formatPhoneNumber(paymentPhone || '+7 ');
    setEditingPaymentPhone(formattedPhone);
    setEditingPaymentComment(paymentComment || '');
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

  const handlePaymentPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    // Защищаем "+7 " от удаления
    if (formatted.startsWith('+7 ') || formatted === '+7') {
      setEditingPaymentPhone(formatted);
    } else if (formatted === '') {
      setEditingPaymentPhone('+7 ');
    }
  };

  const handleSavePayment = async (adminId: string) => {
    try {
      const updatedAdmin = await updateStaffAdmin(adminId, {
        payment_phone: normalizePhoneNumber(editingPaymentPhone),
        payment_comment: editingPaymentComment,
      });
      setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      setEditingPaymentAdminId(null);
      setEditingPaymentPhone('');
      setEditingPaymentComment('');
    } catch (error) {
      console.error('Ошибка при сохранении телефона и комментария:', error);
      alert(error instanceof Error ? error.message : 'Не удалось сохранить телефон и комментарий');
    }
  };

  const handleCancelEditPayment = () => {
    setEditingPaymentAdminId(null);
    setEditingPaymentPhone('');
    setEditingPaymentComment('');
  };

  const handleStartEditSalaryComment = (adminId: string, salaryComment: string) => {
    setEditingSalaryCommentAdminId(adminId);
    setEditingSalaryComment(salaryComment || '');
  };

  const handleSaveSalaryComment = async (adminId: string) => {
    try {
      const updatedAdmin = await updateStaffAdmin(adminId, {
        salary_comment: editingSalaryComment,
      });
      setAdmins(admins.map(a => a.id === adminId ? updatedAdmin : a));
      setEditingSalaryCommentAdminId(null);
      setEditingSalaryComment('');
    } catch (error) {
      console.error('Ошибка при сохранении комментария к выплате:', error);
      alert(error instanceof Error ? error.message : 'Не удалось сохранить комментарий');
    }
  };

  const handleCancelEditSalaryComment = () => {
    setEditingSalaryCommentAdminId(null);
    setEditingSalaryComment('');
  };

  // Загрузить доход админа за период
  const loadAdminEarningsForPeriod = async (adminId: string, dateRange?: { from: Date; to: Date }) => {
    const range = dateRange || earningsDateRange[adminId];
    if (!range?.from) return;

    setLoadingEarnings(prev => ({ ...prev, [adminId]: true }));
    try {
      const startDate = formatDate(range.from);
      const endDate = range.to ? formatDate(range.to) : startDate;

      const transfers = await getWorkerTransfersForPeriod(adminId, startDate, endDate);
      setEarningsForPeriod(prev => ({ ...prev, [adminId]: transfers }));
    } catch (error) {
      console.error('Ошибка при загрузке дохода за период:', error);
    } finally {
      setLoadingEarnings(prev => ({ ...prev, [adminId]: false }));
    }
  };

  // Форматирование суммы
  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Админы</h3>
        <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
          <User className="w-4 h-4 mr-1" /> Добавить
        </Button>
      </div>

      {/* Список админов */}
      <div className="space-y-4">
        {admins.map((admin) => (
          <Card key={admin.id} className="hover:shadow-md transition-shadow border-2 border-gray-300">
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <div className="font-bold text-lg flex items-center gap-2">
                      {admin.full_name}
                      <span className="text-gray-400">|</span>
                      <button
                        onClick={() => handleDeleteAdmin(admin.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {admin.phone}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-4 mb-3 items-center">
                <div>
                  <div className="text-xs text-gray-500 uppercase">Дней в месяце</div>
                  <div className="font-bold text-lg">{admin.days_worked_this_month}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 uppercase">Заработано сегодня</div>
                  <div className="font-bold text-lg text-green-600">
                    {admin.earned_today.toLocaleString()} ₽
                  </div>
                </div>
              </div>

              {/* Отображение условий */}
              {salarySettings && (
                <div className="text-xs text-gray-400 mb-3">
                  Условия: {salarySettings.admin_fixed_salary}₽ за выход
                </div>
              )}
              {!salarySettings && (
                <div className="text-xs text-gray-400 mb-3">
                  Загрузка условий...
                </div>
              )}

              <div className="border-t border-gray-200 mb-3"></div>

              {/* Toggle Switch - работает сегодня */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Работает сегодня</span>
                <button
                  onClick={() => handleToggleWorkingToday(admin.id)}
                  disabled={startingShiftAdminId === admin.id || admin.is_working_today}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
                    admin.is_working_today ? "bg-green-500" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      admin.is_working_today ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Секция начислений */}
              <div className="border-t border-gray-300 pt-3 mb-3 space-y-2">
                {/* Кнопка истории начислений */}
                <button
                  onClick={() => handleToggleEarnings(admin.id)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Начисления</span>
                  {showEarnings[admin.id] ? (
                    <ChevronUp className="w-4 h-4 ml-auto" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  )}
                </button>

                {/* Раскрытая история начислений (только EARNING) */}
                {showEarnings[admin.id] && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {loadingTransactions[admin.id] ? (
                      <div className="text-center text-gray-500 text-xs py-2">Загрузка...</div>
                    ) : !salaryTransactions[admin.id] || salaryTransactions[admin.id].length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-4">Нет транзакций</div>
                    ) : (
                      salaryTransactions[admin.id]
                        .filter(t => t.transaction_type === 'EARNING')
                        .slice(0, 10)
                        .map((transaction) => {
                          // Находим соответствующую смену для отображения даты работы
                          const matchingShift = workShifts[admin.id]?.find(
                            shift => shift.worker_id === admin.id &&
                            shift.started_at <= transaction.created_at &&
                            (!shift.finished_at || shift.finished_at >= transaction.created_at)
                          );

                          return (
                            <div key={transaction.id} className="bg-gray-50 rounded p-2 text-xs">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-medium">Начисление зарплаты</span>
                                <span className="text-green-600">
                                  +{formatBalance(transaction.amount)}
                                </span>
                              </div>
                              <div className="text-gray-500 flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                {new Date(transaction.created_at).toLocaleDateString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {matchingShift && (
                                <div className="text-blue-600 flex items-center gap-1">
                                  <CalendarIcon className="w-3 h-3" />
                                  Дата работы: {new Date(matchingShift.work_date).toLocaleDateString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>

              {/* Кнопка перевода на весь контейнер */}
              {admin.earned_today > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs mb-3"
                  onClick={() => handleTransferAdminEarnings(admin.id)}
                >
                  <ArrowDown className="w-3 h-3 mr-1" />
                  Перевести на итоговый баланс
                </Button>
              )}

              {/* Актуальный баланс */}
              <div className="bg-blue-50 rounded-lg p-3 mb-3">
                <div className="flex flex-col">
                  {/* Заголовок и сумма на одной линии */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-gray-600 uppercase">Итоговый баланс</span>
                    </div>
                    <div className={`font-bold text-lg ${getBalanceColor(admin.current_balance)}`}>
                      {formatBalance(admin.current_balance)}
                    </div>
                  </div>

                  {/* Горизонтальный разделитель */}
                  <div className="w-full border-t border-gray-300 mb-2"></div>

                  {/* Реквизиты и телефон для переводов */}
                  {editingCardAdminId === admin.id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-3 h-3 text-gray-500" />
                        <input
                          type="text"
                          value={editingCardDetails}
                          onChange={(e) => setEditingCardDetails(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border rounded"
                          placeholder="Номер карты"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs px-2 py-1"
                          onClick={() => handleSaveCardDetails(admin.id)}
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
                      {admin.payment_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-gray-500" />
                          <span className="text-xs text-gray-600">{admin.payment_phone}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:gap-2">
                      {/* Номер карты */}
                      {admin.card_number && (
                        <>
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-blue-600" />
                            <span className="text-xs text-gray-600">{admin.card_number}</span>
                            <button
                              onClick={() => handleCopyCardDetails(admin.id, admin.card_number)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {copiedCardAdminId === admin.id ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              onClick={() => handleStartEditCard(admin.id, admin.card_number)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                          {/* Разделитель между картой и телефоном */}
                          {admin.payment_phone && (
                            <>
                              <span className="md:hidden w-full border-t border-gray-200 my-2"></span>
                              <span className="hidden md:inline text-gray-400">|</span>
                            </>
                          )}
                        </>
                      )}
                      {/* Телефон */}
                      {admin.payment_phone && (
                        <>
                          {editingPaymentAdminId === admin.id ? (
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
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs px-2 py-1"
                                  onClick={() => handleSavePayment(admin.id)}
                                >
                                  ✓
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs px-2 py-1"
                                  onClick={handleCancelEditPayment}
                                >
                                  ✕
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-gray-600">{admin.payment_phone}</span>
                              {admin.payment_comment && (
                                <span className="text-xs text-gray-400 italic">({admin.payment_comment})</span>
                              )}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(admin.payment_phone);
                                  setCopiedCardAdminId(admin.id);
                                  setTimeout(() => setCopiedCardAdminId(null), 2000);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {copiedCardAdminId === admin.id ? (
                                  <Check className="w-3 h-3 text-green-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                onClick={() => handleStartEditPayment(admin.id, admin.payment_phone, admin.payment_comment || '')}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
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
                  {editingSalaryCommentAdminId === admin.id ? (
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
                          onClick={() => handleSaveSalaryComment(admin.id)}
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
                        {admin.salary_comment ? (
                          <p className="text-sm text-gray-800 bg-white p-3 rounded-md border border-gray-200">
                            {admin.salary_comment}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">Нет комментария</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleStartEditSalaryComment(admin.id, admin.salary_comment || '')}
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
                    value={payoutAmounts[admin.id] || ''}
                    onChange={(e) => setPayoutAmounts(prev => ({ ...prev, [admin.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => handlePayoutSalary(admin.id)}
                    disabled={!payoutAmounts[admin.id]}
                  >
                    Выдать
                  </Button>
                </div>

              </div>

              {/* Доход за период */}
              <div className="border-t border-gray-300 pt-3 mb-3">
                <button
                  onClick={() => setShowEarningsPeriod(prev => ({ ...prev, [admin.id]: !prev[admin.id] }))}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Доход за период</span>
                  {showEarningsPeriod[admin.id] ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                </button>

                {showEarningsPeriod[admin.id] && (
                  <div className="space-y-3">
                    <Popover
                      open={isEarningsCalendarOpen[admin.id] || false}
                      onOpenChange={(open) => setIsEarningsCalendarOpen(prev => ({ ...prev, [admin.id]: open }))}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !earningsDateRange[admin.id]?.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {earningsDateRange[admin.id]?.from ? (
                            earningsDateRange[admin.id]?.to ? (
                              <>
                                {format(earningsDateRange[admin.id].from, 'dd.MM.yyyy', { locale: ru })} -{" "}
                                {format(earningsDateRange[admin.id].to, 'dd.MM.yyyy', { locale: ru })}
                              </>
                            ) : (
                              format(earningsDateRange[admin.id].from, 'dd.MM.yyyy', { locale: ru })
                            )
                          ) : (
                            <span>Выберите период</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={earningsDateRange[admin.id]}
                          onSelect={(range) => {
                            console.log('[Calendar] Выбран диапазон:', range);

                            if (!range?.from) {
                              // Сброс - ничего не выбрано
                              setEarningsDateRange(prev => ({ ...prev, [admin.id]: { from: undefined, to: undefined } }));
                              setEarningsForPeriod(prev => ({ ...prev, [admin.id]: undefined }));
                              console.log('[Calendar] Сброс диапазона');
                              return;
                            }

                            // Сохраняем диапазон (если to не выбран, to = from для одной даты)
                            const newRange = {
                              from: range.from,
                              to: range.to || range.from
                            };

                            console.log('[Calendar] Сохраняем диапазон:', newRange);
                            setEarningsDateRange(prev => ({ ...prev, [admin.id]: newRange }));

                            // Загружаем данные - передаём диапазон напрямую, чтобы избежать проблем с асинхронностью setState
                            loadAdminEarningsForPeriod(admin.id, newRange);
                          }}
                          locale={ru}
                          showOutsideDays={false}
                          disabled={{ after: new Date() }}
                        />
                      </PopoverContent>
                    </Popover>

                    {loadingEarnings[admin.id] ? (
                      <div className="text-center text-gray-500 text-xs py-2">Загрузка...</div>
                    ) : earningsForPeriod[admin.id] !== undefined ? (
                      earningsForPeriod[admin.id] > 0 ? (
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-green-600" />
                              <span className="text-sm font-medium text-gray-700">Доход за период:</span>
                            </div>
                            <span className="text-lg font-bold text-green-600">
                              {formatMoney(earningsForPeriod[admin.id])}₽
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

              {/* Кнопки истории */}
              <div className="border-t border-gray-300 pt-3 mb-3 space-y-2">
                {/* Кнопка истории выплат */}
                <button
                  onClick={() => handleToggleTransactions(admin.id)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-200"
                >
                  <History className="w-4 h-4" />
                  <span>История выплат</span>
                  {showTransactions[admin.id] ? (
                    <ChevronUp className="w-4 h-4 ml-auto" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  )}
                </button>

                {/* Раскрытая история выплат (PAYOUT, ADVANCE, TRANSFER) */}
                {showTransactions[admin.id] && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {loadingTransactions[admin.id] ? (
                      <div className="text-center text-gray-500 text-xs py-2">Загрузка...</div>
                    ) : !salaryTransactions[admin.id] || salaryTransactions[admin.id].length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-4">Нет транзакций</div>
                    ) : (
                      salaryTransactions[admin.id]
                        .filter(t => t.transaction_type === 'PAYOUT' || t.transaction_type === 'ADVANCE' || t.transaction_type === 'TRANSFER')
                        .slice(0, 10)
                        .map((transaction) => {
                          // TRANSFER: Перевод с ежедневного баланса
                          if (transaction.transaction_type === 'TRANSFER') {
                            const operationDate = new Date(transaction.created_at).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            });

                            return (
                              <div key={transaction.id} className="bg-green-50 border-green-200 rounded border p-2 text-xs">
                                <div className="flex items-center gap-1 mb-1">
                                  <ArrowRight className="w-3 h-3 text-green-600" />
                                  <span className="font-medium text-green-700">Перевод с ежедневного баланса</span>
                                </div>
                                <div className="flex items-center gap-1 text-gray-600">
                                  <CalendarIcon className="w-3 h-3" />
                                  <span>Дата операции: {operationDate}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-green-200">
                                  <span className="font-bold text-green-600">
                                    {transaction.amount > 0 ? '+' : ''}{formatBalance(transaction.amount)}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          // PAYOUT и ADVANCE: Выплаты
                          const matchingShift = workShifts[admin.id]?.find(
                            shift => shift.worker_id === admin.id &&
                            shift.started_at <= transaction.created_at &&
                            (!shift.finished_at || shift.finished_at >= transaction.created_at)
                          );

                          return (
                            <div key={transaction.id} className="bg-gray-50 rounded p-2 text-xs">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-medium">Выдано</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-red-600">
                                    {formatBalance(transaction.amount)}
                                  </span>
                                  {/* Кнопка удаления только для owner */}
                                  {userRole === 'owner' && (
                                    <button
                                      onClick={() => handleDeleteTransaction(admin.id, transaction)}
                                      className="text-gray-400 hover:text-red-600 transition-colors"
                                      title="Удалить транзакцию"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="text-gray-500 flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                {new Date(transaction.created_at).toLocaleDateString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {matchingShift && (
                                <div className="text-blue-600 flex items-center gap-1">
                                  <CalendarIcon className="w-3 h-3" />
                                  Дата работы: {new Date(matchingShift.work_date).toLocaleDateString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                  })}
                                </div>
                              )}
                              {transaction.description && (
                                <div className="text-gray-400 mt-1">{transaction.description}</div>
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

      {/* Modal добавления админа */}
      <AddAdminModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddAdmin}
      />
    </div>
  );
};
