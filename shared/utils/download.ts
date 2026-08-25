/**
 * Утилиты для скачивания файлов в Telegram Mini App
 */

/**
 * Скачивание PDF файла в Telegram Mini App без открытия превью
 * Использует navigator.share (Web Share API) для iOS Safari webview
 * Это нативная модалка iOS "Поделиться/Сохранить"
 *
 * @param pdfBlob - Blob с PDF данными
 * @param fileName - Имя файла для скачивания
 */
export async function downloadPdfInTelegram(pdfBlob: Blob, fileName: string): Promise<void> {
  try {
    console.log('[downloadPdfInTelegram] Начало, размер blob:', pdfBlob.size);

    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      console.log('[downloadPdfInTelegram] Используем navigator.share');
      await navigator.share({
        files: [file],
      });
      console.log('[downloadPdfInTelegram] share завершён');
    } else {
      // Fallback: blob URL + click
      console.log('[downloadPdfInTelegram] navigator.share недоступен, fallback');
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (err) {
    console.error('[downloadPdfInTelegram] ERROR:', err);
  }
}
