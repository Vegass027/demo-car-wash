import { supabase } from '../supabase';
import type {
  ReportHistory,
  CarwashReport,
  TireReport,
  PaymentsReport,
  ExpensesReport,
  ChemistryExpensesReport,
  ChemistryExpenseDetail,
  SalesReport,
  SalesDetail,
  SalariesReport,
  TotalsReport,
  DailyReport
} from '../../entities/report/model';

// Экспортируем типы для использования в компонентах
export type {
  ReportHistory,
  CarwashReport,
  TireReport,
  PaymentsReport,
  ExpensesReport,
  SalariesReport,
  TotalsReport,
  DailyReport
};

/**
 * Получить агрегированный отчёт за период
 * @param startDate - Начальная дата периода (YYYY-MM-DD)
 * @param endDate - Конечная дата периода (YYYY-MM-DD)
 * @param userId - ID текущего пользователя
 * @param role - Роль пользователя ('admin' или 'owner')
 * @returns Агрегированный отчёт за период
 */
export async function getReportHistory(
  startDate: string,
  endDate: string,
  userId: string,
  role: 'admin' | 'owner'
): Promise<ReportHistory> {
  console.log('[getReportHistory] Загрузка агрегированного отчёта:', { startDate, endDate, userId, role });

  try {
    // Проверяем, является ли период "прошлым" (все даты до сегодня)
    const today = new Date().toISOString().split('T')[0];
    const isPastPeriod = endDate < today;

    if (isPastPeriod) {
      console.log('[getReportHistory] Период в прошлом, загружаем из daily_reports');
      return await getReportHistoryFromDailyReports(startDate, endDate);
    } else {
      console.log('[getReportHistory] Период включает текущий день, используем агрегацию');
      return await getReportHistoryFromAggregation(startDate, endDate);
    }
  } catch (error) {
    console.error('[getReportHistory] Ошибка загрузки агрегированного отчёта:', error);
    throw error;
  }
}

/**
 * Получить отчёт из таблицы daily_reports (для прошлых периодов)
 */
