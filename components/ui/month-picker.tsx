import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface MonthPickerProps {
  value: string; // "2025-01"
  onChange: (value: string) => void;
}

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [year, setYear] = useState(value ? parseInt(value.slice(0, 4)) : new Date().getFullYear());
  const [month, setMonth] = useState(value ? parseInt(value.slice(5, 7)) - 1 : new Date().getMonth());

  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
                  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  const handleSelect = (m: number) => {
    setMonth(m);
    const mm = String(m + 1).padStart(2, '0');
    onChange(`${year}-${mm}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal">
          <CalendarIcon className="w-4 h-4 mr-2" />
          {months[month]} {year}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        {/* Навигация по годам */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-medium">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* Сетка месяцев */}
        <div className="grid grid-cols-4 gap-1">
          {months.map((name, i) => (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={`px-2 py-2 rounded text-sm transition-colors ${
                i === month && year === new Date().getFullYear()
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
