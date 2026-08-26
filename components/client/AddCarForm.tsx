import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CarType } from '../../types';
import { getSessionToken } from '../../lib/supabase';

interface AddCarFormProps {
  clientId: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
//
// switch from lib/api/clients.ts:createClientCar (anon INSERT on client_cars)
// to POST /api/client-create-car. Server resolves client.id from JWT — this
// component no longer passes nor knows client_id. Authoritative ownership
// gate is on the server side.

export const AddCarForm: React.FC<AddCarFormProps> = ({ onSuccess, onCancel }) => {
  const [carModel, setCarModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [carType, setCarType] = useState<CarType>(CarType.SEDAN);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same regex as api/_lib/validation.ts PLATE_RE — keep client-side check
  // for instant UX feedback; server is authoritative.
  const plateRegex = /^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}$/i;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!carModel.trim() || !plateNumber.trim()) {
      setError('Заполните все поля');
      return;
    }

    if (!plateRegex.test(plateNumber.trim())) {
      setError('Неверный формат номера. Используйте формат: А555АА');
      return;
    }

    const token = getSessionToken();
    if (!token) {
      setError('Сессия не активна. Перезагрузите Mini App.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/client-create-car', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          car_model: carModel.trim(),
          plate_number: plateNumber.trim().toUpperCase(),
          car_type: carType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.error || `HTTP ${res.status}`;
        let friendly = 'Не удалось добавить машину';
        if (code === 'car_model_required') friendly = 'Укажите марку машины.';
        else if (code === 'plate_number_bad_format') friendly = 'Неверный формат гос. номера.';
        else if (code === 'plate_number_required') friendly = 'Укажите гос. номер.';
        else if (code === 'car_type_invalid') friendly = 'Неверный тип автомобиля.';
        throw new Error(friendly);
      }

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

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

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
