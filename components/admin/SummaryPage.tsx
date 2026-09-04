import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Car,
  CarFront,
  LifeBuoy,
  Banknote,
  Wallet,
  Coffee,
  Wrench,
  Home,
  Pen,
  Package,
  Trash2,
  Paperclip,
  Check,
  Download,
  Save,
  Calendar as CalendarIcon,
  CreditCard,
  Smartphone,
  ClipboardList,
  Gem,
  BarChart3,
  Users,
  User,
  CheckCircle,
  XCircle,
  Zap,
  FileText,
  Info,
  Target,
  X,
  Eye,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Book
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDate } from '../../shared/utils/date';
import { motion } from 'framer-motion';
import { getOrganizations } from '../../lib/api/organizations';
import { getWorksheetEntries, type WorksheetEntry } from '../../lib/api/worksheets';
import { getCompanySettings } from '../../lib/api/companySettings';
import { allocateDocumentNumber } from '../../lib/api/document-numbers';
import { generateInvoiceHTML, generateActHTML } from '../../shared/utils/document-templates';
import { generateInvoiceDocx, generateActDocx } from '../../shared/utils/docx-generator';
import { isTelegramWebApp } from '../../shared/telegram/telegram';
import { downloadPdfInTelegram } from '../../shared/utils/download';
import { MonthPicker } from '../ui/month-picker';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadReceipt,
  getReceiptUrl,
  deleteReceipt,
  type ExpenseWithCreator,
  EXPENSE_CATEGORIES,
  isCommentRequired,
  formatCreatorName
} from '../../lib/api/expenses';
import { getCompletedBookingsByDate } from '../../lib/api/bookings';
import { getCompletedTireBookingsByDate } from '../../lib/api/tire-bookings';
import { getWorkersWithTransactionsByDate } from '../../lib/api/workers';
import { getTireWorkersWithTransactionsByDate } from '../../lib/api/tire-workers';
import { getAdminsWithTransactionsByDate } from '../../lib/api/admins';
import type { Organization } from '../../entities/organization/model';
import { ProductSalesForm } from './ProductSalesForm';
import { getProductSalesByDate } from '../../lib/api/product-sales';

// Типы для расходов (локальные для UI)
type ExpenseCategory = 'tea_coffee' | 'repair' | 'utilities' | 'stationery' | 'other';

interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  time: string;
  checkFile?: File | null;
  comment?: string;
}

interface SummaryPageProps {
  bookings?: any[];
  tireBookings?: any[];
  workers?: any[];
  technicians?: any[];
  selectedDate?: string;
  userId?: string;
  userRole?: 'admin' | 'owner';
}

