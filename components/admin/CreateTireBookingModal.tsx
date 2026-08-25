import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { TireBooking } from '../../lib/api/tire-bookings';
import { TireService, getTireServices } from '../../lib/api/tire-services';
import { cn } from '../../lib/utils';
import { addMinutesToTime, isValidTimeRange, findOverlappingBookings } from '../../shared/utils/time';
import { DURATION_OPTIONS } from '../../shared/config/tire-booking';
import { Clock, AlertCircle } from 'lucide-react';
import { normalizePhoneNumber } from '../../shared/utils/phone';

interface CreateTireBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (booking: Omit<TireBooking, 'id' | 'status' | 'created_at' | 'updated_at'>) => void;
  initialTime?: string;
  selectedDate?: string;
  existingBookings?: TireBooking[];
}

const PAYMENT_METHODS = [
  { value: 'Наличный', label: 'Наличные' },
  { value: 'Безналичный', label: 'Карта' },
  { value: 'Перевод', label: 'Перевод' },
  { value: 'Ведомость', label: 'Ведомость' },
  { value: 'Яндекс', label: 'Яндекс' },
];

export const CreateTireBookingModal: React.FC<CreateTireBookingModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  initialTime,
  selectedDate,
  existingBookings = []
}) => {
const [startTime, setStartTime] = useState(initialTime || '');
const [endTime, setEndTime] = useState('');
const [phone, setPhone] = useState('+7 ');
const [clientName, setClientName] = useState('');
const [carModel, setCarModel] = useState('');
const [plateNumber, setPlateNumber] = useState('');
const [serviceId, setServiceId] = useState<string>('');
  const [tireServices, setTireServices] = useState<TireService[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Наличный' | 'Безналичный' | 'Перевод' | 'Ведомость' | 'Яндекс'>('Наличный');
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string;
    clientName?: string;
    carModel?: string;
    plateNumber?: string;
  }>({});
  const [overlapError, setOverlapError] = useState<string | null>(null);
  
  // Рефы для полей
  const startHoursInputRef = React.useRef<HTMLInputElement>(null);
  const startMinutesInputRef = React.useRef<HTMLInputElement>(null);
  const endHoursInputRef = React.useRef<HTMLInputElement>(null);
  const endMinutesInputRef = React.useRef<HTMLInputElement>(null);

  // Форматирование телефона при вводе
  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    const limitedDigits = digits.slice(0, 11);
    
    if (limitedDigits.length === 0) return '+7 ';
    if (limitedDigits.length <= 1) return `+${limitedDigits}`;
    if (limitedDigits.length <= 4) return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1)}`;
    if (limitedDigits.length <= 7) return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1, 4)}) ${limitedDigits.slice(4)}`;
    if (limitedDigits.length <= 9) return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1, 4)}) ${limitedDigits.slice(4, 7)}-${limitedDigits.slice(7)}`;
    return `+${limitedDigits.slice(0, 1)} (${limitedDigits.slice(1, 4)}) ${limitedDigits.slice(4, 7)}-${limitedDigits.slice(7, 9)}-${limitedDigits.slice(9)}`;
  };

  // Валидация телефона
  const validatePhone = (value: string): boolean => {
    const phoneRegex = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;
    return phoneRegex.test(value);
  };

  // Форматирование гос. номера при вводе (формат: X777XX - строго 6 символов)
  const formatPlateNumber = (value: string): string => {
    // Удаляем все символы кроме букв и цифр
    const cleaned = value.replace(/[^А-ЯA-Zа-яa-z0-9]/g, '').toUpperCase();
    
    // Ограничиваем до 6 символов
    const limited = cleaned.slice(0, 6);
    
    return limited;
  };

  // Валидация гос. номера (формат: X777XX - строго 2 буквы в конце)
  const validatePlateNumber = (value: string): boolean => {
    const plateNumberRegex = /^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}$/;
    return plateNumberRegex.test(value);
  };

  // Очистка ошибки конкретного поля при вводе
  const clearFieldError = (fieldName: keyof typeof fieldErrors) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors(prev => ({ ...prev, [fieldName]: undefined }));
    }
  };

  // Валидация при потере фокуса
  const handlePhoneBlur = () => {
    if (phone && phone.trim() !== '+7 ' && !validatePhone(phone)) {
      setFieldErrors(prev => ({ ...prev, phone: 'Введите корректный номер' }));
    }
  };

  const handleClientNameBlur = () => {
    if (!clientName || clientName.trim() === '') {
      setFieldErrors(prev => ({ ...prev, clientName: 'Укажите имя клиента' }));
    }
  };

  const handleCarModelBlur = () => {
    if (!carModel || carModel.trim() === '') {
      setFieldErrors(prev => ({ ...prev, carModel: 'Укажите модель автомобиля' }));
    }
  };

  const handlePlateNumberBlur = () => {
    if (!plateNumber || plateNumber.trim() === '') {
      setFieldErrors(prev => ({ ...prev, plateNumber: 'Укажите гос. номер' }));
    } else if (!validatePlateNumber(plateNumber)) {
      setFieldErrors(prev => ({ ...prev, plateNumber: 'Формат: А123АА' }));
    }
  };
  
  // Обработчик быстрого выбора длительности
  const handleDurationSelect = (minutes: number) => {
    if (!startTime) return;
    const newEndTime = addMinutesToTime(startTime, minutes);
    setEndTime(newEndTime);
    setOverlapError(null);
  };

  // Проверка пересечений
  const checkOverlap = (start: string, end: string): boolean => {
    if (!start || !end) return false;
    if (!isValidTimeRange(start, end)) {
      setOverlapError('Время окончания должно быть больше времени начала');
      return true;
    }
    
    const overlapping = findOverlappingBookings(
      start,
      end,
      existingBookings,
      selectedDate || new Date().toISOString().split('T')[0]
    );
    
    if (overlapping.length > 0) {
      const booking = overlapping[0];
      setOverlapError(
        `Пересечение с заказом: ${booking.car_model} (${booking.start_time} - ${booking.start_time})`
      );
      return true;
    }
    
    setOverlapError(null);
    return false;
  };

  // При открытии модального окна фокусируемся на нужном поле
  React.useEffect(() => {
    if (isOpen) {
      // Если initialTime содержит часы (текущий день), фокус на минутах
      if (initialTime && initialTime.includes(':')) {
        if (startMinutesInputRef.current) {
          startMinutesInputRef.current.focus();
          startMinutesInputRef.current.select();
        }
      } else {
        // Если initialTime пустой (другой день), фокус на часах
        if (startHoursInputRef.current) {
          startHoursInputRef.current.focus();
        }
      }
    }
  }, [isOpen, initialTime]);

  // Сброс времени при изменении initialTime
  React.useEffect(() => {
    setStartTime(initialTime || '');
    setEndTime('');
    setOverlapError(null);
  }, [initialTime]);

  // Загрузка услуг шиномонтажа при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      getTireServices()
        .then(setTireServices)
        .catch(error => {
          console.error('Ошибка при загрузке услуг шиномонтажа:', error);
        });
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Валидация времени начала (проверяем что часы и минуты заполнены)
    if (!startTime || !startTime.includes(':') || startTime.split(':')[1] === '') {
      return;
    }

    // Валидация времени окончания (проверяем что часы и минуты заполнены)
    if (!endTime || !endTime.includes(':') || endTime.split(':')[1] === '') {
      return;
    }

    // Валидация всех полей
    const errors: {
      phone?: string;
      clientName?: string;
      carModel?: string;
      plateNumber?: string;
    } = {};

    // Валидация телефона
    if (!phone || phone.trim() === '+7 ') {
      errors.phone = 'Введите корректный номер';
    } else if (!validatePhone(phone)) {
      errors.phone = 'Введите корректный номер';
    }

    // Валидация имени
    if (!clientName || clientName.trim() === '') {
      errors.clientName = 'Укажите имя клиента';
    }

    // Валидация модели авто
    if (!carModel || carModel.trim() === '') {
      errors.carModel = 'Укажите модель автомобиля';
    }

    // Валидация гос. номера
    if (!plateNumber || plateNumber.trim() === '') {
      errors.plateNumber = 'Укажите гос. номер';
    } else if (!validatePlateNumber(plateNumber)) {
      errors.plateNumber = 'Формат: А123АА';
    }

    // Проверка времени
    if (!startTime || !endTime) {
      return;
    }

    // Проверка пересечений
    if (checkOverlap(startTime, endTime)) {
      return;
    }

    if (!serviceId) {
      return;
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const selectedService = tireServices.find(s => s.id === serviceId);
    if (!selectedService) return;

    const bookingDate = selectedDate || new Date().toISOString().split('T')[0];
    
    // Вычисляем длительность в минутах
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    const estimatedDuration = endTotalMinutes - startTotalMinutes;

    onCreate({
      client_name: clientName,
      phone: normalizePhoneNumber(phone),
      car_model: carModel,
      plate_number: plateNumber,
      booking_date: bookingDate,
      start_time: startTime,
      estimated_duration: estimatedDuration,
      services: [{
        service_id: serviceId,
        name: selectedService.name,
        quantity: 1,
        price: selectedService.price,
        total: selectedService.price
      }],
      total_price: selectedService.price,
      payment_method: paymentMethod,
      is_paid: false,
      status: 'ОЖИДАЕТ',
      is_org: false
    });

    handleClose();
  };

  const handleClose = () => {
    setStartTime('');
    setEndTime('');
    setPhone('+7 ');
    setClientName('');
    setCarModel('');
    setPlateNumber('');
    setServiceId('');
    setPaymentMethod('Наличный');
    setFieldErrors({});
    setOverlapError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-6">Новая запись на шиномонтаж</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Время начала */}
            <div className="space-y-2">
              <Label htmlFor="startTime">Время начала</Label>
              <div className="flex items-center gap-2">
                {/* Часы */}
                <Input
                  id="startHours"
                  type="text"
                  inputMode="numeric"
                  value={startTime.includes(':') ? startTime.split(':')[0] || '' : ''}
                  onChange={(e) => {
                    const hours = e.target.value.replace(/\D/g, '').slice(0, 2);
                    const minutes = startTime.includes(':') ? startTime.split(':')[1] : '';
                    setStartTime(`${hours}:${minutes}`);
                    setOverlapError(null);
                  }}
                  ref={startHoursInputRef}
                  disabled={!!initialTime && initialTime.includes(':')}
                  className={`w-20 text-center ${initialTime && initialTime.includes(':') ? 'bg-gray-100' : ''}`}
                  placeholder=""
                  maxLength={2}
                  required
                />
                <span className="text-2xl font-bold text-gray-600">:</span>
                {/* Минуты */}
                <Input
                  id="startMinutes"
                  type="text"
                  inputMode="numeric"
                  value={startTime.includes(':') ? startTime.split(':')[1] || '' : ''}
                  onChange={(e) => {
                    const hours = startTime.includes(':') ? startTime.split(':')[0] : '';
                    const minutes = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setStartTime(`${hours}:${minutes}`);
                    setOverlapError(null);
                  }}
                  ref={startMinutesInputRef}
                  className="w-20 text-center"
                  placeholder=""
                  maxLength={2}
                  required
                />
              </div>
            </div>

            {/* Время окончания */}
            <div className="space-y-2">
              <Label htmlFor="endTime">Время окончания</Label>
              <div className="flex items-center gap-2">
                {/* Часы */}
                <Input
                  id="endHours"
                  type="text"
                  inputMode="numeric"
                  value={endTime.includes(':') ? endTime.split(':')[0] || '' : ''}
                  onChange={(e) => {
                    const hours = e.target.value.replace(/\D/g, '').slice(0, 2);
                    const minutes = endTime.includes(':') ? endTime.split(':')[1] : '';
                    setEndTime(`${hours}:${minutes}`);
                    setOverlapError(null);
                  }}
                  ref={endHoursInputRef}
                  className="w-20 text-center"
                  placeholder=""
                  maxLength={2}
                  required
                />
                <span className="text-2xl font-bold text-gray-600">:</span>
                {/* Минуты */}
                <Input
                  id="endMinutes"
                  type="text"
                  inputMode="numeric"
                  value={endTime.includes(':') ? endTime.split(':')[1] || '' : ''}
                  onChange={(e) => {
                    const hours = endTime.includes(':') ? endTime.split(':')[0] : '';
                    const minutes = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setEndTime(`${hours}:${minutes}`);
                    setOverlapError(null);
                  }}
                  ref={endMinutesInputRef}
                  className="w-20 text-center"
                  placeholder=""
                  maxLength={2}
                  required
                />
              </div>
            </div>

            {/* Быстрый выбор длительности */}
            <div className="space-y-2">
              <Label>Быстрый выбор длительности</Label>
              <div className="grid grid-cols-2 gap-3">
                {DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.minutes}
                    type="button"
                    onClick={() => handleDurationSelect(option.minutes)}
                    className="border-2 rounded-lg p-3 flex items-center justify-center gap-2 hover:border-primary hover:bg-blue-50 transition-all"
                  >
                    <Clock className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-sm">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ошибка пересечения */}
            {overlapError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{overlapError}</p>
              </div>
            )}

            {/* Номер телефона */}
            <div className="space-y-2">
              <Label htmlFor="phone">Номер телефона</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+7 (___) ___-__-__"
                value={phone}
                onChange={(e) => {
                  const formatted = formatPhoneNumber(e.target.value);
                  if (formatted.startsWith('+7 ') || formatted === '+7') {
                    setPhone(formatted);
                  } else if (formatted === '') {
                    setPhone('+7 ');
                  }
                  clearFieldError('phone');
                }}
                onFocus={() => clearFieldError('phone')}
                onBlur={handlePhoneBlur}
                className={cn(
                  "text-lg tracking-wider",
                  fieldErrors.phone ? "border-red-500 focus:ring-red-500" : ""
                )}
              />
              {fieldErrors.phone && (
                <p className="text-sm text-red-500">{fieldErrors.phone}</p>
              )}
            </div>

            {/* Имя клиента */}
            <div className="space-y-2">
              <Label htmlFor="clientName">Имя клиента</Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  clearFieldError('clientName');
                }}
                onFocus={() => clearFieldError('clientName')}
                onBlur={handleClientNameBlur}
                placeholder="Алексей М."
                className={cn(
                  fieldErrors.clientName ? "border-red-500 focus:ring-red-500" : ""
                )}
              />
              {fieldErrors.clientName && (
                <p className="text-sm text-red-500">{fieldErrors.clientName}</p>
              )}
            </div>

            {/* Автомобиль */}
            <div className="space-y-2">
              <Label htmlFor="carModel">Автомобиль</Label>
              <Input
                id="carModel"
                value={carModel}
                onChange={(e) => {
                  setCarModel(e.target.value);
                  clearFieldError('carModel');
                }}
                onFocus={() => clearFieldError('carModel')}
                onBlur={handleCarModelBlur}
                placeholder="Toyota Camry"
                className={cn(
                  fieldErrors.carModel ? "border-red-500 focus:ring-red-500" : ""
                )}
              />
              {fieldErrors.carModel && (
                <p className="text-sm text-red-500">{fieldErrors.carModel}</p>
              )}
            </div>

            {/* Госномер */}
            <div className="space-y-2">
              <Label htmlFor="plateNumber">Госномер</Label>
              <Input
                id="plateNumber"
                value={plateNumber}
                onChange={(e) => {
                  const formatted = formatPlateNumber(e.target.value);
                  setPlateNumber(formatted);
                  clearFieldError('plateNumber');
                }}
                onFocus={() => clearFieldError('plateNumber')}
                onBlur={handlePlateNumberBlur}
                placeholder="А123АА"
                className={cn(
                  "uppercase",
                  fieldErrors.plateNumber ? "border-red-500 focus:ring-red-500" : ""
                )}
              />
              {fieldErrors.plateNumber && (
                <p className="text-sm text-red-500">{fieldErrors.plateNumber}</p>
              )}
            </div>

            {/* Услуга */}
            <div className="space-y-2">
              <Label htmlFor="service">Услуга</Label>
              <Select value={serviceId} onValueChange={(value) => setServiceId(value)}>
                <SelectTrigger id="service">
                  <SelectValue placeholder="Выберите услугу" />
                </SelectTrigger>
                <SelectContent>
                  {tireServices.map(service => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} — {service.price}₽
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Способ оплаты */}
            <div className="space-y-2">
              <Label htmlFor="payment">Способ оплаты</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'Наличный' | 'Безналичный' | 'Перевод' | 'Ведомость' | 'Яндекс')}>
                <SelectTrigger id="payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(method => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
                Отмена
              </Button>
              <Button type="submit" className="flex-1">
                Создать
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
