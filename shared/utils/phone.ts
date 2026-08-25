/**
 * Нормализация номера телефона
 * Удаляет все нецифровые символы и приводит к формату +7XXXXXXXXXX
 *
 * Примеры:
 * - "+79930838101" → "+79930838101"
 * - "+7 (993) 083-81-01" → "+79930838101"
 * - "89930838101" → "+79930838101"
 * - "9930838101" → "+79930838101"
 *
 * @param phone - Номер телефона в любом формате
 * @returns Нормализованный номер (+7XXXXXXXXXX)
 */
export function normalizePhoneNumber(phone: string): string {
  // Удаляем все нецифровые символы
  const digits = phone.replace(/\D/g, '')

  // Если номер начинается с 8, заменяем на 7
  if (digits.startsWith('8')) {
    return '+7' + digits.slice(1)
  }

  // Если номер начинается с 7, добавляем +
  if (digits.startsWith('7')) {
    return '+' + digits
  }

  // Если номер 10 цифр (без кода страны), добавляем +7
  if (digits.length === 10) {
    return '+7' + digits
  }

  // Иначе возвращаем как есть
  return digits
}

/**
 * Форматирование номера телефона для отображения
 * Превращает "79930838101" в "+7 (993) 083-81-01"
 * 
 * @param phone - Нормализованный номер (только цифры)
 * @returns Форматированный номер для отображения
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  
  if (digits.length === 11) {
    return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  
  return phone
}
