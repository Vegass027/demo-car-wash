/**
 * Анимированный прогресс-бар с эффектом воды и пузырьками
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface AnimatedProgressProps {
  value: number;
  showPercentage?: boolean;
  className?: string;
}

export const AnimatedProgress: React.FC<AnimatedProgressProps> = ({
  value,
  showPercentage = false,
  className,
}) => {
  return (
    <div className={cn('relative h-20 w-full overflow-hidden rounded-lg bg-gray-200 border-2 border-gray-500', className)}>
      {/* Базовый слой с бирюзовым цветом воды - заполняется снизу вверх */}
      <div
        className="absolute bottom-0 left-0 w-full transition-all duration-500 ease-out bg-teal-400/30"
        style={{ height: `${value}%` }}
      >
        {/* Пузырьки */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="bubble bubble-1" />
          <div className="bubble bubble-2" />
          <div className="bubble bubble-3" />
          <div className="bubble bubble-4" />
          <div className="bubble bubble-5" />
        </div>

        {/* Проценты */}
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-black">
            {value}%
          </div>
        )}
      </div>
    </div>
  );
};