async function getReportHistoryFromDailyReports(
  startDate: string,
  endDate: string
): Promise<ReportHistory> {
  // Загружаем daily_reports, salary_transactions, inventory_arrivals и product_sales параллельно
  const [dailyReportsResult, salaryTransactionsResult, inventoryArrivalsResult, productSalesResult] = await Promise.all([
    supabase
      .from('daily_reports')
      .select('*')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true }),

    // Загружаем зарплатные транзакции за период для разделения по типам работников и сотрудникам
    supabase
      .from('salary_transactions')
      .select('worker_type, worker_id, worker_name, transaction_type, amount, created_at')
      .in('transaction_type', ['PAYOUT', 'ADVANCE'])
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`),

    // Загружаем приходы товаров со склада за период для химии
    supabase
      .from('inventory_arrivals')
      .select('item_name, total_price, delivery_date')
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate),

    // Загружаем продажи товаров за период
    supabase
      .from('product_sales')
      .select('product_name, quantity, total_price, sale_date')
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
  ]);

  if (dailyReportsResult.error) throw dailyReportsResult.error;
  if (salaryTransactionsResult.error) throw salaryTransactionsResult.error;
  if (inventoryArrivalsResult.error) throw inventoryArrivalsResult.error;
  if (productSalesResult.error) throw productSalesResult.error;

  const dailyReports = dailyReportsResult.data;
  const salaryTransactions = salaryTransactionsResult.data || [];
  const inventoryArrivals = inventoryArrivalsResult.data || [];
  const productSales = productSalesResult.data || [];

  if (!dailyReports || dailyReports.length === 0) {
    console.warn('[getReportHistoryFromDailyReports] Нет данных в daily_reports за период:', { startDate, endDate });
    // Возвращаем пустой отчёт
    return {
      startDate,
      endDate,
      carwash: { carsCount: 0, total: 0, cash: 0, card: 0, transfer: 0, sbp: 0, vedomost: 0, yandex: 0, qrCode: 0 },
      tire: { carsCount: 0, storageCount: 0, total: 0, cash: 0, card: 0, transfer: 0, sbp: 0, vedomost: 0, yandex: 0, qrCode: 0 },
      payments: { cash: 0, card: 0, transfer: 0, sbp: 0, vedomost: 0, yandex: 0, qrCode: 0, total: 0 },
      expenses: { teaCoffee: 0, repair: 0, utilities: 0, stationery: 0, other: 0, total: 0 },
      chemistry: { total: 0, details: [] },
      salaries: { workers: 0, workersDetails: [], technicians: 0, techniciansDetails: [], admin: 0, adminsDetails: [], total: 0 },
      sales: { total: 0, details: [] },
      totals: { revenue: 0, expenses: 0, chemistry: 0, salaries: 0, sales: 0, profit: 0 }
    };
  }

  // Суммируем данные из daily_reports (ГОТОВЫЕ значения!)
  const aggregated = dailyReports.reduce((acc, report) => {
    const r = report as DailyReport;

    // Автомойка - готовые значения
    acc.carwash.carsCount += r.carwash_completed_count || 0;
    acc.carwash.total += Number(r.carwash_revenue) || 0;
    acc.carwash.cash += Number(r.carwash_cash) || 0;
    acc.carwash.card += Number(r.carwash_card) || 0;
    acc.carwash.transfer += Number(r.carwash_transfer) || 0;
    acc.carwash.sbp += Number(r.carwash_sbp) || 0;
    acc.carwash.vedomost += Number(r.carwash_vedomost) || 0;
    acc.carwash.yandex += Number(r.carwash_yandex) || 0;
    acc.carwash.qrCode += Number(r.carwash_qr_code) || 0;

    // Шиномонтаж - готовые значения
    acc.tire.carsCount += r.tire_completed_count || 0;
    acc.tire.storageCount = 0; // Будет заполнено отдельным запросом ниже
    acc.tire.total += Number(r.tire_revenue) || 0;
    acc.tire.cash += Number(r.tire_cash) || 0;
    acc.tire.card += Number(r.tire_card) || 0;
    acc.tire.transfer += Number(r.tire_transfer) || 0;
    acc.tire.sbp += Number(r.tire_sbp) || 0;
    acc.tire.vedomost += Number(r.tire_vedomost) || 0;
    acc.tire.yandex += Number(r.tire_yandex) || 0;
    acc.tire.qrCode += Number(r.tire_qr_code) || 0;

    // Способы оплаты - готовые значения (ОБЩИЕ!)
    acc.payments.cash += Number(r.cash_revenue) || 0;
    acc.payments.card += Number(r.card_revenue) || 0;
    acc.payments.transfer += Number(r.transfer_revenue) || 0;
    acc.payments.sbp += Number(r.sbp_revenue) || 0;
    acc.payments.vedomost += Number(r.vedomost_revenue) || 0;
    acc.payments.yandex += Number(r.yandex_revenue) || 0;
    acc.payments.qrCode += Number(r.qr_code_revenue) || 0;
    acc.payments.total += Number(r.total_revenue) || 0;

    // Расходы - готовые значения
    const expensesByCategory = r.expenses_by_category || {};
    acc.expenses.teaCoffee += Number(expensesByCategory.tea_coffee) || 0;
    acc.expenses.repair += Number(expensesByCategory.repair) || 0;
    acc.expenses.utilities += Number(expensesByCategory.utilities) || 0;
    acc.expenses.stationery += Number(expensesByCategory.stationery) || 0;
    acc.expenses.other += Number(expensesByCategory.other) || 0;
    acc.expenses.total += Number(r.total_expenses) || 0;

    // Продажи - готовые значения из daily_reports
    acc.sales.total += Number(r.product_sales_revenue) || 0;

    return acc;
  }, {
    carwash: { carsCount: 0, total: 0, cash: 0, card: 0, transfer: 0, sbp: 0, vedomost: 0, yandex: 0, qrCode: 0 } as Pick<CarwashReport, 'carsCount' | 'total' | 'cash' | 'card' | 'transfer' | 'sbp' | 'vedomost' | 'yandex' | 'qrCode'>,
    tire: { carsCount: 0, storageCount: 0, total: 0, cash: 0, card: 0, transfer: 0, sbp: 0, vedomost: 0, yandex: 0, qrCode: 0 } as Pick<TireReport, 'carsCount' | 'storageCount' | 'total' | 'cash' | 'card' | 'transfer' | 'sbp' | 'vedomost' | 'yandex' | 'qrCode'>,
    payments: { cash: 0, card: 0, transfer: 0, sbp: 0, vedomost: 0, yandex: 0, qrCode: 0, total: 0 } as Pick<PaymentsReport, 'cash' | 'card' | 'transfer' | 'sbp' | 'vedomost' | 'yandex' | 'qrCode' | 'total'>,
    expenses: { teaCoffee: 0, repair: 0, utilities: 0, stationery: 0, other: 0, total: 0 },
    sales: { total: 0, details: [] },
    salaries: { workers: 0, workersDetails: [], technicians: 0, techniciansDetails: [], admin: 0, adminsDetails: [], total: 0 },
    totals: { revenue: 0, expenses: 0, chemistry: 0, salaries: 0, sales: 0, profit: 0 }
  });

  // Агрегируем зарплаты из salary_transactions (workers + technicians) с детализацией по сотрудникам
  const salariesFromTransactions = salaryTransactions.reduce((acc, transaction) => {
    const amount = Math.abs(Number(transaction.amount)) || 0;
    const workerType = transaction.worker_type;
    const workerId = transaction.worker_id;
    const workerName = transaction.worker_name || 'Неизвестный';

    if (workerType === 'worker') {
      acc.workers += amount;

      // Детализация по мойщикам
      const existingWorker = acc.workersDetails.find(w => w.id === workerId);
      if (existingWorker) {
        existingWorker.salary += amount;
      } else {
        acc.workersDetails.push({ id: workerId, name: workerName, salary: amount });
      }
    } else if (workerType === 'tire_worker') {
      acc.technicians += amount;

      // Детализация по шиномонтажникам
      const existingTechnician = acc.techniciansDetails.find(t => t.id === workerId);
      if (existingTechnician) {
        existingTechnician.salary += amount;
      } else {
        acc.techniciansDetails.push({ id: workerId, name: workerName, salary: amount });
      }
    }

    return acc;
  }, {
    workers: 0,
    workersDetails: [] as any[],
    technicians: 0,
    techniciansDetails: [] as any[],
    admin: 0,
    adminsDetails: [] as any[],
    total: 0
  });

  // Добавляем зарплаты из salary_transactions к агрегированным данным
  aggregated.salaries.workers += salariesFromTransactions.workers;
  aggregated.salaries.workersDetails = salariesFromTransactions.workersDetails;
  aggregated.salaries.technicians += salariesFromTransactions.technicians;
  aggregated.salaries.techniciansDetails = salariesFromTransactions.techniciansDetails;

  // Агрегируем админов по salary_transactions с детализацией (фактические выплаты)
  const adminsFromTransactions = salaryTransactions.reduce((acc, transaction) => {
    const amount = Math.abs(Number(transaction.amount)) || 0;
    const workerType = transaction.worker_type;
    const workerId = transaction.worker_id;
    const workerName = transaction.worker_name || 'Неизвестный';

    if (workerType === 'admin') {
      acc.admin += amount;

      // Детализация по админам
      const existingAdmin = acc.adminsDetails.find(a => a.id === workerId);
      if (existingAdmin) {
        existingAdmin.salary += amount;
      } else {
        acc.adminsDetails.push({ id: workerId, name: workerName, salary: amount });
      }
    }

    return acc;
  }, {
    admin: 0,
    adminsDetails: [] as any[]
  });

  // Добавляем админов к агрегированным данным
  aggregated.salaries.admin += adminsFromTransactions.admin;
  aggregated.salaries.adminsDetails = adminsFromTransactions.adminsDetails;

  // total = workers + technicians + admin
  aggregated.salaries.total = aggregated.salaries.workers + aggregated.salaries.technicians + aggregated.salaries.admin;

  // Подсчитываем хранение резины и кондиционеры для прошлых периодов из tire_bookings
  const tireBookingsForStorage = await supabase
    .from('tire_bookings')
    .select('services')
    .eq('status', 'ГОТОВО')
    .gte('booking_date', startDate)
    .lte('booking_date', endDate);

  if (tireBookingsForStorage.data) {
    aggregated.tire.storageCount = tireBookingsForStorage.data.filter(b =>
      b.services?.some((s: any) =>
        s.name === 'Хранение резины' || s.name === 'Сезонное хранение резины'
      )
    ).length;

    // Подсчёт кондиционеров
    const allServices = tireBookingsForStorage.data.flatMap((b: any) => b.services || []);

    // Комплексная заправка кондиционера
    const complexServices = allServices.filter((s: any) =>
      s.name?.toLowerCase().includes('комплексная заправка')
    );
    if (complexServices.length > 0) {
      aggregated.tire.acComplexCount = complexServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
      aggregated.tire.acComplexTotal = complexServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
      aggregated.tire.acComplexPrice = complexServices[0]?.price || 0;
    }

    // Доливка фреона
    const freonServices = allServices.filter((s: any) =>
      s.name?.toLowerCase().includes('доливка фреона') || s.name?.toLowerCase().includes('доливка фриона')
    );
    if (freonServices.length > 0) {
      aggregated.tire.acFreonCount = freonServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
      aggregated.tire.acFreonTotal = freonServices.reduce((sum: number, s: any) => sum + (s.total || s.price * (s.quantity || 1)), 0);
      aggregated.tire.acFreonGrams = freonServices.reduce((sum: number, s: any) => sum + (s.quantity || 1) * 50, 0);
    }
  }

  // Агрегируем данные по химии (из СКЛАДА)
  const chemistryReport = aggregateChemistryData(inventoryArrivals);

  // Агрегируем данные по продажам (из product_sales)
  const salesReport = aggregateSalesData(productSales);

  // Расчёт итоговых значений
  aggregated.totals = {
    revenue: aggregated.carwash.total + aggregated.tire.total,
    expenses: aggregated.expenses.total,
    chemistry: chemistryReport.total,
    salaries: aggregated.salaries.total,
    sales: salesReport.total,
    profit: aggregated.carwash.total + aggregated.tire.total + salesReport.total - aggregated.expenses.total - chemistryReport.total - aggregated.salaries.total
  };

  // Итоги - готовые значения
  const reportHistory: ReportHistory = {
    startDate,
    endDate,
    carwash: aggregated.carwash,
    tire: aggregated.tire,
    payments: aggregated.payments,
    expenses: aggregated.expenses,
    chemistry: chemistryReport,
    salaries: aggregated.salaries,
    sales: salesReport,
    totals: aggregated.totals
  };

  console.log('[getReportHistoryFromDailyReports] Отчёт загружен из daily_reports:', reportHistory);
  return reportHistory;
}

/**
 * Получить отчёт через агрегацию из исходных таблиц (для текущего периода)
 */
async function getReportHistoryFromAggregation(
  startDate: string,
  endDate: string
): Promise<ReportHistory> {
  // Загружаем данные параллельно
  const [
    carwashData,
    tireData,
    expensesData,
    salaryTransactionsData,
    inventoryArrivalsData,
    productSalesData
  ] = await Promise.all([
    // Автомойка: завершённые заказы за период
    supabase
      .from('bookings')
      .select('price, payment_method, completed_at')
      .eq('status', 'ГОТОВО')
      .gte('completed_at', `${startDate}T00:00:00`)
      .lte('completed_at', `${endDate}T23:59:59`),

    // Шиномонтаж: завершённые заказы за период (включая services для подсчёта хранения)
    supabase
      .from('tire_bookings')
      .select('total_price, payment_method, booking_date, services')
      .eq('status', 'ГОТОВО')
      .gte('booking_date', startDate)
      .lte('booking_date', endDate),

    // Расходы за период
    supabase
      .from('expenses')
      .select('category, amount, expense_date')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate),

    // Зарплатные транзакции за период
    supabase
      .from('salary_transactions')
      .select('worker_type, worker_id, worker_name, transaction_type, amount, created_at')
      .in('transaction_type', ['PAYOUT', 'ADVANCE'])
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`),

    // Склад: приходы товаров за период
    supabase
      .from('inventory_arrivals')
      .select('item_name, total_price, delivery_date')
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate),

    // Продажи товаров за период
    supabase
      .from('product_sales')
      .select('product_name, quantity, total_price, sale_date')
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
  ]);

  // Проверяем ошибки
  if (carwashData.error) throw carwashData.error;
  if (tireData.error) throw tireData.error;
  if (expensesData.error) throw expensesData.error;
  if (salaryTransactionsData.error) throw salaryTransactionsData.error;
  if (inventoryArrivalsData.error) throw inventoryArrivalsData.error;
  if (productSalesData.error) throw productSalesData.error;

  // Агрегируем данные по автомойке
  const carwashReport = aggregateCarwashData(carwashData.data || []);

  // Агрегируем данные по шиномонтажу
  const tireReport = aggregateTireData(tireData.data || []);

  // Агрегируем данные по способам оплаты (ОБЩИЕ)
  const paymentsReport = aggregatePaymentsData(carwashData.data || [], tireData.data || []);

  // Агрегируем данные по расходам
  const expensesReport = aggregateExpensesData(expensesData.data || []);

  // Агрегируем данные по химии (из СКЛАДА)
  const chemistryReport = aggregateChemistryData(inventoryArrivalsData.data || []);

  // Агрегируем данные по зарплатам
  const salariesReport = aggregateSalariesData(
    salaryTransactionsData.data || []
  );

  // Агрегируем данные по продажам
  const salesReport = aggregateSalesData(productSalesData.data || []);

  // Рассчитываем итоговые данные
  const totalsReport: TotalsReport = {
    revenue: carwashReport.total + tireReport.total,
    expenses: expensesReport.total,
    chemistry: chemistryReport.total,
    salaries: salariesReport.total,
    sales: salesReport.total,
    profit: carwashReport.total + tireReport.total + salesReport.total - expensesReport.total - chemistryReport.total - salariesReport.total
  };

  const reportHistory: ReportHistory = {
    startDate,
    endDate,
    carwash: carwashReport,
    tire: tireReport,
    payments: paymentsReport,
    expenses: expensesReport,
    chemistry: chemistryReport,
    salaries: salariesReport,
    sales: salesReport,
    totals: totalsReport
  };

  console.log('[getReportHistoryFromAggregation] Агрегированный отчёт загружен:', reportHistory);
  return reportHistory;
}

