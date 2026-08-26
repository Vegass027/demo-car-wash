import React, { useState, useEffect } from 'react';
import { supabase, getSessionToken } from '../../lib/supabase';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ArrowLeft, Search, Check, Calculator, Clock, CreditCard, User, Building2, Users, Plus, Send, Lock, Trash2, Edit2, Pen, CheckCircle, AlertCircle, Unlock, Circle, ClipboardList, Banknote, QrCode, Minus } from 'lucide-react';
import { SignatureModal } from './SignatureModal';
import { ClientDatabaseAccordion } from './ClientDatabaseAccordion';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { CarType } from '../../types';
import { formatDate } from '../../shared/utils/date';
import { Service, getServicePrice } from '../../lib/api/services';
import { SERVICE_CATEGORIES, isBonusService } from '../../lib/config/serviceCategories';
import { findDriversByPhone } from '../../lib/api/organizations';
import { Organization, OrganizationDriver, OrganizationCar } from '../../entities/organization/model';
import { Booking } from '../../lib/api/bookings';
import { searchByPlateNumber } from '../../lib/api/search';
import { SearchResult } from '../../lib/api/search';
import {
  Client,
  ClientCar,
  getClientCars,
} from '../../lib/api/clients';
// ✅ Новые импорты для рефакторинга
import { validatePhone, validateCarNumber } from '../booking/validation';
import { CarCard } from '../booking/CarCard';
import { AddCarButton } from '../booking/AddCarButton';
import { FieldWithChange } from '../booking/FieldWithChange';
import { trackCarChanges, findCarById } from '../booking/carUtils';
import { normalizePhoneNumber } from '../../shared/utils/phone';

