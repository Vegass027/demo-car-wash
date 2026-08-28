import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Car, Plus, History, LockOpen, Lock } from 'lucide-react';
import { Booking } from '../../lib/api/bookings';
import { DateSelector } from './DateSelector';
import { isCarWashBookingActive } from '../../shared/utils/time';
import { QuickBookingCell } from './QuickBookingCell';
import { openBoxForHourActionDispatcher } from '../../lib/api/staff-actions';

interface DayTimelineProps {
  bookings: Booking[];
  onBookingClick?: (booking: Booking) => void;
  onCreateBooking?: (hour: number, boxNumber: number) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onNavigate?: (page: string) => void;
  quickBookings?: Booking[];
  onQuickBookingClick?: (booking: Booking) => void;
  onOpenHistory?: () => void;
  onOpenQuickHistory?: () => void;
  closedBoxes?: Map<number, number[]>;  // ✅ Изменено: Map с открытыми часами
  onToggleBox?: (boxNumber: number, adminId?: string) => void;
  onReloadClosedBoxes?: () => void;
  // ✅ Новые пропсы для онлайн-записи
  userRole?: 'admin' | 'client';
  currentClientId?: string;
  adminId?: string;  // ✅ ID админа для временного открытия бокса
  // ✅ NEW: ID организаций, где клиент является водителем
  driverOrganizationIds?: string[];
}

