/**
 * Утилита для генерации UUID v4
 * Использует crypto.randomUUID() если доступно, иначе генерирует UUID вручную
 */

export function generateUUID(): string {
  // crypto.randomUUID() доступен в современных браузерах и Node.js
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback для старых браузеров
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
