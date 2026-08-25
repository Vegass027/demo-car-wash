import React from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { TireWorker } from '../../lib/api/tire-workers';
import { User, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AssignTireTechnicianModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicians: TireWorker[];
  onAssign: (technicianId: string) => void;
  assignedTechnicianId?: string;
}

export const AssignTireTechnicianModal: React.FC<AssignTireTechnicianModalProps> = ({
  isOpen,
  onClose,
  technicians,
  onAssign,
  assignedTechnicianId,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md gap-4 border bg-white p-6 shadow-lg rounded-lg z-[100] max-h-[90vh] overflow-y-auto scroll-mobile flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Назначить мастера</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {technicians.filter(t => t.is_working_today).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Нет доступных мастеров на сегодня</p>
            </div>
          ) : (
            technicians
              .filter(t => t.is_working_today)
              .map(technician => (
                <Card
                  key={technician.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    assignedTechnicianId === technician.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  )}
                  onClick={() => onAssign(technician.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold">{technician.full_name}</div>
                          <div className="text-sm text-gray-500">{technician.phone}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {assignedTechnicianId === technician.id && (
                          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          ✕
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </Dialog>
  );
};
