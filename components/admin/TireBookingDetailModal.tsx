import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Clock, User, CarFront, Banknote, X, CreditCard, RefreshCw, Trash2, Bandage, Check, CheckCircle, ChevronRight, Plus, CircleX, Building2, Phone, FileSignature } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AddServiceModal } from './AddServiceModal';
import { SignatureViewModal } from './SignatureViewModal';
import type { TireBooking, TireServiceItem } from '../../lib/api/tire-bookings';
import { formatTimeWithoutSeconds, calculateEndTime, timeToMinutes } from '../../shared/utils/time';

export interface TireBookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: TireBooking | null;
  onChangePaymentMethod?: (bookingId: string) => void;
  onCancelBooking?: (bookingId: string) => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAddService?: (bookingId: string, services: Array<{ service_id: string; quantity: number }>) => void;
  onRemoveService?: (bookingId: string, serviceId: string) => void;
  onAssignTechnician?: (bookingId: string) => void;
  technicians?: any[];
  tireServices?: any[];
}

export const TireBookingDetailModal: React.FC<TireBookingDetailModalProps> = ({
  isOpen,
  onClose,
  booking,
  onChangePaymentMethod,
  onCancelBooking,
  onMarkAsReady,
  onStartWork,
  onMarkAsPaid,
  onAddService,
  onRemoveService,
  onAssignTechnician,
  technicians = [],
  tireServices = [],
}) => {
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isProcessingPaid, setIsProcessingPaid] = useState(false);
  const [isProcessingReady, setIsProcessingReady] = useState(false);

  // Сбрасываем состояния обработки когда booking меняется или статус становится ГОТОВО/ОТМЕНЕНО
  useEffect(() => {
    if (booking?.status === 'ГОТОВО' || booking?.status === 'ОТМЕНЕНО') {
      setIsProcessingReady(false);
      setIsProcessingPaid(false);
    }
  }, [booking?.id, booking?.status]);

  if (!booking) return null;

  // Вычисляем endTime из start_time и estimated_duration
  const startTime = formatTimeWithoutSeconds(booking.start_time);
  const endTime = calculateEndTime(startTime, booking.estimated_duration);

  const handleAddService = (services: Array<{ service_id: string; quantity: number }>) => {
    onAddService?.(booking.id, services);
    setIsAddServiceModalOpen(false);
  };

  const handleRemoveService = (serviceId: string) => {
    onRemoveService?.(booking.id, serviceId);
  };

  return (
    <Dialog key={booking.id} open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scroll-mobile">
        <div className="flex items-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Детали записи</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-gray-300">|</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-sm">
              {startTime} - {endTime}
            </Badge>
          </div>
        </div>

        <div className="mt-4">
          <TireBookingCard
            booking={booking}
            onChangePaymentMethod={() => onChangePaymentMethod?.(booking.id)}
            onCancel={() => onCancelBooking?.(booking.id)}
            onMarkAsReady={() => onMarkAsReady?.(booking.id)}
            onStartWork={() => onStartWork?.(booking.id)}
            onMarkAsPaid={() => onMarkAsPaid?.(booking.id)}
            onAddService={() => setIsAddServiceModalOpen(true)}
            onRemoveService={handleRemoveService}
            onAssignTechnician={() => onAssignTechnician?.(booking.id)}
            technicians={technicians}
            onOpenSignatureModal={() => setIsSignatureModalOpen(true)}
            isProcessingPaid={isProcessingPaid}
            isProcessingReady={isProcessingReady}
            onSetProcessingPaid={setIsProcessingPaid}
            onSetProcessingReady={setIsProcessingReady}
          />
        </div>
      </DialogContent>

      <AddServiceModal
        isOpen={isAddServiceModalOpen}
        onClose={() => setIsAddServiceModalOpen(false)}
        onAdd={handleAddService}
        existingServices={(booking.services as TireServiceItem[]).map(s => s.service_id)}
        services={tireServices}
      />

      <SignatureViewModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        signatureData={booking.signature_data || ''}
        driverName={booking.client_name || ''}
        obtainedAt={booking.signature_obtained_at || ''}
      />
    </Dialog>
  );
};

