import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Input } from '../ui/input';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import html2pdf from 'html2pdf.js';
import {
  Coffee,
  Wrench,
  FileText,
  Package,
  Calendar as CalendarIcon,
  Wallet,
  User,
  Eye,
  X,
  MessageCircle,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Download,
  CarFront,
  LifeBuoy,
  Users,
  Banknote,
  Building2,
  LineChart,
  ShoppingCart,
  Key
} from 'lucide-react';
import { CompanySettingsWizard } from './CompanySettingsWizard';
import { SalarySettingsWizard } from './SalarySettingsWizard';
import { ChangePasswordWizard } from './ChangePasswordWizard';
import { cn } from '../../lib/utils';
import { formatDate } from '../../shared/utils/date';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import {
  getExpenses,
  type ExpenseWithCreator,
  EXPENSE_CATEGORIES,
  formatCreatorName
} from '../../lib/api/expenses';
import {
  getReportHistory,
  type ReportHistory,
  type PaymentsReport
} from '../../lib/api/reports';
import { generateReportHistoryPDF } from '../../lib/utils/report-pdf-template';
import { getInventoryArrivals } from '../../lib/api/inventory';
import {
  inventoryArrivalToHistory,
  type InventoryArrivalHistory
} from '../../entities/inventory/model';
import type { WorkerSalaryDetail } from '../../entities/report/model';

// Типы для расходов (локальные для UI)
type ExpenseCategory = 'tea_coffee' | 'repair' | 'utilities' | 'stationery' | 'other';

