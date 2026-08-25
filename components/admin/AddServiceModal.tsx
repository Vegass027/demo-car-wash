import React, { useState, useMemo } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import { Calculator } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TireService, groupServicesByCategory } from '../../lib/api/tire-services';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (services: Array<{ service_id: string; quantity: number }>) => void;
  existingServices: string[];
  services?: TireService[];
}

// Тип для выбранной услуги с количеством
interface SelectedService {
  serviceId: string;
  quantity: number;
  price: number;
}

export const AddServiceModal: React.FC<AddServiceModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingServices,
  services = [],
}) => {
  const [selectedServices, setSelectedServices] = useState<Map<string, SelectedService>>(new Map());
  const [totalPrice, setTotalPrice] = useState(0);

  // Обработчик изменения количества услуги
  const handleQuantityChange = (serviceId: string, price: number, delta: number) => {
    const newServices = new Map<string, SelectedService>(selectedServices);
    const current: SelectedService | undefined = newServices.get(serviceId);

    if (!current) {
      // Добавляем новую услугу с количеством 1
      newServices.set(serviceId, { serviceId, quantity: 1, price });
      setTotalPrice(p => p + price);
    } else {
      const newQuantity = current.quantity + delta;
      if (newQuantity <= 0) {
        // Удаляем услугу если количество <= 0
        newServices.delete(serviceId);
        setTotalPrice(p => p - (current.price * current.quantity));
      } else {
        // Обновляем количество
        newServices.set(serviceId, { serviceId, quantity: newQuantity, price });
        setTotalPrice(p => p + (price * delta));
      }
    }
    setSelectedServices(newServices);
  };

  // Добавить выбранные услуги
  const handleAddServices = () => {
    const servicesToAdd = Array.from(selectedServices.values()).map((s: SelectedService) => ({
      service_id: s.serviceId,
      quantity: s.quantity
    }));
    onAdd(servicesToAdd);
    setSelectedServices(new Map<string, SelectedService>());
    setTotalPrice(0);
    onClose();
  };

  // Сбросить выбор при закрытии
  const handleClose = () => {
    setSelectedServices(new Map<string, SelectedService>());
    setTotalPrice(0);
    onClose();
  };

  const availableServices = services.filter(s => !existingServices.includes(s.id));

  // Группируем услуги по категориям (для шиномонтажа)
  const groupedServices = useMemo(() => {
    return groupServicesByCategory(availableServices);
  }, [availableServices]);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-transparent data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md gap-4 border bg-white p-6 shadow-lg rounded-lg z-[160] flex flex-col max-h-[90vh] overflow-hidden pointer-events-auto">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-bold">Услуги</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4 flex-1 overflow-y-auto min-h-0">
          <Label className="text-gray-500 text-xs uppercase tracking-wider block">Выберите услуги</Label>

          {/* Аккордеон для услуг шиномонтажа (с категориями) */}
          <Accordion type="multiple" className="w-full">
            {Object.entries(groupedServices).map(([category, categoryServices]: [string, TireService[]]) => (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="py-3">
                  <span className="font-semibold">{category}</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    {categoryServices.map((service: TireService) => {
                      const servicePrice = service.price;
                      const selected = selectedServices.get(service.id);
                      const quantity = selected?.quantity || 0;
                      return (
                        <div
                          key={service.id}
                          className={cn(
                            "flex items-center justify-between border p-3 rounded-lg transition-colors",
                            selected ? "border-primary bg-blue-50" : "hover:border-primary hover:bg-gray-50"
                          )}
                        >
                          <div className="flex-1">
                            <div className="text-sm font-medium">{service.name}</div>
                            <div className="text-xs text-gray-500">
                              {service.name === 'Сезонное хранение резины' 
                                ? `${servicePrice} ₽` 
                                : `${servicePrice} ₽/шт`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full"
                              onClick={() => handleQuantityChange(service.id, servicePrice, -1)}
                              disabled={quantity === 0}
                            >
                              -
                            </Button>
                            <span className="w-8 text-center font-medium">{quantity}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full"
                              onClick={() => handleQuantityChange(service.id, servicePrice, 1)}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {availableServices.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              Все услуги уже добавлены
            </div>
          )}
        </div>

        {selectedServices.size > 0 && (
          <div className="space-y-3 pt-4 border-t mt-4 flex-shrink-0">
            <div className="bg-black text-white p-4 rounded-xl flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                <span className="font-medium">Всего:</span>
              </div>
              <span className="text-xl font-bold">{totalPrice} ₽</span>
            </div>
            <Button className="w-full h-12" onClick={handleAddServices}>
              Добавить ({Array.from(selectedServices.values()).reduce((sum: number, s: SelectedService) => sum + s.quantity, 0)} шт)
            </Button>
          </div>
        )}

        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          ✕
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
