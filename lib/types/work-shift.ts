/**
 * Интерфейс рабочей смены
 * Соответствует таблице work_shifts в базе данных
 */
export interface WorkShift {
  id: string;                    // UUID
  worker_type: 'worker' | 'tire_worker' | 'admin';  // Тип работника
  worker_id: string;             // UUID работника
  worker_name: string;           // Имя работника
  work_date: string;             // Дата работы (YYYY-MM-DD)
  started_at: string;            // Время начала (TIMESTAMPTZ)
  finished_at?: string | null;   // Время окончания (TIMESTAMPTZ)
  earnings?: number | null;      // Заработок за смену
  status: 'working' | 'finished';  // Статус смены
  created_at: string;            // TIMESTAMP
}
