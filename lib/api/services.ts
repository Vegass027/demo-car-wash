import { supabase } from '../supabase';
import { CarType } from '../types/common';

// Тип услуги из БД
export interface Service {
  id: string;
  service_id: string;
  name: string;
  service_type: string;
  category: string;
  price_sedan: number;
  price_crossover: number;
  price_jeep: number;
  price_large_suv: number;
  price_minivan: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  allow_multiple: boolean;
  is_visible_in_online_booking: boolean;
}

// Услуга с выбранной ценой для конкретного типа авто
export interface ServiceWithPrice extends Service {
  selectedPrice: number;
}

// Категории услуг
export type ServiceCategory = 'basic' | 'additional';

// Получить цену услуги для типа авто
export function getServicePrice(service: Service, carType: CarType): number {
  switch (carType) {
    case 'SEDAN':
      return Number(service.price_sedan);
    case 'CROSSOVER':
      return Number(service.price_crossover);
    case 'JEEP':
      return Number(service.price_jeep);
    case 'LARGE_SUV':
      return Number(service.price_large_suv);
    case 'MINIVAN':
      return Number(service.price_minivan);
    default:
      return Number(service.price_sedan);
  }
}

// Получить все услуги
export async function getServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Ошибка при загрузке услуг:', error);
    throw error;
  }

  return data || [];
}

// Получить услуги с ценами для конкретного типа авто
export async function getServicesWithPrices(carType: CarType): Promise<ServiceWithPrice[]> {
  const services = await getServices();
  
  return services.map(service => ({
    ...service,
    selectedPrice: getServicePrice(service, carType)
  }));
}

// Получить услуги по категории
export async function getServicesByCategory(category: ServiceCategory): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error(`Ошибка при загрузке услуг категории ${category}:`, error);
    throw error;
  }

  return data || [];
}

// Получить услугу по service_id
export async function getServiceByServiceId(serviceId: string): Promise<Service | null> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error(`Ошибка при загрузке услуги ${serviceId}:`, error);
    return null;
  }

  return data;
}

// Получить услугу по ID
export async function getServiceById(id: string): Promise<Service | null> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Ошибка при загрузке услуги ${id}:`, error);
    return null;
  }

  return data;
}

/**
 * Получить услуги видимые клиентам в онлайн-записи
 * Фильтрует по is_visible_in_online_booking = true
 */
export async function getPublicServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .eq('is_visible_in_online_booking', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Ошибка при загрузке публичных услуг:', error);
    throw error;
  }

  return data || [];
}
