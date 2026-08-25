import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CarData {
  id: string;
  car_model: string;
  plate_number: string;
}

export interface CarCardProps {
  car: CarData;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const CarCard: React.FC<CarCardProps> = ({ car, selected, onClick, className }) => {
  return (
    <Card
      className={cn(
        "border-2 border-gray-200 cursor-pointer hover:border-primary hover:bg-blue-50 transition-colors",
        selected && "border-primary bg-blue-50",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="font-medium">{car.car_model}</div>
          <span className="text-gray-400">|</span>
          <div className="text-sm text-gray-600">{car.plate_number}</div>
        </div>
        {selected && (
          <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shrink-0">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
