/**
 * Настройки зарплаты для всех типов сотрудников
 */
export interface SalarySettings {
  id: string;
  worker_solo_base: number;        // Базовая ставка мойщика СОЛО (500₽)
  worker_solo_commission: number;  // Процент мойщика СОЛО (0.4 = 40%)
  worker_pair_base: number;        // Базовая ставка мойщика ПАРА (250₽)
  worker_pair_commission: number;  // Процент мойщика ПАРА (0.2 = 20%)
  tire_worker_commission: number;  // Процент шиномонтажника (0.5 = 50%)
  tire_worker_storage_fee: number;  // Фиксированная ставка шиномонтажника за хранение резины (300₽)
  admin_fixed_salary: number;      // Фиксированная зарплата админа (2000₽)
  created_at: string;
  updated_at: string;
}
