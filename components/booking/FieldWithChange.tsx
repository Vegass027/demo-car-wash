import React from 'react';
import { cn } from '../../lib/utils';

export interface FieldWithChangeProps {
  label: string;
  originalValue?: string;
  currentValue?: string;
  isChanged?: boolean;
  className?: string;
}

export function FieldWithChange({ 
  label, 
  originalValue, 
  currentValue, 
  isChanged,
  className 
}: FieldWithChangeProps) {
  return (
    <div className={cn("pt-2", className)}>
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="font-medium">
        {isChanged ? (
          <span className="text-blue-600">
            {originalValue || 'Не указано'} → {currentValue || 'Не указано'}
          </span>
        ) : (
          currentValue || 'Не указано'
        )}
      </div>
    </div>
  );
}
