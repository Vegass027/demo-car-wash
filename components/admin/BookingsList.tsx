import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Booking, Worker, CarType } from '../../types';
import { Clock, User, CarFront, Banknote, X, CreditCard, UserPlus, RefreshCw, Trash2, Bandage, Check, ChevronRight, Plus, Phone, CircleX, Users, Building2, Pen, CheckCircle, AlertCircle, Tag } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AddServiceModalCarWash } from './AddServiceModalCarWash';
import { SignatureViewModal } from './SignatureViewModal';
import { getServicePrice } from '../../lib/api/services';
import { updateBookingCarType } from '../../lib/api/bookings';
import { formatPhoneForDisplay } from '../../shared/utils/phone';

const ANTIFREEZE_SERVICE_IDS = ['antifreeze-org', 'antifreeze-umc'];

// Helper function to get worker name by ID (moved outside to be accessible by BookingCard)
const getWorkerName = (workerId: string | undefined, worker_name: string | undefined, workers: any[] = []): string => {
  // Сначала проверяем worker_name из booking
  if (worker_name) return worker_name;

  if (!workerId) return '';
  const worker = workers.find(w => w.id === workerId);
  if (!worker) return '';

  // Если работает в паре - показывать "Пара"
  if (worker.working_mode === 'pair' && worker.partner_id) {
    const partner = workers.find(w => w.id === worker.partner_id);
    return partner ? `${worker.full_name} + ${partner.full_name}` : worker.full_name;
  }

  return worker.full_name;
};

// Helper function to get worker display name (short or full)
const getWorkerDisplayName = (
  workerId: string | undefined,
  worker_name: string | undefined,
  worker_id_2: string | undefined,
  worker_name_2: string | undefined,
  workers: any[] = [],
  showPairDetails: boolean = false
): string => {
  // Если есть второй мойщик - это пара
  if (worker_id_2 && worker_name_2) {
    if (showPairDetails) {
      return `${worker_name || ''} + ${worker_name_2}`;
    }
    return 'Пара';
  }

  // Если есть только один мойщик
  if (worker_name) {
    return worker_name;
  }

  if (!workerId) return '';
  const worker = workers.find(w => w.id === workerId);
  if (!worker) return '';

  // Если работает в паре
  if (worker.working_mode === 'pair' && worker.partner_id) {
    if (showPairDetails) {
      const partner = workers.find(w => w.id === worker.partner_id);
      return partner ? `${worker.full_name} + ${partner.full_name}` : worker.full_name;
    }
    return 'Пара';
  }

  return worker.full_name;
};

// Функция для форматирования длительности работы
const formatWorkDuration = (startTime: string | undefined, endTime: string | undefined): string => {
  if (!startTime || !endTime) return '';
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins === 0) return '0 минут';
  if (diffMins === 1) return '1 минута';
  if (diffMins < 60) {
    // Правильное склонение для минут: 2-4 минуты, 5-20 минут
    const lastDigit = diffMins % 10;
    const lastTwoDigits = diffMins % 100;
    
    // Исключения: 11-14 минут
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return `${diffMins} минут`;
    }
    
    if (lastDigit === 1) return `${diffMins} минута`;
    if (lastDigit >= 2 && lastDigit <= 4) return `${diffMins} минуты`;
    return `${diffMins} минут`;
  }

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (mins === 0) return `${hours} ч`;
  if (mins === 1) return `${hours} ч 1 минута`;
  if (mins >= 2 && mins <= 4) return `${hours} ч ${mins} минуты`;
  return `${hours} ч ${mins} мин`;
};

interface BookingsListProps {
  bookings: Booking[];
  onAssignWorker: (bookingId: string) => void;
  onCancelBooking: (bookingId: string) => void;
  onChangePaymentMethod: (bookingId: string) => void;
  onNavigate: (view: string) => void;
  initialTab?: string;
  workers?: any[];
  services?: any[];
}

