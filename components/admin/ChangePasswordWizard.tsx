import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ArrowLeft, Check, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';

interface ChangePasswordWizardProps {
  onBack: () => void;
  userId: string; // ID текущего пользователя (владельца)
}

// Переиспользуемый компонент формы смены пароля
interface PasswordChangeFormProps {
  userId: string;
  login?: string;
}

const PasswordChangeForm: React.FC<PasswordChangeFormProps> = ({
  userId,
  login,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    oldPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!oldPassword) {
      newErrors.oldPassword = 'Введите старый пароль';
    }

    if (!newPassword) {
      newErrors.newPassword = 'Введите новый пароль';
    } else if (newPassword.length < 6) {
      newErrors.newPassword = 'Пароль должен быть минимум 6 символов';
    }

    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Пароли не совпадают';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const { data, error } = await supabase.rpc('change_password', {
        p_user_id: userId,
        p_old_password: oldPassword,
        p_new_password: newPassword,
      });

      if (error) {
        console.error('[PasswordChangeForm] Error:', error);
        setSaveError('Ошибка при смене пароля');
        setSaving(false);
        return;
      }

      if (data === false) {
        setSaveError('Неверный старый пароль');
        setSaving(false);
        return;
      }

      setSaveSuccess(true);
      // Очищаем форму
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Скрываем сообщение об успехе через 2 секунды
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('[PasswordChangeForm] Error:', error);
      setSaveError('Неожиданная ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Логин */}
      {login && (
        <p className="text-xs text-gray-500">
          Логин: <span className="font-mono font-medium">{login}</span>
        </p>
      )}

      {/* Сообщение об успехе */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span className="font-medium">Пароль изменён!</span>
          </div>
        </div>
      )}

      {/* Сообщение об ошибке */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{saveError}</span>
          </div>
        </div>
      )}

      {/* Старый пароль */}
      <div className="space-y-2">
        <Label className="text-sm">Старый пароль</Label>
        <div className="relative">
          <Input
            type={showOldPassword ? 'text' : 'password'}
            value={oldPassword}
            onChange={(e) => {
              setOldPassword(e.target.value);
              if (errors.oldPassword) {
                setErrors(prev => ({ ...prev, oldPassword: undefined }));
              }
            }}
            className={cn("h-10 pr-10", errors.oldPassword ? "border-red-500" : "")}
          />
          <button
            type="button"
            onClick={() => setShowOldPassword(!showOldPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {showOldPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {errors.oldPassword && (
          <p className="text-xs text-red-500">{errors.oldPassword}</p>
        )}
      </div>

      {/* Новый пароль */}
      <div className="space-y-2">
        <Label className="text-sm">Новый пароль</Label>
        <div className="relative">
          <Input
            type={showNewPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (errors.newPassword) {
                setErrors(prev => ({ ...prev, newPassword: undefined }));
              }
            }}
            className={cn("h-10 pr-10", errors.newPassword ? "border-red-500" : "")}
          />
          <button
            type="button"
            onClick={() => setShowNewPassword(!showNewPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {showNewPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {errors.newPassword && (
          <p className="text-xs text-red-500">{errors.newPassword}</p>
        )}
      </div>

      {/* Подтверждение пароля */}
      <div className="space-y-2">
        <Label className="text-sm">Подтвердите пароль</Label>
        <div className="relative">
          <Input
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) {
                setErrors(prev => ({ ...prev, confirmPassword: undefined }));
              }
            }}
            className={cn("h-10 pr-10", errors.confirmPassword ? "border-red-500" : "")}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {showConfirmPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-red-500">{errors.confirmPassword}</p>
        )}
      </div>

      {/* Кнопка сохранения */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-10 text-sm bg-black text-white hover:bg-gray-800"
      >
        {saving ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Сохранение...</span>
          </div>
        ) : (
          'Сохранить'
        )}
      </Button>
    </div>
  );
};

export const ChangePasswordWizard: React.FC<ChangePasswordWizardProps> = ({
  onBack,
  userId,
}) => {
  const [loading, setLoading] = useState(true);
  const [ownerData, setOwnerData] = useState<{ id: string; login: string } | null>(null);
  const [adminData, setAdminData] = useState<{ id: string; login: string } | null>(null);

  // Загружаем данные владельца и админа при монтировании
  useEffect(() => {
    const loadData = async () => {
      try {
        // Загружаем владельца (браузерный логин)
        const { data: owner, error: ownerError } = await supabase
          .from('profiles')
          .select('id, login')
          .eq('id', userId)
          .single();

        if (!ownerError && owner) {
          setOwnerData(owner);
        }

        // Загружаем админа (браузерный логин) - ищем по role и наличию login
        const { data: admin, error: adminError } = await supabase
          .from('profiles')
          .select('id, login')
          .eq('role', 'admin')
          .not('login', 'is', null)
          .limit(1)
          .single();

        if (!adminError && admin) {
          setAdminData(admin);
        }
      } catch (error) {
        console.error('[ChangePasswordWizard] Error loading users:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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
          <h2 className="font-bold text-lg">Смена пароля</h2>
          <p className="text-sm text-gray-500">Управление паролями для входа</p>
        </div>
      </div>

      {/* Accordion с формами */}
      <div className="flex-1 overflow-y-auto px-1">
        <Accordion type="single" collapsible className="w-full">
          {/* Владелец */}
          {ownerData && (
            <AccordionItem value="owner" className="border border-purple-200 rounded-lg mb-3 overflow-hidden">
              <AccordionTrigger className="text-base font-medium bg-purple-50 px-4 hover:no-underline hover:bg-purple-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Владелец
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <PasswordChangeForm
                  userId={ownerData.id}
                  login={ownerData.login || undefined}
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Админ */}
          {adminData && (
            <AccordionItem value="admin" className="border border-blue-200 rounded-lg overflow-hidden">
              <AccordionTrigger className="text-base font-medium bg-blue-50 px-4 hover:no-underline hover:bg-blue-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Админ
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <PasswordChangeForm
                  userId={adminData.id}
                  login={adminData.login || undefined}
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  );
};