/**
 * Агрегировать данные по автомойке
 */
function aggregateCarwashData(bookings: any[]): CarwashReport {
  const report: CarwashReport = {
    carsCount: bookings.length,
    total: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    sbp: 0,
    vedomost: 0,
    yandex: 0,
    qrCode: 0
  };

  bookings.forEach(booking => {
    const price = Number(booking.price) || 0;
    const paymentMethod = booking.payment_method;

    report.total += price;

    if (paymentMethod === 'Наличный') {
      report.cash += price;
    } else if (paymentMethod === 'Безналичный') {
      report.card += price;
    } else if (paymentMethod === 'Перевод') {
      report.transfer += price;
    } else if (paymentMethod === 'СБП') {
      report.sbp += price;
    } else if (paymentMethod === 'Ведомость') {
      report.vedomost += price;
    } else if (paymentMethod === 'Яндекс') {
      report.yandex += price;
    } else if (paymentMethod === 'QR-code') {
      report.qrCode += price;
    }
  });

  return report;
}

/**
 * Агрегировать данные по шиномонтажу
 */
function aggregateTireData(bookings: any[]): TireReport {
  const report: TireReport = {
    carsCount: bookings.length,
    storageCount: 0,
    total: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    sbp: 0,
    vedomost: 0,
    yandex: 0,
    qrCode: 0,
    acComplexCount: 0,
    acComplexTotal: 0,
    acComplexPrice: 0,
    acFreonCount: 0,
    acFreonTotal: 0,
    acFreonGrams: 0,
    otherServiceCount: 0,
    otherServiceTotal: 0,
    otherServiceComments: []
  };

  bookings.forEach(booking => {
    const price = Number(booking.total_price) || 0;
    const paymentMethod = booking.payment_method;

    report.total += price;

    if (paymentMethod === 'Наличный') {
      report.cash += price;
    } else if (paymentMethod === 'Безналичный') {
      report.card += price;
    } else if (paymentMethod === 'Перевод') {
      report.transfer += price;
    } else if (paymentMethod === 'СБП') {
      report.sbp += price;
    } else if (paymentMethod === 'Ведомость') {
      report.vedomost += price;
    } else if (paymentMethod === 'Яндекс') {
      report.yandex += price;
    } else if (paymentMethod === 'QR-code') {
      report.qrCode += price;
    }

    // Подсчёт хранений резины
    if (booking.services) {
      const hasStorage = booking.services.some(
        (s: any) => s.name === 'Хранение резины' || s.name === 'Сезонное хранение резины'
      );
      if (hasStorage) {
        report.storageCount++;
      }

      // Подсчёт комплексных заправок кондиционера
      const complexServices = booking.services.filter(
        (s: any) => s.name?.toLowerCase().includes('комплексная заправка')
      );
      complexServices.forEach((s: any) => {
        const qty = s.quantity || 1;
        const total = s.total || (s.price * qty);
        report.acComplexCount! += qty;
        report.acComplexTotal! += total;
        if (!report.acComplexPrice || report.acComplexPrice === 0) {
          report.acComplexPrice = s.price;
        }
      });

      // Подсчёт доливок фреона
      const freonServices = booking.services.filter(
        (s: any) => s.name?.toLowerCase().includes('доливка фреона') || s.name?.toLowerCase().includes('доливка фриона')
      );
      freonServices.forEach((s: any) => {
        const qty = s.quantity || 1;
        const total = s.total || (s.price * qty);
        report.acFreonCount! += qty;
        report.acFreonTotal! += total;
        report.acFreonGrams! += qty * 50;
      });

      // Подсчёт "ПРОЧЕЕ"
      const otherServices = booking.services.filter(
        (s: any) => s.name === 'ПРОЧЕЕ'
      );
      otherServices.forEach((s: any) => {
        const qty = s.quantity || 1;
        const total = s.total || (s.price * qty);
        report.otherServiceCount! += qty;
        report.otherServiceTotal! += total;
        if (s.comment) {
          report.otherServiceComments = report.otherServiceComments || [];
          report.otherServiceComments.push(`${s.comment} (${total}₽)`);
        }
      });
    }
  });

  return report;
}

