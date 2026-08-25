import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ArrowLeft, Check, Calculator, Clock, CreditCard, User, History, Repeat, Send, AlertCircle, Building2, Pen, Lock, CheckCircle, Circle, ClipboardList, QrCode } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { CarType } from '../../types';
import { formatDate } from '../../shared/utils/date';
import { Service, getServicePrice } from '../../lib/api/services';
import { getBookingsByProfileId } from '../../lib/api/bookings';
import { SERVICE_CATEGORIES, isBonusService } from '../../lib/config/serviceCategories';
import { getClientCars } from '../../lib/api/clients';
import { hasFreeBodyWashAvailable, hasFreeBodyWashAvailableByProfileId, getWashesUntilNextFreeWash, getWashesUntilNextFreeWashByProfileId } from '../../lib/api/loyalty';
import { LOYALTY_CONFIG } from '../../shared/config/loyalty';
import { Client, ClientCar } from '../../lib/api/clients';
import { Booking } from '../../lib/api/bookings';
import { CombinedCar, getClientCombinedCars } from '../../lib/api/combined-cars';
import { findDriversByPhone } from '../../lib/api/organizations';
import { isProfileBlockedForOnlineBooking } from '../../lib/api/booking-cancellations';
import { BankSelectionStep } from './BankSelectionStep';

export interface OnlineBookingWizardData {
  clientCarId?: string;              // Для личных машин
  organizationCarId?: string;         // Для организационных машин
  carModel: string;
  plateNumber: string;
  carType: CarType;
  price: number;
  services: string[];
  paymentMethod: 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость' | 'QR-code';
  bookingDate: string;
  startTime: string;
  boxNumber: number;
  profileId: string;
  organizationId?: string;           // ID организации (для организационных машин)
  isOrganizationCar?: boolean;       // Флаг организационной машины
}

interface OnlineBookingWizardProps {
  onBack: () => void;
  onComplete: (data: OnlineBookingWizardData) => void;
  onWizardClose?: () => void;
  profileId: string;
  clientId: string | null;
  profileName: string;
  profilePhone: string;
  selectedDate?: string;
  selectedSlot?: {
    date: string;
    startTime: string;
    boxNumber: number;
  };
  services?: Service[];
  existingBookings?: Booking[];
  // ✅ Флаг: открыт ли из Timeline (предвыбран слот)
  isFromTimeline?: boolean;
  // ✅ Данные из App.tsx для избежания повторной загрузки
  organizations?: any[];
  organizationDrivers?: any[];
  organizationCars?: any[];
  clients?: any[];
}

const STEPS = 4; // 4 шага: 0-Выбор авто, 1-Услуги, 2-Выбор вида оплаты, 3-Подтверждение/Выбор банка

