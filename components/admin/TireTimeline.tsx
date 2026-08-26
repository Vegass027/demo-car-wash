import React, { useRef } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Plus, CarFront, Clock, History, Bandage, Lock } from 'lucide-react';
import { TireBooking } from '../../lib/api/tire-bookings';
import { InProgressCard } from './InProgressCard';
import { DateSelector } from './DateSelector';
import { formatDate } from '../../shared/utils/date';
import { timeToMinutes, isTireBookingActive, isTimeActive, calculateEndTime, formatTimeWithoutSeconds } from '../../shared/utils/time';

interface TireTimelineProps {
  bookings: TireBooking[];
  onBookingClick?: (booking: TireBooking) => void;
  onCreateBooking?: (hour: number) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onOpenHistory?: () => void;
  // ✅ Новые пропсы для онлайн-записи
  userRole?: 'admin' | 'client';
  currentProfileId?: string;
  // ✅ Проп для скрытия кнопки "Добавить"
  showAddButton?: boolean;
  // ✅ Новый проп: день открыт/закрыт
  isDayOpen?: boolean;
  // ✅ Текст для отображения когда откроется (для клиента)
  nextOpenDateText?: string;
  // ✅ NEW: ID организаций, где клиент является водителем
  driverOrganizationIds?: string[];
}

