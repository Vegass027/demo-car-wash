/**
 * Жидкий прогресс-бар с SVG волнами и анимированными пузырьками
 * Использует SVG-трансформацию для создания реалистичного эффекта воды
 */

import React, { useId, useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface LiquidProgressBarProps {
  value: number;
  showPercentage?: boolean;
  className?: string;
  color?: 'teal' | 'blue' | 'purple' | 'green';
}

const colorConfig = {
  teal: {
    primary: '#1abc9c',
    secondary: '#16a085',
    tertiary: '#0e6655',
    bubble: 'rgba(255, 255, 255, 0.6)',
  },
  blue: {
    primary: '#60a5fa',
    secondary: '#3b82f6',
    tertiary: '#2563eb',
    bubble: 'rgba(255, 255, 255, 0.6)',
  },
  purple: {
    primary: '#a78bfa',
    secondary: '#8b5cf6',
    tertiary: '#7c3aed',
    bubble: 'rgba(255, 255, 255, 0.6)',
  },
  green: {
    primary: '#4ade80',
    secondary: '#22c55e',
    tertiary: '#16a34a',
    bubble: 'rgba(255, 255, 255, 0.6)',
  },
};

export const LiquidProgressBar: React.FC<LiquidProgressBarProps> = ({
  value,
  showPercentage = false,
  className,
  color = 'teal',
}) => {
  const colors = colorConfig[color];
  // Генерируем уникальный ID для градиента
  const uniqueId = useId();
  const gradientId = `liquid-gradient-${uniqueId}`;

  // Состояние для анимированного значения
  const [animatedValue, setAnimatedValue] = useState(value);
  const animationRef = useRef<number | null>(null);
  const prevValueRef = useRef(value);

  // Анимация изменения значения
  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    const duration = 500; // 500ms анимация
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing функция для плавности
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      const newValue = startValue + (endValue - startValue) * easeOutCubic;
      setAnimatedValue(newValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = endValue;
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value]);

  // Считаем, насколько опустить волну вниз
  // При 100% -> y=0 (верх)
  // При 0% -> y=80 (низ)
  const translateY = 80 - (animatedValue / 100) * 80;

  return (
    <div className={cn('relative h-20 w-full overflow-hidden rounded-lg bg-gray-200 border-2 border-gray-500', className)}>
      <svg
        className="absolute bottom-0 left-0 w-full h-full"
        viewBox="0 0 400 80"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={colors.primary} stopOpacity="1" />
            <stop offset="100%" stopColor={colors.tertiary} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Группа с трансформацией (двигает волну вниз) */}
        <g transform={`translate(0, ${translateY})`}>
          
          <path
            fill={`url(#${gradientId})`}
            // Рисуем волну сверху, а потом длинный "хвост" вниз на 400px, 
            // чтобы при поднятии волны снизу не было дырки
            d="M0,0 Q50,-5 100,0 T200,0 T300,0 T400,0 V400 H0 Z"
          >
            <animate
              attributeName="d"
              dur="2s"
              repeatCount="indefinite"
              values="
                M0,0 Q50,-5 100,0 T200,0 T300,0 T400,0 V400 H0 Z;
                M0,0 Q50,5 100,0 T200,0 T300,0 T400,0 V400 H0 Z;
                M0,0 Q50,-5 100,0 T200,0 T300,0 T400,0 V400 H0 Z"
            />
          </path>
        </g>
      </svg>

      {/* Проценты */}
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-black z-10">
          {Math.round(animatedValue)}%
        </div>
      )}
    </div>
  );
};
