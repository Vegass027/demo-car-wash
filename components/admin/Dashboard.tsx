import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Clock, Plus, Car, User, Banknote, Play, Sun, ChevronDown, LogOut } from 'lucide-react';
import { PostStatus, Booking, Worker, CarType } from '../../types';
import { cn } from '../../lib/utils';
import { DayTimeline } from './DayTimeline';
import { BookingDetailModal } from './BookingsList';
import { OrdersHistoryModal } from './OrdersHistoryModal';
import { QuickOrdersHistoryModal } from './QuickOrdersHistoryModal';
import { formatDate } from '../../shared/utils/date';
import { BookingWizardData } from './BookingWizard';
import { BookingWizard } from './BookingWizard';

interface DashboardProps {
  onNewBooking: (hour?: number, boxNumber?: number, date?: string) => void;
  onNavigate: (page: string) => void;
  onAssignWorker: (bookingId: string) => void;
  onCancelBooking: (bookingId: string) => void;
  onChangePaymentMethod: (bookingId: string) => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAddService?: (bookingId: string, serviceIds: string[], discount: number) => void;
  onRemoveService?: (bookingId: string, serviceId: string) => void;
  onRemoveDiscount?: (bookingId: string) => void;
  onUpdateCarType?: (bookingId: string, carType: CarType) => void;  // ✅ Добавлено
  mockPosts: any[];
  bookings: Booking[];
  workers?: Worker[];
  services?: any[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  quickBookings?: Booking[];
  onQuickBooking?: (data: BookingWizardData) => void;
  closedBoxes?: Map<number, number[]>;
  onToggleBox?: (boxNumber: number, adminId?: string) => void;
  onReloadClosedBoxes?: () => void;
  bookingsLoading?: boolean;
  adminId?: string;  // ✅ Добавлено
  onLogout?: () => void;  // ✅ Добавлено
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNewBooking,
  onNavigate,
  onAssignWorker,
  onCancelBooking,
  onChangePaymentMethod,
  onMarkAsReady,
  onStartWork,
  onMarkAsPaid,
  onAddService,
  onRemoveService,
  onRemoveDiscount,
  onUpdateCarType,
  mockPosts,
  bookings,
  workers = [],
  services = [],
  selectedDate = formatDate(new Date()),
  onDateChange,
  quickBookings = [],
  onQuickBooking,
  closedBoxes = new Map(),
  onToggleBox,
  onReloadClosedBoxes,
  bookingsLoading = false,
  adminId,
  onLogout,
}) => {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQuickHistoryOpen, setIsQuickHistoryOpen] = useState(false);

  // Авто-переключение selectedDate в 00:00 на новый день
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      // Если 00:00 - переключаемся на сегодняшний день
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        const today = formatDate(now);
        if (onDateChange && selectedDate !== today) {
          onDateChange(today);
        }
      }
    };

    // Проверяем каждую минуту
    const interval = setInterval(checkMidnight, 60000);
    return () => clearInterval(interval);
  }, [selectedDate, onDateChange]);

  // Находим актуальный booking из bookings prop по ID
  const selectedBooking = React.useMemo(() => {
    if (!selectedBookingId) return null;
    return bookings.find(b => b.id === selectedBookingId) || quickBookings.find(b => b.id === selectedBookingId) || null;
  }, [bookings, quickBookings, selectedBookingId]);
  
  // Фильтруем bookings по выбранной дате
  const filteredBookings = bookings.filter(b => b.booking_date === selectedDate);
  
  // Filter upcoming bookings (ОЖИДАЕТ status)
  const upcomingBookings = filteredBookings
    .filter(b => b.status === 'ОЖИДАЕТ')
    .slice(0, 3); // Show top 3

  // Helper function to get worker name by ID
  const getWorkerName = (workerId: string | undefined): string => {
    if (!workerId) return '';
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return '';

    // Если работает в паре - показывать "Пара"
    if (worker.working_mode === 'pair' && worker.partner_id) {
      const partner = workers.find(w => w.id === worker.partner_id);
      return partner ? `${worker.name} + ${partner.name}` : worker.name;
    }

    return worker.name;
  };

  return (
    <div className="space-y-6 pt-6 pb-20 pt-safe telegram-safe-area-top animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">Автомойка</h1>
          <div className="w-32 h-px bg-gray-300 mt-1"></div>
          <p className="text-sm text-gray-500">Сегодня: {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLogout}
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          title="Выйти"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      {/* Разделитель */}
      <div className="h-px bg-gray-200 w-full mb-4"></div>

      {/* Day Timeline */}
      <DayTimeline
        bookings={filteredBookings}
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        onBookingClick={(booking) => setSelectedBookingId(booking.id)}
        onCreateBooking={(hour, boxNumber) => {
          onNewBooking(hour, boxNumber, selectedDate);
        }}
        onNavigate={onNavigate}
        quickBookings={quickBookings}
        onQuickBookingClick={(booking) => setSelectedBookingId(booking.id)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenQuickHistory={() => setIsQuickHistoryOpen(true)}
        closedBoxes={closedBoxes}
        onToggleBox={onToggleBox}
        onReloadClosedBoxes={onReloadClosedBoxes}
        adminId={adminId}
      />


      {/* Booking Detail Modal */}
      <BookingDetailModal
        isOpen={selectedBooking !== null}
        onClose={() => setSelectedBookingId(null)}
        booking={selectedBooking}
        onAssignWorker={onAssignWorker}
        onChangePaymentMethod={onChangePaymentMethod}
        onCancelBooking={(bookingId) => {
          setSelectedBookingId(null);
          onCancelBooking(bookingId);
        }}
        onMarkAsReady={async (bookingId) => {
          await onMarkAsReady?.(bookingId);
        }}
        onStartWork={async (bookingId) => {
          await onStartWork?.(bookingId);
        }}
        onMarkAsPaid={async (bookingId) => {
          await onMarkAsPaid?.(bookingId);
        }}
        onAddService={(bookingId, serviceIds, discount) => {
          onAddService?.(bookingId, serviceIds, discount);
        }}
        workers={workers}
        services={services}
        onRemoveService={(bookingId, serviceId) => {
          onRemoveService?.(bookingId, serviceId);
        }}
        onRemoveDiscount={(bookingId) => {
          onRemoveDiscount?.(bookingId);
        }}
        onUpdateCarType={onUpdateCarType}
        disabled={bookingsLoading}
      />

      {/* Orders History Modal */}
      <OrdersHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        bookings={bookings}
        selectedDate={selectedDate}
        workers={workers}
        services={services}
      />

      {/* Quick Orders History Modal */}
      <QuickOrdersHistoryModal
        isOpen={isQuickHistoryOpen}
        onClose={() => setIsQuickHistoryOpen(false)}
        quickBookings={quickBookings}
        selectedDate={selectedDate}
        workers={workers}
        services={services}
      />
    </div>
  );
};