export const DayTimeline: React.FC<DayTimelineProps> = ({
  bookings,
  onBookingClick,
  onCreateBooking,
  selectedDate,
  onDateChange,
  onNavigate,
  quickBookings = [],
  onQuickBookingClick,
  onOpenHistory,
  onOpenQuickHistory,
  closedBoxes = new Map(),
  onToggleBox,
  onReloadClosedBoxes,
  // ✅ Новые пропсы
  userRole = 'admin',
  currentClientId,
  adminId,
  driverOrganizationIds = [],
}) => {
  // Автообновление времени каждую минуту (гибридная логика)
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Каждую минуту

    return () => clearInterval(interval);
  }, []);
  
  // Фильтруем только записи кроме отмененных (ГОТОВЫЕ остаются в расписании)
  const activeBookings = bookings.filter((booking) => {
    const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
    const matchesDate = selectedDate ? booking.booking_date === selectedDate : true;
    const isNotQuickBooking = !booking.is_quick_booking; // Исключаем быстрые заказы
    return isNotCancelled && matchesDate && isNotQuickBooking;
  });

  // ✅ Фильтрация для клиента: чужие записи показываем как "Занято"
  const displayBookings = React.useMemo(() => {
    if (userRole === 'client' && currentClientId) {
      return activeBookings.map(booking => {
        // ✅ Проверяем, является ли запись своей (личной или организационной)
        const isPersonalBooking = booking.client_id === currentClientId;
        const isOrgBooking = booking.is_org &&
                             booking.organization_id &&
                             driverOrganizationIds.includes(booking.organization_id);
        
        // Если это НЕ его запись - скрыть детали
        if (!isPersonalBooking && !isOrgBooking) {
          return {
            ...booking,
            client_name: 'Занято',
            phone: '',
            plate_number: '',
            car_model: '',
            services: [],
            price: 0
          };
        }
        return booking;
      });
    }
    return activeBookings;
  }, [activeBookings, userRole, currentClientId, driverOrganizationIds]);

  // Часы работы с 8 до 18
  const hours = Array.from({ length: 11 }, (_, i) => i + 8);

  // Получаем текущий час для выделения
  const currentHour = currentTime.getHours();

  // Получаем запись для конкретного часа и бокса
  const getBookingForHourAndBox = (hour: number, boxNumber: number): Booking | null => {
    return displayBookings.find((booking) => {
      const bookingHour = parseInt(booking.start_time?.split(':')[0] || '0');
      return bookingHour === hour && booking.box_number === boxNumber;
    }) || null;
  };

  // ✅ Определяем текст для отображения в блоке (для клиента)
  // Возвращает строку статуса для отображения внутри цветного блока.
  // Возвращает 'Занято' для занятых (не своих) слотов и короткий статус
  // (например, «Ожидает», «Готово», «В работе») для собственных.
  // Возвращает '' если статус неизвестен — тогда рендерим car_model/plate.
  const getBookingDisplayText = (booking: Booking): string => {
    if (userRole === 'client') {
      // Не-своя запись → показываем просто «Занято», без статуса (избегаем утечки
      // чужой бизнес-информации через текст статуса в публичном таймлайне).
      if (booking.client_name === 'Занято') {
        return 'Занято';
      }
      // Косметика: на клиентском таймлайне статус «ОЖИДАЕТ» не показываем —
      // рендерим только car_model/plate_number как у админа. Чужие записи
      // остаются «Занято» (см. выше). Фоллбэк: пусто.
      return '';
    }
    // Админ/владелец: status показывается из booking_status_color, текст в отдельном badge.
    return '';
  };

  // ✅ Проверяем, закрыт ли бокс на конкретный час
  const isBoxClosedForHour = (boxNumber: number, hour: number): boolean => {
    const openHours = closedBoxes.get(boxNumber);
    if (!openHours) return false; // Бокс открыт

    // Проверяем, есть ли этот час в open_hours
    return !openHours.includes(hour);
  };

  // ✅ Проверяем, полностью ли открыт бокс (все рабочие часы открыты)
  const isBoxFullyOpen = (boxNumber: number): boolean => {
    const openHours = closedBoxes.get(boxNumber);
    if (!openHours) return true; // Бокс полностью открыт (нет записи в closed_boxes)

    // Рабочие часы: 8-18 (11 часов)
    const allWorkingHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

    // Проверяем, все ли рабочие часы открыты
    return allWorkingHours.every(hour => openHours.includes(hour));
  };

  // Определяем цвет статуса записи (без автоматического переключения)
  const getStatusColor = (booking: Booking): string => {
    // Косметика: на клиентском таймлайне «Занято» (redacted чужой слот)
    // рендерим серым (bg-gray-300). Свои записи клиента остаются по status
    // ниже — оранжевый для ОЖИДАЕТ и т.д. Админ/owner эту ветку не
    // используют: для них весь DayTimeline раскрашен по booking.status.
    if (userRole === 'client' && booking.client_name === 'Занято') {
      return 'bg-gray-300';
    }
    switch (booking.status) {
      case 'В РАБОТЕ':
        return 'bg-green-400'; // В РАБОТЕ = зеленый
      case 'ОЖИДАЕТ':
        return 'bg-orange-400'; // ОЖИДАЕТ = оранжевый
      case 'ГОТОВО':
        return 'bg-blue-400'; // ГОТОВО = синий
      case 'ОТМЕНЕНО':
        return 'bg-gray-300'; // ОТМЕНЕНО = серый
      default:
        return 'bg-orange-400';
    }
  };

  return (
    <div>
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
      <Card>
        <CardContent className="p-3">
          <div className="space-y-1">
            {/* Заголовки боксов */}
            <div className="flex items-center gap-1 px-2">
              <div className="min-w-[50px]"></div>
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-500 font-medium flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  Бокс 1
                  {/* ✅ Кнопки закрытия боксов - только для админа */}
                  {userRole === 'admin' && (
                    <button
                      onClick={() => onToggleBox?.(1, adminId)}
                      className="cursor-pointer hover:opacity-70 transition-opacity"
                      title={isBoxFullyOpen(1) ? 'Закрыть бокс' : 'Открыть бокс'}
                    >
                      {isBoxFullyOpen(1) ? (
                        <LockOpen className="w-3 h-3 text-green-500" />
                      ) : (
                        <Lock className="w-3 h-3 text-red-500" />
                      )}
                    </button>
                  )}
                </span>
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-500 font-medium flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  Бокс 2
                  {userRole === 'admin' && (
                    <button
                      onClick={() => onToggleBox?.(2, adminId)}
                      className="cursor-pointer hover:opacity-70 transition-opacity"
                      title={isBoxFullyOpen(2) ? 'Закрыть бокс' : 'Открыть бокс'}
                    >
                      {isBoxFullyOpen(2) ? (
                        <LockOpen className="w-3 h-3 text-green-500" />
                      ) : (
                        <Lock className="w-3 h-3 text-red-500" />
                      )}
                    </button>
                  )}
                </span>
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-500 font-medium flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  Бокс 3
                  {userRole === 'admin' && (
                    <button
                      onClick={() => onToggleBox?.(3)}
                      className="cursor-pointer hover:opacity-70 transition-opacity"
                      title={isBoxClosedForHour(3, currentHour) ? 'Открыть бокс' : 'Закрыть бокс'}
                    >
                      {isBoxClosedForHour(3, currentHour) ? (
                        <Lock className="w-3 h-3 text-red-500" />
                      ) : (
                        <LockOpen className="w-3 h-3 text-green-500" />
                      )}
                    </button>
                  )}
                </span>
              </div>
            </div>
            {hours.map((hour) => {
              const isCurrentHour = hour === currentHour;
              const box1Booking = getBookingForHourAndBox(hour, 1);
              const box2Booking = getBookingForHourAndBox(hour, 2);
              const box3Booking = getBookingForHourAndBox(hour, 3);

              return (
                <div
                  key={hour}
                  className={`flex items-center gap-1 py-1 px-2 rounded ${
                    isCurrentHour ? 'bg-primary/5' : ''
                  }`}
                >
                  {/* Час */}
                  <div
                    className={`text-xs font-semibold text-center py-1 px-2 rounded min-w-[50px] ${
                      isCurrentHour
                        ? 'bg-primary text-white'
                        : 'text-gray-600'
                    }`}
                  >
                    {hour}:00
                  </div>

                   {/* Бокс 1 */}
                   <div
                     className={`flex-1 h-10 rounded-md border-2 flex items-center justify-center relative ${
                       isBoxClosedForHour(1, hour) && userRole !== 'admin' ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'
                     } transition-transform`}
                      onClick={() => {
                        console.log('[DayTimeline] Клик на бокс 1, час:', hour, 'userRole:', userRole, 'adminId:', adminId, 'isBoxClosed:', isBoxClosedForHour(1, hour));

                        // ✅ Если бокс закрыт и админ кликает - открываем на этот час
                        if (isBoxClosedForHour(1, hour) && userRole === 'admin' && adminId && selectedDate) {
                          console.log('[DayTimeline] Открываем бокс 1 на час:', hour);
                          openBoxForHourActionDispatcher(1, selectedDate, hour, adminId)
                            .then(() => {
                              console.log('[DayTimeline] Бокс открыт, перезагружаем');
                              // Перезагружаем закрытые боксы
                              onReloadClosedBoxes?.();
                            })
                            .catch(error => {
                              console.error('[DayTimeline] Ошибка открытия бокса:', error);
                            });
                          return;
                        }

                        // Проверяем что бокс не закрыт на этот час
                        if (isBoxClosedForHour(1, hour)) return;

                        // ✅ Клиенты могут открывать только свои заказы
                        if (userRole === 'client') {
                          if (box1Booking) {
                            onBookingClick?.(box1Booking);
                            return;
                          }
                          onCreateBooking?.(hour, 1);
                          return;
                        }

                        // ✅ Админ и владелец могут открывать детали любого заказа
                        if (box1Booking) {
                          onBookingClick?.(box1Booking);
                          return;
                        }

                        // Создаем запись
                        onCreateBooking?.(hour, 1);
                      }}
                  >
                    {box1Booking ? (
                      <div
                        className={`w-full h-full rounded-md ${getStatusColor(
                           box1Booking
                         )} flex items-center justify-center p-1 ${isBoxClosedForHour(1, hour) ? 'blur-sm' : ''}`}
                         title={`${box1Booking.client_name} - ${box1Booking.car_model}`}
                      >
                        <div className="text-black text-center">
                          {getBookingDisplayText(box1Booking) ? (
                            <>
                              <div className="text-[10px] font-semibold leading-tight truncate max-w-full">
                                {getBookingDisplayText(box1Booking)}
                              </div>
                              {/* Для собственной записи показываем марку+номер под статусом,
                                  если они есть в payload (не урезаны redacted-слоем). */}
                              {String(box1Booking.car_model || '').slice(0, 8) ? (
                                <div className="text-[8px] opacity-80 leading-tight truncate max-w-full">
                                  {String(box1Booking.car_model || '').slice(0, 8)}
                                  {box1Booking.plate_number ? ` · ${box1Booking.plate_number}` : ''}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="text-[9px] font-semibold leading-tight truncate max-w-full">
                                {String(box1Booking.car_model || '').slice(0, 8)}
                              </div>
                              <div className="text-[8px] opacity-80 truncate max-w-full">
                                {box1Booking.plate_number || ''}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                     ) : (
                       <div className={`w-full h-full rounded-md border-2 border-dashed border-gray-200 hover:border-primary/50 flex items-center justify-center ${isBoxClosedForHour(1, hour) ? 'blur-sm' : ''}`}>
                         <Plus className="w-4 h-4 text-gray-300" />
                       </div>
                     )}
                     {isBoxClosedForHour(1, hour) && (
                       <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none">
                         <Lock className="w-5 h-5 text-blue-600" />
                       </div>
                     )}
                  </div>

                   {/* Бокс 2 */}
                   <div
                     className={`flex-1 h-10 rounded-md border-2 flex items-center justify-center relative ${
                       isBoxClosedForHour(2, hour) && userRole !== 'admin' ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'
                     } transition-transform`}
                     onClick={() => {
                       // ✅ Если бокс закрыт и админ кликает - открываем на этот час
                       if (isBoxClosedForHour(2, hour) && userRole === 'admin' && adminId && selectedDate) {
                         openBoxForHourActionDispatcher(2, selectedDate, hour, adminId)
                           .then(() => {
                             // Перезагружаем закрытые боксы
                             onReloadClosedBoxes?.();
                           })
                           .catch(error => {
                             console.error('[DayTimeline] Ошибка открытия бокса:', error);
                           });
                         return;
                       }

                       // Проверяем что бокс не закрыт на этот час
                       if (isBoxClosedForHour(2, hour)) return;

                       // ✅ Клиенты могут открывать только свои заказы
                       if (userRole === 'client') {
                         if (box2Booking) {
                           onBookingClick?.(box2Booking);
                           return;
                         }
                         onCreateBooking?.(hour, 2);
                         return;
                       }

                       // ✅ Админ и владелец могут открывать детали любого заказа
                       if (box2Booking) {
                         onBookingClick?.(box2Booking);
                         return;
                       }

                       // Создаем запись
                       onCreateBooking?.(hour, 2);
                     }}
                  >
{box2Booking ? (
                       <div
                         className={`w-full h-full rounded-md ${getStatusColor(
                           box2Booking
                         )} flex items-center justify-center p-1 ${isBoxClosedForHour(2, hour) ? 'blur-sm' : ''}`}
                         title={`${box2Booking.client_name} - ${box2Booking.car_model}`}
                      >
                        <div className="text-black text-center">
                          {getBookingDisplayText(box2Booking) ? (
                            <>
                              <div className="text-[10px] font-semibold leading-tight truncate max-w-full">
                                {getBookingDisplayText(box2Booking)}
                              </div>
                              {String(box2Booking.car_model || '').slice(0, 8) ? (
                                <div className="text-[8px] opacity-80 leading-tight truncate max-w-full">
                                  {String(box2Booking.car_model || '').slice(0, 8)}
                                  {box2Booking.plate_number ? ` · ${box2Booking.plate_number}` : ''}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="text-[9px] font-semibold leading-tight truncate max-w-full">
                                {String(box2Booking.car_model || '').slice(0, 8)}
                              </div>
                              <div className="text-[8px] opacity-80 truncate max-w-full">
                                {box2Booking.plate_number || ''}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                     ) : (
                       <div className={`w-full h-full rounded-md border-2 border-dashed border-gray-200 hover:border-primary/50 flex items-center justify-center ${isBoxClosedForHour(2, hour) ? 'blur-sm' : ''}`}>
                         <Plus className="w-4 h-4 text-gray-300" />
                       </div>
                     )}
                     {isBoxClosedForHour(2, hour) && (
                       <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none">
                         <Lock className="w-5 h-5 text-blue-600" />
                       </div>
                     )}
                  </div>

                   {/* Бокс 3 */}
                   <div
                     className={`flex-1 h-10 rounded-md border-2 flex items-center justify-center relative ${
                       isBoxClosedForHour(3, hour) && userRole !== 'admin' ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'
                     } transition-transform`}
                     onClick={() => {
                       // ✅ Если бокс закрыт и админ кликает - открываем на этот час
                       if (isBoxClosedForHour(3, hour) && userRole === 'admin' && adminId && selectedDate) {
                         openBoxForHourActionDispatcher(3, selectedDate, hour, adminId)
                           .then(() => {
                             // Перезагружаем закрытые боксы
                             onReloadClosedBoxes?.();
                           })
                           .catch(error => {
                             console.error('[DayTimeline] Ошибка открытия бокса:', error);
                           });
                         return;
                       }

                       // Проверяем что бокс не закрыт на этот час
                       if (isBoxClosedForHour(3, hour)) return;

                       // ✅ Клиенты могут открывать только свои заказы
                       if (userRole === 'client') {
                         if (box3Booking) {
                           onBookingClick?.(box3Booking);
                           return;
                         }
                         onCreateBooking?.(hour, 3);
                         return;
                       }

                       // ✅ Админ и владелец могут открывать детали любого заказа
                       if (box3Booking) {
                         onBookingClick?.(box3Booking);
                         return;
                       }

                       // Создаем запись
                       onCreateBooking?.(hour, 3);
                     }}
                  >
{box3Booking ? (
                       <div
                         className={`w-full h-full rounded-md ${getStatusColor(
                           box3Booking
                         )} flex items-center justify-center p-1 ${isBoxClosedForHour(3, hour) ? 'blur-sm' : ''}`}
                         title={`${box3Booking.client_name} - ${box3Booking.car_model}`}
                      >
                        <div className="text-black text-center">
                          {getBookingDisplayText(box3Booking) ? (
                            <>
                              <div className="text-[10px] font-semibold leading-tight truncate max-w-full">
                                {getBookingDisplayText(box3Booking)}
                              </div>
                              {String(box3Booking.car_model || '').slice(0, 8) ? (
                                <div className="text-[8px] opacity-80 leading-tight truncate max-w-full">
                                  {String(box3Booking.car_model || '').slice(0, 8)}
                                  {box3Booking.plate_number ? ` · ${box3Booking.plate_number}` : ''}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="text-[9px] font-semibold leading-tight truncate max-w-full">
                                {String(box3Booking.car_model || '').slice(0, 8)}
                              </div>
                              <div className="text-[8px] opacity-80 truncate max-w-full">
                                {box3Booking.plate_number || ''}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                     ) : (
                       <div className={`w-full h-full rounded-md border-2 border-dashed border-gray-200 hover:border-primary/50 flex items-center justify-center ${isBoxClosedForHour(3, hour) ? 'blur-sm' : ''}`}>
                         <Plus className="w-4 h-4 text-gray-300" />
                       </div>
                     )}
                     {isBoxClosedForHour(3, hour) && (
                       <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none">
                         <Lock className="w-5 h-5 text-blue-600" />
                       </div>
                     )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ✅ Легенда только для админа */}
          {userRole === 'admin' && (
            <div className="flex gap-3 mt-3 pt-2 border-t text-xs text-gray-500 flex-wrap justify-center">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-400" />
                <span>Ожидает</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-400" />
                <span>В работе</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-400" />
                <span>Готово</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Разделитель между расписанием и быстрым заказом */}
      <div className="h-px bg-gray-200 w-full my-6"></div>

      {/* ✅ Окошко быстрого заказа (30 минут) - только для админа */}
      {userRole === 'admin' && onNavigate && (
        <QuickBookingCell
          onClick={() => onNavigate('quick-booking-wizard')}
          quickBookings={quickBookings}
          onQuickBookingClick={onQuickBookingClick}
          onQuickHistoryClick={onOpenQuickHistory}
        />
      )}
    </div>
  );
};