/**
 * Агрегировать данные по способам оплаты (ОБЩИЕ для всех типов)
 */
function aggregatePaymentsData(
  carwashBookings: any[],
  tireBookings: any[]
): PaymentsReport {
  const report: PaymentsReport = {
    cash: 0,
    card: 0,
    transfer: 0,
    sbp: 0,
    vedomost: 0,
    yandex: 0,
    qrCode: 0,
    total: 0
  };

  // Автомойка
  carwashBookings.forEach(booking => {
    const price = Number(booking.price) || 0;
    const paymentMethod = booking.payment_method;

    if (paymentMethod === 'Наличный') {
      report.cash += price;
    } else if (paymentMethod === 'Безналичный') {
      report.card += price;
    } else if (paymentMethod === 'Перевод') {
      report.transfer += price;
    } else if (paymentMethod === 'СБП') {
      report.sbp += price;
    } else if (paymentMethod === 'Ведомость') {
      report.vedomost += price;
    } else if (paymentMethod === 'Яндекс') {
      report.yandex += price;
    } else if (paymentMethod === 'QR-code') {
      report.qrCode += price;
    }

    report.total += price;
  });

  // Шиномонтаж
  tireBookings.forEach(booking => {
    const totalPrice = Number(booking.total_price) || 0;
    const paymentMethod = booking.payment_method;

    if (paymentMethod === 'Наличный') {
      report.cash += totalPrice;
    } else if (paymentMethod === 'Безналичный') {
      report.card += totalPrice;
    } else if (paymentMethod === 'Перевод') {
      report.transfer += totalPrice;
    } else if (paymentMethod === 'СБП') {
      report.sbp += totalPrice;
    } else if (paymentMethod === 'Ведомость') {
      report.vedomost += totalPrice;
    } else if (paymentMethod === 'Яндекс') {
      report.yandex += totalPrice;
    } else if (paymentMethod === 'QR-code') {
      report.qrCode += totalPrice;
    }

    report.total += totalPrice;
  });

  return report;
}

