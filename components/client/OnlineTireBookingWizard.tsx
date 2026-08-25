import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ArrowLeft, Check, Calculator, Clock, CreditCard, History, Repeat, Send, AlertCircle, ChevronDown, Minus, Plus, Building2, Pen, User, ClipboardList, QrCode } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { formatDate } from '../../shared/utils/date';
import { TireServiceItem, TireBooking } from '../../lib/api/tire-bookings';
import { getTireServices, groupServicesByCategory } from '../../lib/api/tire-services';
import type { TireService as TireServiceType } from '../../lib/api/tire-services';
import { getTireBookingsByProfileId } from '../../lib/api/tire-bookings';
import { getClientCombinedCars } from '../../lib/api/combined-cars';
import { findDriversByPhone } from '../../lib/api/organizations';
import type { CombinedCar } from '../../lib/api/combined-cars';
import { addMinutesToTime, isValidTimeRange, formatTimeWithoutSeconds, calculateEndTime } from '../../shared/utils/time';
import { DURATION_OPTIONS } from '../../shared/config/tire-booking';
import { findAvailableTireTimeSlots } from '../../shared/utils/time';
import { BankSelectionStep } from './BankSelectionStep';

export interface OnlineTireBookingWizardData {
  selectedCarId: string;
  selectedCarType: 'personal' | 'organization';
  carModel: string;
  plateNumber: string;
  services: TireServiceItem[];
  price: number;
  startTime: string;
  endTime: string;
  paymentMethod: 'Наличный' | 'Безналичный' | 'Перевод' | 'QR-code' | 'СБП' | 'Ведомость';
  bookingDate: string;
  estimatedDuration: number;
  profileId: string;
  organization_id?: string;
  org_name?: string;
  driver_id?: string;
  car_id?: string;
  client_car_id?: string;
  signature_data?: string;
}

interface OnlineTireBookingWizardProps {
  onBack: () => void;
  onComplete: (data: OnlineTireBookingWizardData) => void;
  onWizardClose?: () => void;
  profileId: string;
  clientId: string | null;
  profileName: string;
  profilePhone: string;
  selectedDate?: string;
  selectedSlot?: {
    date: string;
    startTime: string;
  };
  existingBookings?: TireBooking[];
  // ✅ Данные из App.tsx для избежания повторной загрузки
  tireServices?: any[];
  organizations?: any[];
  organizationDrivers?: any[];
  organizationCars?: any[];
  clients?: any[];
}

const STEPS = 4; // 4 шага: 1-История, 2-Услуги, 3-Время, 4-Оплата и подтверждение