export const BookingsList: React.FC<BookingsListProps> = ({ bookings, onAssignWorker, onCancelBooking, onChangePaymentMethod, onNavigate, initialTab = 'waiting', workers = [], services = [] }) => {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  
  // Сортируем bookings по времени
  const sortedBookings = React.useMemo(() => {
    return [...bookings].sort((a, b) => {
      const hourA = parseInt(a.start_time?.split(':')[0] || '0');
      const hourB = parseInt(b.start_time?.split(':')[0] || '0');
      return hourA - hourB;
    });
  }, [bookings]);
  
  // Находим актуальный booking из bookings prop по ID
  const selectedBooking = React.useMemo(() => {
    if (!selectedBookingId) return null;
    return bookings.find(b => b.id === selectedBookingId) || null;
  }, [bookings, selectedBookingId]);

  return (
    <div className="h-full flex flex-col pb-20 pt-safe telegram-safe-area-top animate-in fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Шиномонтаж</h2>
        <Button onClick={() => onNavigate('booking-wizard')}>+ Добавить</Button>
      </div>
 
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>Раздел шиномонтажа находится в разработке</p>
      </div>

      {/* Booking Detail Modal - используется в модальном окне деталей заказа на главной странице */}
      <BookingDetailModal
        isOpen={selectedBooking !== null}
        onClose={() => setSelectedBookingId(null)}
        booking={selectedBooking}
        onAssignWorker={onAssignWorker}
        onChangePaymentMethod={onChangePaymentMethod}
        services={services}
        onCancelBooking={(bookingId) => {
          setSelectedBookingId(null);
          onCancelBooking(bookingId);
        }}
      />
    </div>
  );
};

export interface BookingCardProps {
  booking: Booking;
  onAssign: () => void;
  onCancel: () => void;
  onChangePaymentMethod: () => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAddService?: () => void;
  onRemoveService?: (serviceId: string) => void;
  onRemoveDiscount?: () => void;
  onClick?: () => void;
  key?: string;
  workers?: any[];
  services?: any[];
  disabled?: boolean;
  calculatedPrice?: number; // Пересчитанная сумма чека
  tempCarType?: CarType; // Временный тип авто для расчета цен
  showCarTypeSelector?: boolean; // Показывать Select вместо Badge с ценой
  onUpdateCarType?: (carType: CarType) => void; // Обработчик изменения типа авто
  isProcessingPaid?: boolean;
  isProcessingReady?: boolean;
  onSetProcessingPaid?: (value: boolean) => void;
  onSetProcessingReady?: (value: boolean) => void;
}

