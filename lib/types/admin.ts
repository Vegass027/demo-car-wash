/**
 * Интерфейс администратора
 * Соответствует таблице admins в базе данных
 */
export interface Admin {
  id: string;                       // UUID
  profile_id: string;               // UUID профиля в таблице profiles
  full_name: string;                  // Полное имя админа
  phone: string;                      // Телефон
  card_number?: string | null;         // Номер банковской карты для выплат
  payment_phone?: string | null;       // Номер телефона для СБП/переводов
  payment_comment?: string | null;     // Комментарий для перевода по телефону
  salary_comment?: string | null;      // Комментарий админа к выплате зарплаты (заметки)
  is_active: boolean;                 // Активен ли админ
  
  // Зарплата
  fixed_salary: number;                // Фиксированная зарплата (2000₽ за выход)
  earned_today: number;                // Заработано за текущий день
  current_balance: number;             // Накопленный баланс
  is_advance_taken: boolean;           // Взят ли аванс
  base_rate_taken_today: boolean;     // Начислен ли выход за сегодня
  
  // Работа
  is_working_today: boolean;           // Работает ли сегодня
  days_worked_this_month: number;     // Количество отработанных дней в месяце
  last_shift_date: string | null;     // Дата последней смены (для idempotency)
  
  created_at: string;                 // TIMESTAMP
  updated_at: string;                 // TIMESTAMP
}
