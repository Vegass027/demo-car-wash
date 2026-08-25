/**
 * Универсальный обработчик валидации полей
 */
export interface FieldValidatorConfig {
  value: string;
  validator?: (value: string) => boolean;
  errorMessage: string;
  skipIfEmpty?: boolean;
}

export function createFieldValidator(
  fieldName: string,
  errorMessage: string,
  validator?: (value: string) => boolean,
  skipIfEmpty: boolean = false
) {
  return (value: string) => {
    if (skipIfEmpty && (!value || value.trim() === '')) {
      return;
    }
    if (value && value.trim() !== '' && validator && !validator(value)) {
      return { [fieldName]: errorMessage };
    }
    if (!value || value.trim() === '') {
      return { [fieldName]: errorMessage };
    }
  };
}

/**
 * Валидаторы для конкретных полей
 */
export const validatePhone = (value: string): boolean => {
  const phoneRegex = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;
  return phoneRegex.test(value);
};

export const validateCarNumber = (value: string): boolean => {
  const carNumberRegex = /^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}$/;
  return carNumberRegex.test(value);
};