export const OnlineTireBookingWizard: React.FC<OnlineTireBookingWizardProps> = ({
  onBack,
  onComplete,
  onWizardClose,
  profileId,
  clientId,
  profileName,
  profilePhone,
  selectedDate: propSelectedDate,
  selectedSlot: propSelectedSlot,
  existingBookings = [],
  tireServices = [],
  organizations = [],
  organizationDrivers = [],
  organizationCars = [],
  clients = []
}) => {
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string>(propSelectedDate || formatDate(new Date()));
  const [selectedSlot, setSelectedSlot] = useState(propSelectedSlot || null);
  
  // Данные клиента
  const [combinedCars, setCombinedCars] = useState<CombinedCar[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [selectedCarType, setSelectedCarType] = useState<'personal' | 'organization' | null>(null);
  const [carModel, setCarModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverSignature, setDriverSignature] = useState<string | null>(null);
  const [isLoadingSignature, setIsLoadingSignature] = useState(false);

  // История записей
  const [bookingHistory, setBookingHistory] = useState<TireBooking[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  // ✅ Услуги теперь приходят из props, удаляем state
  // const [tireServices, setTireServices] = useState<TireServiceType[]>([]);
  const [selectedServices, setSelectedServices] = useState<TireServiceItem[]>([]);
  const [price, setPrice] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Время
  const [startTime, setStartTime] = useState(propSelectedSlot?.startTime || '');
  const [endTime, setEndTime] = useState('');
  const [overlapError, setOverlapError] = useState<string | null>(null);
  
  // ✅ Устанавливаем текущее время по умолчанию на шаге 3 (локальное время устройства)
  useEffect(() => {
    if (step === 3 && !propSelectedSlot && !startTime) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setStartTime(`${hours}:${minutes}`);
    }
  }, [step, propSelectedSlot, startTime]);
  
   // Оплата
   const [paymentMethod, setPaymentMethod] = useState<'Наличный' | 'Безналичный' | 'Перевод' | 'QR-code' | 'СБП' | 'Ведомость'>('Наличный');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Ошибки
  const [validationError, setValidationError] = useState<string | null>(null);

  // Показывать BankSelectionStep для СБП
  const [showBankSelection, setShowBankSelection] = useState(false);

  // Загрузка данных при монтировании
  useEffect(() => {
    const loadData = async () => {
        setIsLoadingHistory(true);
        try {
          // ✅ Услуги уже загружены в App.tsx и переданы через props
          // setTireServices(tireServices); // ❌ Удалено - используем prop
 
          // Загружаем комбинированный список машин (личные + организационные)
          if (clientId) {
            const cars = await getClientCombinedCars(clientId, profilePhone);
            setCombinedCars(cars);
          } else {
            setCombinedCars([]);
          }
 
          // Загружаем историю записей
          const history = await getTireBookingsByProfileId(profileId);
          setBookingHistory(history);
        } catch (error) {
          console.error('Ошибка при загрузке данных:', error);
        } finally {
          setIsLoadingHistory(false);
        }
    };
 
    loadData();
  }, [profileId, clientId, tireServices]);

  // Сброс времени при изменении выбранного слота
  useEffect(() => {
    if (propSelectedSlot) {
      setStartTime(propSelectedSlot.startTime);
      setEndTime('');
      setOverlapError(null);
    }
  }, [propSelectedSlot]);

  // ✅ Синхронизация selectedDate с propSelectedDate при изменении (защита от устаревшей даты)
  useEffect(() => {
    if (propSelectedDate && propSelectedDate !== selectedDate) {
      setSelectedDate(propSelectedDate);
    }
  }, [propSelectedDate]);

  // Обработчик выбора машины из списка
  const handleSelectCar = async (car: CombinedCar) => {
    setSelectedCarId(car.id);
    setSelectedCarType(car.type);
    setCarModel(car.car_model);
    setPlateNumber(car.plate_number);

    // Если это организационная машина - загружаем подпись водителя
    if (car.type === 'organization' && profilePhone) {
      setIsLoadingSignature(true);
      try {
        const driversData = await findDriversByPhone(profilePhone);
        if (driversData && driversData.length > 0) {
          // Находим водителя из этой организации
          const driver = driversData.find(d => d.organization.id === car.organization_id);
          if (driver?.driver.signature_data) {
            setDriverSignature(driver.driver.signature_data);
          } else {
            setDriverSignature(null);
          }
        } else {
          setDriverSignature(null);
        }
      } catch (error) {
        console.error('Ошибка при загрузке подписи водителя:', error);
        setDriverSignature(null);
      } finally {
        setIsLoadingSignature(false);
      }
    } else {
      setDriverSignature(null);
    }

    // Переходим к следующему шагу
    setStep(2);
  };

  // Обработчик повтора записи из истории
  const handleRepeatBooking = async (booking: TireBooking) => {
    // Определяем тип машины по наличию organization_id
    const isOrg = !!booking.organization_id;
    const carType = isOrg ? 'organization' : 'personal';
    const carId = isOrg ? booking.car_id : booking.client_car_id;

    setSelectedCarId(carId || null);
    setSelectedCarType(carType);
    setCarModel(booking.car_model);
    setPlateNumber(booking.plate_number);
    setSelectedServices(booking.services);
    setPrice(booking.total_price);

    // Если это организационная машина - загружаем подпись водителя
    if (isOrg && profilePhone) {
      setIsLoadingSignature(true);
      try {
        const driversData = await findDriversByPhone(profilePhone);
        if (driversData && driversData.length > 0) {
          // Находим водителя из этой организации
          const driver = driversData.find(d => d.organization.id === booking.organization_id);
          if (driver?.driver.signature_data) {
            setDriverSignature(driver.driver.signature_data);
          } else {
            setDriverSignature(null);
          }
        } else {
          setDriverSignature(null);
        }
      } catch (error) {
        console.error('Ошибка при загрузке подписи водителя:', error);
        setDriverSignature(null);
      } finally {
        setIsLoadingSignature(false);
      }
    } else {
      setDriverSignature(null);
    }

    // Переходим к шагу оплаты
    setStep(4);
  };

  // Обработчик изменения количества услуги
  const handleServiceQuantityChange = (serviceId: string, quantity: number) => {
    const service = tireServices.find(s => s.id === serviceId);
    if (!service) return;

    const newServices = [...selectedServices];
    const existingIndex = newServices.findIndex(s => s.service_id === serviceId);

    if (quantity <= 0) {
      // Удаляем услугу если количество 0
      if (existingIndex >= 0) {
        newServices.splice(existingIndex, 1);
      }
    } else if (existingIndex >= 0) {
      // Обновляем количество существующей услуги
      newServices[existingIndex] = {
        service_id: serviceId,
        name: service.name,
        quantity,
        price: service.price,
        total: service.price * quantity
      };
    } else {
      // Добавляем новую услугу
      newServices.push({
        service_id: serviceId,
        name: service.name,
        quantity,
        price: service.price,
        total: service.price * quantity
      });
    }

    setSelectedServices(newServices);
    
    // Пересчитываем общую цену
    const newPrice = newServices.reduce((sum, s) => sum + s.total, 0);
    setPrice(newPrice);
  };

  // Получить количество выбранной услуги
  const getServiceQuantity = (serviceId: string): number => {
    const service = selectedServices.find(s => s.service_id === serviceId);
    return service ? service.quantity : 0;
  };

  // Обработчик быстрого выбора длительности
  const handleDurationSelect = (minutes: number) => {
    if (!startTime) return;
    const newEndTime = addMinutesToTime(startTime, minutes);
    setEndTime(newEndTime);
    checkOverlap(startTime, newEndTime);
  };

  // Получить текущую длительность из startTime и endTime
  const getCurrentDuration = (): number => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  };

  // Проверка пересечений
  const checkOverlap = (start: string, end: string): boolean => {
    if (!start || !end) return false;
    if (!isValidTimeRange(start, end)) {
      setOverlapError('Время окончания должно быть больше времени начала');
      return true;
    }

    // Проверяем пересечения с существующими записями
    const overlapping = existingBookings.filter(booking => {
      if (booking.booking_date !== selectedDate) return false;
      if (booking.status === 'ОТМЕНЕНО') return false;
      
      const bookingEnd = calculateEndTime(booking.start_time, booking.estimated_duration);
      
      // Проверяем пересечение интервалов
      return (start < bookingEnd && end > booking.start_time);
    });

    if (overlapping.length > 0) {
      const booking = overlapping[0];
      const bookingEnd = calculateEndTime(booking.start_time, booking.estimated_duration);
      setOverlapError(
        `Пересечение с заказом: ${booking.car_model} (${booking.start_time} - ${bookingEnd})`
      );
      return true;
    }

    setOverlapError(null);
    return false;
  };

  // Обработчик оплаты
  const handlePayment = async () => {
    if (!selectedCarId || !carModel || !plateNumber) {
      setValidationError('Выберите автомобиль');
      return;
    }

    if (selectedServices.length === 0) {
      setValidationError('Выберите хотя бы одну услугу');
      return;
    }

    if (!startTime || !endTime) {
      setValidationError('Укажите время записи');
      return;
    }

    if (checkOverlap(startTime, endTime)) {
      return;
    }

    // ✅ БЛОКИРУЕМ КНОПКУ ДЛЯ ВСЕХ МЕТОДОВ ОПЛАТЫ
    setIsProcessingPayment(true);
    setValidationError(null);

    try {
      // Вычисляем длительность
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const estimatedDuration = (endH * 60 + endM) - (startH * 60 + startM);

      // Определяем данные для передачи
      const baseData = {
        carModel,
        plateNumber,
        services: selectedServices,
        price,
        startTime,
        endTime,
        paymentMethod,
        bookingDate: selectedDate,
        estimatedDuration,
        profileId
      };

      // Если выбрана организационная машина - добавляем организационные данные
      if (selectedCarType === 'organization') {
        const selectedCar = combinedCars.find(c => c.id === selectedCarId);
        await onComplete({
          ...baseData,
          selectedCarId,
          selectedCarType: 'organization',
          organization_id: selectedCar?.organization_id,
          org_name: selectedCar?.organization_name,
          driver_id: selectedCar?.organization_id ? undefined : undefined, // Будет заполнено на основе телефона
          car_id: selectedCarId,
          client_car_id: undefined,
          signature_data: driverSignature || undefined
        });
      } else {
        // Личная машина
        await onComplete({
          ...baseData,
          selectedCarId,
          selectedCarType: 'personal',
          organization_id: undefined,
          org_name: undefined,
          driver_id: undefined,
          car_id: undefined,
          client_car_id: selectedCarId,
          signature_data: undefined
        });
      }
    } catch (error) {
      console.error('Ошибка при создании записи:', error);
      setValidationError('Ошибка при создании записи. Попробуйте снова.');
    } finally {
      // ✅ РАЗБЛОКИРУЕМ КНОПКУ ПОСЛЕ ЗАВЕРШЕНИЯ
      setIsProcessingPayment(false);
    }
  };

  // Навигация по шагам
  const nextStep = () => {
    if (step === 2 && selectedServices.length === 0) {
      setValidationError('Выберите хотя бы одну услугу');
      return;
    }
    if (step === 3 && (!startTime || !endTime)) {
      setValidationError('Укажите время записи');
      return;
    }
    setValidationError(null);
    setStep(prev => Math.min(prev + 1, STEPS));
  };

  const prevStep = () => {
    if (step === 1) {
      onBack();
    } else {
      setStep(prev => prev - 1);
    }
  };

  // Группировка услуг по категориям (исключаем "ПРОЧЕЕ" для клиентов)
  const groupedServices = React.useMemo(() => {
    const filteredServices = tireServices.filter(s => !s.is_custom_price);
    return groupServicesByCategory(filteredServices);
  }, [tireServices]);

  return (
    <div className="h-full flex flex-col pb-20 pt-safe telegram-safe-area-top telegram-safe-area-bottom">
      {/* Wizard Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={prevStep}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h2 className="font-bold text-lg">Онлайн-запись на шиномонтаж</h2>
          <div className="text-xs text-gray-500">
            {step === 1 ? 'История' : `Шаг ${step - 1} из ${STEPS - 1}`}
          </div>
        </div>
      </div>

      {/* Progress Bar - не показываем на шаге 1 */}
      {step !== 1 && (
        <div className="h-1 bg-gray-200 w-full mb-6 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${((step - 1) / (STEPS - 1)) * 100}%` }}
          />
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto px-1">
        
        {/* Шаг 1: История записей */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            {/* Выбор машины */}
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Выберите автомобиль</h4>
              {combinedCars.length > 0 ? (
                <div className="space-y-4">
                  {/* Личные автомобили */}
                  {combinedCars.filter(c => c.type === 'personal').length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span className="font-medium">Личные</span>
                      </div>
                      <div className="space-y-2">
                        {combinedCars.filter(c => c.type === 'personal').map((car) => (
                          <Card
                            key={car.id}
                            className={cn(
                              "cursor-pointer transition-colors",
                              selectedCarId === car.id ? "border-primary bg-blue-50" : "hover:border-primary"
                            )}
                            onClick={() => handleSelectCar(car)}
                          >
                            <CardContent className="p-4">
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="font-bold">{car.car_model}</div>
                                  <div className="text-sm text-gray-500">{car.plate_number}</div>
                                </div>
                                {selectedCarId === car.id && (
                                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Организационные автомобили */}
                  {combinedCars.filter(c => c.type === 'organization').length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
                        <Building2 className="w-4 h-4" />
                        <span className="font-medium">Организации</span>
                      </div>
                      <div className="space-y-2">
                        {combinedCars.filter(c => c.type === 'organization').map((car) => (
                          <Card
                            key={car.id}
                            className={cn(
                              "cursor-pointer transition-colors",
                              selectedCarId === car.id ? "border-primary bg-blue-50" : "hover:border-primary"
                            )}
                            onClick={() => handleSelectCar(car)}
                          >
                            <CardContent className="p-4">
                              <div className="flex justify-between items-center">
                                <div className="flex-1">
                                  <div className="font-bold">{car.car_model}</div>
                                  <div className="text-sm text-gray-500">{car.plate_number}</div>
                                  {car.organization_name && (
                                    <div className="text-xs text-gray-400 mt-1">{car.organization_name}</div>
                                  )}
                                </div>
                                {selectedCarId === car.id && (
                                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  У вас нет добавленных автомобилей
                </div>
              )}
            </div>
          </div>
        )}

        {/* Шаг 2: Услуги */}
        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold">Услуги шиномонтажа</h3>
            
            <div className="space-y-6">
              {Object.entries(groupedServices).map(([category, services]: [string, TireServiceType[]]) => {
                const isExpanded = expandedCategories.has(category);
                
                return (
                  <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setExpandedCategories(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(category)) {
                            newSet.delete(category);
                          } else {
                            newSet.add(category);
                          }
                          return newSet;
                        });
                      }}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700">
                        {category}
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="p-3 space-y-3">
                        {services.map((service) => {
                          const quantity = getServiceQuantity(service.id);
                          const isSelected = quantity > 0;
                          return (
                            <div
                              key={service.id}
                              className={cn(
                                "border p-3 rounded-lg transition-colors",
                                isSelected ? "border-primary bg-blue-50" : "hover:border-primary hover:bg-gray-50"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{service.name}</div>
                                  <div className="text-sm text-gray-500">
                                    {service.name === 'Сезонное хранение резины' 
                                      ? `${service.price} ₽` 
                                      : `${service.price} ₽ / ед.`}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleServiceQuantityChange(service.id, Math.max(0, quantity - 1))}
                                    className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 transition-colors"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="w-8 text-center font-medium">{quantity}</span>
                                  <button
                                    onClick={() => handleServiceQuantityChange(service.id, quantity + 1)}
                                    className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 transition-colors"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="bg-black text-white p-4 rounded-xl flex justify-between items-center mt-6">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  <span className="font-medium">Всего:</span>
                </div>
                <span className="text-xl font-bold">{price} ₽</span>
              </div>
              <Button className="w-full h-12" onClick={nextStep} disabled={selectedServices.length === 0}>Далее</Button>
            </div>
          </div>
        )}

        {/* Шаг 3: Время */}
        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold">Время записи</h3>
            
            {/* Быстрый выбор доступных окон */}
            {(() => {
              const availableSlots = findAvailableTireTimeSlots(
                existingBookings,
                selectedDate,
                [30, 60]
              );
              
              const now = new Date();
              const currentMinutes = now.getHours() * 60 + now.getMinutes();
              const today = formatDate(now);
              const isToday = selectedDate === today;
              
              const filteredSlots = availableSlots.filter(slot => {
                if (isToday) {
                  const slotMinutes = parseInt(slot.start.split(':')[0]) * 60 + parseInt(slot.start.split(':')[1]);
                  return slotMinutes >= currentMinutes;
                }
                return true;
              });
              
              if (filteredSlots.length === 0) return null;

              return (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-700">
                      Доступные окна между заказами:
                    </div>
                    <div className="space-y-2">
                      {filteredSlots.map((slot) => (
                        <button
                          key={`${slot.start}-${slot.end}`}
                          onClick={() => {
                            setStartTime(slot.start);
                            setEndTime(slot.end);
                            checkOverlap(slot.start, slot.end);
                          }}
                          className={cn(
                            "w-full border-2 rounded-lg p-3 flex items-center justify-between transition-all cursor-pointer hover:border-primary hover:bg-blue-50",
                            startTime === slot.start && endTime === slot.end
                              ? "border-primary bg-blue-50"
                              : "border"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium">
                              {slot.start} - {slot.end} • {slot.duration} мин
                            </span>
                          </div>
                          <ArrowLeft className="w-4 h-4 rotate-180" />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
            
            {/* Ручной ввод времени */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="text-sm font-semibold text-gray-700">
                  Укажите время для новой записи:
                </div>
                
                {/* Время начала */}
                <div className="space-y-2">
                  <Label>Время начала</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setOverlapError(null);
                    }}
                    className="h-12"
                  />
                </div>

                {/* Длительность */}
                <div className="space-y-2">
                  <Label>Длительность</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_OPTIONS.slice(0, 2).map((option) => (
                      <button
                        key={option.minutes}
                        onClick={() => handleDurationSelect(option.minutes)}
                        disabled={!startTime}
                        className={cn(
                          "border-2 rounded-lg p-3 text-sm font-medium transition-all cursor-pointer",
                          !startTime ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-blue-50",
                          getCurrentDuration() === option.minutes ? "border-primary bg-blue-50" : ""
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Время окончания */}
                <div className="space-y-2">
                  <Label>Время окончания</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      checkOverlap(startTime, e.target.value);
                    }}
                    className="h-12"
                  />
                </div>

                {/* Статус проверки */}
                {startTime && endTime && (
                  <div className="space-y-2">
                    {overlapError ? (
                      <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 p-3 rounded-lg">
                        <AlertCircle className="w-4 h-4" />
                        <span>{overlapError}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                        <Check className="w-4 h-4" />
                        <span>Проверка: Нет пересечений! Можно записать</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button className="w-full h-12" onClick={nextStep}>Далее</Button>
          </div>
        )}

        {/* Шаг 4: Оплата и подтверждение */}
        {step === 4 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            {/* Если СБП - показываем страницу оплаты */}
            {paymentMethod === 'СБП' && showBankSelection ? (
              <BankSelectionStep
                bookingDetails={{
                  date: selectedDate,
                  time: startTime,
                  boxNumber: 1, // Шиномонтаж - 1 пост
                  carModel,
                  plateNumber,
                  services: selectedServices.map(s => s.service_id),
                  price,
                }}
                services={tireServices}
                profileId={profileId}
                profileName={profileName}
                profilePhone={profilePhone}
                onBack={() => setShowBankSelection(false)}
                onPaymentComplete={() => {
                  // TODO: реализовать создание заказа после оплаты
                }}
                onWizardClose={onWizardClose}
                serviceType='tire'
              />
            ) : (
              <>
                <h3 className="text-xl font-bold">Оплата и подтверждение</h3>

                {/* Информация о записи */}
                <Card className="border-primary bg-blue-50/50">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Дата и время</div>
                      <div className="font-bold text-lg">
                        {selectedDate} в {startTime} - {endTime}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Автомобиль</div>
                      <div className="font-medium">{carModel} ({plateNumber})</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Услуги</div>
                      <div className="space-y-1">
                        {selectedServices.map((service) => (
                          <div key={service.service_id} className="text-sm">
                            {service.name} × {service.quantity}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Подпись водителя для организационных машин */}
                    {selectedCarType === 'organization' && (
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Подпись водителя</div>
                        {isLoadingSignature ? (
                          <div className="text-sm text-gray-500">Загрузка...</div>
                        ) : driverSignature ? (
                          <div className="border-2 border-gray-200 rounded-lg p-2 bg-white">
                            <img
                              src={driverSignature}
                              alt="Подпись водителя"
                              className="h-16 mx-auto"
                            />
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 flex items-center gap-2">
                            <Pen className="w-4 h-4" />
                            Подпись не установлена
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="font-bold">Итого:</span>
                      <span className="text-xl font-bold">{price} ₽</span>
                    </div>
                  </CardContent>
                </Card>

                 {/* Способ оплаты */}
                <div className="space-y-3">
                  <Label>Способ оплаты</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => setPaymentMethod('Наличный')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentMethod === 'Наличный'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <CreditCard className={cn("w-6 h-6", paymentMethod === 'Наличный' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentMethod === 'Наличный' ? "" : "text-gray-400")}>Наличный</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('Безналичный')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentMethod === 'Безналичный'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <CreditCard className={cn("w-6 h-6", paymentMethod === 'Безналичный' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentMethod === 'Безналичный' ? "" : "text-gray-400")}>Безнал</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('Перевод')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentMethod === 'Перевод'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <Send className={cn("w-6 h-6", paymentMethod === 'Перевод' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentMethod === 'Перевод' ? "" : "text-gray-400")}>Перевод</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('QR-code')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentMethod === 'QR-code'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <QrCode className={cn("w-6 h-6", paymentMethod === 'QR-code' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentMethod === 'QR-code' ? "" : "text-gray-400")}>QR-code</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('СБП')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentMethod === 'СБП'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <Building2 className={cn("w-6 h-6", paymentMethod === 'СБП' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentMethod === 'СБП' ? "" : "text-gray-400")}>СБП</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('Ведомость')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentMethod === 'Ведомость'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <ClipboardList className={cn("w-6 h-6", paymentMethod === 'Ведомость' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentMethod === 'Ведомость' ? "" : "text-gray-400")}>Ведомость</span>
                    </button>
                  </div>
                </div>

                {validationError && (
                  <div className="text-red-500 text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {validationError}
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full h-14 mt-6 text-lg"
                  onClick={paymentMethod === 'СБП' ? () => setShowBankSelection(true) : handlePayment}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Создание заказа...</span>
                    </div>
                  ) : (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      {paymentMethod === 'СБП' || paymentMethod === 'Безналичный' ? 'Оплатить и записаться' : 'Подтвердить запись'}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