interface TireBookingCardProps {
  booking: TireBooking;
  onChangePaymentMethod: () => void;
  onCancel: () => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAddService?: () => void;
  onRemoveService?: (serviceId: string) => void;
  onAssignTechnician?: () => void;
  technicians?: any[];
  onOpenSignatureModal?: () => void;
  isProcessingPaid?: boolean;
  isProcessingReady?: boolean;
  onSetProcessingPaid?: (value: boolean) => void;
  onSetProcessingReady?: (value: boolean) => void;
}

const TireBookingCard = ({ booking, onChangePaymentMethod, onCancel, onMarkAsReady, onStartWork, onMarkAsPaid, onAddService, onRemoveService, onAssignTechnician, technicians = [], onOpenSignatureModal, isProcessingPaid = false, isProcessingReady = false, onSetProcessingPaid, onSetProcessingReady }: TireBookingCardProps) => {
  // Вычисляем endTime из start_time и estimated_duration
  const startTime = formatTimeWithoutSeconds(booking.start_time);
  const endTime = calculateEndTime(startTime, booking.estimated_duration);

  // Гибридная логика: определяем активный статус
  const isActive = booking.status === 'В РАБОТЕ';

  // Проверка просрочки для формата snake_case
  const isExpired = (() => {
    // Исключаем завершенные статусы
    if (booking.status === 'ГОТОВО' || booking.status === 'ОТМЕНЕНО') return false;
    
    // Если статус уже 'ПРОСРОЧЕН' - считаем просроченным
    if (booking.status === 'ПРОСРОЧЕН') return true;
    
    // Для статусов 'ОЖИДАЕТ' и 'В РАБОТЕ' проверяем по времени
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (booking.booking_date !== today) return false;
    
    const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();
    const endMinutesTotal = timeToMinutes(endTime);
    
    return currentMinutesTotal > endMinutesTotal;
  })();

  const displayStatus = isActive ? 'В РАБОТЕ' : (isExpired ? 'ПРОСРОЧЕН' : booking.status);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'В РАБОТЕ': return 'bg-green-100 text-green-800 border-green-200';
      case 'ОЖИДАЕТ': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ГОТОВО': return 'bg-green-100 text-green-800 border-green-200';
      case 'ОТМЕНЕНО': return 'bg-red-100 text-red-800 border-red-200';
      case 'ПРОСРОЧЕН': return 'bg-[#4F39F6]/10 text-[#4F39F6] border-[#4F39F6]/30';
      default: return 'bg-gray-100';
    }
  };

  return (
    <Card
      className={cn("border-l-4 border-t-2 relative cursor-pointer hover:shadow-md transition-shadow",
        isActive ? 'border-l-green-500' :
        isExpired ? 'border-l-[#4F39F6]' :
        booking.status === 'ОЖИДАЕТ' ? 'border-l-yellow-500' :
        booking.status === 'ГОТОВО' ? 'border-l-green-500' :
        booking.status === 'ОТМЕНЕНО' ? 'border-l-red-500' : 'border-l-gray-300'
      )}
    >
      {/* Статус-бадж, встроенный в верхнюю границу */}
      <div className={cn(
        "absolute top-[-12px] right-6 px-3 py-1 rounded-md text-xs font-semibold shadow-sm z-10",
        isActive ? 'bg-green-500 text-white' :
        isExpired ? 'bg-[#4F39F6] text-white' :
        booking.status === 'ОЖИДАЕТ' ? 'bg-yellow-500 text-white' :
        booking.status === 'ГОТОВО' ? 'bg-green-500 text-white' :
        booking.status === 'ОТМЕНЕНО' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
      )}>
        {displayStatus}
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
            <span className="font-semibold">{booking.phone || 'Не указан'}</span>
          </div>
          <div className="border-t border-gray-200"></div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center">
              <CarFront className="w-4 h-4 flex-shrink-0 text-muted-foreground mr-2" />
              <div>{booking.car_model}</div>
            </div>
            <div className="flex items-center">
              <Bandage className="w-4 h-4 flex-shrink-0 text-muted-foreground mr-2" />
              <Badge variant="outline" className="text-xs uppercase">{booking.plate_number}</Badge>
            </div>
          </div>
        </div>

        {/* Вертикальный разделитель */}
        <div className="border-l border-gray-200"></div>

        {/* Правая колонка */}
        <div className="space-y-4 text-sm flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <span className="font-semibold">
              Мастер: {booking.worker_name || "Не назначен"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <Badge variant="outline" className="text-xs">{booking.payment_method || 'Не указан'}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <Badge variant="outline" className="text-sm uppercase">{booking.total_price} ₽</Badge>
          </div>
          {booking.is_paid && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-600" />
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Оплачено</Badge>
            </div>
          )}
          {booking.signature_data && (
            <div className="flex items-center gap-2">
              <FileSignature className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSignatureModal?.();
                }}
              >
                <span>Подпись</span>
                <Check className="w-3 h-3 text-green-600" />
              </Button>
            </div>
          )}
        </div>
      </div>

          <div className="border-t pt-4">
            <div className="flex gap-2 flex-wrap justify-center">
              <Button size="sm" variant="outline" className="gap-1" onClick={(e) => { e.stopPropagation(); onChangePaymentMethod(); }}>
                <RefreshCw className="w-3.5 h-3.5" />
                Оплата
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={(e) => { e.stopPropagation(); onAssignTechnician?.(); }}>
                <User className="w-3.5 h-3.5" />
                Мастер
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
                <CircleX className="w-3.5 h-3.5" />
                Отмена
              </Button>
            </div>
          </div>

          {booking.services && booking.services.length > 0 && (
            <div className="border-t pt-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">Услуги:</div>
              <div className="space-y-2">
                {booking.services.map(service => (
                  <div key={service.service_id} className="flex justify-between items-center text-sm group">
                    <div className="flex items-center gap-2 flex-1">
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700">{service.name} × {service.quantity}</span>
                      {service.comment && <span className="text-xs text-orange-500">({service.comment})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{service.total} ₽</span>
                      <span className="text-gray-300">|</span>
                      {(booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveService?.(service.service_id);
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t"></div>

          {(booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ') && (
            <div className="pt-2 space-y-2">
              <Button
                size="sm"
                className="w-full bg-black hover:bg-gray-800 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddService?.();
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Добавить услугу
              </Button>
            </div>
          )}

          <div className="border-t"></div>

          {/* Уведомление если мастер не выбран */}
          {!booking.worker_id && (
            <div className="text-sm text-gray-500 bg-gray-100 rounded-lg p-2 text-center">
              Выберите мастера
            </div>
          )}

          {booking.status === 'ОЖИДАЕТ' && onStartWork && (
            <div className="pt-0 space-y-2">
              <Button
                size="sm"
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                disabled={!booking.worker_id}
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

          {/* Уведомление если не оплачено */}
          {booking.worker_id && !booking.is_paid && (
            <div className="text-sm text-gray-500 bg-gray-100 rounded-lg p-2 text-center">
              Отметьте как оплаченный
            </div>
          )}

          {(booking.status === 'В РАБОТЕ' || booking.status === 'ПРОСРОЧЕН') && !booking.is_paid && onMarkAsPaid && (
            <div className="pt-0 space-y-2">
              <Button
                size="sm"
                className={cn(
                  "w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold",
                  (!booking.worker_id || isProcessingPaid) && "opacity-50 cursor-not-allowed"
                )}
                disabled={!booking.worker_id || isProcessingPaid}
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

              <Button
                size="sm"
                className={cn(
                  "w-full bg-green-500 hover:bg-green-600 text-black font-semibold",
                  (!booking.worker_id || !booking.is_paid || isProcessingReady) && "opacity-50 cursor-not-allowed"
                )}
                disabled={!booking.worker_id || !booking.is_paid || isProcessingReady}
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
    </Card>
  );
};
