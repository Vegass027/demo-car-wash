/**
 * Утилита для правильного склонения единиц измерения в зависимости от числа
 */

/**
 * Получить правильную форму слова для единицы измерения
 * 
 * @param quantity - количество
 * @param unit - единица измерения (штуки, литры, канистры)
 * @returns правильная форма слова
 * 
 * @example
 * getUnitDeclension(1, 'литры') // 'литр'
 * getUnitDeclension(2, 'литры') // 'литра'
 * getUnitDeclension(5, 'литры') // 'литров'
 */
export function getUnitDeclension(quantity: number, unit: string): string {
  const absNumber = Math.abs(quantity);
  const lastTwoDigits = absNumber % 100;
  const lastDigit = absNumber % 10;

  const unitForms: Record<string, [string, string, string]> = {
    'штуки': ['штука', 'штуки', 'штук'],
    'литры': ['литр', 'литра', 'литров'],
    'канистры': ['канистра', 'канистры', 'канистр'],
    'граммы': ['грамм', 'грамма', 'граммов'],
    'килограммы': ['килограмм', 'килограмма', 'килограммов'],
    'штука': ['штука', 'штуки', 'штук'],
    'литр': ['литр', 'литра', 'литров'],
    'канистра': ['канистра', 'канистры', 'канистр'],
    'грамм': ['грамм', 'грамма', 'граммов'],
    'килограмм': ['килограмм', 'килограмма', 'килограммов'],
  };

  const forms = unitForms[unit];
  if (!forms) {
    return unit;
  }

  // Числа от 11 до 19 всегда используют третью форму
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return forms[2];
  }

  // Числа, заканчивающиеся на 1 (кроме 11)
  if (lastDigit === 1) {
    return forms[0];
  }

  // Числа, заканчивающиеся на 2, 3, 4 (кроме 12, 13, 14)
  if (lastDigit >= 2 && lastDigit <= 4) {
    return forms[1];
  }

  // Все остальные числа используют третью форму
  return forms[2];
}
