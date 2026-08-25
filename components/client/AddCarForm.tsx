import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CarType } from '../../types';
import { createClientCar } from '../../lib/api/clients';

interface AddCarFormProps {
  clientId: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AddCarForm: React.FC<AddCarFormProps> = ({ clientId, onSuccess, onCancel }) => {
  const [carModel, setCarModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [carType, setCarType] = useState<CarType>(CarType.SEDAN);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId) {
      setError('Не удалось определить клиента');
      return;
    }

    if (!carModel.trim() || !plateNumber.trim()) {
      setError('Заполните все поля');
      return;
    }

    // Валидация формата гос номера: А555АА (1 буква, 3 цифры, 2 буквы)
    const plateRegex = /^[А-Яа-яA-Za-z]\d{3}[А-Яа-яA-Za-z]{2}$/;
    if (!plateRegex.test(plateNumber.trim())) {
      setError('Неверный формат номера. Используйте формат: А555АА');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createClientCar({
        client_id: clientId,
        car_model: carModel.trim(),
        plate_number: plateNumber.trim().toUpperCase(),
        car_type: carType
      });

      // Сбрасываем форму
      setCarModel('');
      setPlateNumber('');
      setCarType(CarType.SEDAN);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Не удалось добавить машину');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-primary bg-blue-50/50">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="text-lg font-bold">Добавить машину</h3>

          {/* Марка авто */}
          <div className="space-y-2">
            <Label htmlFor="car-model">Марка и модель</Label>
            <Input
              id="car-model"
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder="Например: Toyota Camry"
              disabled={isLoading}
            />
          </div>

          {/* Гос. номер */}
          <div className="space-y-2">
            <Label htmlFor="plate-number">Гос. номер</Label>
            <Input
              id="plate-number"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
              placeholder="Формат: Е777КХ"
              disabled={isLoading}
              maxLength={6}
            />
          </div>

          {/* Тип авто */}
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
                  onClick={() => setCarType(type.id)}
                  className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                    carType === type.id
                      ? 'border-primary bg-blue-50'
                      : 'border hover:border-primary hover:bg-blue-50'
                  }`}
                  disabled={isLoading}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ошибка */}
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Кнопки */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