export const OnlineBookingWizard: React.FC<OnlineBookingWizardProps> = ({
  onBack,
  onComplete,
  onWizardClose,
  profileId,
  clientId,
  profileName,
  profilePhone,
  selectedDate: propSelectedDate,
  selectedSlot: propSelectedSlot,
  services = [],
  existingBookings = [],
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
  
  // История записей
  const [bookingHistory, setBookingHistory] = useState<Booking[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  // Лояльность
  const [hasFreeWash, setHasFreeWash] = useState(false);
  const [washesUntilFree, setWashesUntilFree] = useState(0);
  
  // Выбор класса авто и услуг
   const [selectedCarClass, setSelectedCarClass] = useState<CarType | null>(null);
   const [selectedServices, setSelectedServices] = useState<string[]>([]);
   const [price, setPrice] = useState(0);
   const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set()); // Раскрытые категории аккордеона (все закрыты по умолчанию)
  
   // Оплата
   const [paymentMethod, setPaymentMethod] = useState<'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость' | 'QR-code'>('Наличный');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Ошибки
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Подпись водителя организации
  const [driverSignature, setDriverSignature] = useState<string | null>(null);
  const [isLoadingSignature, setIsLoadingSignature] = useState(false);

  // Проверка блокировки
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(true);

  // Загрузка данных при монтировании
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingHistory(true);
      setIsLoadingBlocked(true);
      try {
        // ✅ Проверяем блокировку
        const blocked = await isProfileBlockedForOnlineBooking(profileId);
        setIsBlocked(blocked);

        // ✅ Используем данные из props вместо загрузки из API
        // Загружаем комбинированный список машин (личные + организационные)
        if (clientId && profilePhone) {
          const cars = await getClientCombinedCars(clientId, profilePhone);
          setCombinedCars(cars);
        } else {
          setCombinedCars([]);
        }

        // Загружаем историю записей
        const history = await getBookingsByProfileId(profileId);
        setBookingHistory(history);

        // Проверяем лояльность
        const freeWash = await hasFreeBodyWashAvailableByProfileId(profileId);
        setHasFreeWash(freeWash);

        const untilFree = await getWashesUntilNextFreeWashByProfileId(profileId);
        setWashesUntilFree(untilFree);
      } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
      } finally {
        setIsLoadingHistory(false);
        setIsLoadingBlocked(false);
      }
    };

    loadData();
  }, [profileId, clientId]);

  // ✅ Синхронизация selectedDate с propSelectedDate при изменении (защита от устаревшей даты)
  useEffect(() => {
    if (propSelectedDate && propSelectedDate !== selectedDate) {
      setSelectedDate(propSelectedDate);
    }
  }, [propSelectedDate]);

  // Обработчик выбора машины из списка
  const handleSelectCar = async (car: CombinedCar, type: 'personal' | 'organization') => {
    setSelectedCarId(car.id);
    setSelectedCarType(type);
    setCarModel(car.car_model);
    setPlateNumber(car.plate_number);
    setSelectedCarClass(car.car_type as CarType);
    
    // Если выбрана организационная машина, загружаем подпись водителя
    if (type === 'organization' && profilePhone) {
      setIsLoadingSignature(true);
      try {
        const drivers = await findDriversByPhone(profilePhone);
        if (drivers && drivers.length > 0) {
          // Находим водителя из этой организации
          const driver = drivers.find(d => d.organization.id === car.organization_id);
          if (driver?.driver.signature_data) {
            setDriverSignature(driver.driver.signature_data);
          } else {
            setDriverSignature(null);
          }
        } else {
          setDriverSignature(null);
        }
      } catch (error) {
        console.error('Ошибка при загрузке подписи:', error);
        setDriverSignature(null);
      } finally {
        setIsLoadingSignature(false);
      }
    } else {
      setDriverSignature(null);
    }
    
    // Переходим к следующему шагу (Услуги)
    setStep(2);
  };

  // Обработчик повтора записи из истории
  const handleRepeatBooking = async (booking: Booking) => {
    setSelectedCarId(booking.client_car_id || booking.car_id || null);
    const carType = booking.client_car_id ? 'personal' : (booking.car_id ? 'organization' : null);
    setSelectedCarType(carType);
    setCarModel(booking.car_model);
    setPlateNumber(booking.plate_number);
    setSelectedCarClass(booking.car_type as CarType);
    setSelectedServices(booking.services);
    
    // Если повторяем организационную запись, загружаем подпись
    if (carType === 'organization' && profilePhone) {
      setIsLoadingSignature(true);
      try {
        const drivers = await findDriversByPhone(profilePhone);
        if (drivers && drivers.length > 0) {
          const driver = drivers.find(d => d.organization.id === booking.organization_id);
          if (driver?.driver.signature_data) {
            setDriverSignature(driver.driver.signature_data);
          } else {
            setDriverSignature(null);
          }
        } else {
          setDriverSignature(null);
        }
      } catch (error) {
        console.error('Ошибка при загрузке подписи:', error);
        setDriverSignature(null);
      } finally {
        setIsLoadingSignature(false);
      }
    } else {
      setDriverSignature(null);
    }
    
    // Пересчитываем цену
    const newPrice = booking.services.reduce((sum, serviceId) => {
      const service = services.find(s => s.id === serviceId);
      if (service && booking.car_type) {
        return sum + getServicePrice(service, booking.car_type as CarType);
      }
      return sum;
    }, 0);
    setPrice(newPrice);

    // Переходим к шагу оплаты
    setStep(3);
  };

  // Обработчик выбора услуги
  const handleServiceToggle = (serviceId: string, servicePrice: number) => {
    if (selectedServices.includes(serviceId)) {
      // Убираем услугу из списка
      setSelectedServices(prev => prev.filter(id => id !== serviceId));
      setPrice(p => p - servicePrice);
    } else {
      // Добавляем услугу в список
      setSelectedServices(prev => [...prev, serviceId]);
      setPrice(p => p + servicePrice);
    }
  };

  // Обработчик оплаты
  const handlePayment = async () => {
    if (!selectedCarId || !carModel || !plateNumber || !selectedCarClass) {
      setValidationError('Выберите автомобиль');
      return;
    }

    if (!selectedSlot) {
      setValidationError('Выберите время записи');
      return;
    }

    // ✅ БЛОКИРУЕМ КНОПКУ ДЛЯ ВСЕХ МЕТОДОВ ОПЛАТЫ
    setIsProcessingPayment(true);
    setValidationError(null);

    try {
      if (paymentMethod === 'Безналичный') {
        // Онлайн-оплата
        // TODO: Интеграция с платёжной системой
        // await processOnlinePayment(price, profileId);

        // После успешной оплаты
        const selectedCar = combinedCars.find(c => c.id === selectedCarId);
        await onComplete({
          clientCarId: selectedCarType === 'personal' ? selectedCarId : undefined,
          organizationCarId: selectedCarType === 'organization' ? selectedCarId : undefined,
          carModel,
          plateNumber,
          carType: selectedCarClass,
          price,
          services: selectedServices,
          paymentMethod,
          bookingDate: selectedDate,
          startTime: selectedSlot.startTime,
          boxNumber: selectedSlot.boxNumber,
          profileId,
          organizationId: selectedCar?.organization_id,
          isOrganizationCar: selectedCarType === 'organization'
        });
      } else {
        // Наличные/Перевод - подтверждение сразу
        const selectedCar = combinedCars.find(c => c.id === selectedCarId);
        await onComplete({
          clientCarId: selectedCarType === 'personal' ? selectedCarId : undefined,
          organizationCarId: selectedCarType === 'organization' ? selectedCarId : undefined,
          carModel,
          plateNumber,
          carType: selectedCarClass,
          price,
          services: selectedServices,
          paymentMethod,
          bookingDate: selectedDate,
          startTime: selectedSlot.startTime,
          boxNumber: selectedSlot.boxNumber,
          profileId,
          organizationId: selectedCar?.organization_id,
          isOrganizationCar: selectedCarType === 'organization'
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

  return (
    <div className="h-full flex flex-col pb-20 pt-safe telegram-safe-area-top">
      {/* Wizard Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={prevStep}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h2 className="font-bold text-lg">Онлайн-запись</h2>
          <div className="text-xs text-gray-500">
            {step === 1 ? 'Выбор авто' : step === 2 ? 'Услуги' : step === 3 ? 'Выбор вида оплаты' : 'Подтверждение'}
          </div>
        </div>
      </div>

      {/* Блокировка */}
      {isBlocked && !isLoadingBlocked && (
        <div className="flex-1 flex items-center justify-center bg-gray-100">
          <div className="text-center p-8">
            <Lock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <div className="text-lg font-bold text-gray-700 mb-2">
              Онлайн запись для вас недоступна
            </div>
            <div className="text-gray-600">
              Чтобы записаться, позвоните по номеру: <span className="font-bold">89281930600</span>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar - не показываем на шаге 1 */}
      {!isBlocked && step !== 1 && (
        <div className="h-1 bg-gray-200 w-full mb-6 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${((step - 1) / (STEPS - 1)) * 100}%` }}
          />
        </div>
      )}

      {/* Step Content */}
      {!isBlocked && (
        <div className="flex-1 overflow-y-auto px-1">

          {/* Шаг 1: Выбор автомобиля */}
          {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            {/* Выбор машины */}
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Выберите автомобиль</h4>
              
              {/* Личные машины */}
              {combinedCars.filter(c => c.type === 'personal').length > 0 && (
                <div className="mb-4">
                  <div className="text-sm text-gray-600 font-medium mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Личные
                  </div>
                  <div className="space-y-2">
                    {combinedCars
                      .filter(c => c.type === 'personal')
                      .map((car) => (
                        <Card
                          key={car.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            selectedCarId === car.id && selectedCarType === 'personal'
                              ? "border-primary bg-blue-50"
                              : "hover:border-primary"
                          )}
                          onClick={() => handleSelectCar(car, 'personal')}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-bold">{car.car_model}</div>
                                <div className="text-sm text-gray-500">{car.plate_number}</div>
                              </div>
                              {selectedCarId === car.id && selectedCarType === 'personal' && (
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
              
              {/* Организационные машины */}
              {combinedCars.filter(c => c.type === 'organization').length > 0 && (
                <div>
                  <div className="text-sm text-gray-600 font-medium mb-2 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Организации
                  </div>
                  <div className="space-y-2">
                    {combinedCars
                      .filter(c => c.type === 'organization')
                      .map((car) => (
                        <Card
                          key={car.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            selectedCarId === car.id && selectedCarType === 'organization'
                              ? "border-primary bg-blue-50"
                              : "hover:border-primary"
                          )}
                          onClick={() => handleSelectCar(car, 'organization')}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-bold">{car.car_model}</div>
                                <div className="text-sm text-gray-500">{car.plate_number}</div>
                                {car.organization_name && (
                                  <div className="text-xs text-gray-400">{car.organization_name}</div>
                                )}
                              </div>
                              {selectedCarId === car.id && selectedCarType === 'organization' && (
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
              
              {combinedCars.length === 0 && (
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
            <h3 className="text-xl font-bold">Услуги</h3>
            <div className="space-y-4">
              <Label className="text-gray-500 text-xs uppercase tracking-wider block">Выберите услуги</Label>

              {/* Бонусная мойка - отдельный блок (только для личных машин) */}
              {hasFreeWash && selectedCarType === 'personal' && (() => {
                const freeWashService = services.find(s => s.id === LOYALTY_CONFIG.FREE_BODY_WASH_SERVICE_ID);
                if (!freeWashService) return null;

                const isSelected = selectedServices.includes(freeWashService.id);

                return (
                  <div
                    className={cn(
                      "flex items-center justify-between border-2 p-4 rounded-xl cursor-pointer transition-all",
                      isSelected ? "border-green-500 bg-green-50" : "border-green-300 hover:border-green-500 hover:bg-green-50"
                    )}
                    onClick={() => handleServiceToggle(freeWashService.id, 0)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isSelected ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-bold">{freeWashService.name}</div>
                        <div className="text-xs text-green-600 font-bold">0 ₽</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Аккордеон категорий услуг */}
              <div className="space-y-3">
                {Object.values(SERVICE_CATEGORIES).map((category) => {
                  const categoryServices = services.filter(svc => 
                    !isBonusService(svc.service_id) && 
                    category.services.includes(svc.service_id) &&
                    svc.is_visible_in_online_booking !== false
                  );
                  
                  if (categoryServices.length === 0) return null;
                  
                  const isExpanded = expandedCategories.has(category.id);
                  
                  return (
                    <div key={category.id} className="border rounded-lg overflow-hidden">
                      {/* Заголовок категории */}
                      <button
                        type="button"
                        onClick={() => {
                          const newExpanded = new Set(expandedCategories);
                          if (isExpanded) {
                            newExpanded.delete(category.id);
                          } else {
                            newExpanded.add(category.id);
                          }
                          setExpandedCategories(newExpanded);
                        }}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{category.icon}</span>
                          <span className="font-medium text-sm">{category.label}</span>
                          <span className="text-xs text-gray-500">({categoryServices.length})</span>
                        </div>
                        <div className={cn(
                          "transition-transform duration-200",
                          isExpanded ? "rotate-180" : ""
                        )}>
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      
                      {/* Услуги категории */}
                      {isExpanded && (
                        <div className="p-3 space-y-2 border-t">
                          {categoryServices.map((svc: Service) => {
                            const servicePrice = selectedCarClass ? getServicePrice(svc, selectedCarClass) : 0;
                            const isSelected = selectedServices.includes(svc.id);
                            
                            return (
                              <div
                                key={svc.id}
                                className={cn(
                                  "flex items-center justify-between border p-3 rounded-lg cursor-pointer transition-colors",
                                  isSelected ? "border-primary bg-blue-50" : "hover:border-primary hover:bg-gray-50"
                                )}
                                onClick={() => handleServiceToggle(svc.id, servicePrice)}
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  {isSelected ? (
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                  ) : (
                                    <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                  )}
                                   <div>
                                     <div className="text-sm font-medium">{svc.name}</div>
                                     <div className="text-xs text-gray-500 whitespace-nowrap">+{servicePrice} ₽</div>
                                   </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

                <div className="bg-black text-white p-4 rounded-xl flex justify-between items-center mt-6">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    <span className="font-medium">Всего:</span>
                  </div>
                  <span className="text-xl font-bold">{price} ₽</span>
                </div>
                <Button className="w-full h-12" onClick={() => { setPaymentMethod('Наличный'); nextStep(); }} disabled={selectedServices.length === 0}>Далее</Button>
            </div>
          </div>
        )}

        {/* Шаг 3: Выбор вида оплаты */}
        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold">Выберите способ оплаты</h3>

             {/* Способ оплаты */}
            <div className="space-y-3">
              <Label>Способ оплаты</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setPaymentMethod('Наличный')}
                  className={cn(
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
                    paymentMethod === 'Перевод'
                      ? "border-primary bg-blue-50"
                      : "border hover:border-primary hover:bg-blue-50"
                  )}
                >
                  <Send className={cn("w-6 h-6", paymentMethod === 'Перевод' ? "text-primary" : "text-gray-400")} />
                  <span className={cn("font-bold text-sm", paymentMethod === 'Перевод' ? "" : "text-gray-400")}>Перевод</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('СБП')}
                  className={cn(
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
                    paymentMethod === 'СБП'
                      ? "border-primary bg-blue-50"
                      : "border hover:border-primary hover:bg-blue-50"
                  )}
                >
                  <Building2 className={cn("w-6 h-6", paymentMethod === 'СБП' ? "text-primary" : "text-gray-400")} />
                  <span className={cn("font-bold text-sm", paymentMethod === 'СБП' ? "" : "text-gray-400")}>СБП</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('QR-code')}
                  className={cn(
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
                    paymentMethod === 'QR-code'
                      ? "border-primary bg-blue-50"
                      : "border hover:border-primary hover:bg-blue-50"
                  )}
                >
                  <QrCode className={cn("w-6 h-6", paymentMethod === 'QR-code' ? "text-primary" : "text-gray-400")} />
                  <span className={cn("font-bold text-sm", paymentMethod === 'QR-code' ? "" : "text-gray-400")}>QR-code</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('Ведомость')}
                  className={cn(
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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

            <Button
              className="w-full h-14 text-lg"
              onClick={paymentMethod === 'СБП' ? () => setStep(4) : nextStep}
              disabled={!paymentMethod}
            >
              <Check className="w-5 h-5 mr-2" />
              {paymentMethod === 'СБП' ? 'Оплатить и записаться' : 'Подтвердить'}
            </Button>
          </div>
        )}

        {/* Шаг 4: Подтверждение записи / Оплата СБП */}
        {step === 4 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            {/* Если СБП - показываем страницу оплаты */}
            {paymentMethod === 'СБП' ? (
              <>
                {console.log('[OnlineBookingWizard] Rendering BankSelectionStep with profileId:', profileId, 'type:', typeof profileId)}
                <BankSelectionStep
                  bookingDetails={{
                    date: selectedDate,
                    time: selectedSlot?.startTime || '',
                    boxNumber: selectedSlot?.boxNumber || 0,
                    carModel,
                    plateNumber,
                    services: selectedServices,
                    price,
                  }}
                  services={services}
                  profileId={profileId}
                  profileName={profileName}
                  profilePhone={profilePhone}
                  onBack={() => setStep(3)}
                  onPaymentComplete={() => {
                    // Перенаправляем на страницу гаража/онлайн записи
                    // TODO: реализовать перенаправление
                  }}
                  onWizardClose={onWizardClose}
                  serviceType='carwash'
                />
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold">Подтверждение записи</h3>

            {/* Информация о записи */}
            <Card className="border-primary bg-blue-50/50">
              <CardContent className="p-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Дата и время</div>
                  <div className="font-bold text-lg">
                    {selectedDate} в {selectedSlot?.startTime}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Бокс</div>
                  <div className="font-medium">Бокс {selectedSlot?.boxNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Автомобиль</div>
                  <div className="font-medium">{carModel} ({plateNumber})</div>
                  {selectedCarType === 'organization' && (
                    <div className="text-xs text-gray-400 mt-1">Организационный автомобиль</div>
                  )}
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

                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Услуги</div>
                  <div className="space-y-1">
                    {selectedServices.map((serviceId) => {
                      const service = services.find(s => s.id === serviceId);
                      return (
                        <div key={serviceId} className="text-sm">
                          {service?.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-bold">Итого:</span>
                  <span className="text-xl font-bold">{price} ₽</span>
                </div>
              </CardContent>
            </Card>

             {/* Способ оплаты */}
            <div className="space-y-3">
              <Label>Способ оплаты</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <button
                  onClick={() => setPaymentMethod('Наличный')}
                  className={cn(
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
                    paymentMethod === 'QR-code'
                      ? "border-primary bg-blue-50"
                      : "border hover:border-primary hover:bg-blue-50"
                  )}
                >
                  <QrCode className={cn("w-6 h-6", paymentMethod === 'QR-code' ? "text-primary" : "text-gray-400")} />
                  <span className={cn("font-bold text-sm", paymentMethod === 'QR-code' ? "" : "text-gray-400")}>QR-code</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('Ведомость')}
                  className={cn(
                    "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
              onClick={handlePayment}
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
                  {paymentMethod === 'Безналичный' ? 'Оплатить и записаться' : 'Подтвердить запись'}
                </>
              )}
            </Button>
              </>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
};