interface AnalyticsPageProps {
  userId?: string;
  userRole?: 'admin' | 'owner';
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  userId = '',
  userRole = 'admin',
}) => {
  // История расходов
  const [selectedDateRange, setSelectedDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [historyExpenses, setHistoryExpenses] = useState<ExpenseWithCreator[]>([]);
  const [cachedHistoryExpenses, setCachedHistoryExpenses] = useState<ExpenseWithCreator[]>([]); // Кэш для сохранения результатов при закрытии календаря
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; fileName: string } | null>(null);
  const [openHistorySection, setOpenHistorySection] = useState(false); // Состояние аккордеона истории расходов
  const [showCompanySettingsWizard, setShowCompanySettingsWizard] = useState(false); // Состояние мастера юридических данных
  const [showSalarySettingsWizard, setShowSalarySettingsWizard] = useState(false); // Состояние мастера условий персонала
  const [showChangePasswordWizard, setShowChangePasswordWizard] = useState(false); // Состояние мастера смены пароля

  // История отчетов
  const [openReportsSection, setOpenReportsSection] = useState(false); // Состояние аккордеона истории отчетов
  const [reportDateRange, setReportDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [reportHistory, setReportHistory] = useState<ReportHistory | null>(null);
  const [loadingReportHistory, setLoadingReportHistory] = useState(false);
  const [isReportCalendarOpen, setIsReportCalendarOpen] = useState(false);

  // История прихода склада
  const [openInventorySection, setOpenInventorySection] = useState(false);
  const [inventoryDateRange, setInventoryDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [inventoryHistory, setInventoryHistory] = useState<InventoryArrivalHistory[]>([]);
  const [loadingInventoryHistory, setLoadingInventoryHistory] = useState(false);
  const [isInventoryCalendarOpen, setIsInventoryCalendarOpen] = useState(false);

  // Ref для плавной прокрутки
  const historyExpenseRef = useRef<HTMLDivElement>(null);
  const reportsHistoryRef = useRef<HTMLDivElement>(null);
  const inventoryHistoryRef = useRef<HTMLDivElement>(null);

  // Статистика оплат организаций (только для владельца)
const [openOrgPaymentsSection, setOpenOrgPaymentsSection] = useState(false);
const [selectedOrgMonth, setSelectedOrgMonth] = useState(formatDate(new Date()).substring(0, 7)); // YYYY-MM
const [orgPaymentsData, setOrgPaymentsData] = useState<any[]>([]);
const [orgPaymentsLoading, setOrgPaymentsLoading] = useState(false);

  // Категории расходов
  const expenseCategories: { id: ExpenseCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'tea_coffee', label: 'Чай/Кофе', icon: <Coffee className="w-4 h-4" /> },
    { id: 'repair', label: 'Ремонт', icon: <Wrench className="w-4 h-4" /> },
    { id: 'utilities', label: 'Коммуналка', icon: <Package className="w-4 h-4" /> },
    { id: 'stationery', label: 'Канцелярия', icon: <FileText className="w-4 h-4" /> },
    { id: 'other', label: 'Прочее', icon: <Package className="w-4 h-4" /> },
  ];

  // Загрузка истории расходов при изменении диапазона дат
  useEffect(() => {
    const loadHistoryExpenses = async () => {
      console.log('[AnalyticsPage] Загрузка истории расходов:', { userId, userRole, selectedDateRange });
      if (userId && selectedDateRange.from) {
        setLoadingHistory(true);
        try {
          const startDate = formatDate(selectedDateRange.from);
          const endDate = selectedDateRange.to ? formatDate(selectedDateRange.to) : startDate;
          const data = await getExpenses(userId, userRole as 'admin' | 'owner', undefined, startDate, endDate);
          console.log('[AnalyticsPage] История расходов загружена:', data);
          setHistoryExpenses(data);
          setCachedHistoryExpenses(data); // Сохраняем в кэш
        } catch (error) {
          console.error('[AnalyticsPage] Ошибка загрузки истории расходов:', error);
        } finally {
          setLoadingHistory(false);
        }
      }
    };
    loadHistoryExpenses();
  }, [userId, userRole, selectedDateRange]);

  // Загрузка истории отчетов при изменении диапазона дат
  useEffect(() => {
    const loadReportHistory = async () => {
      console.log('[AnalyticsPage] Загрузка истории отчетов:', { userId, userRole, reportDateRange });
      if (userId && reportDateRange.from) {
        setLoadingReportHistory(true);
        try {
          const startDate = formatDate(reportDateRange.from);
          const endDate = reportDateRange.to ? formatDate(reportDateRange.to) : startDate;
          const data = await getReportHistory(startDate, endDate, userId, userRole as 'admin' | 'owner');
          console.log('[AnalyticsPage] История отчетов загружена:', data);
          setReportHistory(data);
        } catch (error) {
          console.error('[AnalyticsPage] Ошибка загрузки истории отчетов:', error);
        } finally {
          setLoadingReportHistory(false);
        }
      }
    };
    loadReportHistory();
  }, [userId, userRole, reportDateRange]);

  // Загрузка истории прихода склада при изменении диапазона дат
  useEffect(() => {
    const loadInventoryHistory = async () => {
      console.log('[AnalyticsPage] Загрузка истории прихода склада:', { inventoryDateRange });
      if (inventoryDateRange.from) {
        setLoadingInventoryHistory(true);
        try {
          const startDate = formatDate(inventoryDateRange.from);
          const endDate = inventoryDateRange.to ? formatDate(inventoryDateRange.to) : startDate;
          const data = await getInventoryArrivals(undefined, startDate, endDate);
          console.log('[AnalyticsPage] История прихода склада загружена:', data);
          // Преобразуем данные из Supabase в UI формат
          const historyData = data.map(inventoryArrivalToHistory);
          setInventoryHistory(historyData);
        } catch (error) {
          console.error('[AnalyticsPage] Ошибка загрузки истории прихода склада:', error);
        } finally {
          setLoadingInventoryHistory(false);
        }
      }
    };
    loadInventoryHistory();
  }, [inventoryDateRange]);

  // Плавная прокрутка к открытому аккордеону истории отчетов
  useEffect(() => {
    if (openReportsSection && reportsHistoryRef.current) {
      reportsHistoryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openReportsSection]);

  // Плавная прокрутка к открытому аккордеону истории прихода склада
  useEffect(() => {
    if (openInventorySection && inventoryHistoryRef.current) {
      inventoryHistoryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openInventorySection]);

  // Загрузка статистики оплат организаций при изменении месяца
useEffect(() => {
  const loadOrgPayments = async () => {
    if (!selectedOrgMonth) return;
    
    setOrgPaymentsLoading(true);
    try {
      const [year, month] = selectedOrgMonth.split('-').map(Number);
      
      console.log('[AnalyticsPage] Загрузка статистики организаций:', { year, month });
      
      // Прямой SQL запрос через Supabase
      // Убираем !inner чтобы получать все организации, даже если у них нет заказов в одной из категорий
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select(`
          id,
          name,
          inn,
          bookings(price, status, booking_date),
          tire_bookings(total_price, status, booking_date)
        `);
      
      if (orgError) throw orgError;
      
      // Фильтрация и агрегация на клиенте
      const stats = new Map();
      
      orgData?.forEach((org: any) => {
        if (!stats.has(org.id)) {
          stats.set(org.id, {
            id: org.id,
            name: org.name,
            inn: org.inn,
            carwashTotal: 0,
            tireTotal: 0
          });
        }
        
        const stat = stats.get(org.id);
        
        // Автомойка
        org.bookings?.forEach((booking: any) => {
          const bookingDate = new Date(booking.booking_date);
          const bookingYear = bookingDate.getUTCFullYear();  // Используем UTC методы
          const bookingMonth = bookingDate.getUTCMonth() + 1;
          if (booking.status === 'ГОТОВО' &&
              bookingMonth === month &&
              bookingYear === year) {
            stat.carwashTotal += Number(booking.price) || 0;
          }
        });
        
        // Шиномонтаж
        org.tire_bookings?.forEach((booking: any) => {
          const bookingDate = new Date(booking.booking_date);
          const bookingYear = bookingDate.getUTCFullYear();  // Используем UTC методы
          const bookingMonth = bookingDate.getUTCMonth() + 1;
          if (booking.status === 'ГОТОВО' &&
              bookingMonth === month &&
              bookingYear === year) {
            stat.tireTotal += Number(booking.total_price) || 0;
          }
        });
      });
      
      // Фильтруем только организации с оплатами и сортируем
      const result = Array.from(stats.values())
        .filter((org: any) => org.carwashTotal > 0 || org.tireTotal > 0)
        .map((org: any) => ({
          ...org,
          total: org.carwashTotal + org.tireTotal
        }))
        .sort((a: any, b: any) => b.total - a.total);
      
      setOrgPaymentsData(result);
      console.log('[AnalyticsPage] Статистика организаций загружена:', result);
    } catch (error) {
      console.error('[AnalyticsPage] Ошибка загрузки статистики организаций:', error);
    } finally {
      setOrgPaymentsLoading(false);
    }
  };
  
  loadOrgPayments();
}, [selectedOrgMonth]);

  // Обработчик просмотра чека
  const handleViewReceipt = async (expense: ExpenseWithCreator) => {
    if (!expense.receipt_url) return;

    try {
      const { getReceiptUrl } = await import('../../lib/api/expenses');
      const url = await getReceiptUrl(expense.receipt_url);
      const fileName = expense.receipt_url.split('/').pop() || 'чек';
      setViewingReceipt({ url, fileName });
    } catch (error: any) {
      console.error('[handleViewReceipt] Ошибка получения чека:', error);
      if (error?.message?.includes('Object not found')) {
        alert('Чек не найден. Возможно, файл был удален из хранилища.');
      } else {
        alert('Не удалось загрузить чек');
      }
    }
  };

  // Обработчик просмотра накладной (для истории прихода склада - публичный URL)
  const handleViewInventoryReceipt = (receiptUrl: string) => {
    if (!receiptUrl) return;
    const fileName = receiptUrl.split('/').pop() || 'накладная';
    setViewingReceipt({ url: receiptUrl, fileName });
  };

  // Обработчик скачивания чека (для расходов - через signed URL)
  const handleDownloadReceipt = async (receiptUrl: string, itemName: string, createdAt: Date | string) => {
    if (!receiptUrl) return;

    try {
      const { getReceiptUrl } = await import('../../lib/api/expenses');
      const url = await getReceiptUrl(receiptUrl);
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date(createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      link.download = `накладная.${itemName}.${date}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('[handleDownloadReceipt] Ошибка скачивания чека:', error);
      alert('Не удалось скачать чек');
    }
  };

  // Обработчик скачивания накладной (для истории прихода склада - публичный URL)
  const handleDownloadInventoryReceipt = async (receiptUrl: string, itemName: string, createdAt: Date | string) => {
    if (!receiptUrl) return;

    try {
      const response = await fetch(receiptUrl);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date(createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      link.download = `накладная.${itemName}.${date}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('[handleDownloadInventoryReceipt] Ошибка скачивания накладной:', error);
      alert('Не удалось скачать накладную');
    }
  };

  // Форматирование суммы
  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  // Генерация PDF для истории отчетов
  const handleExportReportHistoryPDF = () => {
    if (!reportHistory) return;

    const html = generateReportHistoryPDF(reportHistory);

    // Генерация PDF
    const opt = {
      margin: [10, 10],
      filename: `История-отчетов-${new Date(reportHistory.startDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}-${new Date(reportHistory.endDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        logging: false,
        letterRendering: true
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // @ts-ignore
    html2pdf().set(opt).from(html).save();
  };

  return (
    <div className="space-y-6 pt-6 pb-20 pt-safe telegram-safe-area-top animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
          <LineChart className="w-6 h-6 text-blue-600" />
        </div>
      </div>

      {/* Разделитель */}
      <div className="h-px bg-gray-200 w-full mb-4"></div>

      {/* Кнопки для владельца */}
      {userRole === 'owner' && (
        <div className="space-y-3">
          <Button
            size="default"
            className="w-full h-10 text-base bg-black text-white hover:bg-gray-800"
            onClick={() => setShowCompanySettingsWizard(true)}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Юридические данные
          </Button>
          <Button
            size="default"
            className="w-full h-10 text-base bg-black text-white hover:bg-gray-800"
            onClick={() => setShowSalarySettingsWizard(true)}
          >
            <Users className="w-4 h-4 mr-2" />
            Условия персонала
          </Button>
          <Button
            size="default"
            className="w-full h-10 text-base bg-black text-white hover:bg-gray-800"
            onClick={() => setShowChangePasswordWizard(true)}
          >
            <Key className="w-4 h-4 mr-2" />
            Смена пароля
          </Button>
        </div>
      )}

      {/* Разделитель */}
      <div className="h-px bg-gray-200 w-full mt-4 mb-4"></div>

      {/* История расходов */}
      <div ref={historyExpenseRef} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div
          onClick={() => setOpenHistorySection(!openHistorySection)}
          onPointerDown={(e) => e.preventDefault()}
          className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-gray-900">История расходов</span>
          </div>
          <div className="text-gray-400">
            {openHistorySection ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>

        {openHistorySection && (
          <>
            <div className="border-t border-gray-200"></div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="px-4 py-4 bg-gray-50"
            >
          <div className="mb-4">
            <Popover
              open={isCalendarOpen}
              onOpenChange={(open) => {
                setIsCalendarOpen(open);
                if (open) {
                  // При открытии календаря - сохраняем текущие результаты в кэш
                  setCachedHistoryExpenses(historyExpenses);
                } else if (!open && !selectedDateRange.to && cachedHistoryExpenses.length > 0) {
                  // При закрытии календаря без выбора полного диапазона - восстанавливаем кэш
                  setHistoryExpenses(cachedHistoryExpenses);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDateRange.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDateRange.from ? (
                    selectedDateRange.to ? (
                      <>
                        {format(selectedDateRange.from, 'dd.MM.yyyy', { locale: ru })} -{" "}
                        {format(selectedDateRange.to, 'dd.MM.yyyy', { locale: ru })}
                      </>
                    ) : (
                      format(selectedDateRange.from, 'dd.MM.yyyy', { locale: ru })
                    )
                  ) : (
                    <span>Выберите период</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={selectedDateRange}
                  onSelect={(range) => {
                    if (!range || (!range.from && !range.to)) {
                      // Полный сброс
                      setSelectedDateRange({ from: undefined, to: undefined });
                      return;
                    }

                    // Проверяем клик на startDate
                    if (range.from && selectedDateRange.from &&
                        range.from.getTime() === selectedDateRange.from.getTime() &&
                        !range.to) {
                      // Клик на startDate - снимаем только startDate
                      setSelectedDateRange({ from: undefined, to: undefined });
                      return;
                    }

                    // Проверяем клик на endDate
                    if (range.from && selectedDateRange.to &&
                        range.from.getTime() === selectedDateRange.to.getTime() &&
                        !range.to && !selectedDateRange.from) {
                      // Клик на endDate когда startDate уже снят - снимаем endDate
                      setSelectedDateRange({ from: undefined, to: undefined });
                      return;
                    }

                    // Проверяем клик на endDate когда выбран полный диапазон
                    if (range.from && selectedDateRange.to &&
                        range.from.getTime() === selectedDateRange.to.getTime() &&
                        !range.to && selectedDateRange.from) {
                      // Клик на endDate - снимаем только endDate
                      setSelectedDateRange({
                        from: selectedDateRange.from,
                        to: undefined
                      });
                      return;
                    }

                    // Проверяем клик вне диапазона
                    if (range.from && !range.to && selectedDateRange.from && selectedDateRange.to) {
                      // Клик на новую дату C - сбрасываем старый диапазон, начинаем новый выбор
                      setSelectedDateRange({ from: range.from, to: undefined });
                      return;
                    }

                    // Обычный выбор диапазона
                    setSelectedDateRange(range);
                  }}
                  locale={ru}
                  showOutsideDays={false}
                  disabled={{ after: new Date() }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="border-b border-gray-200 mb-4"></div>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : historyExpenses.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 font-medium">
                {selectedDateRange.from ? (
                  selectedDateRange.to ? (
                    `За период ${format(selectedDateRange.from, 'dd.MM.yyyy', { locale: ru })} - ${format(selectedDateRange.to, 'dd.MM.yyyy', { locale: ru })} расходов не было`
                  ) : (
                    `За ${format(selectedDateRange.from, 'dd.MM.yyyy', { locale: ru })} расходов не было`
                  )
                ) : (
                  'Выберите период для просмотра расходов'
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {expenseCategories.map((category) => {
                const categoryExpenses = historyExpenses.filter(e => e.category === category.id);
                const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);

                if (categoryExpenses.length === 0) return null;

                return (
                  <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Заголовок категории */}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {React.cloneElement(category.icon as React.ReactElement, { className: "w-4 h-4 text-gray-600" })}
                        <span className="font-semibold text-gray-900">{category.label}</span>
                      </div>
                      <span className="font-bold text-gray-900">{formatMoney(categoryTotal)}₽</span>
                    </div>

                    {/* Список расходов категории */}
                    <div className="divide-y divide-gray-100">
                      {categoryExpenses.map((expense) => {
                        const createdAt = new Date(expense.created_at);
                        const timeStr = createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                        const dateStr = createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

                        return (
                          <div key={expense.id} className="px-4 py-3">
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex-1">
                                {/* Строка 1: Сумма */}
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-gray-900">{formatMoney(expense.amount)}₽</span>
                                </div>
                                {expense.comment && (
                                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    {expense.comment}
                                  </div>
                                )}
                                {/* Строка 2: Дата и время */}
                                <div className="text-xs text-gray-400 flex items-center gap-2 mb-1">
                                  <CalendarIcon className="w-3 h-3" />
                                  <span>{dateStr}</span>
                                  <span>|</span>
                                  <span>{timeStr}</span>
                                </div>
                                {/* Строка 3: Имя создателя или редактора */}
                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  <span className="font-medium">
                                    {expense.updater_role && expense.updater_role !== expense.creator_role ? (
                                      <span className="text-orange-600">Ред: {formatCreatorName(expense)}</span>
                                    ) : (
                                      formatCreatorName(expense)
                                    )}
                                  </span>
                                </div>
                                {/* Кнопка просмотра чека под значком расхода (только для мобильных) */}
                                {expense.receipt_url && (
                                  <div className="mt-2 sm:hidden">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewReceipt(expense)}
                                      className="h-7 px-3 py-1 text-xs gap-1.5 border-gray-300"
                                    >
                                      <Eye className="w-3 h-3" />
                                      Чек
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div className="hidden sm:flex flex-col items-center gap-0">
                                {/* Кнопка просмотра чека (только для ПК) */}
                                {expense.receipt_url && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleViewReceipt(expense)}
                                    className="h-7 px-3 py-1 text-xs gap-1.5 border-gray-300"
                                  >
                                    <Eye className="w-3 h-3" />
                                    Чек
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Итого по всем категориям */}
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-purple-600" />
                    <span className="font-semibold text-gray-900">ИТОГО ЗА ПЕРИОД:</span>
                  </div>
                  <span className="text-xl font-bold text-purple-600">
                    {formatMoney(historyExpenses.reduce((sum, e) => sum + e.amount, 0))}₽
                  </span>
                </div>
              </div>
            </div>
          )}
         </motion.div>
         </>
       )}
       </div>

      {/* История отчетов */}
      <div ref={reportsHistoryRef} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div
          onClick={() => setOpenReportsSection(!openReportsSection)}
          onPointerDown={(e) => e.preventDefault()}
          className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-gray-900">История Отчетов</span>
          </div>
          <div className="text-gray-400">
            {openReportsSection ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>

        {openReportsSection && (
          <>
            <div className="border-t border-gray-200"></div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="px-4 py-4 bg-gray-50"
            >
              <div className="mb-4">
                <Popover
                  open={isReportCalendarOpen}
                  onOpenChange={(open) => {
                    setIsReportCalendarOpen(open);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !reportDateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reportDateRange.from ? (
                        reportDateRange.to ? (
                          <>
                            {format(reportDateRange.from, 'dd.MM.yyyy', { locale: ru })} -{" "}
                            {format(reportDateRange.to, 'dd.MM.yyyy', { locale: ru })}
                          </>
                        ) : (
                          format(reportDateRange.from, 'dd.MM.yyyy', { locale: ru })
                        )
                      ) : (
                        <span>Выберите период</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={reportDateRange}
                      onSelect={(range) => {
                        if (!range || (!range.from && !range.to)) {
                          // Полный сброс
                          setReportDateRange({ from: undefined, to: undefined });
                          return;
                        }

                        // Проверяем клик на startDate
                        if (range.from && reportDateRange.from &&
                            range.from.getTime() === reportDateRange.from.getTime() &&
                            !range.to) {
                          // Клик на startDate - снимаем только startDate
                          setReportDateRange({ from: undefined, to: undefined });
                          return;
                        }

                        // Проверяем клик на endDate
                        if (range.from && reportDateRange.to &&
                            range.from.getTime() === reportDateRange.to.getTime() &&
                            !range.to && !reportDateRange.from) {
                          // Клик на endDate когда startDate уже снят - снимаем endDate
                          setReportDateRange({ from: undefined, to: undefined });
                          return;
                        }

                        // Проверяем клик на endDate когда выбран полный диапазон
                        if (range.from && reportDateRange.to &&
                            range.from.getTime() === reportDateRange.to.getTime() &&
                            !range.to && reportDateRange.from) {
                          // Клик на endDate - снимаем только endDate
                          setReportDateRange({
                            from: reportDateRange.from,
                            to: undefined
                          });
                          return;
                        }

                        // Проверяем клик вне диапазона
                        if (range.from && !range.to && reportDateRange.from && reportDateRange.to) {
                          // Клик на новую дату C - сбрасываем старый диапазон, начинаем новый выбор
                          setReportDateRange({ from: range.from, to: undefined });
                          return;
                        }

                        // Обычный выбор диапазона
                        setReportDateRange(range);
                      }}
                      locale={ru}
                      showOutsideDays={false}
                      disabled={{ after: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="border-b border-gray-200 mb-4"></div>
              {loadingReportHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : !reportHistory ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 font-medium">
                    {reportDateRange.from ? (
                      reportDateRange.to ? (
                        `За период ${format(reportDateRange.from, 'dd.MM.yyyy', { locale: ru })} - ${format(reportDateRange.to, 'dd.MM.yyyy', { locale: ru })} данных нет`
                      ) : (
                        `За ${format(reportDateRange.from, 'dd.MM.yyyy', { locale: ru })} данных нет`
                      )
                    ) : (
                      'Выберите период для просмотра отчетов'
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* ШИНОМОНТАЖ */}
                  <div className="border border-gray-200 rounded-lg bg-white">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LifeBuoy className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Шиномонтаж</span>
                      </div>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-200">{formatMoney(reportHistory.tire.total)}₽</Badge>
                    </div>
                    <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Обслужено машин</span>
                        <span className="font-semibold">{reportHistory.tire.carsCount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Хранений резины</span>
                        <span className="font-semibold">{reportHistory.tire.storageCount}</span>
                      </div>
                      {/* Кондиционеры */}
                      {(reportHistory.tire.acComplexCount > 0 || reportHistory.tire.acFreonCount > 0) && (
                        <div className="py-2 space-y-1">
                          <span className="text-sm font-semibold text-gray-600">❄️ Кондиционеры:</span>
                          {reportHistory.tire.acComplexCount > 0 && (
                            <div className="flex justify-between items-center pl-3">
                              <span className="text-xs text-gray-500">Комплексная заправка</span>
                              <span className="text-sm font-semibold">
                                {reportHistory.tire.acComplexCount} шт × {formatMoney(reportHistory.tire.acComplexPrice || 0)}₽ = {formatMoney(reportHistory.tire.acComplexTotal || 0)}₽
                              </span>
                            </div>
                          )}
                          {reportHistory.tire.acFreonCount > 0 && (
                            <div className="flex justify-between items-center pl-3">
                              <span className="text-xs text-gray-500">Доливка фреона ({reportHistory.tire.acFreonGrams}г)</span>
                              <span className="text-sm font-semibold">
                                {reportHistory.tire.acFreonCount} шт = {formatMoney(reportHistory.tire.acFreonTotal || 0)}₽
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* ПРОЧЕЕ */}
                      {reportHistory.tire.otherServiceCount > 0 && (
                        <div className="py-2 space-y-1">
                          <span className="text-sm font-semibold text-gray-600">🔧 ПРОЧЕЕ:</span>
                          <div className="flex justify-between items-center pl-3">
                            <span className="text-xs text-gray-500">
                              {reportHistory.tire.otherServiceCount} шт = {formatMoney(reportHistory.tire.otherServiceTotal || 0)}₽
                            </span>
                          </div>
                          {reportHistory.tire.otherServiceComments?.map((comment, i) => (
                            <div key={i} className="text-xs text-orange-500 pl-3 italic">• {comment}</div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Наличные</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.cash)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Безналичные</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.card)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Переводы</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.transfer)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">СБП</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.sbp)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Ведомость</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.vedomost)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Яндекс</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.yandex)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">QR-code</span>
                        <span className="font-semibold">{formatMoney(reportHistory.tire.qrCode)}₽</span>
                      </div>
                    </div>
                  </div>

                  {/* АВТОМОЙКА */}
                  <div className="border border-gray-200 rounded-lg bg-white">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CarFront className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Автомойка</span>
                      </div>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-200">{formatMoney(reportHistory.carwash.total)}₽</Badge>
                    </div>
                    <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Помыто машин</span>
                        <span className="font-semibold">{reportHistory.carwash.carsCount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Наличные</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.cash)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Безналичные</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.card)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Переводы</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.transfer)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">СБП</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.sbp)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Ведомость</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.vedomost)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Яндекс</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.yandex)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">QR-code</span>
                        <span className="font-semibold">{formatMoney(reportHistory.carwash.qrCode)}₽</span>
                      </div>
                    </div>
                  </div>

                  {/* РАСХОДЫ */}
                  <div className="border border-gray-200 rounded-lg bg-white">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Расходы</span>
                      </div>
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-200">{formatMoney(reportHistory.expenses.total)}₽</Badge>
                    </div>
                    <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Чай/Кофе</span>
                        <span className="font-semibold">{formatMoney(reportHistory.expenses.teaCoffee)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Ремонт</span>
                        <span className="font-semibold">{formatMoney(reportHistory.expenses.repair)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Коммуналка</span>
                        <span className="font-semibold">{formatMoney(reportHistory.expenses.utilities)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Канцелярия</span>
                        <span className="font-semibold">{formatMoney(reportHistory.expenses.stationery)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Прочее</span>
                        <span className="font-semibold">{formatMoney(reportHistory.expenses.other)}₽</span>
                      </div>
                    </div>
                  </div>

                  {/* СКЛАД */}
                  <div className="border border-gray-200 rounded-lg bg-white">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Склад</span>
                      </div>
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-200">{formatMoney(reportHistory.chemistry.total)}₽</Badge>
                    </div>
                    <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
                      {reportHistory.chemistry.details.length > 0 ? (
                        reportHistory.chemistry.details.map((detail, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">{detail.itemName}</span>
                            <span className="font-semibold">{formatMoney(detail.totalAmount)}₽</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500 text-center py-2">
                          Нет данных по складу
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ЗАРПЛАТЫ */}
                  <div className="border border-gray-200 rounded-lg bg-white">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Зарплаты</span>
                      </div>
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-200">{formatMoney(reportHistory.salaries.total)}₽</Badge>
                    </div>
                    <div className="divide-y divide-gray-100 px-4 py-3 space-y-4">
                      {/* Мойщики */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600 font-medium">Мойщики</span>
                          <span className="font-semibold text-red-600">{formatMoney(reportHistory.salaries.workers)}₽</span>
                        </div>
                        {reportHistory.salaries.workersDetails && reportHistory.salaries.workersDetails.length > 0 && (
                          <div className="space-y-1 pl-4 border-l-2 border-gray-200 ml-2">
                            {reportHistory.salaries.workersDetails.map((worker) => (
                              <div key={worker.id} className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-600">{worker.name}</span>
                                <span className="font-medium text-gray-900">{formatMoney(worker.salary)}₽</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Шиномонтажники */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600 font-medium">Шиномонтажники</span>
                          <span className="font-semibold text-red-600">{formatMoney(reportHistory.salaries.technicians)}₽</span>
                        </div>
                        {reportHistory.salaries.techniciansDetails && reportHistory.salaries.techniciansDetails.length > 0 && (
                          <div className="space-y-1 pl-4 border-l-2 border-gray-200 ml-2">
                            {reportHistory.salaries.techniciansDetails.map((technician) => (
                              <div key={technician.id} className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-600">{technician.name}</span>
                                <span className="font-medium text-gray-900">{formatMoney(technician.salary)}₽</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Админы */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600 font-medium">Админы</span>
                          <span className="font-semibold text-red-600">{formatMoney(reportHistory.salaries.admin)}₽</span>
                        </div>
                        {reportHistory.salaries.adminsDetails && reportHistory.salaries.adminsDetails.length > 0 && (
                          <div className="space-y-1 pl-4 border-l-2 border-gray-200 ml-2">
                            {reportHistory.salaries.adminsDetails.map((admin) => (
                              <div key={admin.id} className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-600">{admin.name}</span>
                                <span className="font-medium text-gray-900">{formatMoney(admin.salary)}₽</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* ПРОДАЖИ */}
                  {reportHistory.sales && reportHistory.sales.details.length > 0 && (
                    <div className="border border-gray-200 rounded-lg bg-white">
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5 text-gray-600" />
                          <span className="font-semibold text-gray-900">Продажи товаров</span>
                        </div>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-200">{formatMoney(reportHistory.sales.total)}₽</Badge>
                      </div>
                      <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
                        {reportHistory.sales.details.map((detail) => (
                          <div key={detail.productName} className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">{detail.productName}</span>
                            <span className="font-semibold">{formatMoney(detail.totalPrice)}₽</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ИТОГО */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">Выручка (+):</span>
                        <span className="font-bold text-green-600">{formatMoney(reportHistory.totals.revenue)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">Расходы (-):</span>
                        <span className="font-bold text-red-600">-{formatMoney(reportHistory.totals.expenses)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">Склад (-):</span>
                        <span className="font-bold text-red-600">-{formatMoney(reportHistory.totals.chemistry)}₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">Зарплаты (-):</span>
                        <span className="font-bold text-red-600">-{formatMoney(reportHistory.totals.salaries)}₽</span>
                      </div>
                      {reportHistory.sales && reportHistory.sales.total > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-900">Продажи (+):</span>
                          <span className="font-bold text-green-600">{formatMoney(reportHistory.sales.total)}₽</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                        <span className="text-lg font-bold text-gray-900">Чистая прибыль:</span>
                        <span className={cn(
                          "text-2xl font-bold",
                          reportHistory.totals.profit >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatMoney(reportHistory.totals.profit)}₽
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Экспорт */}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-2" onClick={handleExportReportHistoryPDF}>
                      <Download className="w-4 h-4" />
                      Экспорт PDF
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>

      {/* История Прихода Склад */}
      <div ref={inventoryHistoryRef} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div
          onClick={() => setOpenInventorySection(!openInventorySection)}
          onPointerDown={(e) => e.preventDefault()}
          className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-gray-900">История Прихода Склад</span>
          </div>
          <div className="text-gray-400">
            {openInventorySection ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>

        {openInventorySection && (
          <>
            <div className="border-t border-gray-200"></div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="px-4 py-4 bg-gray-50"
            >
              <div className="mb-4">
                <Popover
                  open={isInventoryCalendarOpen}
                  onOpenChange={(open) => {
                    setIsInventoryCalendarOpen(open);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !inventoryDateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {inventoryDateRange.from ? (
                        inventoryDateRange.to ? (
                          <>
                            {format(inventoryDateRange.from, 'dd.MM.yyyy', { locale: ru })} -{" "}
                            {format(inventoryDateRange.to, 'dd.MM.yyyy', { locale: ru })}
                          </>
                        ) : (
                          format(inventoryDateRange.from, 'dd.MM.yyyy', { locale: ru })
                        )
                      ) : (
                        <span>Выберите период</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={inventoryDateRange}
                      onSelect={(range) => {
                        if (!range || (!range.from && !range.to)) {
                          // Полный сброс
                          setInventoryDateRange({ from: undefined, to: undefined });
                          return;
                        }

                        // Проверяем клик на startDate
                        if (range.from && inventoryDateRange.from &&
                            range.from.getTime() === inventoryDateRange.from.getTime() &&
                            !range.to) {
                          // Клик на startDate - снимаем только startDate
                          setInventoryDateRange({ from: undefined, to: undefined });
                          return;
                        }

                        // Проверяем клик на endDate
                        if (range.from && inventoryDateRange.to &&
                            range.from.getTime() === inventoryDateRange.to.getTime() &&
                            !range.to && !inventoryDateRange.from) {
                          // Клик на endDate когда startDate уже снят - снимаем endDate
                          setInventoryDateRange({ from: undefined, to: undefined });
                          return;
                        }

                        // Проверяем клик на endDate когда выбран полный диапазон
                        if (range.from && inventoryDateRange.to &&
                            range.from.getTime() === inventoryDateRange.to.getTime() &&
                            !range.to && inventoryDateRange.from) {
                          // Клик на endDate - снимаем только endDate
                          setInventoryDateRange({
                            from: inventoryDateRange.from,
                            to: undefined
                          });
                          return;
                        }

                        // Проверяем клик вне диапазона
                        if (range.from && !range.to && inventoryDateRange.from && inventoryDateRange.to) {
                          // Клик на новую дату C - сбрасываем старый диапазон, начинаем новый выбор
                          setInventoryDateRange({ from: range.from, to: undefined });
                          return;
                        }

                        // Обычный выбор диапазона
                        setInventoryDateRange(range);
                      }}
                      locale={ru}
                      showOutsideDays={false}
                      disabled={{ after: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="border-b border-gray-200 mb-4"></div>
              {loadingInventoryHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : inventoryHistory.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 font-medium">
                    {inventoryDateRange.from ? (
                      inventoryDateRange.to ? (
                        `За период ${format(inventoryDateRange.from, 'dd.MM.yyyy', { locale: ru })} - ${format(inventoryDateRange.to, 'dd.MM.yyyy', { locale: ru })} приходов не было`
                      ) : (
                        `За ${format(inventoryDateRange.from, 'dd.MM.yyyy', { locale: ru })} приходов не было`
                      )
                    ) : (
                      'Выберите период для просмотра приходов'
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Группировка по товарам */}
                  {(() => {
                    // Группируем по названию товара
                    const grouped: Record<string, InventoryArrivalHistory[]> = inventoryHistory.reduce((acc, item) => {
                      const itemName = item.itemName || 'Неизвестный товар';
                      if (!acc[itemName]) {
                        acc[itemName] = [];
                      }
                      acc[itemName].push(item);
                      return acc;
                    }, {} as Record<string, InventoryArrivalHistory[]>);

                    return Object.entries(grouped).map(([itemName, items]) => {
                      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
                      const totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

                      return (
                        <div key={itemName} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* Заголовок товара */}
                          <div className="bg-green-50 px-4 py-3 flex items-center gap-2 border-b border-gray-300">
                            <Package className="w-4 h-4 text-green-600" />
                            <span className="font-semibold text-gray-900">{itemName}</span>
                          </div>

                          {/* Список приходов товара */}
                          <div className="divide-y divide-gray-300">
                            {items.map((item) => {
                              const createdAt = new Date(item.createdAt);
                              const deliveryDate = new Date(item.deliveryDate);
                              const timeStr = createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                              const dateStr = createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                              const deliveryDateStr = deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

                              return (
                                <div key={item.id} className="px-4 py-3">
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1">
                                      {/* Строка 1: Сумма и количество */}
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-gray-900">{formatMoney(item.totalPrice)}₽</span>
                                        <span className="text-sm text-gray-600">| {item.quantity} шт.</span>
                                        <span className="text-sm text-gray-600">| {formatMoney(item.pricePerUnit)}₽/шт.</span>
                                      </div>
                                      {/* Строка 2: Дата создания и дата поставки */}
                                      <div className="text-xs text-gray-400 mb-1 flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                          <CalendarIcon className="w-3 h-3" />
                                          <span>Поставка: {deliveryDateStr}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <CalendarIcon className="w-3 h-3" />
                                          <span>Создано: {dateStr} {timeStr}</span>
                                        </div>
                                      </div>
                                      {/* Строка 3: Примечание */}
                                      {item.notes && (
                                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                          <MessageCircle className="w-3 h-3" />
                                          {item.notes}
                                        </div>
                                      )}
                                      {/* Кнопки чека и скачивания (мобильные) */}
                                      {item.receiptUrl && (
                                        <div className="mt-2 sm:hidden flex gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleViewInventoryReceipt(item.receiptUrl)}
                                            className="h-7 px-3 py-1 text-xs gap-1.5 border-gray-300"
                                          >
                                            <Eye className="w-3 h-3" />
                                            Чек
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleDownloadInventoryReceipt(item.receiptUrl, itemName, item.createdAt)}
                                            className="h-7 px-3 py-1 text-xs gap-1.5 border-gray-300"
                                          >
                                            <Download className="w-3 h-3" />
                                            Скачать
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                      {/* Кнопки чека и скачивания (ПК) */}
                                      {item.receiptUrl && (
                                        <div className="hidden sm:flex flex-col gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleViewInventoryReceipt(item.receiptUrl)}
                                            className="h-7 px-3 py-1 text-xs gap-1.5 border-gray-300"
                                          >
                                            <Eye className="w-3 h-3" />
                                            Чек
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleDownloadInventoryReceipt(item.receiptUrl, itemName, item.createdAt)}
                                            className="h-7 px-3 py-1 text-xs gap-1.5 border-gray-300"
                                          >
                                            <Download className="w-3 h-3" />
                                            Скачать
                                          </Button>
                                        </div>
                                      )}
                                  </div>
                                </div>
                              );
                             })}
                           </div>
                          {/* Итого по категории */}
                          <div className="bg-green-100 px-4 py-3 flex items-center justify-between border-t border-gray-300">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">Всего:</span>
                              <span className="font-semibold text-gray-900">{totalQuantity} шт.</span>
                            </div>
                            <span className="font-bold text-green-600">{formatMoney(totalPrice)}₽</span>
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* Итого по всем товарам */}
                  <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-green-600" />
                        <span className="font-semibold text-gray-900">ИТОГО ЗА ПЕРИОД:</span>
                      </div>
                      <span className="text-xl font-bold text-green-600">
                        {formatMoney(inventoryHistory.reduce((sum, item) => sum + item.totalPrice, 0))}₽
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>

      {/* Статистика оплат организаций - только для владельца */}
{userRole === 'owner' && (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <div
      onClick={() => setOpenOrgPaymentsSection(!openOrgPaymentsSection)}
      onPointerDown={(e) => e.preventDefault()}
      className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-3">
        <Building2 className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-gray-900">Статистика оплат организаций</span>
      </div>
      <div className="text-gray-400">
        {openOrgPaymentsSection ? (
          <ChevronUp className="w-5 h-5" />
        ) : (
          <ChevronDown className="w-5 h-5" />
        )}
      </div>
    </div>

    {openOrgPaymentsSection && (
      <>
        <div className="border-t border-gray-200"></div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="px-4 py-4 bg-gray-50"
        >
          {/* Выбор месяца */}
          <div className="mb-4">
            <Input
              type="month"
              value={selectedOrgMonth}
              onChange={(e) => setSelectedOrgMonth(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="border-b border-gray-200 mb-4"></div>
          
          {orgPaymentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : orgPaymentsData.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 font-medium">
                За {new Date(selectedOrgMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} оплат от организаций не было
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Список организаций */}
              {orgPaymentsData.map((org: any) => (
                <div key={org.id} className="border border-gray-200 rounded-lg bg-white">
                  <div className="bg-blue-50 px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{org.name}</div>
                      {org.inn && (
                        <div className="text-xs text-gray-500">ИНН: {org.inn}</div>
                      )}
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200">
                      {formatMoney(org.total)}₽
                    </Badge>
                  </div>
                  <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Автомойка</span>
                      <span className="font-semibold">{formatMoney(org.carwashTotal)}₽</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Шиномонтаж</span>
                      <span className="font-semibold">{formatMoney(org.tireTotal)}₽</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Итого */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Автомойка (всего):</span>
                    <span className="font-bold text-blue-600">
                      {formatMoney(orgPaymentsData.reduce((sum: number, org: any) => sum + org.carwashTotal, 0))}₽
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Шиномонтаж (всего):</span>
                    <span className="font-bold text-blue-600">
                      {formatMoney(orgPaymentsData.reduce((sum: number, org: any) => sum + org.tireTotal, 0))}₽
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                    <span className="text-lg font-bold text-gray-900">ИТОГО:</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {formatMoney(orgPaymentsData.reduce((sum: number, org: any) => sum + org.total, 0))}₽
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </>
    )}
  </div>
)}

      {/* Модалка просмотра чека */}
      {viewingReceipt && createPortal(
        <div className="fixed inset-0 w-full h-full bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">Чек</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewingReceipt(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-8rem)]">
              <img
                src={viewingReceipt.url}
                alt={viewingReceipt.fileName}
                className="max-w-full h-auto object-contain rounded"
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Мастер юридических данных */}
      {showCompanySettingsWizard && createPortal(
        <div className="fixed inset-0 w-full h-full bg-white z-50 overflow-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <CompanySettingsWizard
              onBack={() => setShowCompanySettingsWizard(false)}
              userRole={userRole}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Мастер условий персонала */}
      {showSalarySettingsWizard && createPortal(
        <div className="fixed inset-0 w-full h-full bg-white z-50 overflow-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <SalarySettingsWizard
              onBack={() => setShowSalarySettingsWizard(false)}
              userRole={userRole}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Мастер смены пароля */}
      {showChangePasswordWizard && createPortal(
        <div className="fixed inset-0 w-full h-full bg-white z-50 overflow-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <ChangePasswordWizard
              onBack={() => setShowChangePasswordWizard(false)}
              userId={userId}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