/**
 * Агрегировать данные по расходам
 */
function aggregateExpensesData(expenses: any[]): ExpensesReport {
  const report: ExpensesReport = {
    teaCoffee: 0,
    repair: 0,
    utilities: 0,
    stationery: 0,
    other: 0,
    total: 0
  };

  expenses.forEach(expense => {
    const amount = Number(expense.amount) || 0;
    const category = expense.category;

    switch (category) {
      case 'tea_coffee':
        report.teaCoffee += amount;
        break;
      case 'repair':
        report.repair += amount;
        break;
      case 'utilities':
        report.utilities += amount;
        break;
      case 'stationery':
        report.stationery += amount;
        break;
      case 'other':
        report.other += amount;
        break;
    }

    report.total += amount;
  });

  return report;
}

/**
 * Агрегировать данные по зарплатам
 */
function aggregateSalariesData(
  transactions: any[]
): SalariesReport {
  const report: SalariesReport = {
    workers: 0,
    workersDetails: [],
    technicians: 0,
    techniciansDetails: [],
    admin: 0,
    adminsDetails: [],
    total: 0
  };

  // Суммируем выплаты мойщикам, шиномонтажникам и админам с детализацией (фактические выплаты)
  transactions.forEach(transaction => {
    const amount = Math.abs(Number(transaction.amount)) || 0;
    const workerType = transaction.worker_type;
    const workerId = transaction.worker_id;
    const workerName = transaction.worker_name || 'Неизвестный';

    if (workerType === 'worker') {
      report.workers += amount;

      // Детализация по мойщикам
      const existingWorker = report.workersDetails.find(w => w.id === workerId);
      if (existingWorker) {
        existingWorker.salary += amount;
      } else {
        report.workersDetails.push({ id: workerId, name: workerName, salary: amount });
      }
    } else if (workerType === 'tire_worker') {
      report.technicians += amount;

      // Детализация по шиномонтажникам
      const existingTechnician = report.techniciansDetails.find(t => t.id === workerId);
      if (existingTechnician) {
        existingTechnician.salary += amount;
      } else {
        report.techniciansDetails.push({ id: workerId, name: workerName, salary: amount });
      }
    } else if (workerType === 'admin') {
      report.admin += amount;

      // Детализация по админам
      const existingAdmin = report.adminsDetails.find(a => a.id === workerId);
      if (existingAdmin) {
        existingAdmin.salary += amount;
      } else {
        report.adminsDetails.push({ id: workerId, name: workerName, salary: amount });
      }
    }
  });

  // Общая сумма зарплат
  report.total = report.workers + report.technicians + report.admin;

  return report;
}

