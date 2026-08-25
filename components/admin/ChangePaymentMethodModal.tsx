import React from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { CreditCard, Wallet, Send, ClipboardList, Banknote, QrCode } from 'lucide-react';

interface ChangePaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChange: (method: 'Наличный' | 'Безналичный' | 'Перевод' | 'QR-code' | 'Ведомость' | 'Яндекс') => void;
  currentMethod?: 'Наличный' | 'Безналичный' | 'Перевод' | 'QR-code' | 'Ведомость' | 'Яндекс';
}

export const ChangePaymentMethodModal: React.FC<ChangePaymentMethodModalProps> = ({
  isOpen,
  onClose,
  onChange,
  currentMethod,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-sm gap-4 border bg-white p-6 shadow-lg rounded-lg z-[100] max-h-[90vh] overflow-y-auto scroll-mobile">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Вид оплаты</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <Button
            variant={currentMethod === 'Наличный' ? 'default' : 'outline'}
            className="w-full h-14 justify-start gap-3"
            onClick={() => onChange('Наличный')}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-base">Наличный</span>
          </Button>

          <Button
            variant={currentMethod === 'Безналичный' ? 'default' : 'outline'}
            className="w-full h-14 justify-start gap-3"
            onClick={() => onChange('Безналичный')}
          >
            <CreditCard className="w-5 h-5" />
            <span className="text-base">Безналичный</span>
          </Button>

          <Button
            variant={currentMethod === 'Перевод' ? 'default' : 'outline'}
            className="w-full h-14 justify-start gap-3"
            onClick={() => onChange('Перевод')}
          >
            <Send className="w-5 h-5" />
            <span className="text-base">Перевод</span>
          </Button>

          <Button
            variant={currentMethod === 'QR-code' ? 'default' : 'outline'}
            className="w-full h-14 justify-start gap-3"
            onClick={() => onChange('QR-code')}
          >
            <QrCode className="w-5 h-5" />
            <span className="text-base">QR-code</span>
          </Button>

          <Button
            variant={currentMethod === 'Ведомость' ? 'default' : 'outline'}
            className="w-full h-14 justify-start gap-3"
            onClick={() => onChange('Ведомость')}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-base">Ведомость</span>
          </Button>

          <Button
            variant={currentMethod === 'Яндекс' ? 'default' : 'outline'}
            className="w-full h-14 justify-start gap-3"
            onClick={() => onChange('Яндекс')}
          >
            <Banknote className="w-5 h-5" />
            <span className="text-base">Яндекс</span>
          </Button>
        </div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          ✕
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </Dialog>
  );
};
