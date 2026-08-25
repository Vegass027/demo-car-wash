import { CompanySettings } from '../../entities/companySettings/model';
import { Organization } from '../../lib/api/organizations';
import { WorksheetEntry } from '../../lib/api/worksheet-entries';
import { amountToWords } from './number-to-words';

/**
 * Склоняет название месяца в родительный падеж (для даты)
 * @param monthName - название месяца в именительном падеже
 * @returns название месяца в родительном падеже
 */
function declineMonth(monthName: string): string {
  const monthDeclensions: Record<string, string> = {
    'январь': 'января',
    'февраль': 'февраля',
    'март': 'марта',
    'апрель': 'апреля',
    'май': 'мая',
    'июнь': 'июня',
    'июль': 'июля',
    'август': 'августа',
    'сентябрь': 'сентября',
    'октябрь': 'октября',
    'ноябрь': 'ноября',
    'декабрь': 'декабря'
  };
  return monthDeclensions[monthName] || monthName;
}

/**
 * Генерирует HTML для СЧЕТА НА ОПЛАТУ
 */
export function generateInvoiceHTML(data: {
  executor: CompanySettings;
  client: Organization;
  invoiceNumber: number;
  invoiceDate: string;
  services: Array<{
    number: number;
    name: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
  }>;
  totalAmount: number;
}): string {
  const { executor, client, invoiceNumber, invoiceDate, services, totalAmount } = data;

  // Формируем дату в формате "31.03.2026 г."
  const date = new Date(invoiceDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${day}.${month}.${year} г.`;

  // Формируем сумму прописью
  const amountInWords = amountToWords(totalAmount);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
    h1 { text-align: center; margin-bottom: 20px; }
    .info { margin-bottom: 20px; }
    .info p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #000; padding: 8px; text-align: center; vertical-align: top; }
    th { background-color: #f0f0f0; font-weight: bold; }
    .total { font-weight: bold; background-color: #f0f0f0; }
    .page-content { padding: 10mm; }
    .warning-box { border: 2px solid #000; padding: 10px; margin-bottom: 20px; font-size: 11px; }
    @page {
      margin: 5mm;
      size: A4;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page-content { padding: 10mm; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      header, footer {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="page-content">
  
  <!-- Предупреждающий блок -->
  <div class="warning-box">
    Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и паспорта.
  </div>

  <!-- Таблица банковских реквизитов -->
  <table style="margin-bottom: 20px;">
    <!-- Банк получателя -->
    <tr>
      <td colspan="2" style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">${executor.bank_name}</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">БИК</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">${executor.bik}</td>
    </tr>
    <tr>
      <td colspan="2" style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">${executor.actual_address || executor.legal_address}</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">Сч. №</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">${executor.correspondent_account}</td>
    </tr>
    <tr>
      <td colspan="4" style="border: 2px solid #000; padding: 8px; font-size: 11px; text-align: left; font-weight: bold;">Банк получателя</td>
    </tr>
    
    <!-- Получатель -->
    <tr>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">ИНН ${executor.inn}</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; text-align: left; font-weight: bold;">КПП</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">Сч. №</td>
      <td style="border: 2px solid #000; padding: 8px; font-size: 11px; font-weight: bold;">${executor.payment_account}</td>
    </tr>
    <tr>
      <td colspan="4" style="border: 2px solid #000; padding: 8px; font-size: 11px; text-align: left; font-weight: bold;">
        ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ<br>
        ${executor.full_legal_name.replace(/ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ\s*/, '').replace(/ИП\s*/, '').trim()}
      </td>
    </tr>
    <tr>
      <td colspan="4" style="border: 2px solid #000; padding: 8px; font-size: 11px; text-align: left; font-weight: bold;">Получатель</td>
    </tr>
  </table>

  <h1 style="margin-top: 30px;">СЧЕТ № ${invoiceNumber} от ${formattedDate}</h1>

  <div class="info">
    <p><strong>Поставщик:</strong> ${executor.short_name || executor.full_legal_name}, Адрес: ${executor.legal_address}, ИНН ${executor.inn} ОГРН ${executor.ogrn}</p>
    <p><strong>Покупатель:</strong> ${client.name}, Адрес: ${client.legal_address || ''}, ИНН ${client.inn || ''} ${client.kpp ? `КПП ${client.kpp}` : ''} ${client.ogrn ? `ОГРН ${client.ogrn}` : ''}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40px;">№</th>
        <th>Товар</th>
        <th style="width: 80px;">Кол-во</th>
        <th style="width: 60px;">Ед.</th>
        <th style="width: 120px;">Цена</th>
        <th style="width: 120px;">Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${services.map(service => `
        <tr>
          <td>${service.number}</td>
          <td style="text-align: left;">${service.name}</td>
          <td>${service.quantity}</td>
          <td>${service.unit}</td>
          <td>${service.price.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
          <td>${service.total.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr class="total">
        <td colspan="5" style="text-align: right;">Итого:</td>
        <td>${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr class="total">
        <td colspan="5" style="text-align: right;">В том числе НДС:</td>
        <td>-</td>
      </tr>
      <tr class="total">
        <td colspan="5" style="text-align: right;">Всего к оплате:</td>
        <td>${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  <div class="info" style="margin-top: 30px;">
    <p>Всего наименований ${services.length}, на сумму ${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.</p>
    <p style="font-weight: bold; margin-top: 10px;">${amountInWords}</p>
  </div>

  <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-start;">
    <div style="flex: 1;">
      <p><strong>Руководитель</strong> ____________ (${executor.director_name})</p>
    </div>
    <div style="flex: 1; text-align: right;">
      <p><strong>Бухгалтер</strong> ____________ (${executor.accountant_name || executor.director_name})</p>
    </div>
  </div>
  </div>
</body>
</html>
  `;
}

/**
 * Генерирует HTML для АКТА ВЫПОЛНЕННЫХ РАБОТ
 */
export function generateActHTML(data: {
  executor: CompanySettings;
  client: Organization;
  actNumber: number;
  actDate: string;
  services: Array<{
    number: number;
    name: string;
    unit: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  totalAmount: number;
}): string {
  const { executor, client, actNumber, actDate, services, totalAmount } = data;

  // Формируем дату в формате "31.03.2026 г."
  const date = new Date(actDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${day}.${month}.${year} г.`;

  // Формируем сумму прописью
  const amountInWords = amountToWords(totalAmount);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 11pt; }
    h1 { text-align: center; margin-bottom: 15px; font-size: 14pt; }
    .info { margin-bottom: 15px; }
    .info p { margin: 4px 0; font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
    th, td { border: 1px solid #000; padding: 6px; text-align: center; vertical-align: top; }
    th { background-color: #f0f0f0; font-weight: bold; }
    .total { font-weight: bold; background-color: #f0f0f0; }
    .footer { margin-top: 15px; display: flex; justify-content: space-between; }
    .footer-block { flex: 1; }
    .footer-block p { margin: 3px 0; }
    .signature-line { border-bottom: 2px solid #000; display: inline-block; width: 180px; height: 20px; }
    .header-section { margin-bottom: 8px; }
    .header-section p { margin: 3px 0; font-size: 10pt; }
    .separator { border-top: 2px solid #000; margin: 12px 0; }
    .page-content { padding: 10mm; }
    @page {
      margin: 5mm;
      size: A4;
    }
    @media print {
      body { margin: 0; padding: 0; font-size: 10pt; }
      .page-content { padding: 10mm; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      h1 { margin-bottom: 10px; }
      .info { margin-bottom: 10px; }
      .footer { margin-top: 20px; }
      header, footer {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="page-content">
  <div class="header-section">
    <p><strong>Исполнитель:</strong> ${executor.full_legal_name}</p>
    <p>Юр. Адрес: ${executor.legal_address}</p>
    ${executor.actual_address ? `<p>Факт. Адрес: ${executor.actual_address}</p>` : ''}
    <p>ИНН ${executor.inn} ОГРН ${executor.ogrn}</p>
    <p>р/сч ${executor.payment_account} в ${executor.bank_name}</p>
    <p>кор/сч ${executor.correspondent_account} БИК ${executor.bik}</p>
  </div>
  
  <div class="separator"></div>
  
  <div class="header-section">
    <p><strong>Заказчик:</strong> ${client.name}</p>
    <p>ИНН ${client.inn || ''} ${client.kpp ? `КПП ${client.kpp}` : ''} ${client.ogrn ? `ОГРН ${client.ogrn}` : ''}</p>
    <p>Юр. Адрес: ${client.legal_address || ''}</p>
    <p>Р/сч ${client.payment_account || ''} в ${client.bank_name || ''}</p>
    <p>К/сч ${client.correspondent_account || ''} БИК ${client.bik || ''}</p>
  </div>

  <h1 style="margin-top: 30px;">
    АКТ<br>
    Выполненных работ (оказанных услуг)<br>
    № ${actNumber} от ${formattedDate}
  </h1>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">№</th>
        <th>Наименование работы (услуги)</th>
        <th style="width: 60px;">Ед. Изм.</th>
        <th style="width: 60px;">Кол-во</th>
        <th style="width: 100px;">Цена</th>
        <th style="width: 100px;">Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${services.map(service => `
        <tr>
          <td>${service.number}</td>
          <td style="text-align: left;">${service.name}</td>
          <td>${service.unit}</td>
          <td>${service.quantity}</td>
          <td>${service.price.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
          <td>${service.total.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr class="total">
        <td colspan="5" style="text-align: right;">Итого:</td>
        <td>${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr class="total">
        <td colspan="5" style="text-align: right;">В том числе НДС:</td>
        <td>---</td>
      </tr>
      <tr class="total">
        <td colspan="5" style="text-align: right;">Всего:</td>
        <td>${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  <div class="info" style="margin-top: 30px;">
    <p><em>Всего оказано услуг на сумму: ${amountInWords} без НДС.</em></p>
    <p style="margin-top: 10px;">Вышеперечисленные услуги выполнены полностью в срок.</p>
    <p>Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.</p>
  </div>

  <div class="footer">
    <div class="footer-block">
      <p><strong>От Исполнителя:</strong></p>
      <p class="signature-line"></p>
      <p>/ ${executor.director_name} /</p>
      <p style="margin-top: 10px;">М.П.</p>
    </div>
    <div class="footer-block" style="text-align: right;">
      <p><strong>От Заказчика:</strong></p>
      <p class="signature-line"></p>
      <p>/ <span style="display: inline-block; width: 150px; border-bottom: 1px solid #000;"></span> /</p>
      <p style="margin-top: 10px;">М.П.</p>
    </div>
  </div>
  </div>
</body>
</html>
  `;
}
