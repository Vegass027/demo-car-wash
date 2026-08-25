import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ArrowLeft, Check, AlertCircle, User, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getSalarySettings, updateSalarySettings } from '../../lib/api/salary';
import type { SalarySettings } from '../../lib/types/salary';

interface SalarySettingsWizardProps {
  onBack: () => void;
  userRole?: 'admin' | 'owner';
}

export const SalarySettingsWizard: React.FC<SalarySettingsWizardProps> = ({
  onBack,
  userRole = 'admin',
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [existingSettings, setExistingSettings] = useState<SalarySettings | null>(null);

  // Аккордеоны
  const [openSolo, setOpenSolo] = useState(false);
  const [openPair, setOpenPair] = useState(false);
  const [openTire, setOpenTire] = useState(false);

  // Форма
  const [adminFixedSalary, setAdminFixedSalary] = useState<number>(2000);
  const [workerSoloBase, setWorkerSoloBase] = useState<number>(500);
  const [workerSoloCommission, setWorkerSoloCommission] = useState<number>(40);
  const [workerPairBase, setWorkerPairBase] = useState<number>(250);
  const [workerPairCommission, setWorkerPairCommission] = useState<number>(20);
  const [tireWorkerCommission, setTireWorkerCommission] = useState<number>(50);
  const [tireWorkerStorageFee, setTireWorkerStorageFee] = useState<number>(300);

  // Ошибки валидации
  const [errors, setErrors] = useState<{
    adminFixedSalary?: string;
    workerSoloBase?: string;
    workerSoloCommission?: string;
    workerPairBase?: string;
    workerPairCommission?: string;
    tireWorkerCommission?: string;
    tireWorkerStorageFee?: string;
  }>({});

  // Загрузка существующих данных
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const settings = await getSalarySettings();
        if (settings) {
          setExistingSettings(settings);
          // Заполняем форму существующими данными
          setAdminFixedSalary(settings.admin_fixed_salary);
          setWorkerSoloBase(settings.worker_solo_base);
          setWorkerSoloCommission(settings.worker_solo_commission * 100); // Конвертируем 0.4 в 40
          setWorkerPairBase(settings.worker_pair_base);
          setWorkerPairCommission(settings.worker_pair_commission * 100); // Конвертируем 0.2 в 20
          setTireWorkerCommission(settings.tire_worker_commission * 100); // Конвертируем 0.5 в 50
          setTireWorkerStorageFee(settings.tire_worker_storage_fee);
        }
      } catch (error) {
        console.error('[SalarySettingsWizard] Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Обработчик сохранения
  const handleSave = async () => {
    // Проверка прав доступа (только владелец)
    if (userRole !== 'owner') {
      setSaveError('Только владелец может редактировать условия персонала');
      return;
    }

    // Валидация
    const newErrors: typeof errors = {};

    if (adminFixedSalary < 0 || adminFixedSalary > 50000) {
      newErrors.adminFixedSalary = 'Значение должно быть от 0 до 50000';
    }

    if (workerSoloBase < 0 || workerSoloBase > 10000) {
      newErrors.workerSoloBase = 'Значение должно быть от 0 до 10000';
    }

    if (workerSoloCommission < 0 || workerSoloCommission > 100) {
      newErrors.workerSoloCommission = 'Значение должно быть от 0 до 100';
    }

    if (workerPairBase < 0 || workerPairBase > 10000) {
      newErrors.workerPairBase = 'Значение должно быть от 0 до 10000';
    }

    if (workerPairCommission < 0 || workerPairCommission > 100) {
      newErrors.workerPairCommission = 'Значение должно быть от 0 до 100';
    }

    if (tireWorkerCommission < 0 || tireWorkerCommission > 100) {
      newErrors.tireWorkerCommission = 'Значение должно быть от 0 до 100';
    }

    if (tireWorkerStorageFee < 0 || tireWorkerStorageFee > 10000) {
      newErrors.tireWorkerStorageFee = 'Значение должно быть от 0 до 10000';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setSaveError('Пожалуйста, исправьте ошибки в форме');
      return;
    }

    // Сохранение
    setSaving(true);
    setSaveError(null);

    try {
      const updates = {
        admin_fixed_salary: adminFixedSalary,
        worker_solo_base: workerSoloBase,
        worker_solo_commission: workerSoloCommission / 100, // Конвертируем 40 в 0.4
        worker_pair_base: workerPairBase,
        worker_pair_commission: workerPairCommission / 100, // Конвертируем 20 в 0.2
        tire_worker_commission: tireWorkerCommission / 100, // Конвертируем 50 в 0.5
        tire_worker_storage_fee: tireWorkerStorageFee,
      };

      await updateSalarySettings(updates);

      setSaveSuccess(true);

      // Возвращаемся в аналитику через 1.5 секунды
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (error) {
      console.error('[SalarySettingsWizard] Error saving settings:', error);
      setSaveError('Ошибка при сохранении данных');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col pb-20 pt-safe telegram-safe-area-top">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h2 className="font-bold text-lg">Условия персонала</h2>
          <div className="text-xs text-gray-500">
            {existingSettings ? 'Редактирование' : 'Создание'}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-1 space-y-8">
        {/* Сообщение об успехе */}
        {saveSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span className="font-medium">Данные успешно сохранены!</span>
            </div>
          </div>
        )}

        {/* Сообщение об ошибке */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">{saveError}</span>
            </div>
          </div>
        )}

        {/* Админ */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Админ</h3>
          </div>

          <div className="space-y-2">
            <Label>Фиксированная зарплата (₽)</Label>
            <Input
              type="number"
              value={adminFixedSalary}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                setAdminFixedSalary(value);
                if (errors.adminFixedSalary && value >= 0 && value <= 50000) {
                  setErrors(prev => ({ ...prev, adminFixedSalary: undefined }));
                }
              }}
              className={cn("h-12", errors.adminFixedSalary ? "border-red-500" : "")}
            />
            {errors.adminFixedSalary && (
              <p className="text-sm text-red-500">{errors.adminFixedSalary}</p>
            )}
          </div>
        </div>

        {/* Мойщик СОЛО */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div
            onClick={() => setOpenSolo(!openSolo)}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-900">Мойщик СОЛО</span>
            </div>
            <div className="text-gray-400">
              {openSolo ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openSolo && (
            <>
              <div className="border-t border-gray-200"></div>
              <div className="px-4 py-4 bg-gray-50 space-y-4">
                <div className="space-y-2">
                  <Label>Базовая ставка (₽)</Label>
                  <Input
                    type="number"
                    value={workerSoloBase}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setWorkerSoloBase(value);
                      if (errors.workerSoloBase && value >= 0 && value <= 10000) {
                        setErrors(prev => ({ ...prev, workerSoloBase: undefined }));
                      }
                    }}
                    className={cn("h-12", errors.workerSoloBase ? "border-red-500" : "")}
                  />
                  {errors.workerSoloBase && (
                    <p className="text-sm text-red-500">{errors.workerSoloBase}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Процент от чека (%)</Label>
                  <Input
                    type="number"
                    value={workerSoloCommission}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setWorkerSoloCommission(value);
                      if (errors.workerSoloCommission && value >= 0 && value <= 100) {
                        setErrors(prev => ({ ...prev, workerSoloCommission: undefined }));
                      }
                    }}
                    className={cn("h-12", errors.workerSoloCommission ? "border-red-500" : "")}
                  />
                  {errors.workerSoloCommission && (
                    <p className="text-sm text-red-500">{errors.workerSoloCommission}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Мойщик ПАРА */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div
            onClick={() => setOpenPair(!openPair)}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-900">Мойщик ПАРА</span>
            </div>
            <div className="text-gray-400">
              {openPair ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openPair && (
            <>
              <div className="border-t border-gray-200"></div>
              <div className="px-4 py-4 bg-gray-50 space-y-4">
                <div className="space-y-2">
                  <Label>Базовая ставка (₽)</Label>
                  <Input
                    type="number"
                    value={workerPairBase}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setWorkerPairBase(value);
                      if (errors.workerPairBase && value >= 0 && value <= 10000) {
                        setErrors(prev => ({ ...prev, workerPairBase: undefined }));
                      }
                    }}
                    className={cn("h-12", errors.workerPairBase ? "border-red-500" : "")}
                  />
                  {errors.workerPairBase && (
                    <p className="text-sm text-red-500">{errors.workerPairBase}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Процент от чека (%)</Label>
                  <Input
                    type="number"
                    value={workerPairCommission}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setWorkerPairCommission(value);
                      if (errors.workerPairCommission && value >= 0 && value <= 100) {
                        setErrors(prev => ({ ...prev, workerPairCommission: undefined }));
                      }
                    }}
                    className={cn("h-12", errors.workerPairCommission ? "border-red-500" : "")}
                  />
                  {errors.workerPairCommission && (
                    <p className="text-sm text-red-500">{errors.workerPairCommission}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Шиномонтажник */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div
            onClick={() => setOpenTire(!openTire)}
            onPointerDown={(e) => e.preventDefault()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <Wrench className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-900">Шиномонтажник</span>
            </div>
            <div className="text-gray-400">
              {openTire ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>

          {openTire && (
            <>
              <div className="border-t border-gray-200"></div>
              <div className="px-4 py-4 bg-gray-50 space-y-4">
                <div className="space-y-2">
                  <Label>Процент от чека (%)</Label>
                  <Input
                    type="number"
                    value={tireWorkerCommission}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setTireWorkerCommission(value);
                      if (errors.tireWorkerCommission && value >= 0 && value <= 100) {
                        setErrors(prev => ({ ...prev, tireWorkerCommission: undefined }));
                      }
                    }}
                    className={cn("h-12", errors.tireWorkerCommission ? "border-red-500" : "")}
                  />
                  {errors.tireWorkerCommission && (
                    <p className="text-sm text-red-500">{errors.tireWorkerCommission}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Плата за хранение (₽)</Label>
                  <Input
                    type="number"
                    value={tireWorkerStorageFee}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setTireWorkerStorageFee(value);
                      if (errors.tireWorkerStorageFee && value >= 0 && value <= 10000) {
                        setErrors(prev => ({ ...prev, tireWorkerStorageFee: undefined }));
                      }
                    }}
                    className={cn("h-12", errors.tireWorkerStorageFee ? "border-red-500" : "")}
                  />
                  {errors.tireWorkerStorageFee && (
                    <p className="text-sm text-red-500">{errors.tireWorkerStorageFee}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Кнопка сохранения */}
      <div className="px-1 pb-4 pt-4 border-t border-gray-200">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 text-base bg-black text-white hover:bg-gray-800"
        >
          {saving ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Сохранение...</span>
            </div>
          ) : (
            'Сохранить'
          )}
        </Button>
      </div>
    </div>
  );
};