export const SummaryPage: React.FC<SummaryPageProps> = ({
  bookings = [],
  tireBookings = [],
  workers = [],
  technicians = [],
  selectedDate = formatDate(new Date()),
  userId = '',
  userRole = 'admin',
}) => {
  const [expenses, setExpenses] = useState<ExpenseWithCreator[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCheckFile, setExpenseCheckFile] = useState<File | null>(null);
  const [expenseComment, setExpenseComment] = useState('');
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCreator | null>(null);
  const [savingExpense, setSavingExpense] = useState(false); // Состояние сохранения расхода
  const [inlineEditingExpense, setInlineEditingExpense] = useState<string | null>(null); // ID расхода, который редактируется inline
  const [inlineEditAmount, setInlineEditAmount] = useState('');
  const [inlineEditComment, setInlineEditComment] = useState('');
  const [inlineEditReceiptFile, setInlineEditReceiptFile] = useState<File | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

   // Состояния для данных Итогового отчёта (загружаются из API)
   const [reportData, setReportData] = useState<{
     completedBookings: any[];
     completedTireBookings: any[];
     workersWithTransactions: any[];
     techniciansWithTransactions: any[];
     adminsWithTransactions: any[];
     productSales: any[];
   }>({
     completedBookings: [],
     completedTireBookings: [],
     workersWithTransactions: [],
     techniciansWithTransactions: [],
     adminsWithTransactions: [],
     productSales: [],
   });
   const [loadingReport, setLoadingReport] = useState(false);
   const [reportError, setReportError] = useState<string | null>(null);
  
   // Состояние для ведомостей
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<'carwash' | 'tire'>('carwash');
  const [selectedMonth, setSelectedMonth] = useState(formatDate(new Date()).substring(0, 7)); // YYYY-MM
  const [worksheetData, setWorksheetData] = useState<WorksheetEntry[]>([]);
  const [loadingWorksheet, setLoadingWorksheet] = useState(false);
  const [allServices, setAllServices] = useState<any[]>([]); // Все услуги для получения названий

  // Состояния для генерации документов
  const [loadingInvoicePDF, setLoadingInvoicePDF] = useState(false);
  const [loadingInvoiceWord, setLoadingInvoiceWord] = useState(false);
  const [loadingActPDF, setLoadingActPDF] = useState(false);
  const [loadingActWord, setLoadingActWord] = useState(false);

  // Состояние открытых секций аккордеона
  const [openSection, setOpenSection] = useState<'expenses' | 'sales' | 'report' | 'worksheets' | null>(null);

  // Определяем, это ПК в Telegram Mini App
  const isDesktopTelegram = isTelegramWebApp() && typeof window !== 'undefined' && window.innerWidth > 768;

  // Логирование для отладки Telegram WebApp
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      console.log('[DEBUG] Telegram WebApp:', {
        available: !!window.Telegram.WebApp,
        openLink: typeof window.Telegram.WebApp.openLink,
        platform: window.Telegram.WebApp.platform,
        version: window.Telegram.WebApp.version,
        initData: window.Telegram.WebApp.initData?.slice(0, 50),
        isDesktopTelegram,
      });
    } else {
      console.log('[DEBUG] Telegram WebApp NOT available');
    }
  }, [isDesktopTelegram]);

  // Состояние открытых вложенных секций аккордеона расходов
  const [openExpenseSection, setOpenExpenseSection] = useState<'add' | 'today' | null>(null);

  // Refs для плавной прокрутки к аккордеонам
  const addExpenseRef = useRef<HTMLDivElement>(null);
  const todayExpenseRef = useRef<HTMLDivElement>(null);

  // Категории расходов
  const expenseCategories: { id: ExpenseCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'tea_coffee', label: 'Чай/Кофе', icon: <Coffee className="w-4 h-4" /> },
    { id: 'repair', label: 'Ремонт', icon: <Wrench className="w-4 h-4" /> },
    { id: 'utilities', label: 'Коммуналка', icon: <Zap className="w-4 h-4" /> },
    { id: 'stationery', label: 'Канцелярия', icon: <FileText className="w-4 h-4" /> },
    { id: 'other', label: 'Прочее', icon: <Package className="w-4 h-4" /> },
  ];

  // Расчет зарплат (только выданные суммы за текущий день) - использует данные из API
  const calculateSalaries = () => {
    // Считаем выданные зарплаты мойщиков (PAYOUT и ADVANCE за текущий день)
    // Данные уже отфильтрованы по дате в API функции getWorkersWithTransactionsByDate
    const workersSalaries = reportData.workersWithTransactions
      .map(w => {
        // salary_transactions уже отфильтрованы по дате в API
        const todayPayouts = w.salary_transactions || [];
        const paidToday = todayPayouts.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

        return {
          name: w.full_name,
          paidToday,
        };
      })
      .filter(w => w.paidToday > 0); // Показываем только тех, кому что-то выплатили

    // Считаем выданные зарплаты шиномонтажников (PAYOUT и ADVANCE за текущий день)
    // Данные уже отфильтрованы по дате в API функции getTireWorkersWithTransactionsByDate
    const techniciansSalaries = reportData.techniciansWithTransactions
      .map(t => {
        // salary_transactions уже отфильтрованы по дате в API
        const todayPayouts = t.salary_transactions || [];
        const paidToday = todayPayouts.reduce((sum: number, transaction: any) => sum + Math.abs(transaction.amount), 0);

        return {
          name: t.full_name,
          paidToday,
        };
      })
      .filter(t => t.paidToday > 0); // Показываем только тех, кому что-то выплатили

    // Считаем выданные зарплаты админов (PAYOUT и ADVANCE за текущий день)
    // Данные уже отфильтрованы по дате в API функции getAdminsWithTransactionsByDate
    const adminsSalaries = reportData.adminsWithTransactions
      .map(a => {
        // salary_transactions уже отфильтрованы по дате в API
        const todayPayouts = a.salary_transactions || [];
        const paidToday = todayPayouts.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

        return {
          name: a.full_name,
          paidToday,
        };
      })
      .filter(a => a.paidToday > 0); // Показываем только тех, кому что-то выплатили

    const totalWorkersSalary = workersSalaries.reduce((sum, w) => sum + w.paidToday, 0);
    const totalTechniciansSalary = techniciansSalaries.reduce((sum, t) => sum + t.paidToday, 0);
    const totalAdminsSalary = adminsSalaries.reduce((sum, a) => sum + a.paidToday, 0);

    return {
      workersSalaries,
      techniciansSalaries,
      adminsSalaries,
      totalWorkersSalary,
      totalTechniciansSalary,
      totalAdminsSalary,
    };
  };

  const salaries = calculateSalaries();

  // Загрузка организаций для ведомостей
  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const orgs = await getOrganizations();
        setOrganizations(orgs);
      } catch (error) {
        console.error('[SummaryPage] Ошибка загрузки организаций:', error);
      }
    };
    loadOrganizations();
  }, []);

  // Загрузка расходов при открытии секции 'expenses' или 'report'
  useEffect(() => {
    const loadExpenses = async () => {
      console.log('[SummaryPage] Загрузка расходов:', { openSection, userId, userRole, selectedDate });
      if ((openSection === 'expenses' || openSection === 'report') && userId) {
        setLoadingExpenses(true);
        try {
          // Для секции 'expenses' используем текущий день, для 'report' - выбранную дату
          const date = openSection === 'expenses' ? formatDate(new Date()) : selectedDate;
          const data = await getExpenses(userId, userRole as 'admin' | 'owner', date);
          console.log('[SummaryPage] Расходы загружены:', { date, count: data.length });
          setExpenses(data);
        } catch (error) {
          console.error('[SummaryPage] Ошибка загрузки расходов:', error);
        } finally {
          setLoadingExpenses(false);
        }
      }
    };
    loadExpenses();
  }, [openSection, userId, userRole, selectedDate]);

  // Загрузка данных Итогового отчёта при открытии секции "report"
  useEffect(() => {
    const loadReportData = async () => {
      console.log('[SummaryPage] Загрузка данных отчёта:', { openSection, selectedDate });
      if (openSection === 'report') {
        setLoadingReport(true);
        setReportError(null);
        try {
          // Загружаем данные параллельно
          const [completedBookings, completedTireBookings, workersWithTransactions, techniciansWithTransactions, adminsWithTransactions, productSales] = await Promise.all([
            getCompletedBookingsByDate(selectedDate),
            getCompletedTireBookingsByDate(selectedDate),
            getWorkersWithTransactionsByDate(selectedDate),
            getTireWorkersWithTransactionsByDate(selectedDate),
            getAdminsWithTransactionsByDate(selectedDate),
            getProductSalesByDate(selectedDate),
          ]);

          // Валидация данных
          const validatedBookings = completedBookings.filter(b => b && b.id);
          const validatedTireBookings = completedTireBookings.filter(b => b && b.id);
          const validatedWorkers = workersWithTransactions.filter(w => w && w.id);
          const validatedTechnicians = techniciansWithTransactions.filter(t => t && t.id);
          const validatedAdmins = adminsWithTransactions.filter(a => a && a.id);

          setReportData({
            completedBookings: validatedBookings,
            completedTireBookings: validatedTireBookings,
            workersWithTransactions: validatedWorkers,
            techniciansWithTransactions: validatedTechnicians,
            adminsWithTransactions: validatedAdmins,
            productSales: productSales || [],
          });
          console.log('[SummaryPage] Данные отчёта загружены:', {
            bookings: validatedBookings.length,
            tireBookings: validatedTireBookings.length,
            workers: validatedWorkers.length,
            technicians: validatedTechnicians.length,
            admins: validatedAdmins.length,
            productSales: productSales?.length || 0,
          });
        } catch (error) {
          console.error('[SummaryPage] Ошибка загрузки данных отчёта:', error);
          setReportError('Не удалось загрузить данные отчёта');
        } finally {
          setLoadingReport(false);
        }
      }
    };
    loadReportData();
  }, [openSection, selectedDate]);

  // Обработчик изменения продаж - перезагружает product_sales
  const handleSalesChange = async () => {
    console.log('[SummaryPage] Обновление данных продаж');
    try {
      const productSales = await getProductSalesByDate(selectedDate);
      setReportData(prev => ({
        ...prev,
        productSales: productSales || [],
      }));
    } catch (error) {
      console.error('[SummaryPage] Ошибка обновления продаж:', error);
    }
  };

   // Плавная прокрутка к открытому аккордеону расходов
  useEffect(() => {
    if (openExpenseSection === 'add' && addExpenseRef.current) {
      addExpenseRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (openExpenseSection === 'today' && todayExpenseRef.current) {
      todayExpenseRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openExpenseSection]);

  // Загрузка услуг для ведомостей
  useEffect(() => {
    const loadServices = async () => {
      try {
        if (serviceType === 'carwash') {
          const { getServices } = await import('../../lib/api/services');
          const servicesData = await getServices();
          setAllServices(servicesData);
        } else {
          const { getTireServices } = await import('../../lib/api/tire-services');
          const tireServicesData = await getTireServices();
          setAllServices(tireServicesData);
        }
      } catch (error) {
        console.error('[SummaryPage] Ошибка загрузки услуг:', error);
      }
    };
    loadServices();
  }, [serviceType]);

  // Итого расходов
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Чистая прибыль - использует данные из API
  // Зарплата админа включается только если он вышел в смену
  const totalSalaryExpenses = salaries.totalWorkersSalary + salaries.totalTechniciansSalary + salaries.totalAdminsSalary;
  const totalRevenue = [...reportData.completedBookings, ...reportData.completedTireBookings]
    .reduce((sum, b) => sum + (b.total_price || b.price || 0), 0);
  const totalSalesRevenue = reportData.productSales.reduce((sum, s) => sum + (s.total_price || 0), 0);
  const netProfit = totalRevenue + totalSalesRevenue - totalExpenses - totalSalaryExpenses;

  // Обработчики расходов
  const handleSaveExpense = async () => {
    if (!selectedCategory) return;
    if (!expenseAmount) return;
    if (!userId) return;

    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Валидация: для категорий "Коммуналка", "Ремонт" и "Прочее" обязателен комментарий
    if ((selectedCategory === 'utilities' || selectedCategory === 'repair' || selectedCategory === 'other') && !expenseComment.trim()) {
      const categoryName = selectedCategory === 'utilities' ? 'Коммуналка' :
                          selectedCategory === 'repair' ? 'Ремонт' : 'Прочее';
      alert(`Для категории "${categoryName}" обязательно нужно указать комментарий`);
      return;
    }

    // Блокируем кнопку и показываем "Сохранение..."
    setSavingExpense(true);

    try {
      let receiptUrl: string | undefined;

      // Загружаем чек в Storage если есть
      if (expenseCheckFile) {
        receiptUrl = await uploadReceipt(expenseCheckFile, userId);
      }

      // Всегда используем текущий день для расходов
      const todayDate = formatDate(new Date());

      if (editingExpense) {
        // Редактирование существующего расхода
        await updateExpense(editingExpense.id, {
          category: selectedCategory,
          amount,
          comment: (selectedCategory === 'utilities' || selectedCategory === 'repair' || selectedCategory === 'other') ? expenseComment : null,
          receipt_url: receiptUrl,
          expense_date: todayDate,
        }, userId); // ✅ Передаем userId отдельным параметром
      } else {
        // Создание нового расхода
        await createExpense({
          category: selectedCategory,
          amount,
          comment: (selectedCategory === 'utilities' || selectedCategory === 'repair' || selectedCategory === 'other') ? expenseComment : undefined,
          receipt_url: receiptUrl,
          expense_date: todayDate,
        }, userId); // ✅ Передаем userId отдельным параметром
      }

      // Перезагружаем расходы за сегодня
      const data = await getExpenses(userId, userRole as 'admin' | 'owner', todayDate);
      setExpenses(data);

      // Сброс формы
      setSelectedCategory(null);
      setExpenseAmount('');
      setExpenseCheckFile(null);
      setExpenseComment('');
      setEditingExpense(null);
    } catch (error) {
      console.error('[handleSaveExpense] Ошибка сохранения расхода:', error);
      alert('Не удалось сохранить расход');
    } finally {
      // Разблокируем кнопку
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    // Админ может удалять только свои расходы
    const expense = expenses.find(e => e.id === expenseId);
    if (userRole === 'admin' && expense?.created_by !== userId) {
      alert('Вы можете удалять только свои расходы');
      return;
    }
    
    if (!confirm('Удалить этот расход?')) return;

    try {
      // Удаляем расход из БД (delete-expense action best-effort cleans receipt first)
      await deleteExpense(expenseId);

      // Перезагружаем расходы за сегодня
      const today = formatDate(new Date());
      const data = await getExpenses(userId, userRole as 'admin' | 'owner', today);
      setExpenses(data);
    } catch (error) {
      console.error('[handleDeleteExpense] Ошибка удаления расхода:', error);
      alert('Не удалось удалить расход');
    }
  };

  const handleEditExpense = (expense: ExpenseWithCreator) => {
    // Админ может редактировать только свои расходы
    if (userRole === 'admin' && expense.created_by !== userId) {
      alert('Вы можете редактировать только свои расходы');
      return;
    }
    
    setEditingExpense(expense);
    setSelectedCategory(expense.category as ExpenseCategory);
    setExpenseAmount(expense.amount.toString());
    setExpenseComment(expense.comment || '');
  };

  const handleCancelEdit = () => {
    setEditingExpense(null);
    setSelectedCategory(null);
    setExpenseAmount('');
    setExpenseComment('');
    setExpenseCheckFile(null);
  };

  const handleViewReceipt = async (expense: ExpenseWithCreator) => {
    if (!expense.receipt_url) return;

    try {
      const url = await getReceiptUrl(expense.id);
      const fileName = expense.receipt_url.split('/').pop() || 'чек';
      setViewingReceipt({ url, fileName });
    } catch (error) {
      console.error('[handleViewReceipt] Ошибка получения чека:', error);
      alert('Не удалось загрузить чек');
    }
  };

  // Inline редактирование расходов
  const handleStartInlineEdit = (expense: ExpenseWithCreator) => {
    // Админ может редактировать только свои расходы
    if (userRole === 'admin' && expense.created_by !== userId) {
      alert('Вы можете редактировать только свои расходы');
      return;
    }
    
    setInlineEditingExpense(expense.id);
    setInlineEditAmount(expense.amount.toString());
    setInlineEditComment(expense.comment || '');
    setInlineEditReceiptFile(null); // Сбрасываем файл чека при начале редактирования
  };

  const handleSaveInlineEdit = async (expenseId: string) => {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    const amount = parseFloat(inlineEditAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму');
      return;
    }

    // Валидация: для категорий "Коммуналка", "Ремонт" и "Прочее" обязателен комментарий
    if ((expense.category === 'utilities' || expense.category === 'repair' || expense.category === 'other') && !inlineEditComment.trim()) {
      const categoryName = expense.category === 'utilities' ? 'Коммуналка' :
                          expense.category === 'repair' ? 'Ремонт' : 'Прочее';
      alert(`Для категории "${categoryName}" обязательно нужно указать комментарий`);
      return;
    }

    try {
      let receiptUrl: string | undefined;

      // Загружаем новый чек если выбран
      if (inlineEditReceiptFile) {
        // SAFE REPLACE FLOW (no cleanup of old object):
        //   1. upload new file (atomic; failure here leaves old receipt intact)
        //   2. update DB to point at new path (atomic; failure here leaves
        //      old receipt intact in DB; user can retry upload)
        //   Old receipt is intentionally retained after replacement;
        //   safe orphan cleanup requires attachment ownership/history
        //   and is out of scope (Slice #3f).
        receiptUrl = await uploadReceipt(inlineEditReceiptFile, userId);
        await updateExpense(expenseId, {
          amount,
          comment: (expense.category === 'utilities' || expense.category === 'repair' || expense.category === 'other') ? inlineEditComment : null,
          receipt_url: receiptUrl,
        }, userId);
      } else {
        // No new file — just update amount/comment, keep existing receipt_url
        await updateExpense(expenseId, {
          amount,
          comment: (expense.category === 'utilities' || expense.category === 'repair' || expense.category === 'other') ? inlineEditComment : null,
        }, userId);
      }

      // Перезагружаем расходы за сегодня
      const today = formatDate(new Date());
      const data = await getExpenses(userId, userRole as 'admin' | 'owner', today);
      setExpenses(data);

      // Сброс состояния редактирования
      setInlineEditingExpense(null);
      setInlineEditAmount('');
      setInlineEditComment('');
      setInlineEditReceiptFile(null);
    } catch (error) {
      console.error('[handleSaveInlineEdit] Ошибка сохранения расхода:', error);
      alert('Не удалось сохранить расход');
    }
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingExpense(null);
    setInlineEditAmount('');
    setInlineEditComment('');
    setInlineEditReceiptFile(null);
  };

  // Форматирование суммы
  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  // Генерация ведомости
  const handleGenerateWorksheet = async () => {
    if (!selectedOrg || !selectedMonth) {
      alert('Выберите организацию и месяц');
      return;
    }

    setLoadingWorksheet(true);
    try {
      const startDate = `${selectedMonth}-01`;
      // Вычисляем последний день месяца (для февраля это будет 28 или 29)
      const [year, month] = selectedMonth.split('-');
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;

      const data = await getWorksheetEntries({
        organization_id: selectedOrg,
        service_type: serviceType,
        start_date: startDate,
        end_date: endDate,
      });
      setWorksheetData(data);
    } catch (error) {
      console.error('[SummaryPage] Ошибка генерации ведомости:', error);
      alert('Не удалось загрузить ведомость');
    } finally {
      setLoadingWorksheet(false);
    }
  };

  // Форматирование услуг
  const formatServices = (services: any): string => {
    if (!services) return '';

    // Если это массив строк (service_id)
    if (Array.isArray(services)) {
      // Проверяем первый элемент - если строка, значит это массив service_id
      if (typeof services[0] === 'string') {
        return services.map(serviceId => {
          // Ищем название услуги по service_id
          // Проверяем оба поля: id (UUID) и service_id (строка)
          const service = allServices.find(s => s.id === serviceId || s.service_id === serviceId);
          return service ? service.name : serviceId;
        }).filter(name => name).join(', ');
      }

      // Если это массив объектов с service_id, quantity, price, total
      return services.map(item => {
        // Если у объекта уже есть name, используем его
        if (item.name) {
          const quantity = item.quantity || 1;
          return quantity > 1 ? `${item.name} (${quantity})` : item.name;
        }

        // Иначе ищем название услуги по service_id
        // Проверяем оба поля: id (UUID) и service_id (строка)
        const service = allServices.find(s => s.id === item.service_id || s.service_id === item.service_id);
        if (service) {
          const quantity = item.quantity || 1;
          return quantity > 1 ? `${service.name} (${quantity})` : service.name;
        }
        // Если услуга не найдена, возвращаем service_id
        return item.service_id || item.name || '';
      }).join(', ');
    }

    // Если это объект
    if (typeof services === 'object') {
      return Object.values(services).join(', ');
    }

    return String(services);
  };

  // Экспорт в PDF (для ведомостей)
  const handleExportPDF = async () => {
    console.log('[handleExportPDF] Начало генерации PDF ведомости');
    const orgName = organizations.find(o => o.id === selectedOrg)?.name || '';
    const serviceTypeName = serviceType === 'carwash' ? 'Автомойка' : 'Шиномонтаж';
    const monthName = new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

    // Создаем контент для печати
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ведомость - ${orgName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
          h1 { text-align: center; margin-bottom: 20px; }
          .info { margin-bottom: 20px; }
          .info p { margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #000; padding: 8px; text-align: center; vertical-align: top; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .signature-cell { width: 120px; text-align: center; }
          .signature-img { width: 100px; height: 60px; object-fit: contain; display: block; margin: 0 auto; }
          .no-signature { color: #999; font-style: italic; font-size: 12px; }
          .total { font-weight: bold; background-color: #f0f0f0; }
          .page-content { padding: 10mm; }
          @page {
            margin: 5mm;
            size: A4 landscape;
          }
          @media print {
            body { margin: 0; padding: 0; }
            .page-content { padding: 10mm; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            header, footer {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="page-content">
        <h1>Ведомость услуг</h1>
        <div class="info">
          <p><strong>Организация:</strong> ${orgName}</p>
          <p><strong>Тип услуги:</strong> ${serviceTypeName}</p>
          <p><strong>Период:</strong> ${monthName}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 40px;">№</th>
              <th style="width: 100px;">Дата</th>
              <th style="width: 120px;">Марка авто</th>
              <th style="width: 100px;">Гос.номер</th>
              <th>Перечень выполненых работ</th>
              <th style="width: 100px;">Стоимость</th>
              <th style="width: 150px;">ФИО водителя</th>
              <th class="signature-cell">Подпись</th>
            </tr>
          </thead>
          <tbody>
            ${worksheetData.map((entry, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${new Date(entry.service_date).toLocaleDateString('ru-RU')}</td>
                <td>${entry.car_model || '-'}</td>
                <td>${entry.plate_number || '-'}</td>
                <td>${formatServices(entry.services_provided)}</td>
                <td>${formatMoney(entry.total_amount)}₽</td>
                <td>${entry.driver_name}</td>
                <td class="signature-cell">
                  ${entry.signature_data
                    ? `<img src="${entry.signature_data}" class="signature-img" alt="Подпись" />`
                    : '<span class="no-signature">Нет подписи</span>'
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total">
              <td colspan="5" style="text-align: right;">ИТОГО:</td>
              <td>${formatMoney(worksheetData.reduce((sum, e) => sum + e.total_amount, 0))}₽</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
        <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <p><strong>ИП Галкин В.В</strong> /______________/</p>
            <p>МП</p>
          </div>
          <div style="flex: 1; text-align: right;">
            <p><strong>Заверенная копия передается Заказчику</strong></p>
          </div>
        </div>
        </div>
      </body>
      </html>
    `;

    // Проверяем платформу
    if (isTelegramWebApp()) {
      console.log('[handleExportPDF] Telegram WebApp detected, using URL.createObjectURL');
      // ✅ TELEGRAM: Конвертируем HTML → PDF и скачиваем без превью
      const element = document.createElement('div');
      element.innerHTML = printContent;

      try {
        console.log('[handleExportPDF] Начинаем генерация PDF...');

        console.log('[handleExportPDF] Telegram WebApp methods:', {
          downloadFile: typeof (window.Telegram as any)?.WebApp?.downloadFile,
          shareToChats: typeof (window.Telegram as any)?.WebApp?.shareToChats,
          showAlert: typeof (window.Telegram as any)?.WebApp?.showAlert,
          openLink: typeof (window.Telegram as any)?.WebApp?.openLink,
          version: (window.Telegram as any)?.WebApp?.version,
        });

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '1123px'; // A4 landscape в пикселях при 96dpi
        container.style.pointerEvents = 'none';
        container.innerHTML = printContent;
        document.body.appendChild(container);

        // Ждём рендер
        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(container, {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          scrollX: 0,
          scrollY: 0,
        });

        document.body.removeChild(container);

        console.log('[handleExportPDF] canvas готов:', canvas.width, canvas.height);

        const { jsPDF } = await import('jspdf');

        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(canvas);
        const scale = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);

        pdf.addImage(
          canvas,
          'JPEG',  // было PNG
          0,
          0,
          imgProps.width * scale,
          imgProps.height * scale,
          undefined,
          'FAST'  // сжатие
        );

        const blob = pdf.output('blob');

        console.log('[handleExportPDF] blob создан:', { size: blob.size, type: blob.type });

        console.log('[handleExportPDF] Вызываем downloadPdfInTelegram...');
        await downloadPdfInTelegram(blob, `ведомость-${orgName}-${selectedMonth}.pdf`);
        console.log('[handleExportPDF] PDF успешно загружен');
      } catch (error) {
        console.error('[handleExportPDF] Ошибка:', error);
        alert('Ошибка при генерации PDF');
      }
    } else {
      // ✅ ПК: Открываем HTML в новой вкладке
      const blob = new Blob([printContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.click();

      URL.revokeObjectURL(url);
    }
  };

  // Генерация СЧЕТА
  const handleGenerateInvoicePDF = async () => {
    console.log('[handleGenerateInvoicePDF] Начало генерации PDF счета');
    if (!selectedOrg || !selectedMonth) {
      alert('Выберите организацию и месяц');
      return;
    }

    if (worksheetData.length === 0) {
      alert('Сначала сгенерируйте ведомость');
      return;
    }

    setLoadingInvoicePDF(true);
    try {
      // Получаем данные исполнителя (company_settings)
      const executor = await getCompanySettings();
      if (!executor) {
        alert('Не найдены юридические данные компании. Настройте их в настройках.');
        return;
      }

      // Получаем данные заказчика (organization)
      const client = organizations.find(o => o.id === selectedOrg);
      if (!client) {
        alert('Не найдена организация');
        return;
      }

      // Получаем следующий номер документа
      const [year, month] = selectedMonth.split('-');
      const invoiceNumber = await allocateDocumentNumber(
        selectedOrg,
        parseInt(month, 10),
        parseInt(year, 10),
        serviceType,
      );

      // Формируем дату документа (последний день выбранного месяца)
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const invoiceDate = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

      // Агрегируем услуги (одна строка на весь период)
      const totalAmount = worksheetData.reduce((sum, entry) => sum + entry.total_amount, 0);

      const monthName = new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long' });

      const services = [{
        number: 1,
        name: `Оплата услуг за ${monthName} ${year} г. по ${serviceType === 'carwash' ? 'автомойке' : 'шиномонтажу'} автомобилей, согласно ведомости учета`,
        quantity: 1,
        unit: 'шт.',
        price: totalAmount,
        total: totalAmount
      }];

      // Генерируем HTML
      const html = generateInvoiceHTML({
        executor,
        client,
        invoiceNumber,
        invoiceDate,
        services,
        totalAmount
      });

      // Проверяем платформу
      if (isTelegramWebApp()) {
        console.log('[handleGenerateInvoicePDF] Telegram WebApp detected, using URL.createObjectURL');
        // ✅ TELEGRAM: Конвертируем HTML → PDF и скачиваем без превью
        const element = document.createElement('div');
        element.innerHTML = html;

        try {
          console.log('[handleGenerateInvoicePDF] Начинаем генерация PDF...');

          console.log('[handleGenerateInvoicePDF] Telegram WebApp methods:', {
            downloadFile: typeof (window.Telegram as any)?.WebApp?.downloadFile,
            shareToChats: typeof (window.Telegram as any)?.WebApp?.shareToChats,
            showAlert: typeof (window.Telegram as any)?.WebApp?.showAlert,
            openLink: typeof (window.Telegram as any)?.WebApp?.openLink,
            version: (window.Telegram as any)?.WebApp?.version,
          });

          const container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.top = '0';
          container.style.width = '794px'; // A4 portrait в пикселях при 96dpi
          container.style.pointerEvents = 'none';
          container.innerHTML = html;
          document.body.appendChild(container);

          // Ждём рендер
          await new Promise(r => setTimeout(r, 100));

          const canvas = await html2canvas(container, {
            scale: 1.5,
            useCORS: true,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0,
          });

          document.body.removeChild(container);

          console.log('[handleGenerateInvoicePDF] canvas готов:', canvas.width, canvas.height);

          const { jsPDF } = await import('jspdf');

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
          });

          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgProps = pdf.getImageProperties(canvas);
          const scale = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);

          pdf.addImage(
            canvas,
            'JPEG',  // было PNG
            0,
            0,
            imgProps.width * scale,
            imgProps.height * scale,
            undefined,
            'FAST'  // сжатие
          );

          const blob = pdf.output('blob');

          console.log('[handleGenerateInvoicePDF] blob создан:', {
            size: blob.size,
            type: blob.type,
          });

          console.log('[handleGenerateInvoicePDF] Вызываем downloadPdfInTelegram...');
          await downloadPdfInTelegram(blob, `счет-${invoiceNumber}-${invoiceDate}.pdf`);
          console.log('[handleGenerateInvoicePDF] PDF успешно загружен');
        } catch (error) {
          console.error('[handleGenerateInvoicePDF] Ошибка:', error);
          alert('Ошибка при генерации PDF');
        }
      } else {
        // ✅ ПК: Открываем HTML в новой вкладке
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.click();

        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('[handleGenerateInvoicePDF] Ошибка:', error);
      alert('Не удалось сгенерировать счет');
    } finally {
      setLoadingInvoicePDF(false);
    }
  };

  // Генерация СЧЕТА в формате Word
  const handleGenerateInvoiceWord = async () => {
    console.log('[handleGenerateInvoiceWord] Начало генерации Word счета');
    if (!selectedOrg || !selectedMonth) {
      alert('Выберите организацию и месяц');
      return;
    }

    if (worksheetData.length === 0) {
      alert('Сначала сгенерируйте ведомость');
      return;
    }

    setLoadingInvoiceWord(true);
    try {
      // Получаем данные исполнителя (company_settings)
      const executor = await getCompanySettings();
      if (!executor) {
        alert('Не найдены юридические данные компании. Настройте их в настройках.');
        return;
      }

      // Получаем данные заказчика (organization)
      const client = organizations.find(o => o.id === selectedOrg);
      if (!client) {
        alert('Не найдена организация');
        return;
      }

      // Получаем следующий номер документа
      const [year, month] = selectedMonth.split('-');
      const invoiceNumber = String(await allocateDocumentNumber(
        selectedOrg,
        parseInt(month, 10),
        parseInt(year, 10),
        serviceType,
      ));

      // Формируем дату документа (последний день выбранного месяца)
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const invoiceDate = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

      // Агрегируем услуги (одна строка на весь период)
      const totalAmount = worksheetData.reduce((sum, entry) => sum + entry.total_amount, 0);

      const monthName = new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long' });

      // Импортируем функцию amountToWords
      const { amountToWords } = await import('../../shared/utils/number-to-words');

      const services = [{
        name: `Оплата услуг за ${monthName} ${year} г. по ${serviceType === 'carwash' ? 'автомойке' : 'шиномонтажу'} автомобилей, согласно ведомости учета`,
        quantity: 1,
        price: totalAmount,
        total: totalAmount
      }];

      // Генерируем Word документ
      await generateInvoiceDocx({
        invoiceNumber,
        invoiceDate,
        organizationName: executor.full_legal_name || '',
        organizationInn: executor.inn || '',
        organizationKpp: executor.kpp || '',
        organizationAddress: executor.legal_address || '',
        organizationBank: executor.bank_name || '',
        organizationBik: executor.bik || '',
        organizationRs: executor.payment_account || '',
        organizationKs: executor.correspondent_account || '',
        customerName: client.name || '',
        customerInn: client.inn || '',
        customerKpp: client.kpp || '',
        customerOgrn: client.ogrn || '',
        customerAddress: client.legal_address || '',
        services,
        totalAmount,
        totalAmountWords: amountToWords(totalAmount),
        directorName: executor.director_name || '',
        accountantName: executor.accountant_name || ''
      });

      console.log('[handleGenerateInvoiceWord] Word счет успешно создан');
    } catch (error) {
      console.error('[handleGenerateInvoiceWord] Ошибка:', error);
      alert('Не удалось сгенерировать счет в формате Word');
    } finally {
      setLoadingInvoiceWord(false);
    }
  };

  // Генерация АКТА
  const handleGenerateActPDF = async () => {
    console.log('[handleGenerateActPDF] Начало генерации PDF акта');
    if (!selectedOrg || !selectedMonth) {
      alert('Выберите организацию и месяц');
      return;
    }

    if (worksheetData.length === 0) {
      alert('Сначала сгенерируйте ведомость');
      return;
    }

    setLoadingActPDF(true);
    try {
      // Получаем данные исполнителя (company_settings)
      const executor = await getCompanySettings();
      if (!executor) {
        alert('Не найдены юридические данные компании. Настройте их в настройках.');
        return;
      }

      // Получаем данные заказчика (organization)
      const client = organizations.find(o => o.id === selectedOrg);
      if (!client) {
        alert('Не найдена организация');
        return;
      }

      // Получаем следующий номер документа
      const [year, month] = selectedMonth.split('-');
      const actNumber = await allocateDocumentNumber(
        selectedOrg,
        parseInt(month, 10),
        parseInt(year, 10),
        serviceType,
      );

      // Формируем дату документа (последний день выбранного месяца)
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const actDate = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

      // Агрегируем услуги (одна строка на весь период)
      const totalAmount = worksheetData.reduce((sum, entry) => sum + entry.total_amount, 0);

      const monthName = new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long' });

      const services = [{
        number: 1,
        name: `Услуги по ${serviceType === 'carwash' ? 'мойке' : 'шиномонтажу'} автомобилей, согласно Ведомости учета за ${monthName} месяц ${year} года`,
        quantity: 1,
        unit: 'шт.',
        price: totalAmount,
        total: totalAmount
      }];

      // Генерируем HTML
      const html = generateActHTML({
        executor,
        client,
        actNumber,
        actDate,
        services,
        totalAmount
      });

      // Проверяем платформу
      if (isTelegramWebApp()) {
        console.log('[handleGenerateActPDF] Telegram WebApp detected, using URL.createObjectURL');
        // ✅ TELEGRAM: Конвертируем HTML → PDF и скачиваем без превью
        const element = document.createElement('div');
        element.innerHTML = html;

        try {
          console.log('[handleGenerateActPDF] Начинаем генерацию PDF...');

          const container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.top = '0';
          container.style.width = '794px'; // A4 portrait в пикселях при 96dpi
          container.style.pointerEvents = 'none';
          container.innerHTML = html;
          document.body.appendChild(container);

          // Ждём рендер
          await new Promise(r => setTimeout(r, 100));

          const canvas = await html2canvas(container, {
            scale: 1.5,
            useCORS: true,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0,
          });

          document.body.removeChild(container);

          console.log('[handleGenerateActPDF] canvas готов:', canvas.width, canvas.height);

          const { jsPDF } = await import('jspdf');

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
          });

          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgProps = pdf.getImageProperties(canvas);
          const scale = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);

          pdf.addImage(
            canvas,
            'JPEG',
            0,
            0,
            imgProps.width * scale,
            imgProps.height * scale,
            undefined,
            'FAST'
          );

          const blob = pdf.output('blob');

          console.log('[handleGenerateActPDF] blob создан:', {
            size: blob.size,
            type: blob.type,
          });

          console.log('[handleGenerateActPDF] Вызываем downloadPdfInTelegram...');
          await downloadPdfInTelegram(blob, `акт-${actNumber}-${actDate}.pdf`);
          console.log('[handleGenerateActPDF] PDF успешно загружен');
        } catch (error) {
          console.error('[handleGenerateActPDF] Ошибка:', error);
          alert('Ошибка при генерации PDF');
        }
      } else {
        // ✅ ПК: Открываем HTML в новой вкладке
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.click();

        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('[handleGenerateActPDF] Ошибка:', error);
      alert('Не удалось сгенерировать акт');
    } finally {
      setLoadingActPDF(false);
    }
  };

  // Генерация АКТА в формате Word
  const handleGenerateActWord = async () => {
    console.log('[handleGenerateActWord] Начало генерации Word акта');
    if (!selectedOrg || !selectedMonth) {
      alert('Выберите организацию и месяц');
      return;
    }

    if (worksheetData.length === 0) {
      alert('Сначала сгенерируйте ведомость');
      return;
    }

    setLoadingActWord(true);
    try {
      // Получаем данные исполнителя (company_settings)
      const executor = await getCompanySettings();
      if (!executor) {
        alert('Не найдены юридические данные компании. Настройте их в настройках.');
        return;
      }

      // Получаем данные заказчика (organization)
      const client = organizations.find(o => o.id === selectedOrg);
      if (!client) {
        alert('Не найдена организация');
        return;
      }

      // Получаем следующий номер документа
      const [year, month] = selectedMonth.split('-');
      const actNumber = String(await allocateDocumentNumber(
        selectedOrg,
        parseInt(month, 10),
        parseInt(year, 10),
        serviceType,
      ));

      // Формируем дату документа (последний день выбранного месяца)
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const actDate = `${String(lastDayOfMonth).padStart(2, '0')}.${month}.${year} г.`;

      // Агрегируем услуги (одна строка на весь период)
      const totalAmount = worksheetData.reduce((sum, entry) => sum + entry.total_amount, 0);

      const monthName = new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long' });

      // Импортируем функцию amountToWords
      const { amountToWords } = await import('../../shared/utils/number-to-words');

      const services = [{
        name: `Услуги по ${serviceType === 'carwash' ? 'мойке' : 'шиномонтажу'} автомобилей, согласно Ведомости учета за ${monthName} месяц ${year} года`,
        quantity: 1,
        price: totalAmount,
        total: totalAmount
      }];

      // Генерируем Word документ
      await generateActDocx({
        actNumber,
        actDate,
        organizationName: executor.full_legal_name || '',
        organizationInn: executor.inn || '',
        organizationOgrn: executor.ogrn || '',
        organizationAddress: executor.legal_address || '',
        organizationBank: executor.bank_name || '',
        organizationBik: executor.bik || '',
        organizationRs: executor.payment_account || '',
        organizationKs: executor.correspondent_account || '',
        organizationPhone: executor.phone || '',
        customerName: client.name || '',
        customerInn: client.inn || '',
        customerKpp: client.kpp || '',
        customerOgrn: client.ogrn || '',
        customerAddress: client.legal_address || '',
        customerBank: client.bank_name || '',
        customerRs: client.payment_account || '',
        customerKs: client.correspondent_account || '',
        customerBik: client.bik || '',
        services,
        totalAmount,
        totalAmountWords: amountToWords(totalAmount),
        directorName: executor.director_name || ''
      });

      console.log('[handleGenerateActWord] Word акт успешно создан');
    } catch (error) {
      console.error('[handleGenerateActWord] Ошибка:', error);
      alert('Не удалось сгенерировать акт в формате Word');
    } finally {
      setLoadingActWord(false);
    }
  };

// ✅ КРАСИВЫЙ ШАБЛОН ДЛЯ PDF ОТЧЕТА
  const generateDailyReportPDF = async (reportData: {
    date: string;
    carwash: { cars: number; cash: number; card: number; transfer: number; total: number };
    tire: { cars: number; cash: number; card: number; transfer: number; total: number };
    expenses: { category: string; amount: number; comment?: string }[];
    salaries: { name: string; role: string; amount: number }[];
    sales: { productName: string; quantity: number; totalPrice: number }[];
    totals: { revenue: number; salesRevenue: number; expenses: number; salaries: number; profit: number };
  }) => {
    console.log('[generateDailyReportPDF] Генерация PDF с новым оформлением', reportData);
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      color: #000000;
      background: #ffffff;
    }
    
    /* Управление разрывами страниц */
    .page-section {
      page-break-inside: avoid;
      break-inside: avoid;
      display: block;
    }
    
    @media print {
      .page-section {
        page-break-inside: avoid;
        break-inside: avoid;
        orphans: 3;
        widows: 3;
      }
      @page {
        size: A4;
        margin: 10mm;
      }
    }
    
    h1 {
      word-spacing: normal;
      letter-spacing: normal;
    }
  </style>
</head>
<body>
  <div style="width: 100%; margin: 0 auto; padding: 20px;">
  
  <!-- ШАПКА -->
  <div class="page-section" style="text-align: center; margin-bottom: 15px;">
    <h1 style="font-size: 24px; font-weight: bold; color: #000000; margin-bottom: 5px;">Итоговый отчет 📊</h1>
    <div style="font-size: 16px; color: #666666; font-weight: 500;">${reportData.date}</div>
  </div>

  <!-- ШИНОМОНТАЖ -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">🔧 ШИНОМОНТАЖ</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 2px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Обслужено машин:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportData.tire.cars}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Хранений резины:</span>
              <span style="font-size: 14px; font-weight: bold;">${(reportData.tire as any).storageCount || 0}</span>
            </div>
            ${(reportData.tire as any).acComplexCount > 0 || (reportData.tire as any).acFreonCount > 0 ? `
            <div style="padding: 4px 0; border-bottom: 1px solid #000000;">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">Кондиционеры:</div>
              ${(reportData.tire as any).acComplexCount > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 12px;">
                <span style="font-size: 12px;">Комплексная заправка</span>
                <span style="font-size: 13px; font-weight: bold;">${(reportData.tire as any).acComplexCount} шт × ${(reportData.tire as any).acComplexPrice.toLocaleString('ru-RU')}₽ = ${(reportData.tire as any).acComplexTotal.toLocaleString('ru-RU')}₽</span>
              </div>
              ` : ''}
              ${(reportData.tire as any).acFreonCount > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 12px;">
                <span style="font-size: 12px;">Доливка фреона</span>
                <span style="font-size: 13px; font-weight: bold;">${(reportData.tire as any).acFreonCount} шт × 300₽ = ${(reportData.tire as any).acFreonTotal.toLocaleString('ru-RU')}₽ (${(reportData.tire as any).acFreonGrams}г)</span>
              </div>
              ` : ''}
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Наличные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportData.tire.cash.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Безналичные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportData.tire.card.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
               <span style="font-size: 13px; font-weight: 600;">Переводы:</span>
               <span style="font-size: 14px; font-weight: bold;">${reportData.tire.transfer.toLocaleString('ru-RU')}₽</span>
             </div>
             <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
               <span style="font-size: 13px; font-weight: 600;">QR-code:</span>
               <span style="font-size: 14px; font-weight: bold;">${(reportData.tire as any).qrCode?.toLocaleString('ru-RU') || 0}₽</span>
             </div>
             <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО:</span>
              <span style="font-size: 16px; font-weight: bold; color: #000000;">${reportData.tire.total.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- АВТОМОЙКА -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">💧 АВТОМОЙКА</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 2px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Помыто машин:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportData.carwash.cars}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Наличные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportData.carwash.cash.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Безналичные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportData.carwash.card.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
               <span style="font-size: 13px; font-weight: 600;">Переводы:</span>
               <span style="font-size: 14px; font-weight: bold;">${reportData.carwash.transfer.toLocaleString('ru-RU')}₽</span>
             </div>
             <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
               <span style="font-size: 13px; font-weight: 600;">QR-code:</span>
               <span style="font-size: 14px; font-weight: bold;">${(reportData.carwash as any).qrCode?.toLocaleString('ru-RU') || 0}₽</span>
             </div>
             <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
               <span style="font-size: 14px; font-weight: bold;">ИТОГО:</span>
               <span style="font-size: 16px; font-weight: bold; color: #000000;">${reportData.carwash.total.toLocaleString('ru-RU')}₽</span>
             </div>
           </div>
         </td>
       </tr>
     </tbody>
   </table>

    <!-- РАСХОДЫ -->
  ${reportData.expenses.length > 0 ? `
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">💸 РАСХОДЫ</div>
            <table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
              <thead>
                <tr>
                  <th style="background: #000000; color: white; padding: 8px; text-align: left; font-size: 14px; font-weight: bold; border-bottom: 2px solid #000000;">Категория</th>
                  <th style="background: #000000; color: white; padding: 8px; text-align: left; font-size: 14px; font-weight: bold; border-bottom: 2px solid #000000;">Комментарий</th>
                  <th style="background: #000000; color: white; padding: 8px; text-align: right; font-size: 14px; font-weight: bold; border-bottom: 2px solid #000000;">Сумма</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.expenses.map(exp => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #000000; font-size: 14px;">${exp.category}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #000000; font-size: 14px;">${exp.comment || '-'}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #000000; font-size: 14px; text-align: right;"><strong style="color: #cc0000; font-weight: bold;">${exp.amount.toLocaleString('ru-RU')}₽</strong></td>
                </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО РАСХОДОВ:</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">${reportData.totals.expenses.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <!-- ЗАРПЛАТЫ -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 3px solid #000000; padding: 12px; background: #faf8f5; border-radius: 12px;">
            <div style="font-size: 18px; font-weight: bold; color: #000000; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">👥 ЗАРПЛАТЫ СОТРУДНИКОВ</div>
            ${reportData.salaries.map(sal => `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 14px; font-weight: 600;">${sal.name} (${sal.role}):</span>
              <span style="font-size: 15px; font-weight: bold; color: #cc0000;">${sal.amount.toLocaleString('ru-RU')}₽</span>
            </div>
            `).join('')}
            <div style="display: flex; justify-content: space-between; padding: 10px; margin-top: 8px; background: #e8e8e8; border: 2px solid #000000; border-radius: 8px;">
              <span style="font-size: 15px; font-weight: bold;">ИТОГО ЗАРПЛАТ:</span>
              <span style="font-size: 18px; font-weight: bold; color: #cc0000;">${reportData.totals.salaries.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

   <!-- ПРОДАЖИ -->
   ${reportData.sales.length > 0 ? `
   <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
     <tbody>
       <tr>
         <td style="padding: 0;">
           <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
             <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">🛒 ПРОДАЖИ ТОВАРОВ</div>
             <table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
               <thead>
                 <tr>
                   <th style="background: #000000; color: white; padding: 8px; text-align: left; font-size: 14px; font-weight: bold; border-bottom: 2px solid #000000;">Товар</th>
                   <th style="background: #000000; color: white; padding: 8px; text-align: center; font-size: 14px; font-weight: bold; border-bottom: 2px solid #000000;">Кол-во</th>
                   <th style="background: #000000; color: white; padding: 8px; text-align: right; font-size: 14px; font-weight: bold; border-bottom: 2px solid #000000;">Сумма</th>
                 </tr>
               </thead>
               <tbody>
                 ${reportData.sales.map(sale => `
                 <tr>
                   <td style="padding: 8px; border-bottom: 1px solid #000000; font-size: 14px;">${sale.productName}</td>
                   <td style="padding: 8px; border-bottom: 1px solid #000000; font-size: 14px; text-align: center;">${sale.quantity}</td>
                   <td style="padding: 8px; border-bottom: 1px solid #000000; font-size: 14px; text-align: right;"><strong style="color: #00aa00; font-weight: bold;">${sale.totalPrice.toLocaleString('ru-RU')}₽</strong></td>
                 </tr>
                 `).join('')}
               </tbody>
             </table>
             <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
               <span style="font-size: 14px; font-weight: bold;">ИТОГО ПРОДАЖ:</span>
               <span style="font-size: 16px; font-weight: bold; color: #00aa00;">${reportData.sales.reduce((sum, s) => sum + s.totalPrice, 0).toLocaleString('ru-RU')}₽</span>
             </div>
           </div>
         </td>
       </tr>
     </tbody>
   </table>
   ` : ''}

   <!-- ИТОГОВЫЙ РЕЗУЛЬТАТ -->
  <table class="page-section" style="width: 100%; margin-top: 15px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 3px solid #000000; padding: 15px; background: #faf8f5; border-radius: 12px;">
            <div style="font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 3px solid #000000;">📊 ИТОГОВЫЙ РЕЗУЛЬТАТ</div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Выручка (+):</span>
              <span style="font-size: 16px; font-weight: bold; color: #00aa00;">${reportData.totals.revenue.toLocaleString('ru-RU')}₽</span>
            </div>
            ${reportData.sales.length > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Продажи товаров (+):</span>
              <span style="font-size: 16px; font-weight: bold; color: #00aa00;">${reportData.totals.salesRevenue.toLocaleString('ru-RU')}₽</span>
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Расходы (-):</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">-${reportData.totals.expenses.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Зарплаты (-):</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">-${reportData.totals.salaries.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; margin-top: 10px; background: #d4edda; border: 3px solid #000000; border-radius: 8px;">
              <span style="font-size: 18px; font-weight: bold; color: #000000;">ЧИСТАЯ ПРИБЫЛЬ:</span>
              <span style="font-size: 22px; font-weight: bold; color: ${reportData.totals.profit >= 0 ? '#00aa00' : '#cc0000'};">
                ${reportData.totals.profit.toLocaleString('ru-RU')}₽
              </span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  </div>
</body>
</html>
    `;

    // Генерация PDF - используем html2pdf.js как в AnalyticsPage
    const opt = {
      margin: 10,
      filename: `Итоговый-отчёт-${reportData.date}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        logging: false,
        letterRendering: true,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait' as const,
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    // Проверяем платформу
    if (isTelegramWebApp()) {
      console.log('[generateDailyReportPDF] Telegram WebApp detected, using html2pdf.js');
      // ✅ TELEGRAM: Используем html2pdf.js для генерации PDF
      // @ts-ignore
      try {
        console.log('[generateDailyReportPDF] Начинаем генерацию PDF...');

        // Генерируем PDF с помощью html2pdf.js - передаем HTML строку напрямую
        const pdfBlob = await html2pdf().set(opt).from(html).output('blob');

        console.log('[generateDailyReportPDF] blob создан:', {
          size: pdfBlob.size,
          type: pdfBlob.type,
        });

        console.log('[generateDailyReportPDF] Вызываем downloadPdfInTelegram...');
        await downloadPdfInTelegram(pdfBlob, `Итоговый-отчёт-${reportData.date}.pdf`);
        console.log('[generateDailyReportPDF] PDF успешно загружен');
      } catch (error) {
        console.error('[generateDailyReportPDF] Ошибка:', error);
        alert('Ошибка при генерации PDF');
      }
    } else {
      // ✅ ПК: Используем html2pdf.js напрямую
      // @ts-ignore
      try {
        console.log('[generateDailyReportPDF] Начинаем генерацию PDF для ПК...');

        // Генерируем PDF с помощью html2pdf.js - передаем HTML строку напрямую
        html2pdf().set(opt).from(html).save();

        console.log('[generateDailyReportPDF] PDF успешно сохранен');
      } catch (error) {
        console.error('[generateDailyReportPDF] Ошибка:', error);
        alert('Ошибка при генерации PDF');
      }
    }
  };

  // Экспорт в PDF (для Итогового отчёта)
  const handleExportReportPDF = () => {
    const dateStr = new Date(selectedDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Данные для шиномонтажа
    const tireCash = reportData.completedTireBookings.filter(b => b.payment_method === 'Наличный').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireCard = reportData.completedTireBookings.filter(b => b.payment_method === 'Безналичный').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireTransfer = reportData.completedTireBookings.filter(b => b.payment_method === 'Перевод').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireSbp = reportData.completedTireBookings.filter(b => b.payment_method === 'СБП').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireVedomost = reportData.completedTireBookings.filter(b => b.payment_method === 'Ведомость').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireYandex = reportData.completedTireBookings.filter(b => b.payment_method === 'Яндекс').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireQrCode = reportData.completedTireBookings.filter(b => b.payment_method === 'QR-code').reduce((sum, b) => sum + (b.total_price || 0), 0);
    const tireTotal = reportData.completedTireBookings.reduce((sum, b) => sum + (b.total_price || 0), 0);
 
    // Данные для автомойки
    const carwashCash = reportData.completedBookings.filter(b => b.payment_method === 'Наличный').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashCard = reportData.completedBookings.filter(b => b.payment_method === 'Безналичный').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashTransfer = reportData.completedBookings.filter(b => b.payment_method === 'Перевод').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashSbp = reportData.completedBookings.filter(b => b.payment_method === 'СБП').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashVedomost = reportData.completedBookings.filter(b => b.payment_method === 'Ведомость').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashYandex = reportData.completedBookings.filter(b => b.payment_method === 'Яндекс').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashQrCode = reportData.completedBookings.filter(b => b.payment_method === 'QR-code').reduce((sum, b) => sum + (b.price || 0), 0);
    const carwashTotal = reportData.completedBookings.reduce((sum, b) => sum + (b.price || 0), 0);

    // Данные расходов
    const expensesData = expenses.map(exp => {
      const category = expenseCategories.find(c => c.id === exp.category);
      return {
        category: category?.label || exp.category,
        amount: exp.amount,
        comment: exp.comment
      };
    });

    // Данные зарплат
    const salariesData = [
      ...salaries.workersSalaries.map(w => ({ name: w.name, role: 'Мойщик', amount: w.paidToday })),
      ...salaries.techniciansSalaries.map(t => ({ name: t.name, role: 'Шиномонтаж', amount: t.paidToday })),
      ...salaries.adminsSalaries.map(a => ({ name: a.name, role: 'Администратор', amount: a.paidToday })),
    ];

    // Данные продаж
    const salesData = reportData.productSales.map(s => ({
      productName: s.product_name,
      quantity: s.quantity,
      totalPrice: s.total_price,
    }));

    // Считаем хранения резины для PDF
    const tireStorageCount = reportData.completedTireBookings.filter((b: any) =>
      b.services?.some((s: any) =>
        s.name === 'Хранение резины' || s.name === 'Сезонное хранение резины'
      )
    ).length || 0;

    // Считаем детализацию кондиционеров для PDF
    const acComplexServices = reportData.completedTireBookings.flatMap((b: any) =>
      (b.services || []).filter((s: any) =>
        s.name?.toLowerCase().includes('комплексная заправка')
      )
    );
    const acComplexCount = acComplexServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
    const acComplexTotal = acComplexServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
    const acComplexPrice = acComplexCount > 0 ? Math.round(acComplexTotal / acComplexCount) : 2400;

    const acFreonServices = reportData.completedTireBookings.flatMap((b: any) =>
      (b.services || []).filter((s: any) =>
        s.name?.toLowerCase().includes('доливка фреона')
      )
    );
    const acFreonCount = acFreonServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
    const acFreonTotal = acFreonServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
    const acFreonGrams = acFreonCount * 50;

    // Считаем "ПРОЧЕЕ" для PDF
    const otherServices = reportData.completedTireBookings.flatMap((b: any) =>
      (b.services || []).filter((s: any) => s.name === 'ПРОЧЕЕ')
    );
    const otherServiceCount = otherServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
    const otherServiceTotal = otherServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
    const otherServiceComments = otherServices.filter((s: any) => s.comment).map((s: any) => `${s.comment} (${s.total || s.price * (s.quantity || 1)}₽)`);

    const reportDataForPDF = {
      date: dateStr,
      tire: {
        cars: reportData.completedTireBookings.length,
        storageCount: tireStorageCount,
        acComplexCount,
        acComplexTotal,
        acComplexPrice,
        acFreonCount,
        acFreonTotal,
        acFreonGrams,
        otherServiceCount,
        otherServiceTotal,
        otherServiceComments,
        cash: tireCash,
        card: tireCard,
        transfer: tireTransfer,
        vedomost: tireVedomost,
        yandex: tireYandex,
        qrCode: tireQrCode,
        total: tireTotal
      },
      carwash: {
        cars: reportData.completedBookings.length,
        cash: carwashCash,
        card: carwashCard,
        transfer: carwashTransfer,
        vedomost: carwashVedomost,
        yandex: carwashYandex,
        qrCode: carwashQrCode,
        total: carwashTotal
      },
      expenses: expensesData,
      salaries: salariesData,
      sales: salesData,
      totals: {
        revenue: totalRevenue,
        salesRevenue: totalSalesRevenue,
        expenses: totalExpenses,
        salaries: totalSalaryExpenses,
        profit: netProfit
      }
    };

    generateDailyReportPDF(reportDataForPDF);
  };

  return (
    <div className="space-y-6 pt-6 pb-20 pt-safe telegram-safe-area-top animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">Сводка</h1>
          <div className="w-32 h-px bg-gray-300 mt-1"></div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">
            {new Date(selectedDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Разделитель */}
      <div className="h-px bg-gray-200 w-full mb-4"></div>

      {/* Аккордеон */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        
        {/* 2️⃣ РАСХОДЫ */}
        <div className="border-b border-gray-200 last:border-b-0">
          <div
            onClick={() => setOpenSection(openSection === 'expenses' ? null : 'expenses')}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-orange-600" />
              <span className="font-semibold text-gray-900">Расходы</span>
            </div>
            <div className="text-gray-400">
              {openSection === 'expenses' ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openSection === 'expenses' && (
            <div className="px-4 pb-4 bg-gray-50">
              <div className="border-t border-gray-200 pt-4">
                <div className="space-y-4">
                  
                {/* 1️⃣ Добавить расход */}
                <div ref={addExpenseRef} className="border border-gray-200 rounded-lg bg-white">
                  <div
                    onClick={() => setOpenExpenseSection(openExpenseSection === 'add' ? null : 'add')}
                    onPointerDown={(e) => e.preventDefault()}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none rounded-lg"
                    role="button"
                    tabIndex={0}
                  >
                      <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-orange-600" />
                        <span className="font-semibold text-gray-900">
                          {editingExpense ? 'Редактировать расход' : 'Добавить расход'}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        {openExpenseSection === 'add' ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>

                    {openExpenseSection === 'add' && (
                      <>
                        <div className="border-t border-gray-200"></div>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="px-4 py-6"
                        >
                        <div className="space-y-4">
                          {/* Кнопки выбора категории */}
                          <div className="grid grid-cols-2 gap-2">
                            {expenseCategories.map((category) => (
                              <Button
                                key={category.id}
                                type="button"
                                variant={selectedCategory === category.id ? "default" : "outline"}
                                onClick={() => setSelectedCategory(category.id)}
                                className="justify-center gap-2 h-12 text-center"
                              >
                                {category.icon}
                                <span className="text-sm">{category.label}</span>
                              </Button>
                            ))}
                          </div>

                          {/* Поле комментария для категорий "Коммуналка", "Ремонт" и "Прочее" */}
                          {(selectedCategory === 'utilities' || selectedCategory === 'repair' || selectedCategory === 'other') && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.2 }}
                            >
                              <Input
                                placeholder={selectedCategory === 'utilities' ? 'Комментарий ' :
                                          selectedCategory === 'repair' ? 'Комментарий ' :
                                          'Комментарий'}
                                value={expenseComment}
                                onChange={(e) => setExpenseComment(e.target.value)}
                              />
                            </motion.div>
                          )}

                          {/* Поле ввода суммы */}
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              placeholder="Введите сумму"
                              value={expenseAmount}
                              onChange={(e) => setExpenseAmount(e.target.value)}
                              className="flex-1"
                            />
                            <span className="text-sm text-gray-500 font-medium">₽</span>
                          </div>

                          {/* Загрузка чека */}
                          <div className="flex items-center gap-2">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".jpg,.jpeg,.png,.pdf,.heic"
                              className="hidden"
                              onChange={(e) => setExpenseCheckFile(e.target.files?.[0] || null)}
                            />
                            <Button
                              type="button"
                              variant={expenseCheckFile ? "default" : "outline"}
                              className="w-full justify-center gap-2"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Download className="w-4 h-4" />
                              {expenseCheckFile ? expenseCheckFile.name : 'Загрузить чек'}
                            </Button>
                          </div>

                          {/* Кнопки сохранения/отмены */}
                          <div className="flex gap-2">
                            {editingExpense && (
                              <Button
                                onClick={handleCancelEdit}
                                variant="outline"
                                className="flex-1"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Отмена
                              </Button>
                            )}
                            <Button
                              onClick={handleSaveExpense}
                              className="flex-1"
                              disabled={!selectedCategory || !expenseAmount || loadingExpenses || savingExpense}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {savingExpense ? 'Сохранение...' : (editingExpense ? 'Сохранить' : 'Добавить')}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    </>
                    )}
                  </div>

                  {/* 3️⃣ Расходы на сегодня */}
                  <div ref={todayExpenseRef} className="border border-gray-200 rounded-lg bg-white">
                    <div
                      onClick={() => setOpenExpenseSection(openExpenseSection === 'today' ? null : 'today')}
                      onPointerDown={(e) => e.preventDefault()}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none rounded-lg"
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-3">
                        <Wallet className="w-5 h-5 text-orange-600" />
                        <span className="font-semibold text-gray-900">
                          Расходы на {new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        {openExpenseSection === 'today' ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>

                    {openExpenseSection === 'today' && (
                      <>
                        <div className="border-t border-gray-200"></div>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="px-4 py-6"
                        >
                        {loadingExpenses ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                          </div>
                        ) : expenses.length === 0 ? (
                          <div className="text-center py-8">
                            <div className="text-gray-500 font-medium">
                              На сегодня расходов нет
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Список расходов */}
                            <div className="space-y-3 mb-4">
                                {expenses.map((expense) => {
                                  const category = expenseCategories.find(c => c.id === expense.category);
                                  if (!category) return null;
                                  
                                  const createdAt = new Date(expense.created_at);
                                  const timeStr = createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                                  const dateStr = createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                  const isEditing = inlineEditingExpense === expense.id;
                                  
                                  return (
                                    <div key={expense.id} className="border-b border-gray-100 last:border-b-0 pb-3 last:pb-0">
                                      {isEditing ? (
                                        // Inline форма редактирования
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-gray-100 rounded-full">
                                              {React.cloneElement(category.icon as React.ReactElement, { className: "w-3.5 h-3.5 text-gray-600" })}
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900">{category.label}</span>
                                          </div>
                                          {(expense.category === 'utilities' || expense.category === 'repair' || expense.category === 'other') && (
                                            <Input
                                              placeholder="Комментарий"
                                              value={inlineEditComment}
                                              onChange={(e) => setInlineEditComment(e.target.value)}
                                              className="text-sm ml-7 w-full sm:w-auto"
                                            />
                                          )}
                                          <div className="flex items-center gap-2 ml-7">
                                            <Input
                                              type="number"
                                              placeholder="Сумма"
                                              value={inlineEditAmount}
                                              onChange={(e) => setInlineEditAmount(e.target.value)}
                                              className="flex-1 text-sm"
                                            />
                                            <span className="text-sm text-gray-500">₽</span>
                                          </div>
                                          {/* Загрузка нового чека */}
                                          <div className="flex items-center gap-2 ml-7">
                                            <input
                                              ref={fileInputRef}
                                              type="file"
                                              accept=".jpg,.jpeg,.png,.pdf,.heic"
                                              className="hidden"
                                              onChange={(e) => setInlineEditReceiptFile(e.target.files?.[0] || null)}
                                            />
                                            <Button
                                              type="button"
                                              variant={inlineEditReceiptFile ? "default" : "outline"}
                                              className="flex-1 justify-center gap-2"
                                              onClick={() => fileInputRef.current?.click()}
                                            >
                                              <Download className="w-3 h-3" />
                                              {inlineEditReceiptFile ? inlineEditReceiptFile.name : 'Заменить чек'}
                                            </Button>
                                          </div>
                                          <div className="flex gap-2 ml-7">
                                            <Button
                                              size="sm"
                                              onClick={() => handleSaveInlineEdit(expense.id)}
                                              className="flex-1"
                                            >
                                              <Save className="w-3 h-3 mr-1" />
                                              Сохранить
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={handleCancelInlineEdit}
                                              className="flex-1"
                                            >
                                              <X className="w-3 h-3 mr-1" />
                                              Отмена
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        // Отображение расхода
                                        <div className="flex justify-between items-center gap-2">
                                          <div className="flex-1">
                                            {/* Строка 1: Значок + Категория • Сумма */}
                                            <div className="flex items-center gap-2 mb-1">
                                              <div className="p-1.5 bg-gray-100 rounded-full">
                                                {React.cloneElement(category.icon as React.ReactElement, { className: "w-3.5 h-3.5 text-gray-600" })}
                                              </div>
                                              <span className="text-sm font-semibold text-gray-900">{category.label}</span>
                                              <span className="font-bold text-gray-900">{formatMoney(expense.amount)}₽</span>
                                            </div>
                                            {expense.comment && (
                                              <div className="text-xs text-gray-500 ml-7 mb-1 flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" />
                                                {expense.comment}
                                              </div>
                                            )}
                                            {/* Строка 2: Дата и время */}
                                            <div className="text-xs text-gray-400 ml-7 flex items-center gap-2 mb-1">
                                              <CalendarIcon className="w-3 h-3" />
                                              <span>{dateStr}</span>
                                              <span>•</span>
                                              <span>{timeStr}</span>
                                            </div>
                                            {/* Строка 3: Имя создателя или редактора */}
                                            <div className="text-xs text-gray-400 ml-7 flex items-center gap-1">
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
                                              <div className="ml-7 mt-2 sm:hidden">
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
                                            {userRole === 'owner' || expense.created_by === userId ? (
                                              <>
                                                <div className="flex gap-1">
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleStartInlineEdit(expense)}
                                                    className="h-8 w-8 p-0"
                                                  >
                                                    <Pen className="w-4 h-4" />
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleDeleteExpense(expense.id)}
                                                    className="h-8 w-8 p-0 text-red-600"
                                                  >
                                                    <Trash2 className="w-4 h-4" />
                                                  </Button>
                                                </div>
                                                <div className="w-full h-px bg-gray-200 mt-1 mb-2"></div>
                                              </>
                                            ) : null}
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
                                          {/* Кнопки редактирования и удаления для мобильных */}
                                          <div className="flex sm:hidden flex-col items-center gap-0">
                                            {userRole === 'owner' || expense.created_by === userId ? (
                                              <>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => handleStartInlineEdit(expense)}
                                                  className="h-8 w-8 p-0"
                                                >
                                                  <Pen className="w-4 h-4" />
                                                </Button>
                                                <div className="w-full h-px bg-gray-200 my-1"></div>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => handleDeleteExpense(expense.id)}
                                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                </Button>
                                              </>
                                            ) : null}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>

                            <div className="border-t border-gray-200 mt-4 mb-4"></div>

                            {/* Итого расходов */}
                            <div className="bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-3 sm:p-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <Wallet className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" />
                                  <span className="text-sm sm:text-lg font-semibold text-gray-900">ИТОГО РАСХОДОВ:</span>
                                </div>
                                <span className="text-base sm:text-2xl font-bold text-orange-600">{formatMoney(totalExpenses)}₽</span>
                              </div>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3️⃣ ПРОДАЖИ */}
        <div className="border-b border-gray-200 last:border-b-0">
          <div
            onClick={() => setOpenSection(openSection === 'sales' ? null : 'sales')}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">Продажи</span>
            </div>
            <div className="text-gray-400">
              {openSection === 'sales' ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openSection === 'sales' && (
            <div className="px-4 pb-4 bg-gray-50">
              <div className="border-t border-gray-200 pt-4">
                <ProductSalesForm userId={userId} selectedDate={selectedDate} onSalesChange={handleSalesChange} />
              </div>
            </div>
          )}
        </div>

        {/* 4️⃣ ИТОГОВЫЙ ОТЧЁТ */}
        <div className="border-b border-gray-200 last:border-b-0">
          <div
            onClick={() => setOpenSection(openSection === 'report' ? null : 'report')}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-gray-900">Итоговый отчёт</span>
            </div>
            <div className="text-gray-400">
              {openSection === 'report' ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openSection === 'report' && (
            <div className="px-4 pb-4 bg-gray-50">
              <div className="border-t border-gray-200 pt-4">
                <div className="space-y-6">

                  {/* Состояние загрузки */}
                  {loadingReport && (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                  )}

                  {/* Ошибка загрузки */}
                  {reportError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                      {reportError}
                    </div>
                  )}

                  {/* Данные загружены */}
                  {!loadingReport && !reportError && (
                    <>
                  {/* ШИНОМОНТАЖ */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-white border-2 border-gray-300 shadow-md">
                      <CardHeader className="py-5">
                        <CardTitle className="text-lg flex items-center justify-center gap-2">
                          <LifeBuoy className="w-6 h-6 text-slate-600" />
                          Шиномонтаж
                        </CardTitle>
                        <Separator />
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Обслужено машин</span>
                            <span className="font-semibold text-slate-800">{reportData.completedTireBookings.length}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Хранений резины</span>
                            <span className="font-semibold text-slate-800">{
                              reportData.completedTireBookings.filter((b: any) =>
                                b.services?.some((s: any) =>
                                  s.name === 'Хранение резины' || s.name === 'Сезонное хранение резины'
                                )
                              ).length || 0
                            }</span>
                          </div>
                          {(() => {
                            const acServices = reportData.completedTireBookings.flatMap((b: any) =>
                              (b.services || []).filter((s: any) =>
                                s.name?.toLowerCase().includes('комплексная заправка')
                              )
                            );
                            const complexCount = acServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
                            const complexTotal = acServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
                            const complexPrice = complexCount > 0 ? Math.round(complexTotal / complexCount) : 2400;

                            const freonServices = reportData.completedTireBookings.flatMap((b: any) =>
                              (b.services || []).filter((s: any) =>
                                s.name?.toLowerCase().includes('доливка фреона')
                              )
                            );
                            const freonCount = freonServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
                            const freonTotal = freonServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
                            const freonGrams = freonCount * 50;

                            const hasAC = complexCount > 0 || freonCount > 0;
                            if (!hasAC) return null;
                            return (
                              <div className="py-2 border-b border-slate-100 space-y-1">
                                <span className="text-sm font-semibold text-slate-600">Кондиционеры:</span>
                                {complexCount > 0 && (
                                  <div className="flex justify-between items-center pl-3">
                                    <span className="text-xs text-slate-500">Комплексная заправка</span>
                                    <span className="text-sm font-semibold text-slate-800">
                                      {complexCount} шт × {formatMoney(complexPrice)}₽ = {formatMoney(complexTotal)}₽
                                    </span>
                                  </div>
                                )}
                                {freonCount > 0 && (
                                  <div className="flex justify-between items-center pl-3">
                                    <span className="text-xs text-slate-500">Доливка фреона</span>
                                    <span className="text-sm font-semibold text-slate-800">
                                      {freonCount} шт × 300₽ = {formatMoney(freonTotal)}₽ ({freonGrams}г)
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Наличные</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'Наличный').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Безналичные</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'Безналичный').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Переводы</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'Перевод').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">СБП</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'СБП').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Ведомость</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'Ведомость').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Яндекс</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'Яндекс').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">QR-code</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedTireBookings.filter(b => b.payment_method === 'QR-code').reduce((sum, b) => sum + (b.total_price || 0), 0))}₽
                            </span>
                          </div>
                           <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3 mt-2">
                            <span className="font-semibold text-slate-700">ИТОГО:</span>
                            <span className="text-xl font-bold text-slate-800">{formatMoney(reportData.completedTireBookings.reduce((sum, b) => sum + (b.total_price || 0), 0))}₽</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                   {/* АВТОМОЙКА */}
                   <motion.div
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.3, delay: 0.1 }}
                   >
                    <Card className="bg-white border-2 border-gray-300 shadow-md">
                      <CardHeader className="py-5">
                        <CardTitle className="text-lg flex items-center justify-center gap-2">
                          <CarFront className="w-6 h-6 text-slate-600" />
                          Автомойка
                        </CardTitle>
                        <Separator />
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Помыто машин</span>
                            <span className="font-semibold text-slate-800">{reportData.completedBookings.length}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Наличные</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'Наличный').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Безналичные</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'Безналичный').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Переводы</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'Перевод').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">СБП</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'СБП').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Ведомость</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'Ведомость').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">Яндекс</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'Яндекс').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm font-semibold text-slate-600">QR-code</span>
                            <span className="font-semibold text-slate-800">
                              {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'QR-code').reduce((sum, b) => sum + (b.price || 0), 0))}₽
                            </span>
                          </div>
                           <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3 mt-2">
                             <span className="font-semibold text-slate-700">ИТОГО:</span>
                             <span className="text-xl font-bold text-slate-800">{formatMoney(reportData.completedBookings.reduce((sum, b) => sum + (b.price || 0), 0))}₽</span>
                           </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* РАСХОДЫ */}
                  {expenses.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                    >
                      <Card className="bg-white border-2 border-gray-300 shadow-md">
                        <CardHeader className="py-5">
                          <CardTitle className="text-lg flex items-center justify-center gap-2">
                            <Wallet className="w-6 h-6 text-slate-600" />
                            Расходы
                          </CardTitle>
                          <Separator />
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {expenseCategories.map((category) => {
                              const categoryExpenses = expenses.filter(e => e.category === category.id);
                              const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
                              
                              if (categoryTotal === 0) return null;
                              
                              // Для категорий с комментариями показываем детализацию
                              const hasComments = category.id === 'utilities' || category.id === 'repair' || category.id === 'other';
                              
                              return (
                                <div key={category.id} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                                  <div className="flex justify-between items-center py-2">
                                    <div className="flex items-center gap-2">
                                      <div className="p-1.5 bg-slate-100 rounded-full">
                                        {React.cloneElement(category.icon as React.ReactElement, { className: "w-3.5 h-3.5 text-slate-600" })}
                                      </div>
                                      <span className="text-sm font-semibold text-slate-700">{category.label}</span>
                                    </div>
                                    <span className="font-semibold text-slate-800">{formatMoney(categoryTotal)}₽</span>
                                  </div>
                                  
                                  {/* Детализация расходов с комментариями */}
                                  {hasComments && categoryExpenses.length > 0 && (
                                    <div className="ml-8 mt-2 space-y-1">
                                      {categoryExpenses.map((expense) => (
                                        <div key={expense.id} className="text-xs font-semibold text-slate-500">
                                          {expense.comment || 'Без комментария'}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3 mt-2">
                              <span className="font-semibold text-slate-700">ИТОГО РАСХОДОВ:</span>
                              <span className="text-xl font-bold text-slate-800">{formatMoney(totalExpenses)}₽</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {/* ЗАРПЛАТЫ СОТРУДНИКОВ */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                  >
                    <Card className="bg-white border-2 border-gray-300 shadow-md">
                      <CardHeader className="py-5">
                        <CardTitle className="text-lg flex items-center justify-center gap-2">
                          <Users className="w-6 h-6 text-slate-600" />
                          Зарплаты сотрудников
                        </CardTitle>
                        <Separator />
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {salaries.workersSalaries.map((worker) => (
                            <div key={worker.name} className="flex justify-between items-center py-2 border-b border-slate-100">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarFallback className="bg-slate-200 text-slate-600 text-sm">
                                    {worker.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-sm text-slate-800">{worker.name}</div>
                                  <div className="text-xs font-semibold text-slate-500">Мойщик</div>
                                </div>
                              </div>
                              <span className="font-semibold text-slate-800">{formatMoney(worker.paidToday)}₽</span>
                            </div>
                          ))}
                          {salaries.techniciansSalaries.map((tech) => (
                            <div key={tech.name} className="flex justify-between items-center py-2 border-b border-slate-100">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarFallback className="bg-slate-200 text-slate-600 text-sm">
                                    {tech.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-sm text-slate-800">{tech.name}</div>
                                  <div className="text-xs font-semibold text-slate-500">Шиномонтаж</div>
                                </div>
                              </div>
                              <span className="font-semibold text-slate-800">{formatMoney(tech.paidToday)}₽</span>
                            </div>
                          ))}
                          {salaries.adminsSalaries.map((admin) => (
                            <div key={admin.name} className="flex justify-between items-center py-2 border-b border-slate-100">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarFallback className="bg-slate-200 text-slate-600 text-sm">
                                    {admin.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-sm text-slate-800">{admin.name}</div>
                                  <div className="text-xs font-semibold text-slate-500">Администратор</div>
                                </div>
                              </div>
                              <span className="font-semibold text-slate-800">{formatMoney(admin.paidToday)}₽</span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3 mt-2">
                            <span className="font-semibold text-slate-700">ИТОГО ЗАРПЛАТ:</span>
                            <span className="text-xl font-bold text-slate-800">{formatMoney(totalSalaryExpenses)}₽</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                   </motion.div>

                  {/* ПРОДАЖИ */}
                  {reportData.productSales.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.35 }}
                    >
                      <Card className="bg-white border-2 border-gray-300 shadow-md">
                        <CardHeader className="py-5">
                          <CardTitle className="text-lg flex items-center justify-center gap-2">
                            <ShoppingCart className="w-6 h-6 text-blue-600" />
                            Продажи товаров
                          </CardTitle>
                          <Separator />
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {reportData.productSales.map((sale) => (
                              <div key={sale.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                                <div className="flex-1">
                                  <div className="font-semibold text-sm text-slate-800">{sale.product_name}</div>
                                  <div className="text-xs text-slate-500">
                                    {sale.quantity} × {formatMoney(sale.price_per_unit)}₽
                                  </div>
                                </div>
                                <span className="font-semibold text-slate-800">{formatMoney(sale.total_price)}₽</span>
                              </div>
                            ))}
                            <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3 mt-2">
                              <span className="font-semibold text-slate-700">ИТОГО ПРОДАЖ:</span>
                              <span className="text-xl font-bold text-slate-800">{formatMoney(totalSalesRevenue)}₽</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {/* ИТОГО */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    <Card className="bg-slate-50 border-2 border-slate-300 shadow-md">
                      <CardHeader className="py-5">
                        <CardTitle className="text-lg flex items-center justify-center gap-2">
                          <FileText className="w-6 h-6 text-slate-600" />
                          Итоговый результат
                        </CardTitle>
                        <Separator />
                      </CardHeader>
                       <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-slate-200">
                            <span className="text-sm font-semibold text-slate-600">Выручка (+)</span>
                            <span className="font-semibold text-emerald-700">{formatMoney(totalRevenue)}₽</span>
                          </div>
                          {reportData.productSales.length > 0 && (
                            <div className="flex justify-between items-center py-2 border-b border-slate-200">
                              <span className="text-sm font-semibold text-slate-600">Продажи товаров (+)</span>
                              <span className="font-semibold text-emerald-700">{formatMoney(totalSalesRevenue)}₽</span>
                            </div>
                          )}
                          {expenses.length > 0 && (
                            <div className="flex justify-between items-center py-2 border-b border-slate-200">
                              <span className="text-sm font-semibold text-slate-600">Расходы (-)</span>
                              <span className="font-semibold text-rose-700">-{formatMoney(totalExpenses)}₽</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center py-2 border-b border-slate-200">
                            <span className="text-sm font-semibold text-slate-600">Зарплаты (-)</span>
                            <span className="font-semibold text-rose-700">-{formatMoney(totalSalaryExpenses)}₽</span>
                          </div>
                          <Separator className="bg-slate-300 my-3" />
                          <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3">
                            <span className="text-lg font-bold text-slate-800">Чистая прибыль:</span>
                            <span className={cn(
                              "text-2xl font-bold",
                              netProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                            )}>
                              {formatMoney(netProfit)}₽
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                   {/* Экспорт */}
                   <div className="flex gap-2">
                     <Button variant="outline" className="flex-1 gap-2" onClick={handleExportReportPDF}>
                       <Download className="w-4 h-4" />
                       Экспорт PDF
                     </Button>
                   </div>
                   </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 5️⃣ ВЕДОМОСТИ */}
        <div className="border-b border-gray-200 last:border-b-0">
          <div
            onClick={() => setOpenSection(openSection === 'worksheets' ? null : 'worksheets')}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-gray-900">Ведомости</span>
            </div>
            <div className="text-gray-400">
              {openSection === 'worksheets' ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openSection === 'worksheets' && (
            <div className="px-4 pb-4 bg-gray-50">
              <div className="border-t border-gray-200 pt-4">
                <div className="space-y-6">
                  
                  {/* Выбор организации */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-white border border-gray-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Users className="w-5 h-5 text-purple-600" />
                          Выбор организации
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-2">
                          {organizations.map((org) => (
                            <Button
                              key={org.id}
                              type="button"
                              variant={selectedOrg === org.id ? "default" : "outline"}
                              onClick={() => setSelectedOrg(org.id)}
                              className="justify-center h-auto py-2 px-3 min-h-[40px]"
                            >
                              <span className="text-xs sm:text-sm text-center whitespace-normal break-words leading-tight">
                                {org.name}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Выбор типа услуги и месяца */}
                  {selectedOrg && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    >
                      <Card className="bg-white border border-gray-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Target className="w-5 h-5 text-purple-600" />
                            Параметры ведомости
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {/* Тип услуги */}
                            <div>
                              <label className="text-sm font-semibold text-gray-700 mb-2 block">Тип услуги</label>
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant={serviceType === 'carwash' ? "default" : "outline"}
                                  onClick={() => setServiceType('carwash')}
                                  className="gap-2"
                                >
                                  <CarFront className="w-4 h-4" />
                                  Автомойка
                                </Button>
                                <Button
                                  type="button"
                                  variant={serviceType === 'tire' ? "default" : "outline"}
                                  onClick={() => setServiceType('tire')}
                                  className="gap-2"
                                >
                                  <LifeBuoy className="w-4 h-4" />
                                  Шиномонтаж
                                </Button>
                              </div>
                            </div>

                            {/* Месяц */}
                            <div>
                              <label className="text-sm font-semibold text-gray-700 mb-2 block">Месяц</label>
                              {isDesktopTelegram ? (
                                <MonthPicker
                                  value={selectedMonth}
                                  onChange={setSelectedMonth}
                                />
                              ) : (
                                <Input
                                  type="month"
                                  value={selectedMonth}
                                  onChange={(e) => setSelectedMonth(e.target.value)}
                                  className="w-full"
                                />
                              )}
                            </div>

                             {/* Кнопки генерации */}
                             <div className="space-y-2">
                               <Button
                                 onClick={handleGenerateWorksheet}
                                 disabled={loadingWorksheet}
                                 className="w-full"
                               >
                                 {loadingWorksheet ? (
                                   <>
                                     <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                     Загрузка...
                                   </>
                                 ) : (
                                   <>
                                     <CheckCircle className="w-4 h-4 mr-2" />
                                     Сгенерировать ведомость
                                   </>
                                 )}
                               </Button>
                                
                                <Button
                                  variant="default"
                                  className="w-full gap-2"
                                  onClick={handleGenerateInvoicePDF}
                                  disabled={loadingInvoicePDF}
                                >
                                  {loadingInvoicePDF ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Загрузка...
                                    </>
                                  ) : (
                                    <>
                                      <FileText className="w-4 h-4" />
                                      Сгенерировать счет (PDF)
                                    </>
                                  )}
                                </Button>
                                
                                <Button
                                  variant="default"
                                  className="w-full gap-2"
                                  onClick={handleGenerateActPDF}
                                  disabled={loadingActPDF}
                                >
                                  {loadingActPDF ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Загрузка...
                                    </>
                                  ) : (
                                    <>
                                      <ClipboardList className="w-4 h-4" />
                                      Сгенерировать акт (PDF)
                                    </>
                                  )}
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  className="w-full gap-2"
                                  onClick={handleGenerateInvoiceWord}
                                  disabled={loadingInvoiceWord}
                                >
                                  {loadingInvoiceWord ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                                      Загрузка...
                                    </>
                                  ) : (
                                    <>
                                      <FileText className="w-4 h-4" />
                                      Сгенерировать счет (Word)
                                    </>
                                  )}
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  className="w-full gap-2"
                                  onClick={handleGenerateActWord}
                                  disabled={loadingActWord}
                                >
                                  {loadingActWord ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                                      Загрузка...
                                    </>
                                  ) : (
                                    <>
                                      <ClipboardList className="w-4 h-4" />
                                      Сгенерировать акт (Word)
                                    </>
                                  )}
                                </Button>
                             </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {/* Таблица ведомости */}
                  {worksheetData.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                    >
                      <Card className="bg-white border border-gray-200 overflow-hidden">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="w-5 h-5 text-purple-600" />
                            Ведомость за {new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">№</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">Дата</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">Марка авто</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">Гос.номер</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">Перечень работ</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Стоимость</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">ФИО водителя</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-700 border-b">Подпись</th>
                                </tr>
                              </thead>
                              <tbody>
                                {worksheetData.map((entry, index) => (
                                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-600">{index + 1}</td>
                                    <td className="px-3 py-2 text-gray-600">
                                      {new Date(entry.service_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{entry.car_model || '-'}</td>
                                    <td className="px-3 py-2 text-gray-600">{entry.plate_number || '-'}</td>
                                    <td className="px-3 py-2 text-gray-600 max-w-xs truncate" title={formatServices(entry.services_provided)}>
                                      {formatServices(entry.services_provided)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatMoney(entry.total_amount)}₽</td>
                                    <td className="px-3 py-2 text-gray-600">{entry.driver_name}</td>
                                    <td className="px-3 py-2 text-center">
                                      {entry.signature_data ? (
                                        <img
                                          src={entry.signature_data}
                                          alt="Подпись"
                                          className="h-8 mx-auto"
                                        />
                                      ) : (
                                        <span className="text-gray-400 text-xs">Нет подписи</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-50">
                                <tr>
                                  <td colSpan={5} className="px-3 py-2 text-right font-semibold text-gray-700">
                                    ИТОГО:
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-purple-600">
                                    {formatMoney(worksheetData.reduce((sum, e) => sum + e.total_amount, 0))}₽
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                   )}
                  
                  {/* Кнопка экспорта PDF ведомости */}
                  {worksheetData.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      <Button variant="outline" className="w-full gap-2" onClick={handleExportPDF}>
                        <Download className="w-4 h-4" />
                        Экспорт PDF (ведомость)
                      </Button>
                    </motion.div>
                  )}
 
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

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
            <div className="p-4 overflow-auto">
              <img
                src={viewingReceipt.url}
                alt={viewingReceipt.fileName}
                className="max-w-full h-auto rounded"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