/**
 * Агрегировать данные по расходам на химию из СКЛАДА
 */
function aggregateChemistryData(arrivals: any[]): ChemistryExpensesReport {
  // Группируем по item_name и суммируем total_price
  const grouped = arrivals.reduce((acc, arrival) => {
    const itemName = arrival.item_name;
    const totalAmount = Number(arrival.total_price) || 0;

    if (!acc[itemName]) {
      acc[itemName] = 0;
    }

    acc[itemName] += totalAmount;
    return acc;
  }, {} as Record<string, number>);

  // Преобразуем в массив деталей
  const details: ChemistryExpenseDetail[] = Object.entries(grouped).map(([itemName, totalAmount]) => ({
    itemName,
    totalAmount: Number(totalAmount)
  }));

  // Сортируем по сумме (от большего к меньшему)
  details.sort((a, b) => b.totalAmount - a.totalAmount);

  // Считаем общую сумму
  const total = details.reduce((sum, detail) => sum + detail.totalAmount, 0);

  return {
    total,
    details
  };
}

/**
 * Агрегировать данные по продажам товаров
 */
function aggregateSalesData(sales: any[]): SalesReport {
  // Группируем по product_name и суммируем quantity и total_price
  const grouped = sales.reduce((acc, sale) => {
    const productName = sale.product_name;
    const quantity = Number(sale.quantity) || 0;
    const totalPrice = Number(sale.total_price) || 0;

    if (!acc[productName]) {
      acc[productName] = { quantity: 0, totalPrice: 0 };
    }

    acc[productName].quantity += quantity;
    acc[productName].totalPrice += totalPrice;
    return acc;
  }, {} as Record<string, { quantity: number; totalPrice: number }>);

  // Преобразуем в массив деталей
  const details: SalesDetail[] = Object.entries(grouped).map(([productName, data]) => ({
    productName,
    quantity: (data as { quantity: number; totalPrice: number }).quantity,
    totalPrice: Number((data as { quantity: number; totalPrice: number }).totalPrice)
  }));

  // Сортируем по сумме (от большего к меньшему)
  details.sort((a, b) => b.totalPrice - a.totalPrice);

  // Считаем общую сумму
  const total = details.reduce((sum, detail) => sum + detail.totalPrice, 0);

  return {
    total,
    details
  };
}
