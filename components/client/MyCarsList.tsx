import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Car, Trash2, Building2 } from 'lucide-react';
import { CombinedCar } from '../../lib/api/combined-cars';

// Маппинг классов авто на русский язык
const CAR_TYPE_LABELS: Record<string, string> = {
  'SEDAN': 'Седан',
  'CROSSOVER': 'Кроссовер',
  'JEEP': 'Джип',
  'LARGE_SUV': 'Большой джип',
  'MINIVAN': 'Минивэн',
};

interface MyCarsListProps {
  cars: CombinedCar[];
  onAddCar: () => void;
  onDeleteCar?: (carId: string, type: 'personal' | 'organization') => void;
}

export const MyCarsList: React.FC<MyCarsListProps> = ({ cars, onAddCar, onDeleteCar }) => {
  const personalCars = cars.filter(c => c.type === 'personal');
  const organizationCars = cars.filter(c => c.type === 'organization');

  return (
    <div className="space-y-6">
      {/* Личные машины */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Badge className="bg-gray-800 border-2 border-black px-4 py-2 text-lg font-bold flex items-center gap-2">
            <Car className="w-5 h-5" />
            Мои машины
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddCar}
            className="flex items-center gap-2"
          >
            <Car className="w-4 h-4" />
            Добавить
          </Button>
        </div>

        {personalCars.length > 0 ? (
          <div className="space-y-2">
            {personalCars.map((car) => (
              <Card key={car.id} className="border hover:border-primary transition-colors">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="font-bold">{car.car_model} <span className="font-normal text-gray-500">| {CAR_TYPE_LABELS[car.car_type] || car.car_type}</span></div>
                      <div className="text-sm text-gray-500">{car.plate_number}</div>
                    </div>
                    {onDeleteCar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteCar(car.id, 'personal')}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-gray-50">
            <CardContent className="p-6 text-center">
              <Car className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <div className="text-gray-500 mb-3">У вас пока нет добавленных машин</div>
              <Button
                variant="outline"
                onClick={onAddCar}
                className="flex items-center gap-2 mx-auto"
              >
                <Car className="w-4 h-4" />
                Добавить машину
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Организационные машины */}
      {organizationCars.length > 0 && (
        <div>
          <Badge className="bg-gray-800 border-2 border-black px-4 py-2 text-lg font-bold mb-3 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Машины организаций
          </Badge>
          <div className="space-y-2">
            {organizationCars.map((car) => (
              <Card key={car.id} className="border">
                <CardContent className="p-4">
                  <div className="flex-1">
                    <div className="font-bold">{car.car_model} <span className="font-normal text-gray-500">| {CAR_TYPE_LABELS[car.car_type] || car.car_type}</span></div>
                    <div className="text-sm text-gray-500">{car.plate_number} | {car.organization_name}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
