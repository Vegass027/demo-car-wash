import React, { useState, useEffect } from 'react';
import { TireBooking } from '../../lib/api/tire-bookings';
import { TireTimeline } from './TireTimeline';
import { TireBookingDetailModal } from './TireBookingDetailModal';
import { TireOrdersHistoryModal } from './TireOrdersHistoryModal';
import { formatDate, isToday } from '../../shared/utils/date';
import { getCurrentHour } from '../../shared/utils/date';
import { cn } from '../../lib/utils';
import { Sun, Loader2 } from 'lucide-react';
import { TireService } from '../../lib/api/tire-services';
import { getTireServiceDayStatus, setTireServiceDayStatus } from '../../lib/api/tire-service-days';
import { supabase } from '../../lib/supabase';

interface TireServicePageProps {
  bookings: TireBooking[];
  onCancelBooking: (bookingId: string) => void;
  onChangePaymentMethod: (bookingId: string) => void;
  onAddService?: (bookingId: string, serviceId: string) => void;
  onRemoveService?: (bookingId: string, serviceId: string) => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAssignTechnician?: (bookingId: string) => void;
  onCreateBooking: (booking: Omit<TireBooking, 'id' | 'status'>) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onNavigateToWizard?: (time: string, date: string) => void;
  isWorkingToday?: boolean; // @deprecated - теперь загружается из БД
  onToggleWorkingToday?: () => void; // @deprecated - теперь сохраняется в БД
  technicians?: any[];
  tireServices?: TireService[];
}

export const TireServicePage: React.FC<TireServicePageProps> = ({
  bookings,
  onCancelBooking,
  onChangePaymentMethod,
  onAddService,
  onRemoveService,
  onMarkAsReady,
  onStartWork,
  onMarkAsPaid,
  onAssignTechnician,
  onCreateBooking,
  selectedDate,
  onDateChange,
  onNavigateToWizard,
  isWorkingToday = true, // @deprecated - для обратной совместимости
  onToggleWorkingToday, // @deprecated - для обратной совместимости
  technicians = [],
  tireServices = [],
}) => {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // ✅ Новое состояние: статус работы для выбранной даты (загружается из БД)
  const [isDayOpen, setIsDayOpen] = useState(true);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // ✅ Загружаем статус дня при изменении selectedDate
  useEffect(() => {
    const loadDayStatus = async () => {
      const dateToCheck = selectedDate || formatDate(new Date());
      setIsLoadingStatus(true);
      try {
        const status = await getTireServiceDayStatus(dateToCheck);
        setIsDayOpen(status);
      } catch (error) {
        console.error('Error loading day status:', error);
        setIsDayOpen(true); // По умолчанию открыт
      } finally {
        setIsLoadingStatus(false);
      }
    };
    
    loadDayStatus();
  }, [selectedDate]);

  // ✅ Переключение статуса дня с сохранением в БД
  const handleToggleDayStatus = async () => {
    const dateToToggle = selectedDate || formatDate(new Date());
    const newStatus = !isDayOpen;

    console.log('[TireServicePage] Переключение статуса:', { dateToToggle, currentStatus: isDayOpen, newStatus });

    // Оптимистичное обновление UI
    setIsDayOpen(newStatus);

    try {
      const success = await setTireServiceDayStatus(dateToToggle, newStatus);
      console.log('[TireServicePage] Результат setTireServiceDayStatus:', success);
      if (!success) {
        // Откат при ошибке
        console.log('[TireServicePage] Откат UI из-за ошибки');
        setIsDayOpen(!newStatus);
      }
    } catch (error) {
      console.error('[TireServicePage] Error toggling day status:', error);
      // Откат при ошибке
      setIsDayOpen(!newStatus);
    }
  };

  // Находим выбранный booking
  const selectedBooking = React.useMemo(() => {
    if (!selectedBookingId) return null;
    return bookings.find(b => b.id === selectedBookingId) || null;
  }, [bookings, selectedBookingId]);

  const handleBookingClick = (booking: TireBooking) => {
    setSelectedBookingId(booking.id);
  };

  const handleCreateBookingFromTimeline = (hour: number) => {
    // Если выбранная дата - сегодня: часы = текущий час, минуты пустые
    // Если выбранная дата - не сегодня: часы и минуты пустые
    let initialTime = '';
    if (selectedDate && isToday(selectedDate)) {
      const currentHour = getCurrentHour();
      initialTime = `${currentHour}:`;
    }

    // Вызываем навигацию на wizard
    onNavigateToWizard?.(initialTime, selectedDate || formatDate(new Date()));
  };

  // Форматируем дату для отображения
  const formatSelectedDate = () => {
    if (!selectedDate) return 'Сегодня';
    if (isToday(selectedDate)) return 'Сегодня';
    return new Date(selectedDate).toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  return (
    <div className="h-full flex flex-col pt-6 pb-20 pt-safe telegram-safe-area-top animate-in fade-in">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-gray-900">Шиномонтаж</h2>
          <div className="w-40 h-px bg-gray-300 mt-0"></div>
          <p className="text-sm text-gray-500">Сегодня: {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-gray-500">{formatSelectedDate()}</span>
          <span className={cn(
            "text-m font-bold",
            isDayOpen ? "text-green-600" : "text-red-600"
          )}>
            {isLoadingStatus ? 'Загрузка...' : (isDayOpen ? 'Открыто' : 'Закрыто')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleDayStatus}
              disabled={isLoadingStatus}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-md transition-colors focus:outline-none disabled:opacity-50",
                isDayOpen ? "bg-green-500" : "bg-gray-300"
              )}
            >
              {isLoadingStatus ? (
                <Loader2 className="w-4 h-4 animate-spin text-white absolute left-3" />
              ) : (
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-md bg-white transition-transform",
                    isDayOpen ? "translate-x-6" : "translate-x-1"
                  )}
                />
              )}
            </button>
            <Sun className="w-5 h-5 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Разделитель */}
      <div className="h-px bg-gray-200 w-full mb-10"></div>

      <div className="space-y-6">
        {/* Объединенное расписание с секцией В работе */}
        <TireTimeline
          bookings={bookings}
          onBookingClick={handleBookingClick}
          onCreateBooking={handleCreateBookingFromTimeline}
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          onOpenHistory={() => setIsHistoryOpen(true)}
        />
      </div>

      {/* Модальное окно деталей */}
      <TireBookingDetailModal
        isOpen={selectedBooking !== null}
        onClose={() => setSelectedBookingId(null)}
        booking={selectedBooking}
        onChangePaymentMethod={onChangePaymentMethod}
        onCancelBooking={(bookingId) => {
          setSelectedBookingId(null);
          onCancelBooking(bookingId);
        }}
        onAddService={onAddService}
        onRemoveService={onRemoveService}
        onMarkAsReady={onMarkAsReady}
        onStartWork={onStartWork}
        onMarkAsPaid={onMarkAsPaid}
        onAssignTechnician={onAssignTechnician}
        technicians={technicians}
        tireServices={tireServices}
      />

      {/* Модальное окно истории заказов */}
      <TireOrdersHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        bookings={bookings}
        selectedDate={selectedDate}
        technicians={technicians}
      />

    </div>
  );
};
