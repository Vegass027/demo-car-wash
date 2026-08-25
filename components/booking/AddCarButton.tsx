import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AddCarButtonProps {
  onClick?: () => void;
  className?: string;
  label?: string;
}

export function AddCarButton({ onClick, className, label = 'Добавить машину' }: AddCarButtonProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "text-sm text-blue-600 cursor-pointer hover:text-blue-800 flex items-center gap-1 ml-2",
        className
      )}
    >
      <Plus size={14} />
      {label}
    </div>
  );
}
