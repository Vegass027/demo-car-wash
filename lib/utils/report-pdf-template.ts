import type { ReportHistory } from '../api/reports';

/**
 * Генерирует HTML шаблон для экспорта истории отчетов в PDF
 * @param reportHistory - Данные отчета
 * @returns HTML строка для генерации PDF
 */
export function generateReportHistoryPDF(reportHistory: ReportHistory): string {
  const startDateStr = new Date(reportHistory.startDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const endDateStr = new Date(reportHistory.endDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      color: #000000;
      background: #ffffff;
    }
    
    /* Управление разрывами страниц */
    .page-section {
      page-break-inside: avoid;
      break-inside: avoid;
      display: block;
    }
    
    @media print {
      .page-section {
        page-break-inside: avoid;
        break-inside: avoid;
        orphans: 3;
        widows: 3;
      }
      @page {
        size: A4;
        margin: 10mm;
      }
    }
    
    h1 {
      word-spacing: normal;
      letter-spacing: normal;
    }
  </style>
</head>
<body>
  <div style="width: 100%; max-width: 750px; margin: 0 auto; padding: 10px;">
  
  <!-- ШАПКА -->
  <div class="page-section" style="text-align: center; margin-bottom: 15px;">
    <h1 style="font-size: 24px; font-weight: bold; color: #000000; margin-bottom: 5px;">История Отчетов 📊</h1>
    <div style="font-size: 16px; color: #666666; font-weight: 500;">${startDateStr} - ${endDateStr}</div>
  </div>

  <!-- ШИНОМОНТАЖ -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">🔧 ШИНОМОНТАЖ</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 2px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Обслужено машин:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.tire.carsCount}</span>
            </div>
            ${(reportHistory.tire.acComplexCount > 0 || reportHistory.tire.acFreonCount > 0) ? `
            <div style="padding: 4px 0; border-bottom: 1px solid #000000;">
              <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">❄️ Кондиционеры:</div>
              ${reportHistory.tire.acComplexCount > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 10px;">
                <span style="font-size: 11px; color: #666666;">Комплексная заправка</span>
                <span style="font-size: 12px; font-weight: 600;">${reportHistory.tire.acComplexCount} шт × ${(reportHistory.tire.acComplexPrice || 0).toLocaleString('ru-RU')}₽ = ${(reportHistory.tire.acComplexTotal || 0).toLocaleString('ru-RU')}₽</span>
              </div>
              ` : ''}
              ${reportHistory.tire.acFreonCount > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 10px;">
                <span style="font-size: 11px; color: #666666;">Доливка фреона (${reportHistory.tire.acFreonGrams || 0}г)</span>
                <span style="font-size: 12px; font-weight: 600;">${reportHistory.tire.acFreonCount} шт = ${(reportHistory.tire.acFreonTotal || 0).toLocaleString('ru-RU')}₽</span>
              </div>
              ` : ''}
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Наличные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.tire.cash.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Безналичные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.tire.card.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Переводы:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.tire.transfer.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Ведомость:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.tire.vedomost.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Яндекс:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.tire.yandex.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО:</span>
              <span style="font-size: 16px; font-weight: bold; color: #000000;">${reportHistory.tire.total.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- АВТОМОЙКА -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">💧 АВТОМОЙКА</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 2px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Помыто машин:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.carwash.carsCount}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Наличные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.carwash.cash.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Безналичные:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.carwash.card.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Переводы:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.carwash.transfer.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Ведомость:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.carwash.vedomost.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Яндекс:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.carwash.yandex.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО:</span>
              <span style="font-size: 16px; font-weight: bold; color: #000000;">${reportHistory.carwash.total.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- РАСХОДЫ -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">💸 РАСХОДЫ</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Чай/Кофе:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.expenses.teaCoffee.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Ремонт:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.expenses.repair.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Коммуналка:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.expenses.utilities.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Канцелярия:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.expenses.stationery.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 13px; font-weight: 600;">Прочее:</span>
              <span style="font-size: 14px; font-weight: bold;">${reportHistory.expenses.other.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО РАСХОДОВ:</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">${reportHistory.expenses.total.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- СКЛАД -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">📦 СКЛАД</div>
            ${reportHistory.chemistry.details && reportHistory.chemistry.details.length > 0 ? `
              ${reportHistory.chemistry.details.map(item => `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
                  <span style="font-size: 13px; font-weight: 600;">${item.itemName}:</span>
                  <span style="font-size: 14px; font-weight: bold;">${item.totalAmount.toLocaleString('ru-RU')}₽</span>
                </div>
              `).join('')}
            ` : `
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
                <span style="font-size: 13px; font-weight: 600;">Нет данных:</span>
                <span style="font-size: 14px; font-weight: bold;">0₽</span>
              </div>
            `}
            <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО СКЛАД:</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">${reportHistory.chemistry.total.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ЗАРПЛАТЫ -->
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 3px solid #000000; padding: 12px; background: #faf8f5; border-radius: 12px;">
            <div style="font-size: 18px; font-weight: bold; color: #000000; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">👥 ЗАРПЛАТЫ СОТРУДНИКОВ</div>

    <!-- Мойщики -->
    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #000000;">
      <span style="font-size: 14px; font-weight: 600;">Мойщики:</span>
      <span style="font-size: 15px; font-weight: bold; color: #cc0000;">${reportHistory.salaries.workers.toLocaleString('ru-RU')}₽</span>
    </div>
    ${reportHistory.salaries.workersDetails && reportHistory.salaries.workersDetails.length > 0 ? `
      <div style="padding: 6px 0 6px 15px; border-left: 2px solid #000000; margin-left: 8px;">
        ${reportHistory.salaries.workersDetails.map(worker => `
          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #666666;">${worker.name}</span>
            <span style="font-weight: 500;">${worker.salary.toLocaleString('ru-RU')}₽</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Шиномонтажники -->
    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #000000;">
      <span style="font-size: 14px; font-weight: 600;">Шиномонтажники:</span>
      <span style="font-size: 15px; font-weight: bold; color: #cc0000;">${reportHistory.salaries.technicians.toLocaleString('ru-RU')}₽</span>
    </div>
    ${reportHistory.salaries.techniciansDetails && reportHistory.salaries.techniciansDetails.length > 0 ? `
      <div style="padding: 6px 0 6px 15px; border-left: 2px solid #000000; margin-left: 8px;">
        ${reportHistory.salaries.techniciansDetails.map(technician => `
          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #666666;">${technician.name}</span>
            <span style="font-weight: 500;">${technician.salary.toLocaleString('ru-RU')}₽</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Админы -->
    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #000000;">
      <span style="font-size: 14px; font-weight: 600;">Админы:</span>
      <span style="font-size: 15px; font-weight: bold; color: #cc0000;">${reportHistory.salaries.admin.toLocaleString('ru-RU')}₽</span>
    </div>
    ${reportHistory.salaries.adminsDetails && reportHistory.salaries.adminsDetails.length > 0 ? `
      <div style="padding: 6px 0 6px 15px; border-left: 2px solid #000000; margin-left: 8px;">
        ${reportHistory.salaries.adminsDetails.map(admin => `
          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #666666;">${admin.name}</span>
            <span style="font-weight: 500;">${admin.salary.toLocaleString('ru-RU')}₽</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Итого -->
    <div style="display: flex; justify-content: space-between; padding: 10px; margin-top: 8px; background: #e8e8e8; border: 2px solid #000000; border-radius: 8px;">
      <span style="font-size: 15px; font-weight: bold;">ИТОГО ЗАРПЛАТ:</span>
      <span style="font-size: 18px; font-weight: bold; color: #cc0000;">${reportHistory.salaries.total.toLocaleString('ru-RU')}₽</span>
    </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ПРОДАЖИ -->
  ${reportHistory.sales && reportHistory.sales.details.length > 0 ? `
  <table class="page-section" style="width: 100%; margin-bottom: 12px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 2px solid #000000; padding: 10px; background: #faf8f5; border-radius: 8px;">
            <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000000; text-align: center;">🛒 ПРОДАЖИ ТОВАРОВ</div>
            ${reportHistory.sales.details.map(detail => `
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #000000;">
                <span style="font-size: 13px; font-weight: 600;">${detail.productName} (${detail.quantity} шт.):</span>
                <span style="font-size: 14px; font-weight: bold;">${detail.totalPrice.toLocaleString('ru-RU')}₽</span>
              </div>
            `).join('')}
            <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #e8e8e8; border: 2px solid #000000; border-radius: 6px;">
              <span style="font-size: 14px; font-weight: bold;">ИТОГО ПРОДАЖ:</span>
              <span style="font-size: 16px; font-weight: bold; color: #00aa00;">${reportHistory.sales.total.toLocaleString('ru-RU')}₽</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <!-- ИТОГОВЫЙ РЕЗУЛЬТАТ -->
  <table class="page-section" style="width: 100%; margin-top: 15px; border-collapse: collapse; page-break-inside: avoid;">
    <tbody>
      <tr>
        <td style="padding: 0;">
          <div style="border: 3px solid #000000; padding: 15px; background: #faf8f5; border-radius: 12px;">
            <div style="font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 3px solid #000000;">📊 ИТОГОВЫЙ РЕЗУЛЬТАТ</div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Выручка (+):</span>
              <span style="font-size: 16px; font-weight: bold; color: #00aa00;">${reportHistory.totals.revenue.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Расходы (-):</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">-${reportHistory.totals.expenses.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Склад (-):</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">-${reportHistory.totals.chemistry.toLocaleString('ru-RU')}₽</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Зарплаты (-):</span>
              <span style="font-size: 16px; font-weight: bold; color: #cc0000;">-${reportHistory.totals.salaries.toLocaleString('ru-RU')}₽</span>
            </div>
            ${reportHistory.sales && reportHistory.sales.total > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #000000;">
              <span style="font-size: 15px; font-weight: 600; color: #000000;">Продажи (+):</span>
              <span style="font-size: 16px; font-weight: bold; color: #00aa00;">${reportHistory.sales.total.toLocaleString('ru-RU')}₽</span>
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 12px; margin-top: 10px; background: #d4edda; border: 3px solid #000000; border-radius: 8px;">
              <span style="font-size: 18px; font-weight: bold; color: #000000;">ЧИСТАЯ ПРИБЫЛЬ:</span>
              <span style="font-size: 22px; font-weight: bold; color: ${reportHistory.totals.profit >= 0 ? '#00aa00' : '#cc0000'};">
                ${reportHistory.totals.profit.toLocaleString('ru-RU')}₽
              </span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  </div>
</body>
</html>
  `;
}