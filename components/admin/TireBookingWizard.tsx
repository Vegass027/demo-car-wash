import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ArrowLeft, Check, Calculator, Clock, CreditCard, User, Building2, AlertCircle, Calendar, Send, Plus, Minus, Search, ChevronDown, Lock, ClipboardList, QrCode } from 'lucide-react';
import { DateSelector } from './DateSelector';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { TireBooking, TireServiceItem, TireBookingStatus } from '../../lib/api/tire-bookings';
import { getTireServices, groupServicesByCategory } from '../../lib/api/tire-services';
import type { TireService as TireServiceType } from '../../lib/api/tire-services';
import { getOrganizations, getDriverSignature, Organization } from '../../lib/api/organizations';
import { formatDate } from '../../shared/utils/date';
import { addMinutesToTime, isValidTimeRange, findOverlappingTireBookings, findAvailableTireTimeSlots, calculateEndTime, formatTimeWithoutSeconds } from '../../shared/utils/time';
import { DURATION_OPTIONS } from '../../shared/config/tire-booking';
import { searchByPhone, searchByPlateNumber } from '../../lib/api/search';
import { SearchResult } from '../../lib/api/search';
import { Client, ClientCar, getClientCars } from '../../lib/api/clients';
import { validatePhone, validateCarNumber } from '../booking/validation';
import { CarCard } from '../booking/CarCard';
import { trackCarChanges, findCarById } from '../booking/carUtils';
import { OrganizationDriver, OrganizationCar } from '../../entities/organization/model';
import { supabase } from '../../lib/supabase';
import Timeline from './Timeline';
import { SignatureModal } from './SignatureModal';
import { updateDriverSignature } from '../../lib/api/organizations';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import { CarType } from '../../types';
import { ClientDatabaseAccordion } from './ClientDatabaseAccordion';

export interface TireBookingWizardData {
  clientType: 'PHYSICAL' | 'ORG';
  clientName: string;
  phone: string;
  carModel: string;
  carNumber: string;
  services: TireServiceItem[];
  price: number;
  startTime: string;
  endTime: string;
  paymentType: 'Наличный' | 'Безналичный' | 'Перевод' | 'QR-code' | 'Ведомость' | 'Яндекс';
  date: string;
  orgName?: string;
  organizationId?: string;
  driverId?: string;
  carId?: string;
  estimatedDuration: number;
  clientId?: string;
  clientCarId?: string;
}

interface TireBookingWizardProps {
  onBack: () => void;
  onComplete: (data: TireBookingWizardData) => void;
  initialTime?: string;
  selectedDate?: string;
  existingBookings?: TireBooking[];
  isCreatingTireBooking?: boolean;
}

const STEPS = 4; // 4 шага: 1-Поиск, 2-Услуги, 3-Время и оплата, 4-Подтверждение (шаг0 - создание клиента не считается)


