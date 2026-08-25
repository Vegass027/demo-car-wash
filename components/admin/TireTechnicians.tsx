import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import { TireTechnicianCard } from './TireTechnicianCard';
import { AddTireTechnicianModal } from './AddTireTechnicianModal';
import { TireTechnicianBookingsList } from './TireTechnicianBookingsList';
import { TireWorker } from '../../lib/api/tire-workers';
import { TireBooking } from '../../lib/api/tire-bookings';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import type { SalarySettings } from '../../lib/types/salary';

interface TireTechniciansProps {
  technicians: TireWorker[];
  setTechnicians: (technicians: TireWorker[]) => void;
  tireBookings: TireBooking[];
  onToggleTechnicianWorking: (technicianId: string, isWorking: boolean) => void;
  onDeleteTechnician?: (technicianId: string) => void;
  salarySettings?: SalarySettings | null;
  userRole?: 'admin' | 'owner';
}

export const TireTechnicians: React.FC<TireTechniciansProps> = ({
  technicians,
  setTechnicians,
  tireBookings,
  onToggleTechnicianWorking,
  onDeleteTechnician,
  salarySettings,
  userRole,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTechnicianForBookings, setSelectedTechnicianForBookings] = useState<TireWorker | null>(null);

  const handleAddTechnician = async (newTechnicianData: { name: string; phone: string; cardDetails?: string; paymentPhone?: string; paymentComment?: string }) => {
    try {
      const { createTireWorker } = await import('../../lib/api/tire-workers');
      const newTechnician = await createTireWorker({
        full_name: newTechnicianData.name,
        phone: normalizePhoneNumber(newTechnicianData.phone),
        card_number: newTechnicianData.cardDetails,
        payment_phone: newTechnicianData.paymentPhone ? normalizePhoneNumber(newTechnicianData.paymentPhone) : null,
        payment_comment: newTechnicianData.paymentComment,
        is_active: true,
        is_working_today: false,
        earned_today: 0,
        current_balance: 0,
        is_advance_taken: false,
        completed_bookings: [],
        status: 'available',
        current_booking_id: null,
        cars_today: 0,
      });
      setTechnicians([...technicians, newTechnician]);
    } catch (error) {
      console.error('Ошибка при создании мастера:', error);
      alert('Не удалось создать мастера');
    }
  };

  const handleUpdateTechnician = (technicianId: string, updatedTechnician: TireWorker) => {
    setTechnicians(technicians.map(t =>
      t.id === technicianId ? updatedTechnician : t
    ));
  };

  const handleViewBookings = (technician: TireWorker) => {
    setSelectedTechnicianForBookings(technician);
  };

  const handleDeleteTechnician = (technicianId: string) => {
    onDeleteTechnician?.(technicianId);
  };

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Мастер</h2>
          <h2 className="text-2xl font-bold">Шиномонтажа</h2>
        </div>
        <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Добавить
        </Button>
      </div>

      {/* Список шиномонтажников */}
      <div className="space-y-4">
        {technicians.map((technician) => (
          <TireTechnicianCard
            key={technician.id}
            technician={technician}
            bookings={tireBookings}
            onToggleWorking={onToggleTechnicianWorking}
            onViewBookings={handleViewBookings}
            onUpdateTechnician={handleUpdateTechnician}
            onDelete={handleDeleteTechnician}
            salarySettings={salarySettings}
            userRole={userRole}
          />
        ))}
      </div>

      {/* Modals */}
      <AddTireTechnicianModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddTechnician}
      />

      <TireTechnicianBookingsList
        technician={selectedTechnicianForBookings!}
        allBookings={tireBookings}
        isOpen={selectedTechnicianForBookings !== null}
        onClose={() => setSelectedTechnicianForBookings(null)}
        salarySettings={salarySettings}
      />
    </>
  );
};
