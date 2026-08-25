import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { UserPlus, X } from 'lucide-react';
import { normalizePhoneNumber } from '../../shared/utils/phone';

interface AddTireTechnicianModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (technician: { name: string; phone: string; cardDetails?: string; paymentPhone?: string; paymentComment?: string }) => void;
}

export const AddTireTechnicianModal: React.FC<AddTireTechnicianModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [cardDetails, setCardDetails] = useState('');
  const [paymentPhone, setPaymentPhone] = useState('+7');
  const [paymentComment, setPaymentComment] = useState('');

  const formatPhoneNumber = (value: string) => {
    // Сначала удаляем все нецифровые символы
    const digits = value.replace(/\D/g, '');
    
    // Если пусто, возвращаем +7
    if (digits.length === 0) {
      return '+7';
    }
    
    // Ограничиваем до 11 цифр (включая 7)
    const limitedDigits = digits.slice(0, 11);
    
    // Если первая цифра не 7, заменяем на 7
    const firstDigit = limitedDigits[0] || '7';
    const correctedDigits = firstDigit === '7' ? limitedDigits : '7' + limitedDigits.slice(1);
    
    // Форматируем номер
    if (correctedDigits.length <= 1) {
      return '+' + correctedDigits;
    }
    if (correctedDigits.length <= 4) {
      return '+' + correctedDigits.slice(0, 1) + ' (' + correctedDigits.slice(1);
    }
    if (correctedDigits.length <= 7) {
      return '+' + correctedDigits.slice(0, 1) + ' (' + correctedDigits.slice(1, 4) + ') ' + correctedDigits.slice(4);
    }
    if (correctedDigits.length <= 9) {
      return '+' + correctedDigits.slice(0, 1) + ' (' + correctedDigits.slice(1, 4) + ') ' + correctedDigits.slice(4, 7) + '-' + correctedDigits.slice(7);
    }
    return '+' + correctedDigits.slice(0, 1) + ' (' + correctedDigits.slice(1, 4) + ') ' + correctedDigits.slice(4, 7) + '-' + correctedDigits.slice(7, 9) + '-' + correctedDigits.slice(9);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const handlePaymentPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPaymentPhone(formatted);
  };

  const formatCardNumber = (value: string) => {
    // Удаляем все нецифровые символы и дефисы
    const digits = value.replace(/\D/g, '');
    
    // Ограничиваем до 16 цифр
    const limitedDigits = digits.slice(0, 16);
    
    // Форматируем как 2222-2222-2222-2222
    const groups = [
      limitedDigits.slice(0, 4),
      limitedDigits.slice(4, 8),
      limitedDigits.slice(8, 12),
      limitedDigits.slice(12, 16)
    ].filter(Boolean);
    
    return groups.join('-');
  };

  const handleCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCardDetails(formatted);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && phone.trim()) {
      onAdd({
        name: name.trim(),
        phone: normalizePhoneNumber(phone.trim()),
        cardDetails: cardDetails.trim() || undefined,
        paymentPhone: paymentPhone.trim() ? normalizePhoneNumber(paymentPhone.trim()) : undefined,
        paymentComment: paymentComment.trim() || undefined
      });
      setName('');
      setPhone('+7');
      setCardDetails('');
      setPaymentPhone('+7');
      setPaymentComment('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto scroll-mobile">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Добавить нового мастера
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="technician-name">Имя</Label>
            <Input
              id="technician-name"
              placeholder="Введите имя шиномонтажника"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="technician-phone">Телефон</Label>
            <Input
              id="technician-phone"
              placeholder="+7 (___) ___-__-__"
              value={phone}
              onChange={handlePhoneChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="technician-card">Реквизиты карты для ЗП</Label>
            <Input
              id="technician-card"
              placeholder="Укажите номер карты"
              value={cardDetails}
              onChange={handleCardChange}
              maxLength={19}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="technician-payment-phone">Телефон для переводов</Label>
            <Input
              id="technician-payment-phone"
              placeholder="+7 (___) ___-__-__"
              value={paymentPhone}
              onChange={handlePaymentPhoneChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="technician-payment-comment">Комментарий для перевода</Label>
            <Input
              id="technician-payment-comment"
              placeholder="Укажите комментарий (например: Сбер, Тинькофф)"
              value={paymentComment}
              onChange={(e) => setPaymentComment(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button type="submit" className="flex-1">
              Добавить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
