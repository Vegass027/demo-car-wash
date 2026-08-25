/**
 * Общие типы для использования во всем приложении
 * Вынесены отдельно, чтобы избежать циклических зависимостей
 */

export enum PostStatus {
  FREE = 'FREE',
  BUSY = 'BUSY'
}

export enum CarType {
  SEDAN = 'SEDAN',
  CROSSOVER = 'CROSSOVER',
  JEEP = 'JEEP',
  LARGE_SUV = 'LARGE_SUV',
  MINIVAN = 'MINIVAN'
}

export type WorkingMode = 'solo' | 'pair';

export interface AlertData {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
}
