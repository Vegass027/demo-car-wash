import React from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Worker, Booking } from '../../types';
import { User, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

interface WorkerUnit {
  id: string;
  name: string;
  mode: 'solo' | 'pair';
  workers: Worker[];
}

interface AssignWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (workerId: string) => void;
  bookingId?: string;
  bookings?: Booking[];
  workers?: Worker[];
  selectedDate?: string;
}

export const AssignWorkerModal: React.FC<AssignWorkerModalProps> = ({ 
  isOpen, 
  onClose, 
  onAssign, 
  workers = [] 
}) => {
  // ✅ УПРОЩЕНИЕ: показываем всех работников, которые в смене
  // Администратор сам контролирует, кто на каком заказе работает

  // Группируем мойщиков в рабочие единицы (solo или pair)
  const getWorkerUnits = (): WorkerUnit[] => {
    const units: WorkerUnit[] = [];
    const processedWorkerIds = new Set<string>();

    workers.forEach(worker => {
      // ✅ БАЗОВЫЕ ПРОВЕРКИ ТОЛЬКО:
      // 1. Работник работает сегодня
      // 2. Режим заблокирован (выбран)
      if (!worker.is_working_today) return;
      if (worker.working_mode_status !== 'locked') return;

      // Пропускаем уже обработанных мойщиков
      if (processedWorkerIds.has(worker.id)) return;

      if (worker.working_mode === 'pair' && worker.partner_id) {
        // Находим партнёра
        const partner = workers.find(w => w.id === worker.partner_id);
        
        if (partner) {
          // ✅ БАЗОВЫЕ ПРОВЕРКИ ТОЛЬКО для партнера
          if (!partner.is_working_today || partner.working_mode_status !== 'locked') {
            return;
          }

          // Добавляем пару как одну единицу
          units.push({
            id: worker.id, // Используем ID первого мойщика для назначения
            name: `${worker.full_name} + ${partner.full_name}`,
            mode: 'pair',
            workers: [worker, partner]
          });
          processedWorkerIds.add(worker.id);
          processedWorkerIds.add(partner.id);
        }
      } else if (worker.working_mode === 'solo') {
        // Добавляем solo мойщика
        units.push({
          id: worker.id,
          name: worker.full_name,
          mode: 'solo',
          workers: [worker]
        });
        processedWorkerIds.add(worker.id);
      }
    });

    return units;
  };

  // ✅ УПРОЩЕНИЕ: не фильтруем, показываем всех работников в смене
  const availableWorkerUnits = getWorkerUnits();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md gap-4 border bg-white p-6 shadow-lg rounded-lg z-[100] max-h-[90vh] overflow-y-auto scroll-mobile flex flex-col">
        <DialogHeader>
          <DialogTitle>Сменить мойщика</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {availableWorkerUnits.map((unit) => (
            <button
              key={unit.id}
              onClick={() => onAssign(unit.id)}
              className="w-full flex items-center justify-between p-3 rounded-xl border transition-all hover:bg-accent hover:border-primary"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  unit.mode === 'pair'
                    ? "bg-blue-100 text-blue-700"
                    : "bg-green-100 text-green-700"
                )}>
                  {unit.mode === 'pair' ? (
                    <Users className="w-5 h-5" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm">{unit.name}</div>
                  <div className="text-xs text-muted-foreground flex gap-2">
                    <span>{unit.mode === 'pair' ? 'пара' : 'solo'}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
          {availableWorkerUnits.length === 0 && (
            <div className="text-center text-gray-500 py-4">
              Нет работников в смене
            </div>
          )}
        </div>
        <Button variant="outline" onClick={onClose} className="w-full">
          Отмена
        </Button>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          ✕
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </Dialog>
  );
};
