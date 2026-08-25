import React from 'react';
import { TireBooking } from '../../lib/api/tire-bookings';
import { TireServicePage } from './TireServicePage';
import { TireService } from '../../lib/api/tire-services';

interface TireBookingsListProps {
  bookings: TireBooking[];
  onCancelBooking: (bookingId: string) => void;
  onChangePaymentMethod: (bookingId: string) => void;
  onAddService?: (bookingId: string, serviceId: string) => void;
  onRemoveService?: (bookingId: string, serviceId: string) => void;
  onMarkAsReady?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onMarkAsPaid?: (bookingId: string) => void;
  onAssignTechnician?: (bookingId: string) => void;
  onNavigate: (view: string) => void;
  initialTab?: string;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onCreateBooking: (booking: Omit<TireBooking, 'id' | 'status'>) => void;
  onNavigateToWizard?: (time: string, date: string) => void;
  isWorkingToday?: boolean;
  onToggleWorkingToday?: () => void;
  technicians?: any[];
  tireServices?: TireService[];
}

export const TireBookingsList: React.FC<TireBookingsListProps> = ({
  bookings,
  onCancelBooking,
  onChangePaymentMethod,
  onAddService,
  onRemoveService,
  onMarkAsReady,
  onStartWork,
  onMarkAsPaid,
  onAssignTechnician,
  onNavigate,
  initialTab = 'waiting',
  selectedDate,
  onDateChange,
  onCreateBooking,
  onNavigateToWizard,
  isWorkingToday = true,
  onToggleWorkingToday,
  technicians = [],
  tireServices = [],
}) => {
  const handleCreateBooking = (booking: Omit<TireBooking, 'id' | 'status'>) => {
    // ВЫЗЫВАЕМ onCreateBooking для сохранения в глобальное состояние
    onCreateBooking(booking);
  };

  return (
    <TireServicePage
      bookings={bookings}
      onCancelBooking={onCancelBooking}
      onChangePaymentMethod={onChangePaymentMethod}
      onAddService={onAddService}
      onRemoveService={onRemoveService}
      onMarkAsReady={onMarkAsReady}
      onStartWork={onStartWork}
      onMarkAsPaid={onMarkAsPaid}
      onAssignTechnician={onAssignTechnician}
      onCreateBooking={handleCreateBooking}
      selectedDate={selectedDate}
      onDateChange={onDateChange}
      onNavigateToWizard={onNavigateToWizard}
      isWorkingToday={isWorkingToday}
      onToggleWorkingToday={onToggleWorkingToday}
      technicians={technicians}
      tireServices={tireServices}
    />
  );
};