export const TireTimeline: React.FC<TireTimelineProps> = ({
  bookings,
  onBookingClick,
  onCreateBooking,
  selectedDate,
  onDateChange,
  onOpenHistory,
  userRole = 'admin',
  currentProfileId,
  showAddButton = true,
  isDayOpen = true,
  nextOpenDateText,
  driverOrganizationIds = []
}) => {
  const [totalHours, setTotalHours] = React.useState(10);
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const timelineRef = useRef<HTMLDivElement>(null);

  // Форматируем текущую дату для сравнения
  const today = formatDate(currentTime);
  const isToday = selectedDate === today;

  // Автоматическое обновление каждую минуту
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Обновляем каждую минуту (60000 мс)

    return () => clearInterval(interval);
  }, []);

  // ✅ Фильтрация по роли для онлайн-записи
  const getFilteredBookings = (): TireBooking[] => {
    if (userRole === 'client' && currentProfileId) {
      // Клиент видит только: ОЖИДАЕТ, В РАБОТЕ, ПРОСРОЧЕН
      // НЕ видит: ГОТОВО (закрытые заказы)
      // Детали чужих записей скрываются в BookingCellContent
      return bookings.filter(booking => {
        const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
        const isNotCompleted = booking.status !== 'ГОТОВО';
        const matchesDate = selectedDate ? booking.booking_date === selectedDate : true;
        return isNotCancelled && isNotCompleted && matchesDate;
      });
    }
    // Админ видит все записи
    return bookings.filter((booking) => {
      const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
      const isNotCompleted = booking.status !== 'ГОТОВО';
      const matchesDate = selectedDate ? booking.booking_date === selectedDate : true;
      return isNotCancelled && isNotCompleted && matchesDate;
    });
  };

  const activeBookings = getFilteredBookings();

  // Сортируем заказы по времени (хронологический порядок)
  const sortedBookings = [...activeBookings].sort((a, b) => {
    const timeA = timeToMinutes(a.start_time);
    const timeB = timeToMinutes(b.start_time);
    return timeA - timeB;
  });

  // Создаем массив ячеек на основе totalHours
  const cells = Array.from({ length: totalHours }, (_, i) => i);

  // Получаем записи для отображения в ячейках
  // Ближайший заказ - в первой ячейке, остальные по очереди
  // Если между заказами есть разница во времени (30+ минут) - пустая ячейка между ними
  const getBookingsForCells = (): (TireBooking | null)[] => {
    const result: (TireBooking | null)[] = Array(totalHours).fill(null);
    let cellIndex = 0;

    sortedBookings.forEach((booking, index) => {
      // Если это не первый заказ, проверяем разницу во времени с предыдущим
      if (index > 0 && cellIndex < totalHours - 1) {
        const prevBooking = sortedBookings[index - 1];
        const prevEndTime = calculateEndTime(prevBooking.start_time, prevBooking.estimated_duration);
        const currStartTime = booking.start_time;
        const timeDiff = timeToMinutes(currStartTime) - timeToMinutes(prevEndTime);

        // Если разница >= 30 минут, добавляем пустую ячейку
        if (timeDiff >= 30) {
          cellIndex++;
        }
      }

      // Добавляем запись в ячейку, если есть место
      if (cellIndex < totalHours) {
        result[cellIndex] = booking;
        cellIndex++;
      }
    });

    return result;
  };

  const cellBookings = getBookingsForCells();

  // Определяем цвет статуса записи
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'В РАБОТЕ':
        return 'bg-blue-500 border-blue-600';
      case 'ГОТОВО':
        return 'bg-green-500 border-green-600';
      case 'ОТМЕНЕНО':
        return 'bg-red-500 border-red-600';
      case 'ПРОСРОЧЕН':
        return 'bg-[#4F39F6] border-[#4F39F6]';
      default:
        return 'bg-orange-500 border-orange-600';
    }
  };

  // Получаем активные заказы (гибридная логика: status == 'В РАБОТЕ' ИЛИ is_time_active == true)
  const activeBookingsList = activeBookings.filter(booking => {
    const isActive = isTireBookingActive(booking);
    return isActive;
  });

  // Получаем ближайший заказ (только если НЕТ активных заказов)
  const getNextBooking = (): TireBooking | null => {
    // Если есть активные заказы - не показываем ближайший
    if (activeBookingsList.length > 0) {
      return null;
    }

    const now = new Date();
    const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();

    const waitingBookings = activeBookings.filter(b => {
      const isWaiting = b.status === 'ОЖИДАЕТ';
      // Для сегодняшнего дня - только будущие записи
      const isFuture = !isToday || timeToMinutes(b.start_time) >= currentMinutesTotal;
      return isWaiting && isFuture;
    });

    if (waitingBookings.length === 0) {
      return null;
    }

    // Сортируем по времени и берем ближайший
    const nextBooking = waitingBookings.sort((a, b) => {
      const timeA = timeToMinutes(a.start_time);
      const timeB = timeToMinutes(b.start_time);
      return timeA - timeB;
    })[0];

    return nextBooking;
  };

  const nextBooking = getNextBooking();

  // ✅ Форматируем дату для отображения в сообщении о закрытом дне
  const formatClosedDayDate = () => {
    if (!selectedDate) return '';
    const date = new Date(selectedDate);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  return (
    <div ref={timelineRef} className="overscroll-contain">
      <div className="flex items-center justify-between mb-3">
        {selectedDate && onDateChange ? (
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            userRole={userRole}
          />
        ) : (
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Расписание
          </h2>
        )}
        {onOpenHistory && (
          <>
            <div className="w-px h-6 bg-gray-300 mx-2 md:hidden"></div>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenHistory}
              className="gap-2 h-7 md:h-9 px-2 md:px-3 text-xs md:text-sm"
            >
              <History className="w-3 h-3 md:w-4 md:h-4" />
              <span>История</span>
            </Button>
          </>
        )}
      </div>
      <Card className={isDayOpen ? '' : 'bg-gray-100 border-gray-300'}>
        <CardContent className="p-4">
          {/* ✅ Блокировка для клиента если день закрыт */}
          {!isDayOpen && userRole === 'client' && (
            <div className="mb-6 p-6 bg-gray-200 rounded-xl text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-gray-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-700">
                    Закрыто
                  </h3>
                  {formatClosedDayDate() && (
                    <p className="text-sm text-gray-500">
                      {formatClosedDayDate()} не работает
                    </p>
                  )}
                  {nextOpenDateText && (
                    <p className="text-sm text-gray-500">
                      Откроется {nextOpenDateText}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Выберите другую дату для записи
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Секция: В работе / Ближайший заказ - показываем только если день открыт ИЛИ это админ */}
          {(isDayOpen || userRole === 'admin') && (
            <>
              {activeBookingsList.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    В работе {activeBookingsList.length > 0 && (
                      <>
                        <span className="text-gray-400">|</span>
                        <Clock className="w-4 h-4 text-gray-700 font-semibold" />
                        <span className="text-sm font-semibold text-gray-700">
                          {formatTimeWithoutSeconds(activeBookingsList[0].start_time)} - {calculateEndTime(activeBookingsList[0].start_time, activeBookingsList[0].estimated_duration)}
                        </span>
                      </>
                    )}
                  </h3>
                  <div className="space-y-3">
                    {activeBookingsList.map(booking => (
                      userRole === 'client' ? (
                        // ✅ Для клиента показываем только интервал времени
                        <div
                          key={booking.id}
                          className="w-full bg-white rounded-xl border-2 border-green-500 shadow-sm p-4 text-center"
                        >
                          <div className="flex items-center justify-center gap-2 text-gray-700">
                            <Clock className="w-5 h-5" />
                            <span className="text-base font-semibold">
                              {formatTimeWithoutSeconds(booking.start_time)} - {calculateEndTime(booking.start_time, booking.estimated_duration)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        // ✅ Для админа показываем полную информацию
                        <InProgressCard
                          key={booking.id}
                          booking={booking}
                          onClick={() => onBookingClick?.(booking)}
                        />
                      )
                    ))}
              </div>
              {/* Разделитель */}
              <div className="h-px bg-gray-400 w-full my-4"></div>
            </div>
          ) : nextBooking ? (
            <div className="mb-4">
              <h3 className="text-xs md:text-lg font-bold mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                Ближайший заказ
                <>
                  <span className="text-gray-400">|</span>
                  <Clock className="w-4 h-4 text-gray-700 font-semibold" />
                  <span className="text-xs md:text-lg font-semibold text-gray-700">
                    {formatTimeWithoutSeconds(nextBooking.start_time)} - {calculateEndTime(nextBooking.start_time, nextBooking.estimated_duration)}
                  </span>
                </>
              </h3>
              {userRole === 'client' ? (
                // ✅ Для клиента показываем только интервал времени
                <div className="w-full bg-white rounded-xl border-2 border-orange-500 shadow-sm p-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-700">
                    <Clock className="w-5 h-5" />
                    <span className="text-base font-semibold">
                      {formatTimeWithoutSeconds(nextBooking.start_time)} - {calculateEndTime(nextBooking.start_time, nextBooking.estimated_duration)}
                    </span>
                  </div>
                </div>
              ) : (
                // ✅ Для админа показываем полную информацию
                <InProgressCard
                  key={nextBooking.id}
                  booking={nextBooking}
                  onClick={() => onBookingClick?.(nextBooking)}
                  isNextBooking={true}
                />
              )}
              {/* Разделитель */}
              <div className="h-px bg-gray-400 w-full my-4"></div>
            </div>
          ) : null}
            </>
          )}

          {/* Ячейки расписания (grid-cols-2) - отображаем заказы в хронологическом порядке */}
          <div className="grid grid-cols-2 gap-4">
            {cells.map((cellIndex) => {
              // Получаем заказ для этой ячейки
              const booking = cellBookings[cellIndex];

              // ✅ Если день закрыт и это клиент - слоты неактивны
              const isSlotDisabled = !isDayOpen && userRole === 'client';

              return (
                <button
                  key={cellIndex}
                  disabled={isSlotDisabled}
                  onClick={() => {
                    // ✅ Если день закрыт - не кликаем
                    if (isSlotDisabled) return;

                    // ✅ Клиент может кликать только на свободные слоты
                    if (userRole === 'client' && booking) return;

                    // Админ может кликать на записи
                    if (booking) {
                      onBookingClick?.(booking);
                      return;
                    }

                    // Клик на свободный слот
                    onCreateBooking?.(8 + cellIndex);
                  }}
                  className={`h-24 rounded-xl border-2 border-dashed flex items-center justify-center hover:scale-105 transition-all bg-white hover:border-blue-400 hover:bg-blue-50 hover:shadow-md ${
                    // ✅ Приоритет цветов: ГОТОВО (клиент) > ПРОСРОЧЕН > АКТИВНЫЙ > ОЖИДАЕТ
                    booking?.status === 'ГОТОВО' && userRole === 'client'
                      ? 'border-[#4F39F6]'
                      : booking?.status === 'ПРОСРОЧЕН'
                      ? 'border-[#4F39F6] border-dashed'
                      : booking && isTireBookingActive(booking)
                      ? 'border-green-500'
                      : booking?.status === 'ОЖИДАЕТ'
                      ? 'border-orange-500'
                      : 'border-gray-200'
                  } ${isSlotDisabled ? 'opacity-50 cursor-not-allowed hover:scale-100 hover:border-gray-200 hover:bg-white hover:shadow-none' : 'cursor-pointer'}`}
                >
                  {booking ? (
                    <BookingCellContent booking={booking} userRole={userRole} currentProfileId={currentProfileId} driverOrganizationIds={driverOrganizationIds} />
                  ) : (
                    <EmptyCell />
                  )}
                </button>
              );
            })}
          </div>

          {/* Кнопка добавления ячеек - отдельная, вне грида */}
          {/* ✅ Скрываем для клиента или если showAddButton=false или если день закрыт */}
          {showAddButton && userRole !== 'client' && isDayOpen && (
            <button
              onClick={() => setTotalHours(prev => prev + 2)}
              className="mt-4 w-full h-12 rounded-lg border-2 border-dashed border-blue-300 flex items-center justify-center cursor-pointer hover:scale-105 transition-all bg-blue-50 hover:bg-blue-100 hover:border-blue-500 hover:shadow-md"
            >
              <Plus className="w-6 h-6 text-blue-500 mr-2" />
              <span className="text-blue-600 font-medium">Добавить</span>
            </button>
          )}

          {/* Легенда */}
          <div className="flex gap-3 mt-4 pt-3 border-t text-xs text-gray-500 flex-wrap justify-center">
            {userRole === 'client' ? (
              <>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-orange-500" />
                  <span>Занято</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  <span>В работе</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-[#4F39F6]" />
                  <span>Готово</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-orange-500" />
                  <span>Ожидает</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  <span>В работе</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-[#4F39F6]" />
                  <span>Просрочен</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Компонент для содержимого ячейки с записью
interface BookingCellContentProps {
  booking: TireBooking;
  userRole?: 'admin' | 'client';
  currentProfileId?: string;
  // ✅ NEW: ID организаций, где клиент является водителем
  driverOrganizationIds?: string[];
}

const BookingCellContent: React.FC<BookingCellContentProps> = ({ booking, userRole = 'admin', currentProfileId, driverOrganizationIds = [] }) => {
  // ✅ Для клиента показываем только интервал времени, без деталей
  const showFullDetails = userRole === 'admin';

  // ✅ Проверяем, является ли запись собственной для клиента
  // Это может быть личная запись (created_by_profile_id) или запись через организацию (organization_id)
  const isPersonalBooking = currentProfileId && booking.created_by_profile_id === currentProfileId;
  const isOrgBooking = booking.is_org && booking.organization_id && driverOrganizationIds.includes(booking.organization_id);
  const isOwnBooking = userRole === 'client' && (isPersonalBooking || isOrgBooking);

  return (
    <div className="flex flex-col gap-2 px-2 w-full overflow-hidden">
      {showFullDetails ? (
        <>
          {/* Верхняя строка: значок времени и время */}
          <div className="flex items-center justify-center gap-1 text-gray-600">
            <Clock className="w-5 h-5" />
            <span className="text-sm font-semibold">
              {formatTimeWithoutSeconds(booking.start_time)} - {calculateEndTime(booking.start_time, booking.estimated_duration)}
            </span>
          </div>

          {/* Разделитель */}
          <div className="w-full border-t border-gray-300"></div>

          {/* Нижняя строка: машинка, марка и номер */}
          <div className="flex flex-col items-center justify-center gap-1 text-sm">
            {/* Мобильная версия: марка и номер в разных строках */}
            <div className="flex items-center gap-2 md:hidden">
              <CarFront className="w-5 h-5 text-gray-600" />
              <div className="font-semibold text-gray-800 truncate max-w-full">
                {booking.car_model}
              </div>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <Bandage className="w-5 h-5 text-gray-600" />
              <div className="text-xs text-gray-500 truncate max-w-full">
                {booking.plate_number}
              </div>
            </div>

            {/* ПК версия: марка и номер в одной строке через разделитель */}
            <div className="hidden md:flex items-center gap-2">
              <CarFront className="w-5 h-5 text-gray-600" />
              <div className="flex items-center gap-2 font-semibold text-gray-800 truncate max-w-full">
                <span className="truncate">{booking.car_model}</span>
                <span className="text-gray-400">|</span>
                <span className="text-xs text-gray-500 truncate">{booking.plate_number}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        // ✅ Для клиента
        <div className="flex flex-col items-center justify-center gap-1">
          {/* Время (сверху) */}
          <div className="flex items-center gap-1 text-gray-600 whitespace-nowrap">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-semibold">
              {formatTimeWithoutSeconds(booking.start_time)} - {calculateEndTime(booking.start_time, booking.estimated_duration)}
            </span>
          </div>

          {/* ✅ Своя запись — показываем "Ваша запись" */}
          {isOwnBooking ? (
            <>
              <div className="w-full border-t border-gray-300" />
              <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">Ваша запись</span>
            </>
          ) : (
            // ✅ Чужая запись — показываем "Занято" (без утечки чужого статуса/деталей)
            <>
              <div className="w-full border-t border-gray-300" />
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Занято</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Компонент для пустой ячейки
interface EmptyCellProps {}

const EmptyCell: React.FC<EmptyCellProps> = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
      <Plus className="w-8 h-8 text-gray-300" />
    </div>
  );
};