export const BookingCard = ({ booking, onAssign, onCancel, onChangePaymentMethod, onMarkAsReady, onStartWork, onMarkAsPaid, onAddService, onRemoveService, onRemoveDiscount, onClick, workers = [], services = [], disabled = false, calculatedPrice, tempCarType, showCarTypeSelector = false, onUpdateCarType, isProcessingPaid = false, isProcessingReady = false, onSetProcessingPaid, onSetProcessingReady }: BookingCardProps) => {
    const [showPairDetails, setShowPairDetails] = useState(false);
    const [isSignatureViewOpen, setIsSignatureViewOpen] = useState(false);

    // Используем tempCarType если передан, иначе booking.car_type
    const currentCarType = tempCarType || (booking.car_type as CarType);
    // Используем calculatedPrice если передан, иначе booking.price
    // Вычитаем скидку из цены
    const currentPrice = calculatedPrice !== undefined
      ? calculatedPrice - (booking.discount || 0)
      : booking.price - (booking.discount || 0);

    // Функция для получения названия типа авто
    const getCarTypeLabel = (type: CarType): string => {
      switch (type) {
        case 'SEDAN': return 'Седан';
        case 'CROSSOVER': return 'Кроссовер';
        case 'JEEP': return 'Джип';
        case 'LARGE_SUV': return 'Большой джип';
        case 'MINIVAN': return 'Минивэн';
        default: return type;
      }
    };

    // Функция для расчета цены для конкретного типа авто
    const calculatePriceForType = (type: CarType): number => {
      const servicesPrice = (booking.services || []).reduce((sum, serviceId) => {
        // Ищем услугу по обоим полям: id (UUID) И service_id (строка)
        const service = services.find(s => s.id === serviceId || s.service_id === serviceId);
        if (!service) return sum;

        // Для незамерзающих услуг цена не зависит от типа авто
        const isAntifreeze = ANTIFREEZE_SERVICE_IDS.includes(service.service_id);
        const price = isAntifreeze
          ? Number(service.price_sedan)
          : getServicePrice(service, type);

        return sum + price;
      }, 0);
      // Не вычитаем скидку здесь, она вычитается в currentPrice
      return servicesPrice;
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'В РАБОТЕ': return 'bg-green-100 text-green-800 border-green-200';
            case 'ОЖИДАЕТ': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'ГОТОВО': return 'bg-green-100 text-green-800 border-green-200';
            case 'ОТМЕНЕНО': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100';
        }
    };

    const worker = workers.find(w => w.id === booking.worker_id);
    const isPair = booking.worker_id_2 && booking.worker_name_2;

    return (
        <Card
            className={cn("border-l-4 border-t-2 relative cursor-pointer hover:shadow-md transition-shadow",
                booking.status === 'В РАБОТЕ' ? 'border-l-green-500' :
                booking.status === 'ОЖИДАЕТ' ? 'border-l-yellow-500' :
                booking.status === 'ГОТОВО' ? 'border-l-green-500' :
                booking.status === 'ОТМЕНЕНО' ? 'border-l-red-500' : 'border-l-gray-300'
            )}
            onClick={onClick}
        >
            {/* Статус-бадж, встроенный в верхнюю границу */}
            <div className={cn(
                "absolute top-[-12px] right-6 px-3 py-1 rounded-md text-xs font-semibold shadow-sm z-10",
                booking.status === 'В РАБОТЕ' ? 'bg-green-500 text-white' :
                booking.status === 'ОЖИДАЕТ' ? 'bg-yellow-500 text-white' :
                booking.status === 'ГОТОВО' ? 'bg-green-500 text-white' :
                booking.status === 'ОТМЕНЕНО' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
            )}>
                {booking.status}
            </div>

            <CardContent className="p-6">
                <div className="space-y-4">
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                        {/* Левая колонка */}
                        <div className="space-y-3 text-sm">
                            {booking.is_org && (
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                    <span className="font-semibold">{booking.org_name || 'Не указана'}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                <span className="font-semibold">{booking.client_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                <span className="font-semibold">{booking.phone}</span>
                            </div>
                            <div className="border-t border-gray-200"></div>
                            <div className="flex flex-col gap-2 flex-1">
                                <div className="flex items-center">
                                    <CarFront className="w-4 h-4 flex-shrink-0 text-muted-foreground mr-2" />
                                    <div>{booking.car_model}</div>
                                </div>
                                <div className="flex items-center">
                                    <Bandage className="w-4 h-4 flex-shrink-0 text-muted-foreground mr-2" />
                                    <Badge variant="outline" className="text-xs uppercase">{booking.plate_number}</Badge>
                                </div>
                                {booking.status === 'ГОТОВО' && booking.work_start_time && booking.work_end_time && (
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-gray-600" />
                                        <Badge variant="outline" className="text-xs">{formatWorkDuration(booking.work_start_time, booking.work_end_time)}</Badge>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Вертикальный разделитель */}
                        <div className="border-l border-gray-200"></div>

                        {/* Правая колонка */}
                        <div className="space-y-4 text-sm flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                                {isPair ? (
                                    <Users className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                ) : (
                                    <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                )}
                                <span
                                    className="font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isPair) setShowPairDetails(!showPairDetails);
                                    }}
                                >
                                    Мойщик: {getWorkerDisplayName(booking.worker_id, booking.worker_name, booking.worker_id_2, booking.worker_name_2, workers, showPairDetails) || "Не назначен"}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                <Badge variant="outline" className="text-xs">{booking.payment_method || 'Не указан'}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Banknote className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                {showCarTypeSelector ? (
                                  <Select
                                    value={currentCarType}
                                    onValueChange={(val) => onUpdateCarType?.(val as CarType)}
                                  >
                                    <SelectTrigger className="w-fit h-10 text-xs">
                                      <SelectValue>
                                        <div className="flex flex-col">
                                          <span>{getCarTypeLabel(currentCarType)}</span>
                                          <span className="text-gray-500">{currentPrice} ₽</span>
                                        </div>
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="p-1 w-auto" align="start" alignOffset={-64}>
                                      {Object.values(CarType).map(type => {
                                        const typePrice = calculatePriceForType(type);
                                        return (
                                          <SelectItem key={type} value={type} className="py-1 h-auto text-xs">
                                            <div className="flex flex-col">
                                              <span>{getCarTypeLabel(type)}</span>
                                              <span className="text-gray-500">{typePrice} ₽</span>
                                            </div>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant="outline" className="text-sm uppercase">{currentPrice} ₽</Badge>
                                )}
                            </div>
                            {booking.is_paid && (
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-600" />
                                    <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Оплачено</Badge>
                                </div>
                            )}
                            {booking.is_org && (
                                <div className="flex items-center gap-2">
                                    {booking.signature_data ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-xs"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsSignatureViewOpen(true);
                                            }}
                                        >
                                            <Pen className="w-3 h-3" />
                                            Подпись
                                        </Button>
                                    ) : (
                                        <div className="flex items-center gap-1 text-xs text-orange-600">
                                            <AlertCircle className="w-3 h-3" />
                                            Нет подписи
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex gap-2 flex-wrap justify-center">
                            <Button size="sm" variant="outline" className="gap-1" disabled={disabled} onClick={(e) => { e.stopPropagation(); onChangePaymentMethod(); }}>
                                <RefreshCw className="w-3.5 h-3.5" />
                                Оплата
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1" disabled={disabled} onClick={onAssign}>
                                <RefreshCw className="w-3.5 h-3.5" />
                                Мойщик
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={disabled || booking.status === 'ГОТОВО'}
                                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                            >
                                <CircleX className="w-3.5 h-3.5" />
                                Отмена
                            </Button>
                        </div>
                    </div>

                    {(booking.services && booking.services.length > 0 || booking.discount > 0) && (
                        <div className="border-t pt-4">
                            <div className="text-sm font-semibold text-gray-700 mb-3">Услуги:</div>
                            <div className="space-y-2">
                                {/* Отображение скидки в самом верху */}
                                {booking.discount > 0 && (
                                    <div className="flex justify-between items-center text-sm group">
                                        <div className="flex items-center gap-2 flex-1">
                                            <Tag className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                            <span className="text-purple-600 font-medium">Скидка</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-purple-600 font-bold">-{booking.discount} ₽</span>
                                            <span className="text-gray-300">|</span>
                                            {(booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ') && (
                                                <button
                                                    disabled={disabled}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRemoveDiscount?.();
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {booking.services.map(serviceId => {
                                    // Ищем услугу по обоим полям: id (UUID) И service_id (строка)
                                    const service = services.find((s: any) => s.id === serviceId || s.service_id === serviceId);
                                    if (!service) return null;

                                    // Для незамерзающих услуг цена не зависит от типа авто
                                    const isAntifreeze = ANTIFREEZE_SERVICE_IDS.includes(service.service_id);
                                    const servicePrice = isAntifreeze
                                      ? Number(service.price_sedan)
                                      : getServicePrice(service, currentCarType);

                                    // ✅ Проверяем количество для незамерзающих жидкостей
                                    let quantity = 1;
                                    let displayPrice = servicePrice;

                                    if (isAntifreeze && booking.services_with_quantities && booking.services_with_quantities.length > 0) {
                                      const serviceWithQuantity = booking.services_with_quantities.find(
                                        (sq: any) => sq.service_id === serviceId
                                      );
                                      if (serviceWithQuantity) {
                                        quantity = serviceWithQuantity.quantity;
                                        displayPrice = serviceWithQuantity.total;
                                      }
                                    }

                                    return (
                                        <div key={service.id} className="flex justify-between items-center text-sm group">
                                            <div className="flex items-center gap-2 flex-1">
                                                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                <span className="text-gray-700">{service.name}</span>
                                                {quantity > 1 && (
                                                  <span className="text-gray-500">({quantity})</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500">+{displayPrice} ₽</span>
                                                <span className="text-gray-300">|</span>
                                                {(booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ') && (
                                                    <button
                                                        disabled={disabled}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onRemoveService?.(service.id);
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="border-t"></div>

                    {(booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ') && (
                        <div className="pt-2 space-y-2">
                            <Button
                                size="sm"
                                className="w-full bg-black hover:bg-gray-800 text-white"
                                disabled={disabled}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAddService?.();
                                }}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Добавить услугу | скидку
                            </Button>
                        </div>
                    )}

                    <div className="border-t"></div>

                    {booking.status === 'ОЖИДАЕТ' && onStartWork && (
                        <div className="pt-0 space-y-2">
                            <Button
                                size="sm"
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                                disabled={disabled}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStartWork(booking.id);
                                }}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                В работу
                            </Button>
                        </div>
                    )}

                    {/* Уведомление если мойщик не выбран */}
                    {!booking.worker_id && (
                        <div className="text-sm text-gray-500 bg-gray-100 rounded-lg p-2 text-center">
                            Выберите мойщика
                        </div>
                    )}

                    {booking.status === 'В РАБОТЕ' && !booking.is_paid && onMarkAsPaid && (
                        <div className="pt-0 space-y-2">
                            <Button
                                size="sm"
                                className={cn(
                                    "w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold",
                                    (disabled || !booking.worker_id || isProcessingPaid) && "opacity-50 cursor-not-allowed"
                                )}
                                disabled={disabled || !booking.worker_id || isProcessingPaid}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (isProcessingPaid) return;
                                    onSetProcessingPaid?.(true);
                                    try {
                                        await onMarkAsPaid(booking.id);
                                        onSetProcessingPaid?.(false);
                                    } catch (error) {
                                        onSetProcessingPaid?.(false);
                                    }
                                }}
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {isProcessingPaid ? 'Обработка...' : 'Оплачено'}
                            </Button>
                        </div>
                    )}

                    {booking.status !== 'ГОТОВО' && booking.status !== 'ОТМЕНЕНО' && (
                        <div className="pt-0 space-y-2">
 
                            {/* Уведомление если не оплачено */}
                            {booking.worker_id && !booking.is_paid && (
                                <div className="text-sm text-gray-500 bg-gray-100 rounded-lg p-2 text-center">
                                    Отметьте как оплаченный
                                </div>
                            )}
 
                            <Button
                                size="sm"
                                className={cn(
                                    "w-full bg-green-500 hover:bg-green-600 text-black font-semibold",
                                    (disabled || !booking.worker_id || !booking.is_paid || isProcessingReady) && "opacity-50 cursor-not-allowed"
                                )}
                                disabled={disabled || !booking.worker_id || !booking.is_paid || isProcessingReady}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (isProcessingReady) return;
                                    onSetProcessingReady?.(true);
                                    try {
                                        await onMarkAsReady?.(booking.id);
                                        onSetProcessingReady?.(false);
                                    } catch (error) {
                                        onSetProcessingReady?.(false);
                                    }
                                }}
                            >
                                <Check className="w-4 h-4 mr-2" />
                                {isProcessingReady ? 'Обработка...' : 'Готово'}
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>

            {/* Модальное окно просмотра подписи */}
            <SignatureViewModal
                isOpen={isSignatureViewOpen}
                onClose={() => setIsSignatureViewOpen(false)}
                signatureData={booking.signature_data || null}
                driverName={booking.client_name}
            />
        </Card>
    )
}

export interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onAssignWorker?: (bookingId: string) => void;
  onChangePaymentMethod?: (bookingId: string) => void;
  onCancelBooking?: (bookingId: string) => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAddService?: (bookingId: string, serviceIds: string[], discount: number) => void;
  onRemoveService?: (bookingId: string, serviceId: string) => void;
  onRemoveDiscount?: (bookingId: string) => void;
  onUpdateCarType?: (bookingId: string, carType: CarType) => void;
  workers?: Worker[];
  services?: any[];
  disabled?: boolean;
}

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  isOpen,
  onClose,
  booking,
  onAssignWorker,
  onChangePaymentMethod,
  onCancelBooking,
  onMarkAsReady,
  onStartWork,
  onMarkAsPaid,
  onAddService,
  onRemoveService,
  onRemoveDiscount,
  onUpdateCarType,
  workers = [],
  services = [],
  disabled = false,
}) => {
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [tempCarType, setTempCarType] = useState<CarType>(
    booking?.car_type as CarType || 'SEDAN'
  );
  const [isProcessingPaid, setIsProcessingPaid] = useState(false);
  const [isProcessingReady, setIsProcessingReady] = useState(false);

  // Сбрасываем tempCarType только при открытии нового заказа (по booking.id)
  useEffect(() => {
    if (booking) {
      setTempCarType(booking.car_type as CarType);
    }
  }, [booking?.id]);  // ✅ Только при смене ID заказа

  // Сбрасываем состояния обработки когда booking меняется или статус становится ГОТОВО/ОТМЕНЕНО
  useEffect(() => {
    if (booking?.status === 'ГОТОВО' || booking?.status === 'ОТМЕНЕНО') {
      setIsProcessingReady(false);
      setIsProcessingPaid(false);
    }
  }, [booking?.id, booking?.status]);

  // Функция для получения названия типа авто
  const getCarTypeLabel = (type: CarType): string => {
    switch (type) {
      case 'SEDAN': return 'Седан';
      case 'CROSSOVER': return 'Кроссовер';
      case 'JEEP': return 'Джип';
      case 'LARGE_SUV': return 'Большой джип';
      case 'MINIVAN': return 'Минивэн';
      default: return type;
    }
  };

  if (!booking) return null;

  // Пересчитываем сумму чека для выбранного типа авто
  const calculatedPrice = (booking.services || []).reduce((sum, serviceId) => {
    // Ищем услугу по обоим полям: id (UUID) И service_id (строка)
    const service = services.find(s => s.id === serviceId || s.service_id === serviceId);
    if (!service) return sum;

    // Для незамерзающих услуг цена не зависит от типа авто
    const isAntifreeze = ANTIFREEZE_SERVICE_IDS.includes(service.service_id);
    const price = isAntifreeze
      ? Number(service.price_sedan)
      : getServicePrice(service, tempCarType);

    return sum + price;
  }, 0);

  // Вычитаем скидку из финальной цены
  const finalPrice = calculatedPrice - (booking.discount || 0);

  // Вычисляем разницу если заказ уже оплачен
  const priceDifference = booking.is_paid
    ? calculatedPrice - booking.price
    : 0;

  const handleAddService = (serviceIds: string[], discount: number) => {
    onAddService?.(booking.id, serviceIds, discount);
    setIsAddServiceModalOpen(false);
  };

  const handleRemoveService = (serviceId: string) => {
    onRemoveService?.(booking.id, serviceId);
  };

  const handleRemoveDiscount = () => {
    onRemoveDiscount?.(booking.id);
  };

  return (
    <Dialog key={booking.id} open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scroll-mobile">
        <div className="flex items-center">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-bold">Детали записи</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-gray-300">|</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-xs md:text-sm">
              {(booking.start_time || 'Быстрый').split(':').slice(0, 2).join(':')} - {(booking.end_time || '').split(':').slice(0, 2).join(':')}
            </Badge>
          </div>
        </div>

        {/* Показать разницу если заказ оплачен и тип изменился */}
        {booking.is_paid && priceDifference !== 0 && (
          <div className={cn(
            "mt-3 p-2 rounded-lg flex items-center gap-2 text-sm",
            priceDifference > 0 ? "bg-orange-100 border border-orange-300 text-orange-800" : "bg-green-100 border border-green-300 text-green-800"
          )}>
            {priceDifference > 0 ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            <span className="font-semibold">
              {priceDifference > 0 ? 'Нужно доплатить:' : 'Переплата:'} {Math.abs(priceDifference)} ₽
            </span>
          </div>
        )}

        <div className="mt-4">
          <BookingCard
            booking={booking}
            onAssign={() => onAssignWorker?.(booking.id)}
            onChangePaymentMethod={() => onChangePaymentMethod?.(booking.id)}
            onCancel={() => onCancelBooking?.(booking.id)}
            onMarkAsReady={() => onMarkAsReady?.(booking.id)}
            onStartWork={() => onStartWork?.(booking.id)}
            onMarkAsPaid={() => onMarkAsPaid?.(booking.id)}
            onAddService={() => setIsAddServiceModalOpen(true)}
            onRemoveService={handleRemoveService}
            onRemoveDiscount={handleRemoveDiscount}
            workers={workers || []}
            services={services || []}
            disabled={disabled}
            calculatedPrice={calculatedPrice}
            tempCarType={tempCarType}
            showCarTypeSelector={true}
            onUpdateCarType={(carType) => {
              setTempCarType(carType);
              onUpdateCarType?.(booking.id, carType);
            }}
            isProcessingPaid={isProcessingPaid}
            isProcessingReady={isProcessingReady}
            onSetProcessingPaid={setIsProcessingPaid}
            onSetProcessingReady={setIsProcessingReady}
          />
        </div>
      </DialogContent>

      <AddServiceModalCarWash
        isOpen={isAddServiceModalOpen}
        onClose={() => setIsAddServiceModalOpen(false)}
        onAdd={handleAddService}
        existingServices={booking.services}
        services={services || []}
        carType={booking.car_type}
      />
    </Dialog>
  );
};
