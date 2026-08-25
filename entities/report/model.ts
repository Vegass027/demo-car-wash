/**
 * Модель агрегированного отчёта за период
 */

/**
 * Данные по автомойке за период
 */
export interface CarwashReport {
  /** Количество помытых машин */
  carsCount: number;
  /** Общая выручка */
  total: number;
  /** Выручка наличными */
  cash: number;
  /** Выручка картой */
  card: number;
  /** Выручка переводами */
  transfer: number;
  /** Выручка через СБП */
  sbp: number;
  /** Выручка по ведомости */
  vedomost: number;
  /** Выручка через Яндекс */
  yandex: number;
  /** Выручка через QR-code */
  qrCode: number;
}

/**
 * Данные по шиномонтажу за период
 */
export interface TireReport {
  /** Количество обслуженных машин */
  carsCount: number;
  /** Количество хранений резины */
  storageCount: number;
  /** Общая выручка */
  total: number;
  /** Выручка наличными */
  cash: number;
  /** Выручка картой */
  card: number;
  /** Выручка переводами */
  transfer: number;
  /** Выручка через СБП */
  sbp: number;
  /** Выручка по ведомости */
  vedomost: number;
  /** Выручка через Яндекс */
  yandex: number;
  /** Выручка через QR-code */
  qrCode: number;
  /** Количество комплексных заправок кондиционера */
  acComplexCount?: number;
  /** Сумма по комплексным заправкам кондиционера */
  acComplexTotal?: number;
  /** Цена за единицу комплексной заправки */
  acComplexPrice?: number;
  /** Количество доливок фреона */
  acFreonCount?: number;
  /** Сумма по доливкам фреона */
  acFreonTotal?: number;
  /** Общее количество грамм фреона */
  acFreonGrams?: number;
  /** Количество услуг "ПРОЧЕЕ" */
  otherServiceCount?: number;
  /** Сумма по услугам "ПРОЧЕЕ" */
  otherServiceTotal?: number;
  /** Комментарии к услугам "ПРОЧЕЕ" */
  otherServiceComments?: string[];
}

/**
 * Данные по способам оплаты (ОБЩИЕ для всех типов заказов)
 */
export interface PaymentsReport {
  /** Выручка наличными */
  cash: number;
  /** Выручка картой */
  card: number;
  /** Выручка переводами */
  transfer: number;
  /** Выручка через СБП */
  sbp: number;
  /** Выручка по ведомости */
  vedomost: number;
  /** Выручка через Яндекс */
  yandex: number;
  /** Выручка через QR-code */
  qrCode: number;
  /** Общая выручка */
  total: number;
}

/**
 * Данные по расходам за период
 */
export interface ExpensesReport {
  /** Расходы на чай/кофе */
  teaCoffee: number;
  /** Расходы на ремонт */
  repair: number;
  /** Расходы на коммуналку */
  utilities: number;
  /** Расходы на канцелярию */
  stationery: number;
  /** Прочие расходы */
  other: number;
  /** Общая сумма расходов */
  total: number;
}

/**
 * Детализация расхода на химию по позиции
 */
export interface ChemistryExpenseDetail {
  /** Название товара (из СКЛАДА) */
  itemName: string;
  /** Общая сумма за период */
  totalAmount: number;
}

/**
 * Данные по расходам на химию
 */
export interface ChemistryExpensesReport {
  /** Общая сумма затрат на химию */
  total: number;
  /** Детализация по позициям */
  details: ChemistryExpenseDetail[];
}

/**
 * Детализация продажи товара
 */
export interface SalesDetail {
  /** Название товара */
  productName: string;
  /** Количество проданных единиц */
  quantity: number;
  /** Общая сумма продажи */
  totalPrice: number;
}

/**
 * Данные по продажам товаров за период
 */
export interface SalesReport {
  /** Общая сумма продаж */
  total: number;
  /** Детализация по товарам */
  details: SalesDetail[];
}

/**
 * Детализация зарплаты по сотруднику
 */
export interface WorkerSalaryDetail {
  /** ID сотрудника */
  id: string;
  /** Имя сотрудника */
  name: string;
  /** Сумма зарплаты */
  salary: number;
}

/**
 * Данные по зарплатам за период
 */
export interface SalariesReport {
  /** Выплачено мойщикам */
  workers: number;
  /** Детализация по мойщикам */
  workersDetails: WorkerSalaryDetail[];
  /** Выплачено шиномонтажникам */
  technicians: number;
  /** Детализация по шиномонтажникам */
  techniciansDetails: WorkerSalaryDetail[];
  /** Выплачено админам */
  admin: number;
  /** Детализация по админам */
  adminsDetails: WorkerSalaryDetail[];
  /** Общая сумма зарплат */
  total: number;
}

/**
 * Итоговые данные за период
 */
export interface TotalsReport {
  /** Общая выручка (автомойка + шиномонтаж) */
  revenue: number;
  /** Общие расходы */
  expenses: number;
  /** Расходы на склад (химия) */
  chemistry: number;
  /** Общие зарплаты */
  salaries: number;
  /** Выручка от продаж товаров */
  sales: number;
  /** Чистая прибыль (выручка + продажи - расходы - склад - зарплаты) */
  profit: number;
}

/**
 * Агрегированный отчёт за период
 */
export interface ReportHistory {
  /** Начальная дата периода (YYYY-MM-DD) */
  startDate: string;
  /** Конечная дата периода (YYYY-MM-DD) */
  endDate: string;
  /** Данные по автомойке */
  carwash: CarwashReport;
  /** Данные по шиномонтажу */
  tire: TireReport;
  /** Данные по способам оплаты (ОБЩИЕ) */
  payments: PaymentsReport;
  /** Данные по расходам */
  expenses: ExpensesReport;
  /** Данные по расходам на химию */
  chemistry: ChemistryExpensesReport;
  /** Данные по продажам товаров */
  sales: SalesReport;
  /** Данные по зарплатам */
  salaries: SalariesReport;
  /** Итоговые данные */
  totals: TotalsReport;
}

/**
 * Дневной отчёт из таблицы daily_reports
 */
export interface DailyReport {
  id: string;
  report_date: string;
  carwash_revenue: number;
  carwash_orders_count: number;
  carwash_completed_count: number;
  carwash_cancelled_count: number;
  carwash_cash: number;
  carwash_card: number;
  carwash_transfer: number;
  carwash_sbp: number;
  carwash_vedomost: number;
  carwash_yandex: number;
  carwash_qr_code: number;
  tire_revenue: number;
  tire_orders_count: number;
  tire_completed_count: number;
  tire_cancelled_count: number;
  tire_cash: number;
  tire_card: number;
  tire_transfer: number;
  tire_sbp: number;
  tire_vedomost: number;
  tire_yandex: number;
  tire_qr_code: number;
  total_revenue: number;
  total_orders_count: number;
  cash_revenue: number;
  card_revenue: number;
  transfer_revenue: number;
  sbp_revenue: number;
  vedomost_revenue: number;
  yandex_revenue: number;
  qr_code_revenue: number;
  cashless_revenue: number;
  product_sales_revenue: number;
  total_expenses: number;
  expenses_by_category: Record<string, number>;
  total_salary_paid: number;
  workers_count: number;
  tire_workers_count: number;
  admins_count: number;
  gross_profit: number;
  net_profit: number;
  org_revenue: number;
  org_orders_count: number;
  average_check: number;
  boxes_closed: number;
  is_finalized: boolean;
  finalized_by?: string;
  finalized_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
