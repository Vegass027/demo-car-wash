import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ArrowLeft, Check, Building2, FileText, MapPin, CreditCard, User, Phone, Mail, Globe, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getCompanySettings } from '../../lib/api/companySettings';
import { createStaffCompanySettings, updateStaffCompanySettings } from '../../lib/api/staff-actions';
import type { CompanySettings, CompanySettingsInput } from '../../entities/companySettings/model';
import { normalizePhoneNumber } from '../../shared/utils/phone';

interface CompanySettingsWizardProps {
  onBack: () => void;
  userRole?: 'admin' | 'owner';
}

export const CompanySettingsWizard: React.FC<CompanySettingsWizardProps> = ({
  onBack,
  userRole = 'admin',
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [existingSettings, setExistingSettings] = useState<CompanySettings | null>(null);

  // Форма
  const [legalForm, setLegalForm] = useState<string>('ИП');
  const [fullLegalName, setFullLegalName] = useState('');
  const [shortName, setShortName] = useState('');
  const [inn, setInn] = useState('');
  const [kpp, setKpp] = useState('');
  const [ogrn, setOgrn] = useState('');
  const [legalAddress, setLegalAddress] = useState('');
  const [actualAddress, setActualAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bik, setBik] = useState('');
  const [correspondentAccount, setCorrespondentAccount] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [directorPosition, setDirectorPosition] = useState('Руководитель');
  const [accountantName, setAccountantName] = useState('');
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  // Ошибки валидации
  const [errors, setErrors] = useState<{
    inn?: string;
    kpp?: string;
    ogrn?: string;
    bik?: string;
  }>({});

  // Загрузка существующих данных
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const settings = await getCompanySettings();
        if (settings) {
          setExistingSettings(settings);
          // Заполняем форму существующими данными
          setLegalForm(settings.legal_form);
          setFullLegalName(settings.full_legal_name);
          setShortName(settings.short_name || '');
          setInn(settings.inn);
          setKpp(settings.kpp || '');
          setOgrn(settings.ogrn);
          setLegalAddress(settings.legal_address);
          setActualAddress(settings.actual_address || '');
          setBankName(settings.bank_name);
          setBik(settings.bik);
          setCorrespondentAccount(settings.correspondent_account);
          setPaymentAccount(settings.payment_account);
          setDirectorName(settings.director_name);
          setDirectorPosition(settings.director_position || 'Руководитель');
          setAccountantName(settings.accountant_name || '');
          setIsVatPayer(settings.is_vat_payer);
          setPhone(settings.phone || '');
          setEmail(settings.email || '');
          setWebsite(settings.website || '');
        }
      } catch (error) {
        console.error('[CompanySettingsWizard] Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Валидация ИНН (10 или 12 цифр)
  const validateInn = (value: string): boolean => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 12;
  };

  // Валидация КПП (9 цифр, опционально для ИП)
  const validateKpp = (value: string): boolean => {
    if (!value) return true; // Опционально
    const digits = value.replace(/\D/g, '');
    return digits.length === 9;
  };

  // Валидация ОГРН (13 или 15 цифр)
  const validateOgrn = (value: string): boolean => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 13 || digits.length === 15;
  };

  // Валидация БИК (9 цифр)
  const validateBik = (value: string): boolean => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 9;
  };

  // Обработчик сохранения
  const handleSave = async () => {
    // Проверка прав доступа (только владелец)
    if (userRole !== 'owner') {
      setSaveError('Только владелец может редактировать юридические данные');
      return;
    }

    // Валидация
    const newErrors: typeof errors = {};

    if (!validateInn(inn)) {
      newErrors.inn = 'ИНН должен содержать 10 или 12 цифр';
    }

    if (!validateKpp(kpp)) {
      newErrors.kpp = 'КПП должен содержать 9 цифр';
    }

    if (!validateOgrn(ogrn)) {
      newErrors.ogrn = 'ОГРН должен содержать 13 или 15 цифр';
    }

    if (!validateBik(bik)) {
      newErrors.bik = 'БИК должен содержать 9 цифр';
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
      const data: CompanySettingsInput = {
        legal_form: legalForm,
        full_legal_name: fullLegalName,
        short_name: shortName || undefined,
        inn,
        kpp: kpp || undefined,
        ogrn,
        legal_address: legalAddress,
        actual_address: actualAddress || undefined,
        bank_name: bankName,
        bik,
        correspondent_account: correspondentAccount,
        payment_account: paymentAccount,
        director_name: directorName,
        director_position: directorPosition || undefined,
        accountant_name: accountantName || undefined,
        is_vat_payer: isVatPayer,
        phone: phone ? normalizePhoneNumber(phone) : undefined,
        email: email || undefined,
        website: website || undefined,
      };

      if (existingSettings) {
        // Обновляем существующую запись
        await updateStaffCompanySettings({
          settings_id: existingSettings.id,
          ...data,
        });
      } else {
        // Создаем новую запись
        await createStaffCompanySettings(data);
      }

      setSaveSuccess(true);

      // Возвращаемся в аналитику через 1.5 секунды
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (error) {
      console.error('[CompanySettingsWizard] Error saving settings:', error);
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
          <h2 className="font-bold text-lg">Юридические данные</h2>
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

        {/* Основная информация */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Основная информация</h3>
          </div>

          <div className="space-y-2">
            <Label>Организационно-правовая форма</Label>
            <Select value={legalForm} onValueChange={setLegalForm}>
              <SelectTrigger className="w-full h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ИП">ИП</SelectItem>
                <SelectItem value="ООО">ООО</SelectItem>
                <SelectItem value="АО">АО</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Полное наименование</Label>
            <Input
              value={fullLegalName}
              onChange={(e) => setFullLegalName(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Краткое наименование</Label>
            <Input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              className="h-12"
            />
          </div>
        </div>

        {/* Разделитель */}
        <div className="h-px bg-gray-200 w-full"></div>

        {/* Налоговые реквизиты */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Налоговые реквизиты</h3>
          </div>

          <div className="space-y-2">
            <Label>ИНН</Label>
            <Input
              value={inn}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setInn(digits);
                if (errors.inn && validateInn(digits)) {
                  setErrors(prev => ({ ...prev, inn: undefined }));
                }
              }}
              className={cn("h-12", errors.inn ? "border-red-500" : "")}
            />
            {errors.inn && (
              <p className="text-sm text-red-500">{errors.inn}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>КПП {legalForm === 'ИП' && <span className="text-gray-400 text-xs">(у ИП не заполняется)</span>}</Label>
            <Input
              value={kpp}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setKpp(digits);
                if (errors.kpp && validateKpp(digits)) {
                  setErrors(prev => ({ ...prev, kpp: undefined }));
                }
              }}
              disabled={legalForm === 'ИП'}
              className={cn("h-12", errors.kpp ? "border-red-500" : "")}
            />
            {errors.kpp && (
              <p className="text-sm text-red-500">{errors.kpp}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>ОГРН/ОГРНИП</Label>
            <Input
              value={ogrn}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setOgrn(digits);
                if (errors.ogrn && validateOgrn(digits)) {
                  setErrors(prev => ({ ...prev, ogrn: undefined }));
                }
              }}
              className={cn("h-12", errors.ogrn ? "border-red-500" : "")}
            />
            {errors.ogrn && (
              <p className="text-sm text-red-500">{errors.ogrn}</p>
            )}
          </div>
        </div>

        {/* Разделитель */}
        <div className="h-px bg-gray-200 w-full"></div>

        {/* Адреса */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Адреса</h3>
          </div>

          <div className="space-y-2">
            <Label>Юридический адрес</Label>
            <Input
              value={legalAddress}
              onChange={(e) => setLegalAddress(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Фактический адрес</Label>
            <Input
              value={actualAddress}
              onChange={(e) => setActualAddress(e.target.value)}
              className="h-12"
            />
          </div>
        </div>

        {/* Разделитель */}
        <div className="h-px bg-gray-200 w-full"></div>

        {/* Банковские реквизиты */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Банковские реквизиты</h3>
          </div>

          <div className="space-y-2">
            <Label>Название банка</Label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>БИК</Label>
            <Input
              value={bik}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setBik(digits);
                if (errors.bik && validateBik(digits)) {
                  setErrors(prev => ({ ...prev, bik: undefined }));
                }
              }}
              className={cn("h-12", errors.bik ? "border-red-500" : "")}
            />
            {errors.bik && (
              <p className="text-sm text-red-500">{errors.bik}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Корреспондентский счет (к/сч)</Label>
            <Input
              value={correspondentAccount}
              onChange={(e) => setCorrespondentAccount(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Расчетный счет (р/сч)</Label>
            <Input
              value={paymentAccount}
              onChange={(e) => setPaymentAccount(e.target.value)}
              className="h-12"
            />
          </div>
        </div>

        {/* Разделитель */}
        <div className="h-px bg-gray-200 w-full"></div>

        {/* Руководитель и бухгалтер */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Руководитель и бухгалтер</h3>
          </div>

          <div className="space-y-2">
            <Label>ФИО руководителя</Label>
            <Input
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Должность руководителя</Label>
            <Input
              value={directorPosition}
              onChange={(e) => setDirectorPosition(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>ФИО бухгалтера</Label>
            <Input
              value={accountantName}
              onChange={(e) => setAccountantName(e.target.value)}
              className="h-12"
            />
          </div>
        </div>

        {/* Разделитель */}
        <div className="h-px bg-gray-200 w-full"></div>

        {/* НДС */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">НДС</h3>
          </div>

          <div className="flex items-center gap-3 p-4 border rounded-lg">
            <Checkbox
              id="vat-payer"
              checked={isVatPayer}
              onCheckedChange={(checked) => setIsVatPayer(checked as boolean)}
            />
            <label
              htmlFor="vat-payer"
              className="text-sm font-medium cursor-pointer"
            >
              Плательщик НДС
            </label>
          </div>
          <p className="text-xs text-gray-500">
            {isVatPayer ? 'Документы будут с НДС' : 'Документы с пометкой "без НДС"'}
          </p>
        </div>

        {/* Разделитель */}
        <div className="h-px bg-gray-200 w-full"></div>

        {/* Контакты */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Контакты (опционально)</h3>
          </div>

          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Сайт</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="h-12"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t">
        <Button
          size="lg"
          className="w-full h-14 text-lg"
          onClick={handleSave}
          disabled={saving || saveSuccess}
        >
          {saving ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Сохранение...</span>
            </div>
          ) : saveSuccess ? (
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>Сохранено!</span>
            </div>
          ) : (
            'Сохранить'
          )}
        </Button>
      </div>
    </div>
  );
};
