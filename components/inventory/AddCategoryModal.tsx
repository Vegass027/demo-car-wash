/**
 * Модальное окно для добавления категории расходных материалов
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InventoryCategory, InventoryUnit } from '@/entities/inventory/model';
import { getUnitDeclension } from '@/shared/utils/unitDeclension';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (category: Omit<InventoryCategory, 'id' | 'created_at' | 'updated_at' | 'is_active'>) => void;
}

const UNIT_LABELS: Record<InventoryUnit, string> = {
  штуки: 'Штуки',
  литры: 'Литры',
  канистры: 'Канистры',
  граммы: 'Граммы',
  килограммы: 'Килограммы',
};

const UNIT_EXAMPLES: Record<InventoryUnit, string> = {
  штуки: 'штука',
  литры: 'литр',
  канистры: 'канистра',
  граммы: 'грамм',
  килограммы: 'килограмм',
};

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('штуки');

  const handleSubmit = () => {
    if (!name.trim()) return;

    onAdd({
      name: name.trim(),
      unit,
    });

    // Сброс формы
    setName('');
    setUnit('штуки');
    onClose();
  };

  const handleClose = () => {
    // Сброс формы при закрытии
    setName('');
    setUnit('штуки');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить категорию</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Название категории */}
          <div>
            <Label htmlFor="category-name" className="text-sm font-medium">
              Название категории <span className="text-red-500">*</span>
            </Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Шампуни"
              className="mt-1"
            />
          </div>

          {/* Единица измерения */}
          <div>
            <Label htmlFor="category-unit" className="text-sm font-medium">
              Единица измерения <span className="text-red-500">*</span>
            </Label>
            <Select value={unit} onValueChange={(value) => setUnit(value as InventoryUnit)}>
              <SelectTrigger id="category-unit" className="mt-1">
                <SelectValue placeholder="Выберите единицу измерения" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label} ({UNIT_EXAMPLES[value as InventoryUnit]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Кнопки */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="flex-1"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
