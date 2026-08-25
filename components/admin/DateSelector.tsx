import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Clock } from 'lucide-react';
import { formatDate, formatDateLabel, addDays } from '../../shared/utils/date';

interface DateSelectorProps {
  selectedDate: string;           // Выбранная дата (ISO формат)
  onDateChange: (date: string) => void;  // Callback при выборе даты
  userRole?: 'admin' | 'client'; // Роль пользователя для переключения дней
}

export const DateSelector: React.FC<DateSelectorProps> = ({
  selectedDate,
  onDateChange,
  userRole = 'admin', // По умолчанию для админа
}) => {
  const now = new Date();
  const currentHour = now.getHours();
  const SWITCH_HOUR = 18; // 18:00 МСК - время переключения для клиентов
  
  // Переключаем только для клиентов после 18:00
  const shouldSwitch = userRole === 'client' && currentHour >= SWITCH_HOUR;
  const baseDate = shouldSwitch ? addDays(now, 1) : now;
  
  // Генерируем массив из 4 дат (базовая дата + 3 дня)
  const dates = [
    { 
      value: formatDate(baseDate), 
      label: shouldSwitch ? 'Завтра' : 'Сегодня' 
    },
    { 
      value: formatDate(addDays(baseDate, 1)), 
      label: formatDateLabel(addDays(baseDate, 1)) 
    },
    { 
      value: formatDate(addDays(baseDate, 2)), 
      label: formatDateLabel(addDays(baseDate, 2)) 
    },
    { 
      value: formatDate(addDays(baseDate, 3)), 
      label: formatDateLabel(addDays(baseDate, 3)) 
    },
  ];

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 md:w-5 md:h-5 text-primary" />
      <h2 className="text-sm md:text-lg font-semibold">Расписание</h2>
      <Select value={selectedDate} onValueChange={onDateChange}>
        <SelectTrigger className="w-[95px] md:w-[110px] h-7 md:h-8 text-xs md:text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dates.map((date) => (
            <SelectItem key={date.value} value={date.value}>
              {date.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