// =========================================================================
// Phase 2 / Slice #3a: staff writes go through /api/staff dispatcher
// (Phase 1 service-role pattern). Booking-side mutations remain in
// lib/api/bookings.ts (anon) until Slice #3b.
//
// dispatchStaffCall POSTs to /api/staff?action=<name> with the staff JWT
// from current session (admin/owner app_role). The dispatcher enforces
// ownership of the parent client/organization/driver before allowing the
// write, so client-side validation here only needs the user-facing shape.
// =========================================================================
async function dispatchStaffCall<T = unknown>(action: string, body: AnyObj): Promise<T> {
  const token = getSessionToken();
  if (!token) throw new Error('Missing session token — please log in again');
  const url = `/api/staff?action=${encodeURIComponent(action)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({} as AnyObj));
  if (!res.ok) {
    const err = (data as AnyObj)?.error || `http_${res.status}`;
    throw new Error(err);
  }
  return ((data as AnyObj)?.data ?? data) as T;
}
type AnyObj = Record<string, any>;

const ANTIFREEZE_SERVICE_IDS = ['antifreeze-org', 'antifreeze-umc'];

// ✅ Маппинг классов авто на русский язык
const CAR_TYPE_LABELS: Record<string, string> = {
  'SEDAN': 'Седан',
  'CROSSOVER': 'Кроссовер',
  'JEEP': 'Джип',
  'LARGE_SUV': 'Большой джип',
  'MINIVAN': 'Минивэн',
};

export interface BookingWizardData {
  clientName: string;
  phone: string;
  carModel: string;
  carNumber: string;
  carType: CarType | null;
  price: number;
  services: string[];
  clientType: 'PHYSICAL' | 'ORG';
  selectedHour: number | undefined;
  selectedBoxNumber: number | undefined;
  selectedWorkerId: string | undefined;
  paymentType: 'Наличный' | 'Безналичный' | 'Перевод' | 'Ведомость' | 'QR-code';
  date: string;
  isQuickBooking?: boolean;
  orgName?: string;
  organizationId?: string; // ID выбранной организации
  driverId?: string; // ID выбранного водителя организации
  carId?: string; // ID выбранного автомобиля организации
  newOrganizationName?: string; // Название новой организации для создания
  newDriverName?: string; // Имя нового водителя для создания
  newDriverPhone?: string; // Телефон нового водителя для создания
  newCarModel?: string; // Модель нового автомобиля для создания
  newCarNumber?: string; // Гос. номер нового автомобиля для создания
  
  // ✅ Новые поля для физлиц
  clientId?: string;
  clientCarId?: string;
  
  // ✅ Новое поле для услуг с количеством (только для незамерзающих жидкостей)
  servicesWithQuantities?: Array<{
    service_id: string;
    quantity: number;
    price: number;
    total: number;
  }>;
}

/**
 * Преобразует данные из мастера создания заказа в формат для БД
 */
export function mapWizardDataToBooking(
  data: BookingWizardData
): Omit<Booking, 'id' | 'created_at' | 'updated_at'> {
  // Для быстрых заказов вычисляем время на основе текущего времени
  const isQuickBooking = data.isQuickBooking || false;
  let startTime: string | undefined;
  let endTime: string | undefined;
  
  if (isQuickBooking) {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000); // +30 минут
  
    const formatTime = (date: Date) => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };
  
    startTime = formatTime(now);
    endTime = formatTime(end);
  } else {
    startTime = data.selectedHour ? `${String(data.selectedHour).padStart(2, '0')}:00` : undefined;
    endTime = data.selectedHour ? `${String(data.selectedHour + 1).padStart(2, '0')}:00` : undefined;
  }
  
  return {
    client_name: data.clientName,
    phone: data.phone && data.phone.trim() !== '+7 ' ? normalizePhoneNumber(data.phone) : null,
    car_model: data.carModel,
    plate_number: data.carNumber,
    car_type: data.carType ?? 'SEDAN',
    services: data.services,
    price: data.price,
    payment_method: data.paymentType,
    status: 'ОЖИДАЕТ',
    booking_date: data.date || formatDate(new Date()),
    start_time: startTime,
    end_time: endTime,
    box_number: isQuickBooking ? undefined : data.selectedBoxNumber,
    worker_id: data.selectedWorkerId,
    is_org: data.clientType === 'ORG',
    organization_id: data.organizationId,
    driver_id: data.driverId,
    car_id: data.carId,
    org_name: data.orgName,
    // ✅ Новые поля для физлиц
    client_id: data.clientType === 'PHYSICAL' ? data.clientId : undefined,
    client_car_id: data.clientType === 'PHYSICAL' ? data.clientCarId : undefined,
    signature_obtained: false,
    is_quick_booking: isQuickBooking,
    is_paid: false,
    // ✅ Новое поле для онлайн-записи
    booking_source: 'admin' as const,
    // ✅ Скидка (по умолчанию 0)
    discount: 0,
    // ✅ Новое поле для услуг с количеством (незамерзающие жидкости)
    services_with_quantities: data.servicesWithQuantities || []
  };
}

interface BookingWizardProps {
  onBack: () => void;
  onComplete: (data: BookingWizardData) => void;
  initialHour?: number;
  initialBoxNumber?: number;
  selectedDate?: string;
  bookings?: any[];
  workers?: any[];
  services?: any[];
  onQuickBooking?: () => void;
  isQuickBookingMode?: boolean;
  closedBoxes?: Map<number, number[]>;
  // Данные для организаций (позже будут из базы данных)
  organizations?: Organization[];
  organizationDrivers?: OrganizationDriver[];
  organizationCars?: OrganizationCar[];
  isCreatingBooking?: boolean;
}

export const BookingWizard: React.FC<BookingWizardProps> = ({
  onBack,
  onComplete,
  initialHour,
  initialBoxNumber,
  selectedDate,
  bookings = [],
  workers = [],
  services = [],
  onQuickBooking,
  isQuickBookingMode = false,
  closedBoxes = new Map(),
  organizations = [],
  organizationDrivers = [],
  organizationCars = [],
  isCreatingBooking: isCreatingBookingProp = false
}) => {
  // Внутреннее состояние для режима быстрого заказа
  const [internalQuickBookingMode, setInternalQuickBookingMode] = useState(isQuickBookingMode);
  
  // Синхронизация внутреннего режима быстрого заказа с пропом
  useEffect(() => {
    setInternalQuickBookingMode(isQuickBookingMode);
  }, [isQuickBookingMode]);
  
   const STEPS = React.useMemo(() => 4, [internalQuickBookingMode]); // ✅ 4 шага: 1-Поиск, 2-Услуги, 3-Запись и оплата, 4-Подтверждение
  
  // Используем проп isQuickBookingMode для определения режима на шаге 4
  const isQuickBookingModeActive = isQuickBookingMode || internalQuickBookingMode;
  const [step, setStep] = useState(1);
  const [clientType, setClientType] = useState<'PHYSICAL' | 'ORG'>('PHYSICAL');
  const [phone, setPhone] = useState('+7 ');
  const [clientName, setClientName] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [isAddingNewOrganization, setIsAddingNewOrganization] = useState(false);
  const [newOrganizationName, setNewOrganizationName] = useState('');
  const [isCreatingNewClient, setIsCreatingNewClient] = useState(false); // ✅ Флаг для режима создания нового клиента/организации
  const [foundDrivers, setFoundDrivers] = useState<Array<{
    driver: OrganizationDriver;
    organization: Organization;
    cars: OrganizationCar[];
  }> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingNewDriver, setIsAddingNewDriver] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
   const [isAddingNewCar, setIsAddingNewCar] = useState(false);
   const [newCarModel, setNewCarModel] = useState('');
   const [newCarNumber, setNewCarNumber] = useState('');
   const [newCarType, setNewCarType] = useState<CarType>(CarType.SEDAN);
   
   // ✅ Флаг для режима только чтения на шаге2 (когда организация, водитель и авто выбраны на шаге1)
   const [isReadOnlyStep3, setIsReadOnlyStep3] = useState(false);
  
  // ✅ Флаг для режима редактирования организации
  const [isEditingOrganization, setIsEditingOrganization] = useState(false);

  // ✅ Состояние для хранения данных организации при редактировании
  const [editingOrgData, setEditingOrgData] = useState<{
    organization: Organization | null;
    drivers: OrganizationDriver[];
    cars: OrganizationCar[];
  }>({
    organization: null,
    drivers: [],
    cars: []
  });

  // ✅ Флаг для режима редактирования физлица
  const [isEditingClient, setIsEditingClient] = useState(false);

  // ✅ Состояние для хранения данных физлица при редактировании
  const [editingClientData, setEditingClientData] = useState<{
    client: Client | null;
    cars: ClientCar[];
  }>({
    client: null,
    cars: []
  });

  // ✅ Состояние для добавления водителя в режиме редактирования
  const [isAddingDriverInEditMode, setIsAddingDriverInEditMode] = useState(false);
  const [newDriverNameInEdit, setNewDriverNameInEdit] = useState('');
  const [newDriverPhoneInEdit, setNewDriverPhoneInEdit] = useState('');

  // ✅ Состояние для добавления автомобиля в режиме редактирования
  const [isAddingCarInEditMode, setIsAddingCarInEditMode] = useState(false);
  const [newCarModelInEdit, setNewCarModelInEdit] = useState('');
  const [newCarNumberInEdit, setNewCarNumberInEdit] = useState('');
  
   // ✅ Новые переменные состояния для физлиц
   const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
   const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
   const [selectedClientCarId, setSelectedClientCarId] = useState<string | null>(null);
   const [clientCars, setClientCars] = useState<ClientCar[]>([]);
   
   // ✅ Отдельные переменные для поиска по гос номеру
   const [plateNumber, setPlateNumber] = useState('');
   const [plateSearchResults, setPlateSearchResults] = useState<SearchResult[]>([]);
   const [isPlateSearching, setIsPlateSearching] = useState(false);
  
  // ✅ Состояние для отслеживания изменений автомобиля
  const [originalCarModel, setOriginalCarModel] = useState('');
  const [originalCarNumber, setOriginalCarNumber] = useState('');
  const [isCarModelChanged, setIsCarModelChanged] = useState(false);
  const [isCarNumberChanged, setIsCarNumberChanged] = useState(false);
  
  // ✅ Состояние для раскрытия водителей в поиске
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  
  // ✅ Состояние для модального окна подписи водителя
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [selectedDriverForSignature, setSelectedDriverForSignature] = useState<OrganizationDriver | null>(null);
  
   const [price, setPrice] = useState(0);
   const [selectedCarClass, setSelectedCarClass] = useState<CarType | null>(null);
   const [selectedServices, setSelectedServices] = useState<string[]>([]);
   const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>({}); // Количество услуг (для незамерзаек)
   const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set()); // Раскрытые категории аккордеона (все закрыты по умолчанию)
  const [selectedHour, setSelectedHour] = useState<number | undefined>(initialHour);
  const [selectedBoxNumber, setSelectedBoxNumber] = useState<number | undefined>(initialBoxNumber);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | undefined>(undefined);
  const [paymentType, setPaymentType] = useState<'Наличный' | 'Безналичный' | 'Перевод' | 'Ведомость' | 'Яндекс' | 'QR-code'>('Наличный');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false); // ✅ Флаг для успешного сохранения
  const [saveError, setSaveError] = useState<string | null>(null); // ✅ Ошибка при сохранении
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string;
    clientName?: string;
    carModel?: string;
    carNumber?: string;
    organization?: string;
    driver?: string;
    car?: string;
  }>({});

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

  // Очистка ошибки конкретного поля при вводе
  const clearFieldError = (fieldName: keyof typeof fieldErrors) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors(prev => ({ ...prev, [fieldName]: undefined }));
    }
  };

  // Валидация телефона при потере фокуса (только если телефон указан)
  const handlePhoneBlur = () => {
    if (phone && phone.trim() !== '+7 ' && !validatePhone(phone)) {
      setFieldErrors(prev => ({ ...prev, phone: 'Введите коректный номер' }));
    }
  };

  // Валидация имени при потере фокуса
  const handleClientNameBlur = () => {
    if (!clientName || clientName.trim() === '') {
      setFieldErrors(prev => ({ ...prev, clientName: 'Укажите имя клиента' }));
    }
  };

  // Валидация модели авто при потере фокуса
  const handleCarModelBlur = () => {
    if (!carModel || carModel.trim() === '') {
      setFieldErrors(prev => ({ ...prev, carModel: 'Укажите модель автомобиля' }));
    }
  };

  // Валидация гос. номера при потере фокуса
  const handleCarNumberBlur = () => {
    if (!carNumber || carNumber.trim() === '') {
      setFieldErrors(prev => ({ ...prev, carNumber: 'Укажите гос. номер' }));
    } else if (!validateCarNumber(carNumber)) {
      setFieldErrors(prev => ({ ...prev, carNumber: 'Формат: А123АА' }));
    }
  };

  // Валидация шага 2 (Данные клиента)
  const validateStep3 = (): boolean => {
    const errors: {
      phone?: string;
      clientName?: string;
      carModel?: string;
      carNumber?: string;
      organization?: string;
      driver?: string;
      car?: string;
    } = {};

    // Валидация телефона (только для физлиц)
    if (clientType === 'PHYSICAL') {
      if (!phone || phone.trim() === '+7 ') {
        errors.phone = 'Введите коректный номер';
      } else if (!validatePhone(phone)) {
        errors.phone = 'Введите коректный номер';
      }
    }

    // Специфичная валидация для организаций
    if (clientType === 'ORG') {
      // Валидация организации
      if (!isAddingNewOrganization && !selectedOrganizationId) {
        errors.organization = 'Выберите организацию';
      } else if (isAddingNewOrganization && (!newOrganizationName || newOrganizationName.trim() === '')) {
        errors.organization = 'Введите название организации';
      }

      // Валидация водителя
      if (!isAddingNewDriver && !selectedDriverId) {
        errors.driver = 'Выберите водителя';
      } else if (isAddingNewDriver && (!newDriverName || newDriverName.trim() === '')) {
        errors.driver = 'Введите имя водителя';
      }

      // Валидация автомобиля
      if (!isAddingNewCar && !selectedCarId) {
        errors.car = 'Выберите автомобиль';
      } else if (isAddingNewCar && (!newCarModel || newCarModel.trim() === '')) {
        errors.car = 'Введите модель автомобиля';
      }

      // Для организаций имя клиента может быть заполнено из выбранного водителя
      // или из нового водителя
      const driverName = isAddingNewDriver ? newDriverName : 
                         (selectedDriverId ? organizationDrivers.find(d => d.id === selectedDriverId)?.full_name : '');
      
      if (!driverName || driverName.trim() === '') {
        errors.clientName = 'Укажите имя водителя';
      }

      // Модель авто для организаций берется из выбранного автомобиля или нового
      const carModelValue = isAddingNewCar ? newCarModel : 
                           (selectedCarId ? organizationCars.find(c => c.id === selectedCarId)?.car_model : '');
      
      if (!carModelValue || carModelValue.trim() === '') {
        errors.carModel = 'Укажите модель автомобиля';
      }
    } else {
      // Валидация для физического лица
      // ✅ Проверяем имя ТОЛЬКО если клиент НЕ выбран
      if (!selectedClientId && (!clientName || clientName.trim() === '')) {
        errors.clientName = 'Укажите имя клиента';
      }

      // ✅ Проверяем модель ТОЛЬКО если машина НЕ выбрана
      if (!selectedClientCarId && (!carModel || carModel.trim() === '')) {
        errors.carModel = 'Укажите модель автомобиля';
      }
    }

    // Валидация гос. номера (общая для всех типов)
    if (!carNumber || carNumber.trim() === '') {
      errors.carNumber = 'Укажите гос. номер';
    } else if (!validateCarNumber(carNumber)) {
      errors.carNumber = 'Формат: А123АА';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return false;
    }

    setFieldErrors({});
    return true;
  };

  // ✅ Функция сохранения нового клиента
  const handleSaveNewClient = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    if (clientType === 'PHYSICAL') {
      // Валидация
      if (!clientName || clientName.trim() === '') {
        setSaveError('Укажите имя клиента');
        return;
      }
      if (!phone || phone.trim() === '+7 ') {
        setSaveError('Введите коректный номер');
        return;
      }
      if (!validatePhone(phone)) {
        setSaveError('Введите коректный номер');
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
        // Create client through Slice #3a staff dispatcher (service_role
        // writes; phone normalized server-side).
        const createClientRes = await dispatchStaffCall<{ client: { id: string } }>('create-client', {
          full_name: clientName,
          phone: normalizePhoneNumber(phone),
        });
        const newClient = createClientRes.client;

        // Create the car through the same dispatcher.
        await dispatchStaffCall('create-client-car', {
          client_id: newClient.id,
          car_model: carModel,
          plate_number: carNumber,
          car_type: newCarType,
        });

        setSaveSuccess(true);

        // Сбрасываем форму через 2 секунды
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
        console.error('Такой клиент уже существует:', error);
        
        // Проверяем тип ошибки для красивого сообщения
        if (error.message === 'Такой клиент уже существует') {
          setSaveError('Такой клиент уже существует');
        } else {
          setSaveError('Такой клиент уже существует');
        }
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
        // Create organization through Slice #3a dispatcher.
        const createOrgRes = await dispatchStaffCall<{ organization: { id: string } }>('create-organization', {
          name: newOrganizationName,
        });
        const newOrg = createOrgRes.organization;

        // Create the org-driver.
        await dispatchStaffCall('create-org-driver', {
          organization_id: newOrg.id,
          full_name: newDriverName,
          phone: phone && phone.trim() !== '+7 ' ? normalizePhoneNumber(phone) : undefined,
        });

        // Create the org-car.
        await dispatchStaffCall('create-org-car', {
          organization_id: newOrg.id,
          car_model: carModel,
          plate_number: carNumber,
          car_type: newCarType,
        });

        setSaveSuccess(true);

        // Сбрасываем форму через 2 секунды
        setTimeout(() => {
          setSaveSuccess(false);
          setIsCreatingNewClient(false);
          setNewOrganizationName('');
          setNewDriverName('');
          setPhone('+7 ');
          setCarModel('');
          setCarNumber('');
          setNewCarType(CarType.SEDAN);
          setIsAddingNewOrganization(false);
          setIsAddingNewDriver(false);
          setStep(1);
        }, 2000);
      } catch (error) {
        console.error('Ошибка при сохранении организации:', error);
        
        // Проверяем тип ошибки для красивого сообщения
        if (error.message === 'Такая организация уже существует') {
          setSaveError('Такая организация уже существует');
        } else {
          setSaveError('Ошибка при сохранении организации');
        }
      }
    }
  };

  // Mock Step Navigation
  const nextStep = () => {
    // ✅ Шаг 0 - создание нового клиента/организации
    if (step === 0) {
      setValidationError(null);
      setStep(1); // Переходим на шаг 1 (Поиск)
      return;
    }
    
    if (step === 5 && !isQuickBookingModeActive && !selectedHour) {
      setValidationError('Пожалуйста, выберите время для записи');
      return;
    }
    
    if (step === 5 && !isQuickBookingModeActive && !selectedBoxNumber) {
      setValidationError('Пожалуйста, выберите бокс');
      return;
    }
    
    setValidationError(null);
    
    setStep(prev => Math.min(prev + 1, STEPS));
  };
  const prevStep = () => {
    if (step === 0) {
      // На шаге 0 возвращаемся на шаг 1 (Поиск)
      setStep(1);
      setIsCreatingNewClient(false);
      setIsEditingOrganization(false);
      setIsEditingClient(false);
    } else if (step === 1) {
      onBack();
    } else {
      setStep(prev => {
        const newStep = prev - 1;
        
        // Сбрасываем режим быстрого заказа при возврате на шаги 1-4
        if (newStep <= 4 && isQuickBookingModeActive) {
          setInternalQuickBookingMode(false);
        }
        
        return newStep;
      });
    }
  };

  // ✅ Удален useEffect для шага 2 (шаг удален)

  // Поиск по телефону (универсальный - физлица + организации)
  React.useEffect(() => {
    const search = async () => {
      // Ищем только если номер телефона полный (формат: +7 (XXX) XXX-XX-XX)
      if (validatePhone(phone) && step === 1) {
        setIsSearching(true);
        try {
          const results = await dispatchStaffCall<{ results: typeof searchResults }>('search-client-by-phone', { phone });
          setSearchResults(results.results);
        } catch (error) {
          console.error('Ошибка при поиске:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    };

    const timer = setTimeout(search, 500);
    return () => clearTimeout(timer);
  }, [phone, step]);

  // Поиск по гос номеру (отдельная логика)
  React.useEffect(() => {
    const search = async () => {
      // Ищем только если гос номер валидный (формат: А123АА или А123АА777)
      if (validateCarNumber(plateNumber) && step === 1) {
        setIsPlateSearching(true);
        try {
          const results = await searchByPlateNumber(plateNumber);
          setPlateSearchResults(results);
        } catch (error) {
          console.error('Ошибка при поиске по гос номеру:', error);
          setPlateSearchResults([]);
        } finally {
          setIsPlateSearching(false);
        }
      } else {
        setPlateSearchResults([]);
      }
    };

    const timer = setTimeout(search, 500);
    return () => clearTimeout(timer);
  }, [plateNumber, step]);

  // Обработчик выбора результата поиска
  const handleSelectSearchResult = async (result: SearchResult) => {
    if (result.type === 'client') {
      // Выбрано физлицо
      setSelectedClientId(result.client_id!);
      setClientName(result.client_name!);
      setPhone(result.phone);
      setClientType('PHYSICAL');

      // Загрузить автомобили клиента
      try {
        const cars = await getClientCars(result.client_id!);
        setClientCars(cars);
        setSelectedClientCarId(null);
      } catch (error) {
        console.error('Ошибка при загрузке автомобилей клиента:', error);
        setClientCars([]);
      }

      // ✅ Автоопределяем класс авто при выборе физлица
      // Класс будет определен при выборе конкретного автомобиля
      setStep(2); // ✅ Переходим на шаг 2 (Услуги)
    } else {
      // Выбрана организация
      setSelectedOrganizationId(result.organization_id!);
      setSelectedDriverId(result.driver_id!);
      setClientName(result.driver_name!);
      setPhone(result.phone);
      setClientType('ORG');

      // Сбросить выбор автомобиля
      setSelectedCarId(null);
      setIsAddingNewCar(false);

      // ✅ Если выбран автомобиль - переходим сразу на шаг3 (Класс автомобиля)
      // Если нет автомобиля - переходим на шаг2 для редактирования
      if (result.organization_cars && result.organization_cars.length > 0) {
        // Выбираем первый автомобиль по умолчанию
        const firstCar = result.organization_cars[0];
        setSelectedCarId(firstCar.id);
        setCarModel(firstCar.car_model);
        setCarNumber(firstCar.plate_number);
        setStep(2); // ✅ Переходим на шаг 2 (Класс автомобиля)
      } else {
        setIsReadOnlyStep3(false);
        setStep(2); // Переходим на шаг 2 для редактирования организации
      }
    }
  };

  // ✅ Функция для перехода в режим редактирования организации
  const handleEditOrganization = async (result: SearchResult) => {
    if (!result.organization_id) return;

    try {
      // Загружаем данные организации
      const orgData = organizations.find(o => o.id === result.organization_id);

      // Загружаем ВСЕ водителей организации из базы данных
      const { data: orgDrivers, error: driversError } = await supabase
        .from('organization_drivers')
        .select('*')
        .eq('organization_id', result.organization_id)
        .eq('is_active', true);

      if (driversError) {
        console.error('Ошибка при загрузке водителей организации:', driversError);
      }

      // Загружаем ВСЕ машины организации из базы данных
      const { data: orgCars, error: carsError } = await supabase
        .from('organization_cars')
        .select('*')
        .eq('organization_id', result.organization_id)
        .eq('is_active', true);

      if (carsError) {
        console.error('Ошибка при загрузке автомобилей организации:', carsError);
      }

      setEditingOrgData({
        organization: orgData || null,
        drivers: orgDrivers || [],
        cars: orgCars || []
      });

      setSelectedOrganizationId(result.organization_id);
      setClientType('ORG');
      setIsEditingOrganization(true);
      setIsCreatingNewClient(false);
      setStep(0);
    } catch (error) {
      console.error('Ошибка при загрузке данных организации:', error);
    }
  };

  // ✅ Обработчик открытия модального окна подписи
  const handleOpenSignatureModal = (driver: OrganizationDriver) => {
    setSelectedDriverForSignature(driver);
    setSignatureModalOpen(true);
  };

  // ✅ Обработчик сохранения подписи водителя
  const handleSaveDriverSignature = async (signatureBase64: string) => {
    if (!selectedDriverForSignature) return;

    try {
      await dispatchStaffCall('update-driver-signature', {
        driver_id: selectedDriverForSignature.id,
        signature_data: signatureBase64,
      });

      // Обновляем локальное состояние
      setEditingOrgData(prev => ({
        ...prev,
        drivers: prev.drivers.map(d =>
          d.id === selectedDriverForSignature.id
            ? { ...d, signature_data: signatureBase64, signature_updated_at: new Date().toISOString() }
            : d
        )
      }));

      setSignatureModalOpen(false);
      setSelectedDriverForSignature(null);
    } catch (error) {
      console.error('Ошибка сохранения подписи:', error);
      alert('Не удалось сохранить подпись');
    }
  };

  // ✅ Функция для перехода в режим редактирования физлица
  const handleEditClient = async (result: SearchResult) => {
    if (!result.client_id) return;

    try {
      // Загружаем данные клиента
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', result.client_id)
        .single();

      if (clientError) throw clientError;

      // Загружаем автомобили клиента
      const { data: clientCars, error: carsError } = await supabase
        .from('client_cars')
        .select('*')
        .eq('client_id', result.client_id)
        .eq('is_active', true);

      if (carsError) {
        console.error('Ошибка при загрузке автомобилей клиента:', carsError);
      }

      setEditingClientData({
        client: clientData,
        cars: clientCars || []
      });

      setSelectedClientId(result.client_id);
      setClientType('PHYSICAL');
      setIsEditingClient(true);
      setIsCreatingNewClient(false);
      setStep(0);
    } catch (error) {
      console.error('Ошибка при загрузке данных клиента:', error);
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
          {step === 0 ? (
            // ✅ При редактировании показываем соответствующий заголовок
            <>
              {isEditingOrganization ? (
                <h2 className="font-bold text-lg">Редактирование организации</h2>
              ) : isEditingClient ? (
                <h2 className="font-bold text-lg">Редактирование клиента</h2>
              ) : (
                <h2 className="font-bold text-lg">{clientType === 'ORG' ? 'Создание организации' : 'Создание клиента'}</h2>
              )}
            </>
          ) : (
            <>
              <h2 className="font-bold text-lg">{isQuickBookingModeActive ? 'Быстрый заказ' : 'Новая запись'}</h2>
              <div className="text-xs text-gray-500">
                Шаг {step} из {STEPS}
              </div>
            </>
          )}
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
                    // Защищаем "+7 " от удаления
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
              
              {/* ✅ Поиск по гос номеру - отдельное поле */}
              <div className="relative my-4">
                 <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                 <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#f5f5f5] px-2 text-muted-foreground">Или</span></div>
              </div>
              
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
              
              {/* ✅ Универсальные результаты поиска с машинами */}
              {searchResults.length > 0 && !isSearching && (
                <div className="space-y-3">
                  {/* Разделяем результаты на физлиц и организации */}
                  {(() => {
                    const clientResults = searchResults.filter(r => r.type === 'client');
                    const orgResults = searchResults.filter(r => r.type === 'organization');
                    
                    // Группируем организации по organization_id
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
                        {/* Результаты для физлиц */}
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
                                 {/* Заголовок клиента - иконка и имя, разделитель, телефон */}
                                 <div className="flex items-center gap-2 mb-4">
                                   <div className="font-bold text-lg flex items-center gap-2">
                                     <User className="w-5 h-5" />
                                     {result.client_name}
                                   </div>
                                   <span className="text-gray-400">|</span>
                                   <div className="text-sm text-gray-600">{result.phone}</div>
                                 </div>

                                 {/* Кнопка действия - одна кнопка */}
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   className="w-full mb-4"
                                   onClick={() => {
                                     handleEditClient({
                                       type: 'client',
                                       client_id: result.client_id,
                                       client_name: result.client_name,
                                       phone: result.phone
                                     });
                                   }}
                                 >
                                   <Users className="w-4 h-4 mr-2" />
                                   Добавить/Редактировать
                                 </Button>

                                {/* Список автомобилей */}
                                {result.client_cars && result.client_cars.length > 0 && (
                                  <div className="space-y-2">
                                    {result.client_cars.map((car) => (
                                      <CarCard
                                        key={car.id}
                                        car={car as any}
                                        onClick={async () => {
                                          setSelectedClientId(result.client_id!);
                                          setSelectedClientCarId(car.id);
                                          setClientName(result.client_name!);
                                          setCarModel(car.car_model);
                                          setCarNumber(car.plate_number);
                                          setClientType('PHYSICAL');
                                          setPhone(result.phone);
                                          setIsEditingOrganization(false);
                                          setIsEditingClient(false);
                                          setIsCreatingNewClient(false);

                                           try {
                                             const cars = await getClientCars(result.client_id!);
                                             setClientCars(cars);
                                           } catch (error) {
                                             console.error('Ошибка при загрузке автомобилей клиента:', error);
                                             setClientCars([]);
                                           }

                                           // ✅ Автоопределяем класс авто
                                           setSelectedCarClass(car.car_type as CarType);

                                           setStep(2); // ✅ Переходим на шаг 2 (Услуги)
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
                        
                        {/* Результаты для организаций - сгруппированные */}
                        {orgGroups.size > 0 && (
                          <div className="text-sm text-gray-600 font-medium">
                            Найдено:
                          </div>
                        )}
                        {Array.from(orgGroups.values()).map((orgGroup, orgIndex) => (
                          <div key={`org-${orgIndex}`} className="space-y-2">
                            <Card className="border-primary bg-blue-50/50">
                              <CardContent className="p-4">
                                {/* Заголовок организации - иконка и название, разделитель, телефон */}
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="font-bold text-lg flex items-center gap-2">
                                    <Building2 className="w-5 h-5" />
                                    {orgGroup.organization_name}
                                  </div>
                                  <span className="text-gray-400">|</span>
                                  <div className="text-sm text-gray-600">{orgGroup.phone}</div>
                                </div>
                                
                                {/* Кнопка действия - одна кнопка */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full mb-6"
                                  onClick={() => {
                                    handleEditOrganization({
                                      type: 'organization',
                                      organization_id: orgGroup.organization_id,
                                      organization_name: orgGroup.organization_name,
                                      phone: orgGroup.phone
                                    });
                                  }}
                                >
                                  <Users className="w-4 h-4 mr-2" />
                                  Добавить/Редактировать
                                </Button>
                                
                                {/* Список водителей с их машинами */}
                                <div className="space-y-3">
                                  {orgGroup.drivers.map((driver, driverIndex) => (
                                    <div key={`driver-${driverIndex}`} className="space-y-2">
                                      {/* Имя водителя с галочкой выбора по умолчанию - кликабельное */}
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
                                      
                                      {/* Машины водителя - плавная анимация */}
                                      <div
                                        className="ml-8 overflow-hidden transition-all duration-300 ease-in-out"
                                        style={{
                                          maxHeight: expandedDrivers.has(driver.driver_id) ? '1000px' : '0px',
                                          opacity: expandedDrivers.has(driver.driver_id) ? '1' : '0'
                                        }}
                                      >
                                        <div className="space-y-2 pt-2">
                                          {driver.organization_cars.length > 0 && driver.organization_cars.map((car: any) => (
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
                                                setIsEditingOrganization(false);
                                                setIsCreatingNewClient(false);

                                                const fullCar = findCarById(organizationCars, car.id);
                                                const changes = trackCarChanges(car.car_model, car.plate_number, fullCar);
                                                setOriginalCarModel(changes.originalModel);
                                                setOriginalCarNumber(changes.originalNumber);
                                                setIsCarModelChanged(changes.isModelChanged);
                                                setIsCarNumberChanged(changes.isNumberChanged);

                                                // ✅ Автоопределяем класс авто
                                                setSelectedCarClass(car.car_type as CarType);

                                                setStep(2); // ✅ Переходим на шаг 2 (Услуги)
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

              {/* Loading state for search */}
              {isSearching && phone.length > 5 && (
                <div className="text-center text-gray-500 py-4">
                  <div className="animate-pulse">Поиск...</div>
                </div>
              )}

              {/* ✅ Результаты поиска по гос номеру */}
              {plateSearchResults.length > 0 && !isPlateSearching && (
                <div className="space-y-3">
                  {(() => {
                    const clientResults = plateSearchResults.filter(r => r.type === 'client');
                    const orgResults = plateSearchResults.filter(r => r.type === 'organization');
                    
                    // Группируем организации по organization_id
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
                        {/* Результаты для физлиц */}
                        {clientResults.length > 0 && (
                          <div className="text-sm text-gray-600 font-medium">
                            Найдено по гос номеру: {clientResults.length}
                          </div>
                        )}
                         {clientResults.map((result, index) => (
                           <div key={`plate-client-${index}`} className="space-y-2">
                             <Card className="border-primary bg-blue-50/50">
                               <CardContent className="p-4">
                                 {/* Заголовок клиента - иконка и имя, разделитель, телефон */}
                                 <div className="flex items-center gap-2 mb-4">
                                   <div className="font-bold text-lg flex items-center gap-2">
                                     <User className="w-5 h-5" />
                                     {result.client_name}
                                   </div>
                                   <span className="text-gray-400">|</span>
                                   <div className="text-sm text-gray-600">{result.phone}</div>
                                 </div>

                                 {/* Кнопка действия - одна кнопка */}
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   className="w-full mb-4"
                                   onClick={() => {
                                     handleEditClient({
                                       type: 'client',
                                       client_id: result.client_id,
                                       client_name: result.client_name,
                                       phone: result.phone
                                     });
                                   }}
                                 >
                                   <Users className="w-4 h-4 mr-2" />
                                   Добавить/Редактировать
                                 </Button>

                                {/* Список автомобилей */}
                                {result.client_cars && result.client_cars.length > 0 && (
                                  <div className="space-y-2">
                                    {result.client_cars.map((car) => (
                                      <CarCard
                                        key={car.id}
                                        car={car as any}
                                        onClick={async () => {
                                          setSelectedClientId(result.client_id!);
                                          setSelectedClientCarId(car.id);
                                          setClientName(result.client_name!);
                                          setCarModel(car.car_model);
                                          setCarNumber(car.plate_number);
                                          setClientType('PHYSICAL');
                                          setPhone(result.phone);
                                          setIsEditingOrganization(false);
                                          setIsEditingClient(false);
                                          setIsCreatingNewClient(false);

                                           try {
                                             const cars = await getClientCars(result.client_id!);
                                             setClientCars(cars);
                                           } catch (error) {
                                             console.error('Ошибка при загрузке автомобилей клиента:', error);
                                             setClientCars([]);
                                           }

                                           // ✅ Автоопределяем класс авто
                                           setSelectedCarClass(car.car_type as CarType);

                                           setStep(2); // ✅ Переходим на шаг 2 (Услуги)
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                            </div>
                        ))}
                        
                        {/* Результаты для организаций - сгруппированные */}
                        {orgGroups.size > 0 && (
                          <div className="text-sm text-gray-600 font-medium">
                            Найдено по гос номеру:
                          </div>
                        )}
                        {Array.from(orgGroups.values()).map((orgGroup, orgIndex) => (
                          <div key={`plate-org-${orgIndex}`} className="space-y-2">
                            <Card className="border-primary bg-blue-50/50">
                              <CardContent className="p-4">
                                {/* Заголовок организации - иконка и название, разделитель, телефон */}
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="font-bold text-lg flex items-center gap-2">
                                    <Building2 className="w-5 h-5" />
                                    {orgGroup.organization_name}
                                  </div>
                                  <span className="text-gray-400">|</span>
                                  <div className="text-sm text-gray-600">{orgGroup.phone}</div>
                                </div>
                                
                                {/* Кнопка действия - одна кнопка */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full mb-6"
                                  onClick={() => {
                                    handleEditOrganization({
                                      type: 'organization',
                                      organization_id: orgGroup.organization_id,
                                      organization_name: orgGroup.organization_name,
                                      phone: orgGroup.phone
                                    });
                                  }}
                                >
                                  <Users className="w-4 h-4 mr-2" />
                                  Добавить/Редактировать
                                </Button>
                                
                                {/* Список водителей с их машинами */}
                                <div className="space-y-3">
                                  {orgGroup.drivers.map((driver, driverIndex) => (
                                    <div key={`plate-driver-${driverIndex}`} className="space-y-2">
                                      {/* Имя водителя с галочкой выбора по умолчанию - кликабельное */}
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
                                      
                                      {/* Машины водителя - плавная анимация */}
                                      <div
                                        className="ml-8 overflow-hidden transition-all duration-300 ease-in-out"
                                        style={{
                                          maxHeight: expandedDrivers.has(driver.driver_id) ? '1000px' : '0px',
                                          opacity: expandedDrivers.has(driver.driver_id) ? '1' : '0'
                                        }}
                                      >
                                        <div className="space-y-2 pt-2">
                                          {driver.organization_cars.length > 0 && driver.organization_cars.map((car: any) => (
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
                                                setIsEditingOrganization(false);
                                                setIsCreatingNewClient(false);

                                                const fullCar = findCarById(organizationCars, car.id);
                                                const changes = trackCarChanges(car.car_model, car.plate_number, fullCar);
                                                setOriginalCarModel(changes.originalModel);
                                                setOriginalCarNumber(changes.originalNumber);
                                                setIsCarModelChanged(changes.isModelChanged);
                                                setIsCarNumberChanged(changes.isNumberChanged);

                                                // ✅ Автоопределяем класс авто
                                                setSelectedCarClass(car.car_type as CarType);

                                                setStep(2); // ✅ Переходим на шаг 2 (Услуги)
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

              {/* Loading state for plate search */}
              {isPlateSearching && plateNumber.length > 0 && (
                <div className="text-center text-gray-500 py-4">
                  <div className="animate-pulse">Поиск по гос номеру...</div>
                </div>
              )}

              <div className="relative my-6">
                 <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                 <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#f5f5f5] px-2 text-muted-foreground">Или</span></div>
              </div>

              <div className="space-y-3">
                <Button variant="outline" className="w-full h-12" onClick={() => { setClientType('PHYSICAL'); setIsCreatingNewClient(true); setIsEditingOrganization(false); setStep(0); }}>
                  <User className="w-4 h-4 mr-2" /> Новый клиент
                </Button>
                <Button variant="outline" className="w-full h-12" onClick={() => { setClientType('ORG'); setIsCreatingNewClient(true); setIsEditingOrganization(false); setStep(0); }}>
                  <Building2 className="w-4 h-4 mr-2" /> Новая организация
                </Button>
              </div>

              {/* База клиентов и организаций */}
              <div className="mt-6">
                <ClientDatabaseAccordion
                  onSelectClient={async (clientId, clientCarId, clientName, phone, carModel, carNumber, carType) => {
                    setSelectedClientId(clientId);
                    setSelectedClientCarId(clientCarId);
                    setClientName(clientName);
                    setPhone(phone);
                    setCarModel(carModel);
                    setCarNumber(carNumber);
                    setClientType('PHYSICAL');
                    setIsEditingOrganization(false);
                    setIsEditingClient(false);
                    setIsCreatingNewClient(false);

                    try {
                      const cars = await getClientCars(clientId);
                      setClientCars(cars);
                    } catch (error) {
                      console.error('Ошибка при загрузке автомобилей клиента:', error);
                      setClientCars([]);
                    }

                    setSelectedCarClass(carType as CarType);
                    setStep(2);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {step === 0 && (isEditingOrganization || isEditingClient || isCreatingNewClient) && ( // ✅ Шаг 0 для создания/редактирования клиента/организации
           <div className="space-y-6 animate-in slide-in-from-right duration-300">
              
              <div className="space-y-4">
               {isEditingOrganization && clientType === 'ORG' && (
                  <>
                    {/* Название организации */}
                    <div className="space-y-2">
                      <Label>Название организации</Label>
                      <Input
                        placeholder=""
                        value={editingOrgData.organization?.name || ''}
                        onChange={(e) => setEditingOrgData(prev => ({
                          ...prev,
                          organization: prev.organization ? { ...prev.organization, name: e.target.value } : null
                        }))}
                        className="h-12"
                      />
                    </div>

                    {/* Основная информация */}
                    <div className="space-y-3 pt-4 border-t">
                      <Label className="text-base font-semibold">Основная информация</Label>
                      <div className="space-y-2">
                        <Label>ИНН</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.inn || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, inn: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>КПП</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.kpp || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, kpp: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>ОГРН</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.ogrn || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, ogrn: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                    </div>

                    {/* Адрес */}
                    <div className="space-y-3 pt-4 border-t">
                      <Label className="text-base font-semibold">Адрес</Label>
                      <div className="space-y-2">
                        <Label>Юридический адрес</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.legal_address || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, legal_address: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                    </div>

                    {/* Банковские реквизиты */}
                    <div className="space-y-3 pt-4 border-t">
                      <Label className="text-base font-semibold">Банковские реквизиты</Label>
                      <div className="space-y-2">
                        <Label>Расчетный счет (Р/сч)</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.payment_account || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, payment_account: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Название банка</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.bank_name || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, bank_name: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Корреспондентский счет (К/сч)</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.correspondent_account || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, correspondent_account: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>БИК</Label>
                        <Input
                          placeholder=""
                          value={editingOrgData.organization?.bik || ''}
                          onChange={(e) => setEditingOrgData(prev => ({
                            ...prev,
                            organization: prev.organization ? { ...prev.organization, bik: e.target.value } : null
                          }))}
                          className="h-12"
                        />
                      </div>
                    </div>

                   {/* Секция водителей */}
                   <div className="space-y-3 pt-4 border-t">
                     <div className="flex items-center gap-2">
                       <Label className="text-base font-semibold">Водитель</Label>
                       <span className="text-gray-400">|</span>
                       {!isAddingDriverInEditMode && (
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => setIsAddingDriverInEditMode(true)}
                         >
                           <Plus className="w-4 h-4 mr-1" />
                           Добавить
                         </Button>
                       )}
                     </div>

                     {/* Форма добавления/редактирования водителя */}
                     {isAddingDriverInEditMode && (
                       <div className="space-y-2 p-4 border rounded-lg bg-blue-50">
                         <div className="space-y-2">
                           <Label>Имя водителя</Label>
                           <Input
                             placeholder="Иван Иванов"
                             value={newDriverNameInEdit}
                             onChange={(e) => setNewDriverNameInEdit(e.target.value)}
                             className="h-12"
                           />
                         </div>
                         <div className="space-y-2">
                           <Label>Номер телефона</Label>
                           <Input
                             placeholder="+7 (___) ___-__-__"
                             value={newDriverPhoneInEdit}
                             onChange={(e) => {
                               const formatted = formatPhoneNumber(e.target.value);
                               setNewDriverPhoneInEdit(formatted);
                             }}
                             className="text-lg tracking-wider h-12"
                           />
                         </div>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1"
                              onClick={async () => {
                                if (!newDriverNameInEdit || !newDriverPhoneInEdit) return;
                                if (!validatePhone(newDriverPhoneInEdit)) return;

                                const editingDriverId = (window as any).editingDriverId;

                                try {
                                  if (editingDriverId) {
                                    // Update driver via Slice #3a dispatcher.
                                    const updatedRes = await dispatchStaffCall<{ driver: { id: string; full_name: string; phone: string | null } }>('update-org-driver', {
                                      driver_id: editingDriverId,
                                      full_name: newDriverNameInEdit,
                                      phone: newDriverPhoneInEdit,
                                    });

                                    setEditingOrgData(prev => ({
                                      ...prev,
                                      drivers: prev.drivers.map(d =>
                                        d.id === editingDriverId ? { ...d, ...updatedRes.driver } : d
                                      )
                                    }));

                                    delete (window as any).editingDriverId;
                                  } else {
                                    // Add new driver via Slice #3a dispatcher.
                                    const createdRes = await dispatchStaffCall<{ driver: { id: string; full_name: string; phone: string | null } }>('create-org-driver', {
                                      organization_id: selectedOrganizationId!,
                                      full_name: newDriverNameInEdit,
                                      phone: newDriverPhoneInEdit,
                                    });

                                    setEditingOrgData(prev => ({
                                      ...prev,
                                      drivers: [...prev.drivers, createdRes.driver]
                                    }));
                                  }

                                  setNewDriverNameInEdit('');
                                  setNewDriverPhoneInEdit('');
                                  setIsAddingDriverInEditMode(false);
                                } catch (error) {
                                  console.error('Ошибка при сохранении водителя:', error);
                                }
                              }}
                            >
                              {(window as any).editingDriverId ? 'Сохранить' : 'Добавить'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsAddingDriverInEditMode(false);
                                setNewDriverNameInEdit('');
                                setNewDriverPhoneInEdit('');
                                delete (window as any).editingDriverId;
                              }}
                            >
                              Отмена
                            </Button>
                          </div>
                       </div>
                     )}

                     {/* Список водителей */}
                     <div className="space-y-2">
                       {editingOrgData.drivers.map((driver) => (
                         <div
                           key={driver.id}
                           className="flex justify-between items-start p-3 border rounded-lg bg-gray-50"
                         >
                           <div className="flex-1">
                             <div className="font-medium">{driver.full_name}</div>
                             <div className="text-sm text-gray-600">{driver.phone}</div>
                             
                             {/* ✅ Индикатор подписи */}
                             <div className="mt-2">
                               {driver.signature_data ? (
                                 <div className="flex items-center gap-2">
                                   {/* Preview подписи */}
                                   <img
                                     src={driver.signature_data}
                                     alt="Подпись"
                                     className="h-8 border border-gray-300 rounded px-2 bg-white"
                                   />
                                   {/* Зеленая галочка */}
                                   <Check className="w-4 h-4 text-green-600" />
                                 </div>
                               ) : (
                                 <div className="text-xs text-orange-600 flex items-center gap-1">
                                   <AlertCircle className="w-3 h-3" />
                                   Подпись не установлена
                                 </div>
                               )}
                             </div>
                           </div>
                           <div className="flex flex-col items-center gap-2">
                             {/* Кнопки редактирования и удаления */}
                             <div className="flex items-center justify-center gap-2">
                               <Button
                                 variant="ghost"
                                 size="icon"
                                 onClick={() => {
                                   // Редактировать водителя
                                   setNewDriverNameInEdit(driver.full_name);
                                   setNewDriverPhoneInEdit(driver.phone);
                                   setIsAddingDriverInEditMode(true);
                                   // Сохраняем ID редактируемого водителя
                                   (window as any).editingDriverId = driver.id;
                                 }}
                               >
                                 <Edit2 className="w-4 h-4" />
                               </Button>
                               <span className="text-gray-400">|</span>
                               <Button
                                 variant="ghost"
                                 size="icon"
                                 onClick={async () => {
                                   // Удалить водителя
                                   if (confirm('Удалить водителя?')) {
                                     try {
                                       const { error } = await supabase
                                         .from('organization_drivers')
                                         .update({ is_active: false })
                                         .eq('id', driver.id);
                                       
                                       if (error) throw error;
                                       
                                       setEditingOrgData(prev => ({
                                         ...prev,
                                         drivers: prev.drivers.filter(d => d.id !== driver.id)
                                       }));
                                     } catch (error) {
                                       console.error('Ошибка при удалении водителя:', error);
                                     }
                                   }
                                 }}
                               >
                                 <Trash2 className="w-4 h-4 text-red-500" />
                               </Button>
                             </div>
                             
                             {/* Разделитель на ширину кнопки */}
                             <div className="w-full border-t border-gray-300"></div>
                             
                             {/* Кнопка управления подписью - под кнопками редактирования */}
                             <Button
                               size="sm"
                               variant={driver.signature_data ? "outline" : "default"}
                               onClick={() => handleOpenSignatureModal(driver)}
                               className="w-full"
                             >
                               <Pen className="w-4 h-4 mr-1" />
                               {driver.signature_data ? 'Изменить' : 'Установить'}
                             </Button>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>

                   {/* Секция автомобилей */}
                   <div className="space-y-3 pt-4 border-t">
                     <div className="flex items-center gap-2">
                       <Label className="text-base font-semibold">Автомобиль</Label>
                       <span className="text-gray-400">|</span>
                       {!isAddingCarInEditMode && (
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => setIsAddingCarInEditMode(true)}
                         >
                           <Plus className="w-4 h-4 mr-1" />
                           Добавить
                         </Button>
                       )}
                     </div>

                      {/* Форма добавления/редактирования автомобиля */}
                      {isAddingCarInEditMode && (
                        <div className="space-y-2 p-4 border rounded-lg bg-blue-50">
                          <div className="space-y-2">
                            <Label>Модель автомобиля</Label>
                            <Input
                              placeholder="Toyota Camry"
                              value={newCarModelInEdit}
                              onChange={(e) => setNewCarModelInEdit(e.target.value)}
                              className="h-12"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Гос. номер</Label>
                            <Input
                              placeholder="А123АА"
                              className="uppercase"
                              value={newCarNumberInEdit}
                              onChange={(e) => {
                                const formatted = formatCarNumber(e.target.value);
                                setNewCarNumberInEdit(formatted);
                              }}
                            />
                          </div>
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
                           <div className="flex gap-2">
                             <Button
                               className="flex-1"
                               onClick={async () => {
                                 if (!newCarModelInEdit || !newCarNumberInEdit) return;
                                 if (!validateCarNumber(newCarNumberInEdit)) return;

                                 const editingCarId = (window as any).editingCarId;

try {
                                    if (editingCarId) {
                                      // Update org-car via Slice #3a dispatcher.
                                      const updatedCarRes = await dispatchStaffCall<{ car: { id: string; car_model: string; plate_number: string; car_type: string; is_active: boolean } }>('update-org-car', {
                                        car_id: editingCarId,
                                        car_model: newCarModelInEdit,
                                        plate_number: newCarNumberInEdit,
                                        car_type: newCarType,
                                      });

                                      setEditingOrgData(prev => ({
                                        ...prev,
                                        cars: prev.cars.map(c =>
                                          c.id === editingCarId ? { ...c, ...updatedCarRes.car } : c
                                        )
                                      }));

                                      delete (window as any).editingCarId;
                                     } else {
                                       // Add new org-car via Slice #3a dispatcher.
                                       const createdCarRes = await dispatchStaffCall<{ car: { id: string; car_model: string; plate_number: string; car_type: string; is_active: boolean } }>('create-org-car', {
                                         organization_id: selectedOrganizationId!,
                                         car_model: newCarModelInEdit,
                                         plate_number: newCarNumberInEdit,
                                         car_type: newCarType,
                                       });

                                      setEditingOrgData(prev => ({
                                        ...prev,
                                        cars: [...prev.cars, createdCarRes.car]
                                      }));
                                   }

                                   setNewCarModelInEdit('');
                                   setNewCarNumberInEdit('');
                                   setNewCarType(CarType.SEDAN);
                                   setIsAddingCarInEditMode(false);
                                 } catch (error) {
                                   console.error('Ошибка при сохранении автомобиля:', error);
                                 }
                               }}
                             >
                               {(window as any).editingCarId ? 'Сохранить' : 'Добавить'}
                             </Button>
                             <Button
                               variant="outline"
                               onClick={() => {
                                 setIsAddingCarInEditMode(false);
                                 setNewCarModelInEdit('');
                                 setNewCarNumberInEdit('');
                                 setNewCarType(CarType.SEDAN);
                                 delete (window as any).editingCarId;
                               }}
                             >
                               Отмена
                             </Button>
                           </div>
                        </div>
                      )}

                      {/* Список автомобилей */}
                      <div className="space-y-2">
                        {editingOrgData.cars.map((car) => (
                          <div
                            key={car.id}
                            className="flex justify-between items-center p-3 border rounded-lg bg-gray-50"
                          >
                            <div>
                              <div className="font-bold">{car.car_model} <span className="font-normal text-gray-500">| {CAR_TYPE_LABELS[car.car_type] || car.car_type}</span></div>
                              <div className="text-sm text-gray-600">{car.plate_number}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  // Редактировать автомобиль
                                  setNewCarModelInEdit(car.car_model);
                                  setNewCarNumberInEdit(car.plate_number);
                                  setNewCarType(car.car_type as CarType);
                                  setIsAddingCarInEditMode(true);
                                  // Сохраняем ID редактируемого автомобиля
                                  (window as any).editingCarId = car.id;
                                }}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <span className="text-gray-400">|</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  // Удалить автомобиль
                                  if (confirm('Удалить автомобиль?')) {
                                    try {
                                      const { error } = await supabase
                                        .from('organization_cars')
                                        .update({ is_active: false })
                                        .eq('id', car.id);

                                      if (error) throw error;

                                      setEditingOrgData(prev => ({
                                        ...prev,
                                        cars: prev.cars.filter(c => c.id !== car.id)
                                      }));
                                    } catch (error) {
                                      console.error('Ошибка при удалении автомобиля:', error);
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>
                 </>
               )}
                {clientType === 'ORG' && !isEditingOrganization && (
                  <>
                    {/* Название организации */}
                    <div className="space-y-2">
                      <Label>Название организации</Label>
                      <Input
                        placeholder="ООО Рога и Копыта"
                        value={newOrganizationName}
                        onChange={(e) => setNewOrganizationName(e.target.value)}
                        className="h-12"
                      />
                    </div>

                    {/* Имя водителя */}
                    <div className="space-y-2">
                      <Label>Имя водителя</Label>
                      <Input
                        placeholder="Иван Иванов"
                        value={newDriverName}
                        onChange={(e) => setNewDriverName(e.target.value)}
                        className="h-12"
                      />
                    </div>

                    {/* Номер телефона водителя */}
                    <div className="space-y-2">
                      <Label>Номер телефона</Label>
                      <Input
                        placeholder="+7 (___) ___-__-__"
                        value={phone}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
                          setPhone(formatted);
                          clearFieldError('phone');
                        }}
                        onFocus={() => clearFieldError('phone')}
                        onBlur={handlePhoneBlur}
                        className={cn(
                          "text-lg tracking-wider h-12",
                          fieldErrors.phone ? "border-red-500 focus:ring-red-500" : ""
                        )}
                      />
                      {fieldErrors.phone && (
                        <p className="text-sm text-gray-500">{fieldErrors.phone}</p>
                      )}
                    </div>

                    {/* Модель автомобиля */}
                    <div className="space-y-2">
                      <Label>Модель автомобиля</Label>
                      <Input
                        placeholder="Toyota Camry"
                        value={carModel}
                        onChange={(e) => {
                          setCarModel(e.target.value);
                          clearFieldError('carModel');
                        }}
                        onFocus={() => clearFieldError('carModel')}
                        onBlur={handleCarModelBlur}
                        className={cn(
                          fieldErrors.carModel ? "border-red-500 focus:ring-red-500" : ""
                        )}
                      />
                      {fieldErrors.carModel && (
                        <p className="text-sm text-gray-500">{fieldErrors.carModel}</p>
                      )}
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

                    {/* Гос. номер */}
                    <div className="space-y-2">
                      <Label>Гос. номер</Label>
                      <Input
                        placeholder="А123АА"
                        className={cn(
                          "uppercase",
                          fieldErrors.carNumber ? "border-red-500 focus:ring-red-500" : ""
                        )}
                        value={carNumber}
                        onChange={(e) => {
                          const formatted = formatCarNumber(e.target.value);
                          setCarNumber(formatted);
                          clearFieldError('carNumber');
                        }}
                        onFocus={() => clearFieldError('carNumber')}
                        onBlur={handleCarNumberBlur}
                      />
                      {fieldErrors.carNumber && (
                        <p className="text-sm text-gray-500">{fieldErrors.carNumber}</p>
                      )}
                    </div>
                  </>
                )}
                {/* ✅ Блок для редактирования физлица */}
                {isEditingClient && clientType === 'PHYSICAL' && (
                  <>
                    {/* Имя клиента */}
                    <div className="space-y-2">
                      <Label>Имя клиента</Label>
                      <Input
                        placeholder="Иван Иванов"
                        value={editingClientData.client?.full_name || ''}
                        onChange={(e) => setEditingClientData(prev => ({
                          ...prev,
                          client: prev.client ? { ...prev.client, full_name: e.target.value } : null
                        }))}
                        className="h-12"
                      />
                    </div>

                    {/* Кнопка разблокировки */}
                    {editingClientData.client?.online_booking_blocked_until && (
                      <Button
                        variant="outline"
                        className="w-full border-green-600 text-green-700 hover:bg-green-50"
                        onClick={async () => {
                          if (!selectedClientId) return;
                          try {
                            await dispatchStaffCall('unblock-client', {
                              client_id: selectedClientId,
                            });
                            // Обновляем локальное состояние
                            setEditingClientData(prev => ({
                              ...prev,
                              client: prev.client ? { ...prev.client, online_booking_blocked_until: null } : null
                            }));
                          } catch (error) {
                            console.error('Ошибка разблокировки:', error);
                            alert('Не удалось разблокировать клиента');
                          }
                        }}
                      >
                        <Unlock className="w-4 h-4 mr-2" />
                        Разблокировать
                      </Button>
                    )}

                   {/* Секция автомобилей */}
                   <div className="space-y-3 pt-4 border-t">
                     <div className="flex items-center gap-2">
                       <Label className="text-base font-semibold">Автомобиль</Label>
                       <span className="text-gray-400">|</span>
                       {!isAddingCarInEditMode && (
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => setIsAddingCarInEditMode(true)}
                         >
                           <Plus className="w-4 h-4 mr-1" />
                           Добавить
                         </Button>
                       )}
                     </div>

                      {/* Форма добавления/редактирования автомобиля */}
                      {isAddingCarInEditMode && (
                        <div className="space-y-2 p-4 border rounded-lg bg-blue-50">
                          <div className="space-y-2">
                            <Label>Модель автомобиля</Label>
                            <Input
                              placeholder="Toyota Camry"
                              value={newCarModelInEdit}
                              onChange={(e) => setNewCarModelInEdit(e.target.value)}
                              className="h-12"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Гос. номер</Label>
                            <Input
                              placeholder="А123АА"
                              className="uppercase"
                              value={newCarNumberInEdit}
                              onChange={(e) => {
                                const formatted = formatCarNumber(e.target.value);
                                setNewCarNumberInEdit(formatted);
                              }}
                            />
                          </div>
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
                           <div className="flex gap-2">
                             <Button
                               className="flex-1"
                               onClick={async () => {
                                 if (!newCarModelInEdit || !newCarNumberInEdit) return;
                                 if (!validateCarNumber(newCarNumberInEdit)) return;

                                 const editingCarId = (window as any).editingCarId;

try {
                                     if (editingCarId) {
                                       // Update client-car via Slice #3a dispatcher.
                                       const updatedCarRes = await dispatchStaffCall<{ car: { id: string; car_model: string; plate_number: string; car_type: string; is_active: boolean } }>('update-client-car', {
                                         car_id: editingCarId,
                                         car_model: newCarModelInEdit,
                                         plate_number: newCarNumberInEdit,
                                         car_type: newCarType,
                                       });

                                       setEditingClientData(prev => ({
                                         ...prev,
                                         cars: prev.cars.map(c =>
                                           c.id === editingCarId ? { ...c, ...updatedCarRes.car } : c
                                         )
                                       }));

                                       delete (window as any).editingCarId;
                                     } else {
                                       // Add new client-car via Slice #3a dispatcher.
                                       const createdCarRes = await dispatchStaffCall<{ car: { id: string; car_model: string; plate_number: string; car_type: string; is_active: boolean } }>('create-client-car', {
                                         client_id: selectedClientId!,
                                         car_model: newCarModelInEdit,
                                         plate_number: newCarNumberInEdit,
                                         car_type: newCarType,
                                       });

                                      setEditingClientData(prev => ({
                                        ...prev,
                                        cars: [...prev.cars, createdCarRes.car]
                                      }));
                                    }

                                   setNewCarModelInEdit('');
                                   setNewCarNumberInEdit('');
                                   setNewCarType(CarType.SEDAN);
                                   setIsAddingCarInEditMode(false);
                                 } catch (error) {
                                   console.error('Ошибка при сохранении автомобиля:', error);
                                 }
                               }}
                             >
                               {(window as any).editingCarId ? 'Сохранить' : 'Добавить'}
                             </Button>
                             <Button
                               variant="outline"
                               onClick={() => {
                                 setIsAddingCarInEditMode(false);
                                 setNewCarModelInEdit('');
                                 setNewCarNumberInEdit('');
                                 setNewCarType(CarType.SEDAN);
                                 delete (window as any).editingCarId;
                               }}
                             >
                               Отмена
                             </Button>
                           </div>
                        </div>
                      )}

                      {/* Список автомобилей */}
                      <div className="space-y-2">
                        {editingClientData.cars.map((car) => (
                          <div
                            key={car.id}
                            className="flex justify-between items-center p-3 border rounded-lg bg-gray-50"
                          >
                            <div>
                              <div className="font-bold">{car.car_model} <span className="font-normal text-gray-500">| {CAR_TYPE_LABELS[car.car_type] || car.car_type}</span></div>
                              <div className="text-sm text-gray-600">{car.plate_number}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  // Редактировать автомобиль
                                  setNewCarModelInEdit(car.car_model);
                                  setNewCarNumberInEdit(car.plate_number);
                                  setNewCarType(car.car_type as CarType);
                                  setIsAddingCarInEditMode(true);
                                  // Сохраняем ID редактируемого автомобиля
                                  (window as any).editingCarId = car.id;
                                }}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <span className="text-gray-400">|</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  // Удалить автомобиль
                                  if (confirm('Удалить автомобиль?')) {
                                    try {
                                      const { error } = await supabase
                                        .from('client_cars')
                                        .update({ is_active: false })
                                        .eq('id', car.id);

                                      if (error) throw error;

                                      setEditingClientData(prev => ({
                                        ...prev,
                                        cars: prev.cars.filter(c => c.id !== car.id)
                                      }));
                                    } catch (error) {
                                      console.error('Ошибка при удалении автомобиля:', error);
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>
                 </>
               )}
               {/* ✅ Блок для создания физлица */}
               {clientType === 'PHYSICAL' && !isEditingClient && (
                 <>
                   {/* Поле телефона */}
                   <div className="space-y-2">
                      <Label>Номер телефона</Label>
                      <Input
                        placeholder="+7 (___) ___-__-__"
                        value={phone}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
                          setPhone(formatted);
                          clearFieldError('phone');
                        }}
                        onFocus={() => clearFieldError('phone')}
                        onBlur={handlePhoneBlur}
                        className={cn(
                          "text-lg tracking-wider h-12",
                          fieldErrors.phone ? "border-red-500 focus:ring-red-500" : ""
                        )}
                      />
                      {fieldErrors.phone && (
                        <p className="text-sm text-gray-500">{fieldErrors.phone}</p>
                      )}
                    </div>
                   {/* Имя клиента */}
                   <div className="space-y-2">
                     <Label>Имя клиента</Label>
                     <Input
                       placeholder="Иван Иванов"
                       value={clientName}
                       onChange={(e) => {
                         setClientName(e.target.value);
                         clearFieldError('clientName');
                       }}
                       onFocus={() => clearFieldError('clientName')}
                       onBlur={handleClientNameBlur}
                       className={cn(
                         fieldErrors.clientName ? "border-red-500 focus:ring-red-500" : ""
                       )}
                     />
                     {fieldErrors.clientName && (
                       <p className="text-sm text-gray-500">{fieldErrors.clientName}</p>
                     )}
                   </div>

                    {/* Модель авто (для физлиц или если добавляем новую машину) */}
                    {(!selectedClientCarId) && (
                  <div className="space-y-2">
                    <Label>Модель автомобиля</Label>
                    <Input
                      placeholder="Toyota Camry"
                      value={carModel}
                      onChange={(e) => {
                        setCarModel(e.target.value);
                        
                        const clientCar = findCarById(clientCars, selectedClientCarId);
                        const orgCar = findCarById(organizationCars, selectedCarId);
                        const car = clientCar || orgCar;
                        
                        if (car) {
                          const changes = trackCarChanges(e.target.value, carNumber, car);
                          setIsCarModelChanged(changes.isModelChanged);
                        }
                        clearFieldError('carModel');
                      }}
                      onFocus={() => clearFieldError('carModel')}
                      onBlur={handleCarModelBlur}
                      className={cn(
                        fieldErrors.carModel ? "border-red-500 focus:ring-red-500" : ""
                      )}
                    />
                    {fieldErrors.carModel && (
                      <p className="text-sm text-gray-500">{fieldErrors.carModel}</p>
                    )}
                  </div>
                )}

                {/* Тип авто (для создания нового физлица) */}
                {(!selectedClientCarId) && (
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
                )}

               {/* Гос номер (для физлиц или если добавляем новую машину) */}
               {(!selectedClientCarId) && (
                 <div className="space-y-2">
                    <Label>Гос. номер</Label>
                    <Input
                      placeholder="А123АА"
                      className={cn(
                        "uppercase",
                        fieldErrors.carNumber ? "border-red-500 focus:ring-red-500" : ""
                      )}
                      value={carNumber}
                      onChange={(e) => {
                        const formatted = formatCarNumber(e.target.value);
                        setCarNumber(formatted);
                        
                        if (isAddingNewCar) {
                          setNewCarNumber(formatted);
                        }
                        
                        const clientCar = findCarById(clientCars, selectedClientCarId);
                        const orgCar = findCarById(organizationCars, selectedCarId);
                        const car = clientCar || orgCar;
                        
                        if (car) {
                          const changes = trackCarChanges(carModel, formatted, car);
                          setIsCarNumberChanged(changes.isNumberChanged);
                        }
                        clearFieldError('carNumber');
                      }}
                      onFocus={() => clearFieldError('carNumber')}
                      onBlur={handleCarNumberBlur}
                    />
                    {fieldErrors.carNumber && (
                      <p className="text-sm text-gray-500">{fieldErrors.carNumber}</p>
                    )}
                 </div>
               )}
             </>
             )}
              {isEditingOrganization ? (
                <Button
                  className="w-full h-12 mt-4"
                  onClick={async () => {
                    // Сохранить изменения и вернуться на шаг 1
                    if (!editingOrgData.organization) return;

                    try {
                      // Update organization via Slice #3a dispatcher.
                      await dispatchStaffCall('update-organization', {
                        org_id: selectedOrganizationId!,
                        name: editingOrgData.organization.name,
                        inn: editingOrgData.organization.inn,
                        kpp: editingOrgData.organization.kpp,
                        ogrn: editingOrgData.organization.ogrn,
                        legal_address: editingOrgData.organization.legal_address,
                        payment_account: editingOrgData.organization.payment_account,
                        bank_name: editingOrgData.organization.bank_name,
                        correspondent_account: editingOrgData.organization.correspondent_account,
                        bik: editingOrgData.organization.bik,
                      });

                      setSaveSuccess(true);

                      // Сбрасываем режим редактирования и возвращаемся на шаг 1
                      setIsEditingOrganization(false);
                      setEditingOrgData({ organization: null, drivers: [], cars: [] });
                      setStep(1);

                      // Сбрасываем сообщение об успехе через 2 секунды
                      setTimeout(() => {
                        setSaveSuccess(false);
                      }, 2000);
                    } catch (error) {
                      console.error('Ошибка при сохранении организации:', error);
                      setSaveError('Ошибка при сохранении организации');
                    }
                }}
              >
                Сохранить
              </Button>
             ) : isEditingClient ? (
               <Button
                 className="w-full h-12 mt-4"
                 onClick={async () => {
                   // Сохранить изменения и вернуться на шаг 1
                   if (!editingClientData.client) return;

                    try {
                      // Update client via Slice #3a dispatcher.
                      await dispatchStaffCall('update-client', {
                        client_id: selectedClientId!,
                        full_name: editingClientData.client.full_name,
                      });

                     setSaveSuccess(true);

                     // Сбрасываем режим редактирования и возвращаемся на шаг 1
                     setIsEditingClient(false);
                     setEditingClientData({ client: null, cars: [] });
                     setStep(1);

                     // Сбрасываем сообщение об успехе через 2 секунды
                     setTimeout(() => {
                       setSaveSuccess(false);
                     }, 2000);
                   } catch (error) {
                     console.error('Такой клиент уже существует:', error);
                     setSaveError('Такой клиент уже существует');
                   }
               }}
             >
               Сохранить
             </Button>
             ) : isCreatingNewClient ? (
               <>
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
                   <Button className="w-full h-12 mt-4" onClick={handleSaveNewClient} disabled={saveSuccess}>
                     <Check className="w-5 h-5 mr-2" /> Сохранить
                   </Button>
                 )}
               </>
             ) : (
               <Button className="w-full h-12 mt-4" onClick={nextStep}>Далее</Button>
             )}
             </div>
           </div>
         )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
              <h3 className="text-xl font-bold">Услуги</h3>
              <div className="space-y-4">
                <Label className="text-gray-500 text-xs uppercase tracking-wider block">Выберите услуги</Label>
                
                {/* Аккордеон категорий */}
                <div className="space-y-3">
                  {Object.entries(SERVICE_CATEGORIES).map(([categoryId, category]) => {
                    const categoryServices = services.filter(svc => 
                      !isBonusService(svc.service_id) && category.services.includes(svc.service_id)
                    );
                    
                    if (categoryServices.length === 0) return null;
                    
                    const isExpanded = expandedCategories.has(categoryId);
                    
                    return (
                      <div key={categoryId} className="border rounded-lg overflow-hidden">
                        {/* Заголовок категории */}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedCategories(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(categoryId)) {
                                newSet.delete(categoryId);
                              } else {
                                newSet.add(categoryId);
                              }
                              return newSet;
                            });
                          }}
                          className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{category.icon}</span>
                            <span className="font-medium">{category.label}</span>
                            <span className="text-xs text-gray-500">({categoryServices.length})</span>
                          </div>
                          <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        
                        {/* Услуги категории */}
                        <div
                          className="overflow-hidden transition-all duration-300 ease-in-out"
                          style={{
                            maxHeight: isExpanded ? '2000px' : '0px',
                            opacity: isExpanded ? '1' : '0'
                          }}
                        >
                          <div className="p-3 space-y-3">
                            {categoryServices.map((svc: Service) => {
                             // Для незамерзающих услуг цена не зависит от типа авто
                             const isAntifreeze = ANTIFREEZE_SERVICE_IDS.includes(svc.service_id);
                             const servicePrice = isAntifreeze
                               ? Number(svc.price_sedan) // Используем базовую цену для незамерзайки
                               : (selectedCarClass ? getServicePrice(svc, selectedCarClass) : 0);
                             
                             // Для обычных услуг используем id (UUID), для незамерзайки - service_id (строка)
                             // Это нужно для корректной работы с БД: обычные услуги хранятся как UUID, незамерзайка - как service_id
                             const serviceId = isAntifreeze ? svc.service_id : svc.id;
                             const quantity = serviceQuantities[serviceId] || 0;
                             
                             return (
                               isAntifreeze ? (
                                 // UI для незамерзаек с количеством
                                 <div
                                   key={svc.service_id}
                                   className={cn(
                                     "flex items-center justify-between border p-3 rounded-lg transition-colors",
                                     selectedServices.includes(serviceId) ? "border-primary bg-blue-50" : "hover:border-primary hover:bg-gray-50"
                                   )}
                                 >
                                   <div className="flex items-center space-x-3 flex-1">
                                      <div
                                        className="cursor-pointer"
                                        onClick={() => {
                                          const hasAntifreeze = selectedServices.some(id => ANTIFREEZE_SERVICE_IDS.includes(id));
                                          const hasRegularServices = selectedServices.some(id => !ANTIFREEZE_SERVICE_IDS.includes(id));

                                          if (hasRegularServices) {
                                            alert('Нельзя комбинировать услуги автомойки с продажей незамерзайки.');
                                            return;
                                          }

                                          // ✅ Используем функциональное обновление для гарантии актуального значения
                                          if (selectedServices.includes(serviceId)) {
                                            // Отмена услуги - вычитаем цену за текущее количество
                                            setServiceQuantities(prev => {
                                              const currentQuantity = prev[serviceId] || 0;
                                              setPrice(p => p - currentQuantity * servicePrice);
                                              return { ...prev, [serviceId]: 0 };
                                            });
                                            setSelectedServices(prev => prev.filter(id => id !== serviceId));
                                          } else {
                                            // Выбор услуги - добавляем цену
                                            setServiceQuantities(prev => {
                                              const currentQuantity = prev[serviceId] || 0;
                                              const newQuantity = currentQuantity > 0 ? currentQuantity : 1;
                                              setPrice(p => p + newQuantity * servicePrice);
                                              return { ...prev, [serviceId]: newQuantity };
                                            });
                                            setSelectedServices(prev => [...prev, serviceId]);
                                          }
                                        }}
                                      >
                                       {selectedServices.includes(serviceId) ? (
                                         <CheckCircle className="w-5 h-5 text-green-600" />
                                       ) : (
                                         <Circle className="w-5 h-5 text-gray-400" />
                                       )}
                                     </div>
                                     <div className="flex-1">
                                       <div className="text-sm font-medium">{svc.name}</div>
                                       <div className="text-xs text-gray-500">{servicePrice} ₽/шт</div>
                                     </div>
                                   </div>
                                   
                                    {/* Кнопки +/- для количества */}
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="w-8 h-8"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // ✅ Используем функциональное обновление для гарантии актуального значения
                                          setServiceQuantities(prev => {
                                            const currentQuantity = prev[serviceId] || 0;
                                            const newQuantity = Math.max(0, currentQuantity - 1);

                                            // Вычитаем цену если услуга выбрана И текущее количество >0
                                            if (selectedServices.includes(serviceId) && currentQuantity > 0) {
                                              setPrice(p => p - servicePrice);
                                            }

                                            // При количестве 0 убираем услугу из выбранных
                                            if (newQuantity === 0 && selectedServices.includes(serviceId)) {
                                              setSelectedServices(prev => prev.filter(id => id !== serviceId));
                                            }

                                            return { ...prev, [serviceId]: newQuantity };
                                          });
                                        }}
                                      >
                                        <Minus className="w-4 h-4" />
                                      </Button>
                                     <span className="w-8 text-center font-medium">{quantity}</span>
                                     <Button
                                       size="icon"
                                       variant="outline"
                                       className="w-8 h-8"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         const currentQuantity = serviceQuantities[serviceId] || 0;
                                         const newQuantity = currentQuantity + 1;
                                         
                                         setServiceQuantities(prev => ({ ...prev, [serviceId]: newQuantity }));
                                         
                                         // Если услуга не выбрана - выбираем её
                                         if (!selectedServices.includes(serviceId)) {
                                           setSelectedServices(prev => [...prev, serviceId]);
                                         }
                                         
                                         // Пересчитываем цену
                                         setPrice(p => p + servicePrice);
                                       }}
                                     >
                                       <Plus className="w-4 h-4" />
                                     </Button>
                                   </div>
                                 </div>
                               ) : (
                                 // UI для обычных услуг (без изменений)
                                 <div
                                   key={svc.service_id}
                                   className={cn(
                                     "flex items-center space-x-3 border p-3 rounded-lg cursor-pointer transition-colors",
                                     selectedServices.includes(serviceId) ? "border-primary bg-blue-50" : "hover:border-primary hover:bg-gray-50"
                                   )}
                                   onClick={() => {
                                     const isAntifreeze = ANTIFREEZE_SERVICE_IDS.includes(svc.service_id);
                                     const hasAntifreeze = selectedServices.some(id => ANTIFREEZE_SERVICE_IDS.includes(id));
                                     const hasRegularServices = selectedServices.some(id => !ANTIFREEZE_SERVICE_IDS.includes(id));

                                     if (isAntifreeze && hasRegularServices) {
                                       alert('Нельзя комбинировать услуги автомойки с продажей незамерзайки. Выберите либо услуги мойки, либо незамерзайку.');
                                       return;
                                     }

                                     if (!isAntifreeze && hasAntifreeze) {
                                       alert('Нельзя комбинировать услуги автомойки с продажей незамерзайки. Выберите либо услуги мойки, либо незамерзайку.');
                                       return;
                                     }

                                     if (selectedServices.includes(serviceId)) {
                                       setSelectedServices(prev => prev.filter(id => id !== serviceId));
                                       setPrice(p => p - servicePrice);
                                     } else {
                                       setSelectedServices(prev => [...prev, serviceId]);
                                       setPrice(p => p + servicePrice);
                                     }
                                   }}
                                 >
                                   {selectedServices.includes(serviceId) ? (
                                     <CheckCircle className="w-5 h-5 text-green-600" />
                                   ) : (
                                     <Circle className="w-5 h-5 text-gray-400" />
                                   )}
                                  <div className="flex-1 flex justify-between">
                                    <div className="text-sm font-medium">
                                      {svc.name}
                                    </div>
                                    <span className="text-sm text-gray-500 whitespace-nowrap">+{servicePrice} ₽</span>
                                  </div>
                                </div>
                            )
                          );
                           })}
                          </div>
                        </div>
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
                 
                 {/* ✅ Проверка валидации услуг */}
                 {(() => {
                   const hasAntifreeze = selectedServices.some(id => ANTIFREEZE_SERVICE_IDS.includes(id));
                   const hasRegularServices = selectedServices.some(id => !ANTIFREEZE_SERVICE_IDS.includes(id));
                   const isInvalid = hasAntifreeze && hasRegularServices;
                   
                   return isInvalid ? (
                     <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mt-4">
                       <div className="flex items-center gap-2">
                         <AlertCircle className="w-5 h-5" />
                         <div>
                           <div className="font-semibold">Нельзя комбинировать услуги</div>
                           <div className="text-sm mt-1">
                             Выберите либо услуги автомойки, либо незамерзающие жидкости
                           </div>
                         </div>
                       </div>
                     </div>
                   ) : null;
                 })()}
                 
                 <Button
                   className="w-full h-12"
                   onClick={nextStep}
                   disabled={selectedServices.length === 0 || (() => {
                     const hasAntifreeze = selectedServices.some(id => ANTIFREEZE_SERVICE_IDS.includes(id));
                     const hasRegularServices = selectedServices.some(id => !ANTIFREEZE_SERVICE_IDS.includes(id));
                     return hasAntifreeze && hasRegularServices;
                   })()}
                 >
                   Далее
                 </Button>
              </div>
            </div>
          )}

         {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
             <h3 className="text-xl font-bold">Время и оплата</h3>
             
             {!isQuickBookingModeActive && (
               <div className="space-y-3">
                  <Label>Выберите бокс</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((box) => {
                      const openHours = closedBoxes.get(box);
                      const isBoxClosed = closedBoxes.has(box) && (!openHours || openHours.length === 0);
                      
                      return (
                        <Button
                          key={box}
                          variant={selectedBoxNumber === box ? "default" : "outline"}
                          disabled={isBoxClosed}
                          onClick={() => {
                            if (!isBoxClosed) {
                              setSelectedBoxNumber(box);
                              setSelectedHour(undefined);
                            }
                          }}
                          className="relative"
                        >
                          <span className="flex items-center gap-1">
                            Бокс {box}
                            {isBoxClosed && <Lock className="w-3 h-3" />}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
               </div>
             )}

             {!isQuickBookingModeActive && selectedBoxNumber && (
               <div className="space-y-3 pt-4">
                  <Label>Выберите время</Label>
                  {(() => {
                    // Определяем занятые часы для выбранного бокса
                    const bookedHours = bookings
                      .filter((booking: any) => {
                        if (!booking.start_time) return false;
                        const bookingHour = parseInt(booking.start_time.split(':')[0]);
                        return booking.box_number === selectedBoxNumber &&
                               booking.status !== 'ОТМЕНЕНО' &&
                               booking.status !== 'ГОТОВО';
                      })
                      .map((booking: any) => parseInt(booking.start_time.split(':')[0]));

                    // Определяем текущий час для фильтрации прошлого времени
                    const now = new Date();
                    const currentHour = now.getHours();
                    const today = formatDate(now);
                    
                    // Проверяем, выбрана ли сегодняшняя дата
                    const isToday = selectedDate === today;
                    
                    // Проверяем закрытость бокса на конкретный час
                    const isBoxClosedForHour = (hour: number): boolean => {
                      const openHours = closedBoxes.get(selectedBoxNumber);
                      if (!openHours) return false; // Бокс полностью открыт
                      return !openHours.includes(hour); // Бокс закрыт на этот час
                    };

                    // Фильтруем только свободные часы
                    // Если выбрана сегодняшняя дата - не показываем прошедшие часы
                    const availableHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].filter(
                      hour => {
                        // Час должен быть свободным
                        const isFree = !bookedHours.includes(hour);
                        // Если сегодня - час должен быть >= текущего часа
                        const isNotPast = !isToday || hour >= currentHour;
                        // Бокс должен быть открыт на этот час
                        const isBoxOpen = !isBoxClosedForHour(hour);
                        return isFree && isNotPast && isBoxOpen;
                      }
                    );

                    if (availableHours.length === 0) {
                      return <div className="text-sm text-gray-500 italic">Нет свободных слотов</div>;
                    }

                    return (
                      <div className="grid grid-cols-2 gap-2">
                        {availableHours.map((hour) => (
                          <Button
                            key={hour}
                            variant={selectedHour === hour ? "default" : "outline"}
                            className="justify-start"
                            onClick={() => setSelectedHour(hour)}
                          >
                            {hour}:00 - {hour + 1}:00
                          </Button>
                        ))}
                      </div>
                    );
                  })()}
               </div>
             )}

             {isQuickBookingModeActive && (
               <div className="space-y-3 pt-4">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <Clock className="w-5 h-5" />
                      <span className="font-medium">Быстрый заказ: 30 минут</span>
                    </div>
                    <div className="text-sm text-green-600 mt-2">
                      Время будет определено автоматически при подтверждении
                    </div>
                  </div>
               </div>
             )}

               <div className="space-y-3 pt-4">
                  <Label>Способ оплаты</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <button
                      onClick={() => setPaymentType('Наличный')}
                      className={cn(
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                        "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                         "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                         "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
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
                         "border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer",
                         paymentType === 'Яндекс'
                           ? "border-primary bg-blue-50"
                           : "border hover:border-primary hover:bg-blue-50"
                       )}
                     >
                        <Banknote className={cn("w-6 h-6", paymentType === 'Яндекс' ? "text-primary" : "text-gray-400")} />
                        <span className={cn("font-bold text-sm", paymentType === 'Яндекс' ? "" : "text-gray-400")}>Яндекс</span>
                     </button>
                  </div>
              </div>

             {validationError && (
               <div className="text-red-500 text-sm font-medium">{validationError}</div>
             )}

             <Button className="w-full h-12" onClick={nextStep}>Далее</Button>
          </div>
        )}

         {step === 4 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
             <h3 className="text-xl font-bold">Подтверждение записи</h3>
             
             {/* Карточка с данными клиента */}
             <Card className="border-primary bg-blue-50/50">
               <CardContent className="p-4 space-y-3">
                 {clientType === 'ORG' ? (
                   // Отображение для организации
                   <>
                     <div className="flex justify-between items-start">
                       <div>
                         <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Клиент</div>
                         <div className="font-bold text-lg">
                           {isAddingNewOrganization
                             ? (newOrganizationName || 'Не указано')
                             : (selectedOrganizationId
                                 ? organizations.find(org => org.id === selectedOrganizationId)?.name || 'Не указано'
                                 : 'Не указано')
                           }
                         </div>
                       </div>
                       <Badge variant="secondary">Организация</Badge>
                     </div>
                     <div className="pt-2">
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Номер телефона</div>
                       <div className="font-medium">{phone || 'Не указано'}</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4 pt-2">
                       <div>
                         <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Водитель</div>
                         <div className="font-medium">
                           {isAddingNewDriver
                             ? (newDriverName || 'Не указано')
                             : (selectedDriverId
                                 ? organizationDrivers.find(d => d.id === selectedDriverId)?.full_name || 'Не указано'
                                 : 'Не указано')
                           }
                         </div>
                       </div>
                       <div>
                         <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Подпись</div>
                         <div className="font-medium flex items-center gap-2">
                           {isAddingNewDriver ? (
                             <span className="text-gray-400 text-sm">Новый водитель</span>
                           ) : selectedDriverId ? (
                             (() => {
                               const driver = organizationDrivers.find(d => d.id === selectedDriverId);
                               if (driver?.signature_data) {
                                 return (
                                   <>
                                     <img
                                       src={driver.signature_data}
                                       alt="Подпись"
                                       className="h-6 border border-gray-300 rounded px-2 bg-white"
                                     />
                                     <Check className="w-4 h-4 text-green-600" />
                                   </>
                                 );
                               } else {
                                 return (
                                   <span className="text-orange-500 text-sm flex items-center gap-1">
                                     <AlertCircle className="w-3 h-3" />
                                     Не установлена
                                   </span>
                                 );
                               }
                             })()
                           ) : (
                             <span className="text-gray-400 text-sm">Не указано</span>
                           )}
                         </div>
                       </div>
                       <div>
                         <FieldWithChange
                           label="Автомобиль"
                           originalValue={findCarById(organizationCars, selectedCarId)?.car_model}
                           currentValue={carModel}
                           isChanged={!isAddingNewCar && isCarModelChanged}
                         />
                       </div>
                     </div>
                     <FieldWithChange
                       label="Гос. номер"
                       originalValue={findCarById(organizationCars, selectedCarId)?.plate_number}
                       currentValue={carNumber}
                       isChanged={!isAddingNewCar && isCarNumberChanged}
                     />
                   </>
                 ) : (
                   // Отображение для физического лица
                   <>
                     <div className="flex justify-between items-start">
                       <div>
                         <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Клиент</div>
                         <div className="font-bold text-lg">{clientName || 'Не указано'}</div>
                       </div>
                     </div>
                     <div className="pt-2">
                       <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Номер телефона</div>
                       <div className="font-medium">{phone || 'Не указано'}</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4 pt-2">
                       <FieldWithChange
                         label="Автомобиль"
                         originalValue={originalCarModel}
                         currentValue={carModel}
                         isChanged={isCarModelChanged}
                       />
                       <FieldWithChange
                         label="Гос. номер"
                         originalValue={originalCarNumber}
                         currentValue={carNumber}
                         isChanged={isCarNumberChanged}
                       />
                     </div>
                   </>
                 )}
               </CardContent>
             </Card>

             <h3 className="text-xl font-bold">Назначить мойщика</h3>
             
             <div className="space-y-3">
               {(() => {
                 // Группируем мойщиков на solo workers и pairs
                 const workerUnits: Array<{
                   id: string;
                   name: string;
                   mode: 'solo' | 'pair';
                   workers: any[];
                   cars: number;
                 }> = [];
                 
                 const processedPairs = new Set<string>();
                 
                 workers.forEach(worker => {
                   // Если работает в паре и пара еще не обработана
                   if (worker.workingMode === 'pair' && worker.partnerId) {
                     const pairKey = [worker.id, worker.partnerId].sort().join('-');
                     if (!processedPairs.has(pairKey)) {
                       const partner = workers.find(w => w.id === worker.partnerId);
                       if (partner) {
                         processedPairs.add(pairKey);
                         workerUnits.push({
                           id: worker.id,
                           name: `${worker.name} + ${partner.name}`,
                           mode: 'pair',
                           workers: [worker, partner],
                           cars: worker.carsToday + partner.carsToday
                         });
                       }
                     }
                   }
                   // Если работает solo
                   else if (worker.workingMode === 'solo' && worker.isWorkingToday) {
                     workerUnits.push({
                       id: worker.id,
                       name: worker.name,
                       mode: 'solo',
                       workers: [worker],
                       cars: worker.carsToday
                     });
                   }
                 });
                 
                 return workerUnits.map((unit) => {
                   // Проверяем, занят ли кто-то из пары на выбранное время
                   const isWorkerBusy = unit.workers.some((w: any) =>
                     bookings.some((booking: any) => {
                       const bookingHour = parseInt(booking.start_time.split(':')[0]);
                       return booking.workerId === w.id &&
                              bookingHour === selectedHour &&
                              booking.status !== 'ОТМЕНЕНО' &&
                              booking.status !== 'ГОТОВО';
                     })
                   );

                   return (
                     <div
                       key={unit.id}
                       onClick={() => !isWorkerBusy && setSelectedWorkerId(unit.id)}
                       className={cn(
                         "flex justify-between items-center p-4 border rounded-xl cursor-pointer transition-all",
                         selectedWorkerId === unit.id ? "border-primary bg-blue-50 ring-2 ring-primary ring-offset-2" : "",
                         isWorkerBusy ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-blue-50"
                       )}
                     >
                        <div className="flex items-center gap-3">
                           <div className={cn(
                             "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                             unit.mode === 'pair' ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"
                           )}>
                             {unit.mode === 'pair' ? (
                               <Users className="w-5 h-5" />
                             ) : (
                               unit.name[0]
                             )}
                           </div>
                           <div>
                             <div className="font-bold">{unit.name}</div>
                             <div className="text-xs text-gray-500">
                               {unit.cars} {unit.cars === 1 ? 'машина' : 'машин'} сегодня
                               {unit.mode === 'pair' && ' (пара)'}
                             </div>
                             {isWorkerBusy && selectedHour && (
                               <div className="text-xs text-orange-500 font-medium">Занят в {selectedHour}:00</div>
                             )}
                           </div>
                        </div>
                        {selectedWorkerId === unit.id && (
                          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                     </div>
                   );
                 });
               })()}
             </div>

             <div className="flex items-center gap-2 pt-4">
                <Checkbox
                  id="later"
                  checked={!selectedWorkerId}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedWorkerId(undefined);
                  }}
                />
                <label htmlFor="later" className="text-sm font-medium">Назначить позже</label>
             </div>

              <Button
                size="lg"
                className="w-full h-14 mt-6 text-lg"
                onClick={async () => {
                  // Получаем название организации по ID или используем новую организацию
                  const organizationName = selectedOrganizationId
                    ? organizations.find(o => o.id === selectedOrganizationId)?.name
                    : (isAddingNewOrganization && newOrganizationName.trim() ? newOrganizationName.trim() : undefined);
                  
                  setSaveError(null);

                  // ✅ Формируем массив услуг с количеством (только для незамерзающих жидкостей)
                  const servicesWithQuantities = selectedServices
                    .filter(serviceId => ANTIFREEZE_SERVICE_IDS.includes(serviceId))
                    .map(serviceId => {
                      const quantity = serviceQuantities[serviceId] || 1;
                      const service = services.find((s: Service) => s.service_id === serviceId);
                      const price = service ? Number(service.price_sedan) : 0;
                      return {
                        service_id: serviceId,
                        quantity,
                        price,
                        total: quantity * price
                      };
                    });

                  await onComplete({
                    clientName,
                    phone: phone && phone.trim() !== '+7 ' ? normalizePhoneNumber(phone) : '',
                    carModel,
                    carNumber,
                    carType: selectedCarClass,
                    price,
                    services: selectedServices,
                    clientType,
                    selectedHour: isQuickBookingModeActive ? undefined : selectedHour,
                    selectedBoxNumber: isQuickBookingModeActive ? undefined : selectedBoxNumber,
                    selectedWorkerId,
                    paymentType,
                    date: selectedDate || formatDate(new Date()),
                    isQuickBooking: isQuickBookingModeActive,
                    orgName: organizationName,
                    organizationId: selectedOrganizationId || undefined,
                    driverId: selectedDriverId || undefined,
                    carId: selectedCarId || undefined,
                    clientId: selectedClientId || undefined,
                    clientCarId: selectedClientCarId || undefined,
                    servicesWithQuantities
                  });
                }}
                disabled={isCreatingBookingProp}
              >
                {isCreatingBookingProp ? (
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

     {/* ✅ Модальное окно для работы с подписью водителя */}
     <SignatureModal
       isOpen={signatureModalOpen}
       onClose={() => {
         setSignatureModalOpen(false);
         setSelectedDriverForSignature(null);
       }}
       onSave={handleSaveDriverSignature}
       existingSignature={selectedDriverForSignature?.signature_data || null}
       driverName={selectedDriverForSignature?.full_name || ''}
     />
   </div>
 );
};

function PlusIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}