/**
 * Утилита для расчета статистики товара на складе
 */

import React from 'react';
import { ShieldAlert, Siren } from 'lucide-react';
import { InventoryStats } from '@/entities/inventory/model';

export function calculateInventoryStats(
  current: number,
  base: number
): InventoryStats {
  // Защита от деления на ноль
  if (base === 0) {
    return {
      percentage: 0,
      status: 'critical',
      displayText: `${current}/0`,
    };
  }

  // Рассчитываем процент от базового значения
  const percentage = Math.round((current / base) * 100);
  
  // Проверка: процент не должен превышать 100%
  const clampedPercentage = Math.min(percentage, 100);

  let status: InventoryStats['status'];
  if (clampedPercentage >= 70) {
    status = 'good';
  } else if (clampedPercentage >= 40) {
    status = 'normal';
  } else if (clampedPercentage >= 15) {
    status = 'low';
  } else {
    status = 'critical';
  }

  return {
    percentage: clampedPercentage,
    status,
    displayText: `${current}/${base}`,
  };
}

export function getStatusIndicator(status: InventoryStats['status']): React.ReactNode {
  switch (status) {
    case 'good':
      return null;
    case 'normal':
      return null;
    case 'low':
      return <ShieldAlert className="w-5 h-5 text-yellow-500" />;
    case 'critical':
      return <Siren className="w-5 h-5 text-red-500" />;
  }
}