export const TireBookingWizard: React.FC<TireBookingWizardProps> = ({
  onBack,
  onComplete,
  initialTime,
  selectedDate: propSelectedDate,
  existingBookings = [],
  isCreatingTireBooking: isCreatingTireBookingProp = false
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(propSelectedDate || formatDate(new Date()));
  const [step, setStep] = useState(1);
  const [clientType, setClientType] = useState<'PHYSICAL' | 'ORG'>('PHYSICAL');
  const [phone, setPhone] = useState('+7 ');
  const [clientName, setClientName] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<TireServiceItem[]>([]);
  const [price, setPrice] = useState(0);
  const [startTime, setStartTime] = useState(initialTime || '');
  const [endTime, setEndTime] = useState('');
  const [paymentType, setPaymentType] = useState<'Наличный' | 'Безналичный' | 'Перевод' | 'QR-code' | 'Ведомость' | 'Яндекс'>('Наличный');
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const [isCreatingNewClient, setIsCreatingNewClient] = useState(false);
  const [newOrganizationName, setNewOrganizationName] = useState('');
  const [newDriverName, setNewDriverName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newCarType, setNewCarType] = useState<CarType>(CarType.SEDAN);
   
  const [tireServices, setTireServices] = useState<TireServiceType[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationDrivers, setOrganizationDrivers] = useState<OrganizationDriver[]>([]);
  const [organizationCars, setOrganizationCars] = useState<OrganizationCar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
   const [selectedClientCarId, setSelectedClientCarId] = useState<string | null>(null);
   const [clientCars, setClientCars] = useState<ClientCar[]>([]);
   
   // ✅ Отдельные переменные для поиска по гос номеру
   const [plateNumber, setPlateNumber] = useState('');
   const [plateSearchResults, setPlateSearchResults] = useState<SearchResult[]>([]);
   const [isPlateSearching, setIsPlateSearching] = useState(false);
   
   const [originalCarModel, setOriginalCarModel] = useState('');
  const [originalCarNumber, setOriginalCarNumber] = useState('');
  const [isCarModelChanged, setIsCarModelChanged] = useState(false);
  const [isCarNumberChanged, setIsCarNumberChanged] = useState(false);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    
  // Состояние для модального окна подписи водителя
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [selectedDriverForSignature, setSelectedDriverForSignature] = useState<OrganizationDriver | null>(null);
  const [driverSignature, setDriverSignature] = useState<string | null>(null);

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

  // Форматирование гос. номера при вводе (формат: X777XX - строго 6 символов)
  const formatCarNumber = (value: string): string => {
    const cleaned = value.replace(/[^А-ЯA-Zа-яa-z0-9]/g, '').toUpperCase();
    return cleaned.slice(0, 6);
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

  // Обработчик открытия модального окна подписи
  const handleOpenSignatureModal = (driver: OrganizationDriver) => {
    setSelectedDriverForSignature(driver);
    setSignatureModalOpen(true);
  };

  // Обработчик сохранения подписи водителя
  const handleSaveDriverSignature = async (signatureBase64: string) => {
    if (!selectedDriverForSignature) return;

    try {
      await updateDriverSignature(selectedDriverForSignature.id, signatureBase64);

      // Обновляем локальное состояние подписи
      setDriverSignature(signatureBase64);

      setSignatureModalOpen(false);
      setSelectedDriverForSignature(null);
    } catch (error) {
      console.error('Ошибка сохранения подписи:', error);
      alert('Не удалось сохранить подпись');
    }
  };

  // Проверка пересечений
  const checkOverlap = (start: string, end: string): boolean => {
    if (!start || !end) return false;
    if (!isValidTimeRange(start, end)) {
      setOverlapError('Время окончания должно быть больше времени начала');
      return true;
    }

    const overlapping = findOverlappingTireBookings(
      start,
      end,
      existingBookings,
      selectedDate || formatDate(new Date())
    );

    if (overlapping.length > 0) {
      const booking = overlapping[0];
      const endTime = calculateEndTime(booking.start_time, booking.estimated_duration);
      setOverlapError(
        `Пересечение с заказом: ${booking.car_model} (${booking.start_time} - ${endTime})`
      );
      return true;
    }

    setOverlapError(null);
    return false;
  };

  // Навигация по шагам
  const nextStep = () => {
    if (step === 2 && selectedServices.length === 0) {
      // Шаг 2 = услуги, проверяем что выбрана хотя бы одна услуга
      return;
    }
    if (step === 3) {
      // Шаг 3 = время и оплата, валидируем перед переходом к подтверждению
      if (!startTime || !startTime.includes(':') || startTime.split(':')[1] === '') {
        return;
      }
      if (!endTime || !endTime.includes(':') || endTime.split(':')[1] === '') {
        return;
      }
      if (checkOverlap(startTime, endTime)) {
        return;
      }
    }
    setStep(prev => Math.min(prev + 1, STEPS));
  };

  const prevStep = () => {
    if (step === 0) {
      // На шаге 0 возвращаемся на шаг 1 (Поиск)
      setStep(1);
      setIsCreatingNewClient(false);
    } else if (step === 1) {
      onBack();
    } else {
      setStep(prev => prev - 1);
    }
  };



  // Сброс времени при изменении initialTime
  React.useEffect(() => {
    setStartTime(initialTime || '');
    setEndTime('');
    setOverlapError(null);
  }, [initialTime]);

  // Сброс времени при изменении выбранной даты
  React.useEffect(() => {
    setStartTime('');
    setEndTime('');
    setOverlapError(null);
  }, [selectedDate]);

  // ✅ Синхронизация selectedDate с propSelectedDate при изменении (защита от устаревшей даты)
  React.useEffect(() => {
    if (propSelectedDate && propSelectedDate !== selectedDate) {
      setSelectedDate(propSelectedDate);
    }
  }, [propSelectedDate]);

  // Автоматическое обновление endTime при изменении startTime
  React.useEffect(() => {
    if (startTime && endTime && !overlapError) {
      // Пересчитываем endTime если был выбран через быстрый выбор
      // Но не меняем если пользователь уже вручную указал endTime
    }
  }, [startTime]);

  // Загрузка услуг и организаций из БД при монтировании компонента
  React.useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [servicesData, orgsData] = await Promise.all([
          getTireServices(),
          getOrganizations()
        ]);
        setTireServices(servicesData);
        setOrganizations(orgsData);
      } catch (error) {
        console.error('[TireBookingWizard] Ошибка при загрузке данных:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Поиск по телефону с debounce
  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (validatePhone(phone) && step === 1) {
        setIsSearching(true);
        setSearchResults([]);
        
        try {
          const results = await searchByPhone(phone);
          setSearchResults(results);
        } catch (error) {
          console.error('Ошибка при поиске:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [phone, step]);

  // Поиск по гос номеру с debounce
  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (validateCarNumber(plateNumber) && step === 1) {
        setIsPlateSearching(true);
        setPlateSearchResults([]);
        
        try {
          const results = await searchByPlateNumber(plateNumber);
          setPlateSearchResults(results);
        } catch (error) {
          console.error('Ошибка при поиске по гос номеру:', error);
        } finally {
          setIsPlateSearching(false);
        }
      } else {
        setPlateSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [plateNumber, step]);

  // Загрузка подписи водителя при выборе организации и водителя
  useEffect(() => {
    const loadDriverSignature = async () => {
      if (selectedDriverId && clientType === 'ORG') {
        try {
          const signature = await getDriverSignature(selectedDriverId);
          setDriverSignature(signature);
        } catch (error) {
          console.error('Ошибка при загрузке подписи водителя:', error);
          setDriverSignature(null);
        }
      } else {
        setDriverSignature(null);
      }
    };

    loadDriverSignature();
  }, [selectedDriverId, clientType]);

  // Группировка услуг по категориям
  const groupedServices = React.useMemo(() => {
    return groupServicesByCategory(tireServices);
  }, [tireServices]);

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

  // Обработчик изменения произвольной цены для "ПРОЧЕЕ"
  const handleCustomPriceChange = (serviceId: string, customPrice: number) => {
    setSelectedServices(prev => prev.map(item =>
      item.service_id === serviceId
        ? { ...item, customPrice, price: customPrice, total: customPrice * item.quantity }
        : item
    ));
    // Пересчитываем общую цену
    const newServices = selectedServices.map(item =>
      item.service_id === serviceId
        ? { ...item, customPrice, price: customPrice, total: customPrice * item.quantity }
        : item
    );
    const newPrice = newServices.reduce((sum, s) => sum + s.total, 0);
    setPrice(newPrice);
  };

  // Обработчик изменения комментария для "ПРОЧЕЕ"
  const handleCommentChange = (serviceId: string, comment: string) => {
    setSelectedServices(prev => prev.map(item =>
      item.service_id === serviceId ? { ...item, comment } : item
    ));
  };

  // Получить количество выбранной услуги
  const getServiceQuantity = (serviceId: string): number => {
    const service = selectedServices.find(s => s.service_id === serviceId);
    return service ? service.quantity : 0;
  };

  // ✅ Функция сохранения нового клиента/организации
  const handleSaveNewClient = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    if (clientType === 'PHYSICAL') {
      // Валидация для физлица
      if (!clientName || clientName.trim() === '') {
        setSaveError('Укажите имя клиента');
        return;
      }
      if (!phone || phone.trim() === '+7 ') {
        setSaveError('Введите корректный номер телефона');
        return;
      }
      if (!validatePhone(phone)) {
        setSaveError('Введите корректный номер телефона');
        return;
      }
      if (!carModel || carModel.trim() === '') {
        setSaveError('Укажите модель автомобиля');
        return;
      }
      if (!carNumber || carNumber.trim() === '') {
        setSaveError('Укажите гос. номер');
        return;
      }
      if (!validateCarNumber(carNumber)) {
        setSaveError('Формат: А123АА');
        return;
      }

      try {
        // Создаем клиента
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            full_name: clientName,
            phone: normalizePhoneNumber(phone),
            is_active: true
          })
          .select()
          .single();

        if (clientError) throw clientError;

        // Создаем автомобиль клиента
        const { data: newCar, error: carError } = await supabase
          .from('client_cars')
          .insert({
            client_id: newClient.id,
            car_model: carModel,
            plate_number: carNumber,
            car_type: newCarType,
            is_active: true
          })
          .select()
          .single();

        if (carError) throw carError;

        setSaveSuccess(true);
        
        // Сбрасываем форму через 2 секунды и возвращаемся на шаг 1
        setTimeout(() => {
          setSaveSuccess(false);
          setIsCreatingNewClient(false);
          setClientName('');
          setPhone('+7 ');
          setCarModel('');
          setCarNumber('');
          setNewCarType(CarType.SEDAN);
          setStep(1);
        }, 2000);
      } catch (error) {
        console.error('Ошибка при сохранении клиента:', error);
        setSaveError('Ошибка при сохранении клиента');
      }
    } else if (clientType === 'ORG') {
      // Валидация для организации
      if (!newOrganizationName || newOrganizationName.trim() === '') {
        setSaveError('Введите название организации');
        return;
      }
      if (!newDriverName || newDriverName.trim() === '') {
        setSaveError('Введите имя водителя');
        return;
      }
      // Телефон водителя теперь опциональный
      if (!carModel || carModel.trim() === '') {
        setSaveError('Укажите модель автомобиля');
        return;
      }
      if (!carNumber || carNumber.trim() === '') {
        setSaveError('Укажите гос. номер');
        return;
      }
      if (!validateCarNumber(carNumber)) {
        setSaveError('Формат: А123АА');
        return;
      }

      try {
        // Создаем организацию
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: newOrganizationName,
            is_active: true
          })
          .select()
          .single();

        if (orgError) throw orgError;

        // Создаем водителя организации (телефон нормализуется автоматически, если указан)
        const { data: newDriver, error: driverError } = await supabase
          .from('organization_drivers')
          .insert({
            organization_id: newOrg.id,
            full_name: newDriverName,
            phone: phone && phone.trim() !== '+7 ' ? normalizePhoneNumber(phone) : null,
            is_active: true
          })
          .select()
          .single();

        if (driverError) throw driverError;

        // Создаем автомобиль организации
        const { data: newCar, error: carError } = await supabase
          .from('organization_cars')
          .insert({
            organization_id: newOrg.id,
            car_model: carModel,
            plate_number: carNumber,
            car_type: newCarType,
            is_active: true
          })
          .select()
          .single();

        if (carError) throw carError;

        setSaveSuccess(true);
        
        // Сбрасываем форму через 2 секунды и возвращаемся на шаг 1
        setTimeout(() => {
          setSaveSuccess(false);
          setIsCreatingNewClient(false);
          setNewOrganizationName('');
          setNewDriverName('');
          setPhone('+7 ');
          setCarModel('');
          setCarNumber('');
          setNewCarType(CarType.SEDAN);
          setStep(1);
        }, 2000);
      } catch (error) {
        console.error('Ошибка при сохранении организации:', error);
        setSaveError('Ошибка при сохранении организации');
      }
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
          <h2 className="font-bold text-lg">Новая запись на шиномонтаж</h2>
          {step !== 0 && <div className="text-xs text-gray-500">Шаг {step} из {STEPS}</div>}
        </div>
      </div>

      {/* Progress Bar - не показываем на шаге 0 */}
      {step !== 0 && (
        <div className="h-1 bg-gray-200 w-full mb-6 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${(step / STEPS) * 100}%` }}
          />
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto px-1">
        
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold">Найти клиента</h3>
            <div className="space-y-4">
              <Label>Номер телефона</Label>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="+7 (___) ___-__-__"
                  value={phone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    if (formatted.startsWith('+7 ') || formatted === '+7') {
                      setPhone(formatted);
                    } else if (formatted === '') {
                      setPhone('+7 ');
                    }
                  }}
                  className="text-lg tracking-wider h-12"
                />
                <Button size="icon" className="h-12 w-12 rounded-md shrink-0">
                  <Search className="w-5 h-5" />
                </Button>
              </div>
              
              {searchResults.length > 0 && !isSearching && (
                <div className="space-y-3">
                  {(() => {
                    const clientResults = searchResults.filter(r => r.type === 'client');
                    const orgResults = searchResults.filter(r => r.type === 'organization');
                    
                    const orgGroups = new Map<string, {
                      organization_id: string;
                      organization_name: string;
                      phone: string;
                      drivers: Array<{
                        driver_id: string;
                        driver_name: string;
                        organization_cars: Array<{
                          id: string;
                          car_model: string;
                          plate_number: string;
                        }>;
                      }>;
                    }>();
                    
                    orgResults.forEach(result => {
                      const orgId = result.organization_id!;
                      if (!orgGroups.has(orgId)) {
                        orgGroups.set(orgId, {
                          organization_id: orgId,
                          organization_name: result.organization_name!,
                          phone: result.phone,
                          drivers: []
                        });
                      }
                      orgGroups.get(orgId)!.drivers.push({
                        driver_id: result.driver_id!,
                        driver_name: result.driver_name!,
                        organization_cars: result.organization_cars || []
                      });
                    });
                    
                    return (
                      <>
                        {clientResults.length > 0 && (
                          <div className="text-sm text-gray-600 font-medium">
                            Найдено: {clientResults.length}
                          </div>
                        )}
                        {clientResults.map((result, index) => {
                          // Проверяем, заблокирован ли клиент
                          const isClientBlocked = result.online_booking_blocked_until && 
                            new Date(result.online_booking_blocked_until) > new Date();

                          return (
                          <div key={`client-${index}`} className="space-y-2">
                            {/* Предупреждение о блокировке */}
                            {isClientBlocked && (
                              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-2">
                                <div className="flex items-center gap-2 text-red-700">
                                  <Lock className="w-5 h-5" />
                                  <div>
                                    <p className="font-semibold">Клиент заблокирован</p>
                                    <p className="text-sm">Онлайн запись отключена</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            <Card className="border-primary bg-blue-50/50">
                              <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="font-bold text-lg flex items-center gap-2">
                                    <User className="w-5 h-5" />
                                    {result.client_name}
                                  </div>
                                  <span className="text-gray-400">|</span>
                                  <div className="text-sm text-gray-600">{result.phone}</div>
                                </div>

                                 {result.client_cars && result.client_cars.length > 0 && (
                                   <div className="space-y-2">
                                     {result.client_cars.map((car) => (
                                       <CarCard
                                         key={car.id}
                                         car={car}
                                         onClick={async () => {
                                           setSelectedClientId(result.client_id!);
                                           setSelectedClientCarId(car.id);
                                           setClientName(result.client_name!);
                                           setCarModel(car.car_model);
                                           setCarNumber(car.plate_number);
                                           setClientType('PHYSICAL');
                                           setPhone(result.phone);

                                           try {
                                             const cars = await getClientCars(result.client_id!);
                                             setClientCars(cars);
                                           } catch (error) {
                                             console.error('Ошибка при загрузке автомобилей клиента:', error);
                                             setClientCars([]);
                                           }

                                           setIsCreatingNewClient(false);
                                           setStep(2);
                                         }}
                                       />
                                     ))}
                                   </div>
                                 )}
                               </CardContent>
                             </Card>
                           </div>
                         );
                        })}
                        
                        {orgGroups.size > 0 && (
                          <div className="text-sm text-gray-600 font-medium">
                            Найдено:
                          </div>
                        )}
                        {Array.from(orgGroups.values()).map((orgGroup, orgIndex) => (
                          <div key={`org-${orgIndex}`} className="space-y-2">
                            <Card className="border-primary bg-blue-50/50">
                              <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="font-bold text-lg flex items-center gap-2">
                                    <Building2 className="w-5 h-5" />
                                    {orgGroup.organization_name}
                                  </div>
                                  <span className="text-gray-400">|</span>
                                  <div className="text-sm text-gray-600">{orgGroup.phone}</div>
                                </div>
                                
                                <div className="space-y-3">
                                  {orgGroup.drivers.map((driver, driverIndex) => (
                                    <div key={`driver-${driverIndex}`} className="space-y-2">
                                      <div
                                        className="flex items-center gap-2 p-2 bg-white/50 rounded-lg cursor-pointer hover:bg-white/80 transition-colors"
                                        onClick={() => {
                                          setExpandedDrivers(prev => {
                                            const newSet = new Set(prev);
                                            if (newSet.has(driver.driver_id)) {
                                              newSet.delete(driver.driver_id);
                                            } else {
                                              newSet.add(driver.driver_id);
                                            }
                                            return newSet;
                                          });
                                        }}
                                      >
                                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0">
                                          <Check className="w-4 h-4 text-white" />
                                        </div>
                                        <div className="font-medium flex-1">{driver.driver_name}</div>
                                        <div className={`transform transition-transform ${expandedDrivers.has(driver.driver_id) ? 'rotate-90' : ''}`}>
                                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        </div>
                                      </div>
                                      
                                      <div
                                        className="ml-8 overflow-hidden transition-all duration-300 ease-in-out"
                                        style={{
                                          maxHeight: expandedDrivers.has(driver.driver_id) ? '1000px' : '0px',
                                          opacity: expandedDrivers.has(driver.driver_id) ? '1' : '0'
                                        }}
                                      >
                                        <div className="space-y-2 pt-2">
                                          {driver.organization_cars.length > 0 && driver.organization_cars.map((car) => (
                                            <CarCard
                                              key={car.id}
                                              car={car}
                                              onClick={() => {
                                                setSelectedOrganizationId(orgGroup.organization_id);
                                                setSelectedDriverId(driver.driver_id);
                                                setSelectedCarId(car.id);
                                                setClientName(driver.driver_name);
                                                setCarModel(car.car_model);
                                                setCarNumber(car.plate_number);
                                                setClientType('ORG');
                                                setPhone(orgGroup.phone);

                                                const fullCar = findCarById(organizationCars, car.id);
                                                const changes = trackCarChanges(car.car_model, car.plate_number, fullCar as any);
                                                setOriginalCarModel(changes.originalModel);
                                                setOriginalCarNumber(changes.originalNumber);
                                                setIsCarModelChanged(changes.isModelChanged);
                                                setIsCarNumberChanged(changes.isNumberChanged);

                                                setIsCreatingNewClient(false);
                                                setStep(2);
                                              }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              )}

              {isSearching && phone.length > 5 && (
                <div className="text-center text-gray-500 py-4">
                  <div className="animate-pulse">Поиск...</div>
                </div>
              )}

              <div className="relative my-6">
                 <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                 <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#f5f5f5] px-2 text-muted-foreground">Или</span></div>
              </div>

              <div className="space-y-4">
                <Label>Гос. номер</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="А123АА"
                    value={plateNumber}
                    onChange={(e) => {
                      const formatted = formatCarNumber(e.target.value);
                      setPlateNumber(formatted);
                    }}
                    className="text-lg tracking-wider h-12 uppercase"
                  />
                  <Button size="icon" className="h-12 w-12 rounded-md shrink-0">
                    <Search className="w-5 h-5" />
                  </Button>
                </div>

                {plateSearchResults.length > 0 && !isPlateSearching && (
                  <div className="space-y-3">
                    {(() => {
                      const clientResults = plateSearchResults.filter(r => r.type === 'client');
                      const orgResults = plateSearchResults.filter(r => r.type === 'organization');
                      
                      const orgGroups = new Map<string, {
                        organization_id: string;
                        organization_name: string;
                        phone: string;
                        drivers: Array<{
                          driver_id: string;
                          driver_name: string;
                          organization_cars: Array<{
                            id: string;
                            car_model: string;
                            plate_number: string;
                          }>;
                        }>;
                      }>();
                      
                      orgResults.forEach(result => {
                        const orgId = result.organization_id!;
                        if (!orgGroups.has(orgId)) {
                          orgGroups.set(orgId, {
                            organization_id: orgId,
                            organization_name: result.organization_name!,
                            phone: result.phone,
                            drivers: []
                          });
                        }
                        orgGroups.get(orgId)!.drivers.push({
                          driver_id: result.driver_id!,
                          driver_name: result.driver_name!,
                          organization_cars: result.organization_cars || []
                        });
                      });
                      
                      return (
                        <>
                          {clientResults.length > 0 && (
                            <div className="text-sm text-gray-600 font-medium">
                              Найдено: {clientResults.length}
                            </div>
                          )}
                          {clientResults.map((result, index) => (
                            <div key={`plate-client-${index}`} className="space-y-2">
                              <Card className="border-primary bg-blue-50/50">
                                <CardContent className="p-4">
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className="font-bold text-lg flex items-center gap-2">
                                      <User className="w-5 h-5" />
                                      {result.client_name}
                                    </div>
                                    <span className="text-gray-400">|</span>
                                    <div className="text-sm text-gray-600">{result.phone}</div>
                                  </div>

                                  {result.client_cars && result.client_cars.length > 0 && (
                                    <div className="space-y-2">
                                      {result.client_cars.map((car) => (
                                        <CarCard
                                          key={car.id}
                                          car={car}
                                          onClick={async () => {
                                            setSelectedClientId(result.client_id!);
                                            setSelectedClientCarId(car.id);
                                            setClientName(result.client_name!);
                                            setCarModel(car.car_model);
                                            setCarNumber(car.plate_number);
                                            setClientType('PHYSICAL');
                                            setPhone(result.phone);

                                            try {
                                              const cars = await getClientCars(result.client_id!);
                                              setClientCars(cars);
                                            } catch (error) {
                                              console.error('Ошибка при загрузке автомобилей клиента:', error);
                                              setClientCars([]);
                                            }

                                            setIsCreatingNewClient(false);
                                            setStep(2);
                                          }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          ))}
                          
                          {orgGroups.size > 0 && (
                            <div className="text-sm text-gray-600 font-medium">
                              Найдено:
                            </div>
                          )}
                          {Array.from(orgGroups.values()).map((orgGroup, orgIndex) => (
                            <div key={`plate-org-${orgIndex}`} className="space-y-2">
                              <Card className="border-primary bg-blue-50/50">
                                <CardContent className="p-4">
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className="font-bold text-lg flex items-center gap-2">
                                      <Building2 className="w-5 h-5" />
                                      {orgGroup.organization_name}
                                    </div>
                                    <span className="text-gray-400">|</span>
                                    <div className="text-sm text-gray-600">{orgGroup.phone}</div>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    {orgGroup.drivers.map((driver, driverIndex) => (
                                      <div key={`plate-driver-${driverIndex}`} className="space-y-2">
                                        <div
                                          className="flex items-center gap-2 p-2 bg-white/50 rounded-lg cursor-pointer hover:bg-white/80 transition-colors"
                                          onClick={() => {
                                            setExpandedDrivers(prev => {
                                              const newSet = new Set(prev);
                                              if (newSet.has(driver.driver_id)) {
                                                newSet.delete(driver.driver_id);
                                              } else {
                                                newSet.add(driver.driver_id);
                                              }
                                              return newSet;
                                            });
                                          }}
                                        >
                                          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0">
                                            <Check className="w-4 h-4 text-white" />
                                          </div>
                                          <div className="font-medium flex-1">{driver.driver_name}</div>
                                          <div className={`transform transition-transform ${expandedDrivers.has(driver.driver_id) ? 'rotate-90' : ''}`}>
                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </div>
                                        </div>
                                        
                                        <div
                                          className="ml-8 overflow-hidden transition-all duration-300 ease-in-out"
                                          style={{
                                            maxHeight: expandedDrivers.has(driver.driver_id) ? '1000px' : '0px',
                                            opacity: expandedDrivers.has(driver.driver_id) ? '1' : '0'
                                          }}
                                        >
                                          <div className="space-y-2 pt-2">
                                            {driver.organization_cars.length > 0 && driver.organization_cars.map((car) => (
                                              <CarCard
                                                key={car.id}
                                                car={car}
                                                onClick={() => {
                                                  setSelectedOrganizationId(orgGroup.organization_id);
                                                  setSelectedDriverId(driver.driver_id);
                                                  setSelectedCarId(car.id);
                                                  setClientName(driver.driver_name);
                                                  setCarModel(car.car_model);
                                                  setCarNumber(car.plate_number);
                                                  setClientType('ORG');
                                                  setPhone(orgGroup.phone);

                                                  const fullCar = findCarById(organizationCars, car.id);
                                                  const changes = trackCarChanges(car.car_model, car.plate_number, fullCar as any);
                                                  setOriginalCarModel(changes.originalModel);
                                                  setOriginalCarNumber(changes.originalNumber);
                                                  setIsCarModelChanged(changes.isModelChanged);
                                                  setIsCarNumberChanged(changes.isNumberChanged);

                                                  setIsCreatingNewClient(false);
                                                  setStep(2);
                                                }}
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}

                {isPlateSearching && plateNumber.length > 0 && (
                  <div className="text-center text-gray-500 py-4">
                    <div className="animate-pulse">Поиск...</div>
                  </div>
                )}
              </div>

               <div className="space-y-3">
                 <Button variant="outline" className="w-full h-12" onClick={() => { setClientType('PHYSICAL'); setIsCreatingNewClient(true); setStep(0); }}>
                   <User className="w-4 h-4 mr-2" /> Новый клиент
                 </Button>
                 <Button variant="outline" className="w-full h-12" onClick={() => { setClientType('ORG'); setIsCreatingNewClient(true); setStep(0); }}>
                   <Building2 className="w-4 h-4 mr-2" /> Новая организация
                 </Button>
               </div>

               {/* База клиентов | Организаций */}
               <ClientDatabaseAccordion
                 onSelectClient={async (clientId, clientCarId, clientName, phone, carModel, carNumber, carType) => {
                   setSelectedClientId(clientId);
                   setSelectedClientCarId(clientCarId);
                   setClientName(clientName);
                   setCarModel(carModel);
                   setCarNumber(carNumber);
                   setClientType('PHYSICAL');
                   setPhone(phone);

                   try {
                     const cars = await getClientCars(clientId);
                     setClientCars(cars);
                   } catch (error) {
                     console.error('Ошибка при загрузке автомобилей клиента:', error);
                     setClientCars([]);
                   }

                   setIsCreatingNewClient(false);
                   setStep(2);
                 }}
               />
             </div>
           </div>
         )}

        {step === 0 && isCreatingNewClient && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
              <h3 className="text-xl font-bold">{clientType === 'ORG' ? 'Создание организации' : 'Создание клиента'}</h3>
              
              {clientType === 'ORG' && (
                <>
                  <div className="space-y-2">
                    <Label>Название организации</Label>
                    <Input
                      placeholder="ООО Рога и Копыта"
                      value={newOrganizationName}
                      onChange={(e) => setNewOrganizationName(e.target.value)}
                      className="h-12"
                    />
                  </div>
 
                  <div className="space-y-2">
                    <Label>Имя водителя</Label>
                    <Input
                      placeholder="Иван Иванов"
                      value={newDriverName}
                      onChange={(e) => setNewDriverName(e.target.value)}
                      className="h-12"
                    />
                  </div>
                </>
              )}
 
              <div className="space-y-2">
                <Label>Номер телефона</Label>
                <Input
                  placeholder="+7 (___) ___-__-__"
                  value={phone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setPhone(formatted);
                  }}
                  className="text-lg tracking-wider h-12"
                />
              </div>
 
              {clientType === 'PHYSICAL' && (
                <div className="space-y-2">
                  <Label>Имя клиента</Label>
                  <Input
                    placeholder="Иван Иванов"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="h-12"
                  />
                </div>
              )}
 
              <div className="space-y-2">
                <Label>Модель автомобиля</Label>
                <Input
                  placeholder="Toyota Camry"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  className="h-12"
                />
              </div>
 
              {/* Тип автомобиля */}
              <div className="space-y-2">
                <Label>Тип автомобиля</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: CarType.SEDAN, label: 'Седан' },
                    { id: CarType.CROSSOVER, label: 'Кроссовер' },
                    { id: CarType.JEEP, label: 'Джип' },
                    { id: CarType.LARGE_SUV, label: 'Большой джип' },
                    { id: CarType.MINIVAN, label: 'Минивэн' },
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setNewCarType(type.id)}
                      className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                        newCarType === type.id
                          ? 'border-primary bg-blue-50'
                          : 'border hover:border-primary hover:bg-blue-50'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
 
              <div className="space-y-2">
                <Label>Гос. номер</Label>
                <Input
                  placeholder="А123АА"
                  className="uppercase"
                  value={carNumber}
                  onChange={(e) => {
                    const formatted = formatCarNumber(e.target.value);
                    setCarNumber(formatted);
                  }}
                />
              </div>
 
              {saveSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg text-center">
                  <Check className="w-6 h-6 mx-auto mb-2" />
                  <div className="font-medium">
                    {clientType === 'ORG' ? 'Организация успешно создана!' : 'Клиент успешно создан!'}
                  </div>
                </div>
              )}
 
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    <span>{saveError}</span>
                  </div>
                </div>
              )}
 
              {!saveSuccess && (
                <Button
                  className="w-full h-12"
                  onClick={handleSaveNewClient}
                  disabled={saveSuccess}
                >
                  <Check className="w-5 h-5 mr-2" /> Сохранить
                </Button>
              )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
              <h3 className="text-xl font-bold">Услуги шиномонтажа</h3>
              <div className="space-y-6">
                {isLoading ? (
                  <div className="text-center py-8 text-gray-500">Загрузка услуг...</div>
                ) : (
                  Object.entries(groupedServices).map(([category, services]: [string, TireServiceType[]]) => {
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
                                    {/* Блок для ввода произвольной цены и комментария (услуга "ПРОЧЕЕ") */}
                                    {isSelected && service.is_custom_price && (
                                      <div className="mt-2 space-y-2 pl-4 border-l-2 border-primary">
                                        <Input
                                          placeholder="Своя цена ₽"
                                          type="number"
                                          value={selectedServices.find(s => s.service_id === service.id)?.customPrice ?? ''}
                                          onChange={(e) => handleCustomPriceChange(service.id, Number(e.target.value))}
                                          className="h-10"
                                        />
                                        <Input
                                          placeholder="Комментарий (необязательно)"
                                          value={selectedServices.find(s => s.service_id === service.id)?.comment ?? ''}
                                          onChange={(e) => handleCommentChange(service.id, e.target.value)}
                                          className="h-10"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

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

         {step === 3 && (
           <div className="space-y-6 animate-in slide-in-from-right duration-300">
               <h3 className="text-xl font-bold">Время и оплата</h3>
               
               {/* Выбор даты */}
               <div className="flex items-center gap-2">
                 <DateSelector
                   selectedDate={selectedDate}
                   onDateChange={setSelectedDate}
                 />
               </div>
               
               {/* Расписание */}
               <Card>
                 <CardContent className="p-4">
                   <div className="space-y-3">
                    <Timeline
                      bookings={existingBookings.filter(b => b.booking_date === selectedDate).map(b => ({
                        id: b.id,
                        startTime: formatTimeWithoutSeconds(b.start_time),
                        endTime: calculateEndTime(formatTimeWithoutSeconds(b.start_time), b.estimated_duration),
                        carModel: b.car_model,
                        clientName: b.client_name,
                        status: b.status
                      }))}
                      selectedStart={startTime}
                      selectedEnd={endTime}
                      selectedDate={selectedDate}
                      onSlotClick={(start, end) => {
                        setStartTime(start);
                        setEndTime(end);
                        checkOverlap(start, end);
                      }}
                    />
                </div>
              </CardContent>
            </Card>

            {/* Ручной ввод времени */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="text-sm font-semibold text-gray-700">
                  Укажи время для новой записи:
                </div>
                
                {/* Время начала */}
                <div className="space-y-2">
                  <Label>Время начала</Label>
                  <div className="flex items-center gap-2">
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
                        
                        if (hours.length === 2 && startMinutesInputRef.current) {
                          startMinutesInputRef.current.focus();
                        }
                      }}
                      ref={startHoursInputRef}
                      className="w-20 text-center focus-visible:outline-none focus-visible:ring-0 !ring-0 !outline-none focus:border-black"
                      placeholder=""
                      maxLength={2}
                    />
                    <span className="text-2xl font-bold text-gray-600">:</span>
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
                      className="w-20 text-center focus-visible:outline-none focus-visible:ring-0 !ring-0 !outline-none focus:border-black"
                      placeholder=""
                      maxLength={2}
                    />
                  </div>
                </div>

                {/* Длительность */}
                <div className="space-y-2">
                  <Label>Длительность</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_OPTIONS.map((option) => (
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
                  <div className="flex items-center gap-2">
                    <Input
                      id="endHours"
                      type="text"
                      inputMode="numeric"
                      value={endTime.includes(':') ? endTime.split(':')[0] || '' : ''}
                      onChange={(e) => {
                        const hours = e.target.value.replace(/\D/g, '').slice(0, 2);
                        const minutes = endTime.includes(':') ? endTime.split(':')[1] : '';
                        setEndTime(`${hours}:${minutes}`);
                        checkOverlap(startTime, `${hours}:${minutes}`);
                      }}
                      ref={endHoursInputRef}
                      className="w-20 text-center focus-visible:outline-none focus-visible:ring-0 !ring-0 !outline-none focus:border-black"
                      placeholder=""
                      maxLength={2}
                    />
                    <span className="text-2xl font-bold text-gray-600">:</span>
                    <Input
                      id="endMinutes"
                      type="text"
                      inputMode="numeric"
                      value={endTime.includes(':') ? endTime.split(':')[1] || '' : ''}
                      onChange={(e) => {
                        const hours = endTime.includes(':') ? endTime.split(':')[0] : '';
                        const minutes = e.target.value.replace(/\D/g, '').slice(0, 2);
                        setEndTime(`${hours}:${minutes}`);
                        checkOverlap(startTime, `${hours}:${minutes}`);
                      }}
                      ref={endMinutesInputRef}
                      className="w-20 text-center focus-visible:outline-none focus-visible:ring-0 !ring-0 !outline-none focus:border-black"
                      placeholder=""
                      maxLength={2}
                    />
                  </div>
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

            {/* Быстрый выбор доступных окон */}
            {(() => {
              const availableSlots = findAvailableTireTimeSlots(
                existingBookings,
                selectedDate,
                [30, 60, 90, 120]
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
                            handleDurationSelect(slot.duration);
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

             {/* Способ оплаты */}
             <Card>
               <CardContent className="p-4 space-y-3">
                   <Label>Способ оплаты</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <button
                      onClick={() => setPaymentType('Наличный')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentType === 'Наличный'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <CreditCard className={cn("w-6 h-6", paymentType === 'Наличный' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentType === 'Наличный' ? "" : "text-gray-400")}>Наличный</span>
                    </button>
                    <button
                      onClick={() => setPaymentType('Безналичный')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentType === 'Безналичный'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <CreditCard className={cn("w-6 h-6", paymentType === 'Безналичный' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentType === 'Безналичный' ? "" : "text-gray-400")}>Безнал</span>
                    </button>
                    <button
                      onClick={() => setPaymentType('Перевод')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentType === 'Перевод'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <Send className={cn("w-6 h-6", paymentType === 'Перевод' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentType === 'Перевод' ? "" : "text-gray-400")}>Перевод</span>
                    </button>
                    <button
                      onClick={() => setPaymentType('QR-code')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentType === 'QR-code'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <QrCode className={cn("w-6 h-6", paymentType === 'QR-code' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentType === 'QR-code' ? "" : "text-gray-400")}>QR-code</span>
                    </button>
                    <button
                      onClick={() => setPaymentType('Ведомость')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentType === 'Ведомость'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <ClipboardList className={cn("w-6 h-6", paymentType === 'Ведомость' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentType === 'Ведомость' ? "" : "text-gray-400")}>Ведомость</span>
                    </button>
                    <button
                      onClick={() => setPaymentType('Яндекс')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer min-h-[80px]",
                        paymentType === 'Яндекс'
                          ? "border-primary bg-blue-50"
                          : "border hover:border-primary hover:bg-blue-50"
                      )}
                    >
                      <ClipboardList className={cn("w-6 h-6", paymentType === 'Яндекс' ? "text-primary" : "text-gray-400")} />
                      <span className={cn("font-bold text-sm", paymentType === 'Яндекс' ? "" : "text-gray-400")}>Яндекс</span>
                    </button>
                  </div>
               </CardContent>
             </Card>

            <Button className="w-full h-12" onClick={nextStep}>Далее</Button>
           </div>
         )}

        {step === 4 && (
         <div className="space-y-6 animate-in slide-in-from-right duration-300">
             <h3 className="text-xl font-bold">Подтверждение записи</h3>
             
             {/* Карточка с данными клиента */}
             <Card className="border-primary bg-blue-50/50">
               <CardContent className="p-4 space-y-3">
                   <div className="flex justify-between items-start">
                     <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Клиент</div>
                       <div className="font-bold text-lg">{clientName || 'Не указано'}</div>
                     </div>
                     {clientType === 'ORG' && (
                       <Badge variant="secondary">Организация</Badge>
                     )}
                   </div>
                   <div className="grid grid-cols-2 gap-4 pt-2">
                     <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Телефон</div>
                       <div className="font-medium">{phone}</div>
                     </div>
                     <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Автомобиль</div>
                       <div className="font-medium">{carModel || 'Не указано'}</div>
                     </div>
                     <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Гос. номер</div>
                       <div className="font-medium">{carNumber || 'Не указано'}</div>
                     </div>
                     {clientType === 'ORG' && selectedDriverId && (
                       <div>
                         <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Подпись водителя</div>
                         <div className="font-medium flex items-center gap-2">
                           {driverSignature ? (
                             <>
                               <img
                                 src={driverSignature}
                                 alt="Подпись"
                                 className="h-6 border border-gray-300 rounded px-2 bg-white"
                               />
                               <Check className="w-4 h-4 text-green-600" />
                             </>
                           ) : (
                             <span className="text-orange-500 text-sm flex items-center gap-1">
                               <AlertCircle className="w-3 h-3" />
                               Не установлена
                             </span>
                           )}
                         </div>
                       </div>
                     )}
                   </div>
               </CardContent>
             </Card>

             {/* Карточка с услугами */}
             <Card className="border-primary bg-blue-50/50">
               <CardContent className="p-4 space-y-3">
                   <div>
                     <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Услуги</div>
                      <div className="space-y-2">
                        {selectedServices.map((service) => (
                          <div key={service.service_id} className="flex justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span>{service.name} × {service.quantity}</span>
                              {service.comment && <span className="text-xs text-orange-500">({service.comment})</span>}
                            </div>
                            <span className="font-medium">{service.total} ₽</span>
                          </div>
                        ))}
                      </div>
                   </div>
                   <div className="border-t pt-3 flex justify-between items-center">
                     <span className="font-bold">Итого:</span>
                     <span className="text-xl font-bold">{price} ₽</span>
                   </div>
               </CardContent>
             </Card>

             {/* Карточка с временем */}
             <Card className="border-primary bg-blue-50/50">
               <CardContent className="p-4 space-y-3">
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Время</div>
                       <div className="font-bold text-lg">
                         {startTime && endTime ? `${startTime} - ${endTime}` : 'Не указано'}
                       </div>
                     </div>
                     <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Оплата</div>
                       <div className="font-medium">{paymentType}</div>
                     </div>
                   </div>
               </CardContent>
             </Card>

               <Button
                 size="lg"
                 className="w-full h-14 mt-6 text-lg"
                 onClick={async () => {
                   const organizationName = selectedOrganizationId
                     ? organizations.find(o => o.id === selectedOrganizationId)?.name
                     : undefined;

                   setSaveError(null);

                   try {
                     const estimatedDuration = startTime && endTime
                       ? (() => {
                           const [startH, startM] = startTime.split(':').map(Number);
                           const [endH, endM] = endTime.split(':').map(Number);
                           return (endH * 60 + endM) - (startH * 60 + startM);
                         })()
                       : 0;

                      await onComplete({
                        clientType,
                        clientName,
                        phone: phone && phone.trim() !== '+7 ' ? normalizePhoneNumber(phone) : '',
                        carModel,
                        carNumber,
                        services: selectedServices.map(item => ({
                          service_id: item.service_id,
                          name: item.name,
                          quantity: item.quantity,
                          price: item.customPrice ?? item.price,
                          total: item.total,
                          comment: item.comment,
                        })),
                        price,
                       startTime,
                       endTime,
                       paymentType,
                       date: selectedDate || formatDate(new Date()),
                       orgName: organizationName,
                       organizationId: selectedOrganizationId || undefined,
                       driverId: selectedDriverId || undefined,
                       carId: selectedCarId || undefined,
                       clientId: selectedClientId || undefined,
                       clientCarId: selectedClientCarId || undefined,
                       estimatedDuration
                     });
                   } catch (error) {
                     console.error('Ошибка при создании записи:', error);
                     setSaveError('Ошибка при создании записи. Попробуйте снова.');
                   }
                 }}
                 disabled={isCreatingTireBookingProp}
               >
                 {isCreatingTireBookingProp ? (
                   <div className="flex items-center gap-2">
                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                     <span>Создание заказа...</span>
                   </div>
                 ) : (
                   <>
                     <Check className="w-5 h-5 mr-2" /> Подтвердить запись
                   </>
                 )}
               </Button>
          </div>
        )}

      </div>

     {/* Модальное окно подписи водителя */}
     {signatureModalOpen && selectedDriverForSignature && (
       <SignatureModal
         isOpen={signatureModalOpen}
         onClose={() => {
           setSignatureModalOpen(false);
           setSelectedDriverForSignature(null);
         }}
         onSave={handleSaveDriverSignature}
         driverName={selectedDriverForSignature.full_name}
       />
     )}
   </div>
  );
};
