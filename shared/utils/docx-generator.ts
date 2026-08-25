// ============================================================
// ГЕНЕРАТОР WORD ДОКУМЕНТОВ (.docx)
// Создаёт DOCX файлы для счетов и актов
// ============================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  VerticalAlign,
} from 'docx'
import { saveAs } from 'file-saver'

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Создаёт ячейку таблицы с поддержкой процентных ширин и кастомных границ
 */
function createCell(
  text: string,
  widthPercent?: number,
  bold = false,
  align: 'left' | 'center' | 'right' = 'left',
  borders?: {
    top?: boolean
    right?: boolean
    bottom?: boolean
    left?: boolean
  }
): TableCell {
  const defaultBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  }

  const cellBorders = borders
    ? {
        top: borders.top ? defaultBorders.top : { style: BorderStyle.NONE, size: 0 },
        bottom: borders.bottom ? defaultBorders.bottom : { style: BorderStyle.NONE, size: 0 },
        left: borders.left ? defaultBorders.left : { style: BorderStyle.NONE, size: 0 },
        right: borders.right ? defaultBorders.right : { style: BorderStyle.NONE, size: 0 },
      }
    : defaultBorders

  // Используем фиксированную ширину в twips для лучшего контроля
  // Ширина страницы A4 без полей: 210mm - 30mm = 180mm = 10206 twips
  const TABLE_WIDTH = 10206 // ширина таблицы в twips
  const width = widthPercent ? Math.round(TABLE_WIDTH * widthPercent / 100) : undefined

  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text,
            size: 22, // 11pt = 22 half-points
            bold,
            font: 'Times New Roman',
          }),
        ],
      }),
    ],
    borders: cellBorders,
  })
}

/**
 * Создаёт пустую ячейку с границами
 */
function createEmptyCell(
  widthPercent?: number,
  borders?: {
    top?: boolean
    right?: boolean
    bottom?: boolean
    left?: boolean
  }
): TableCell {
  return createCell('', widthPercent, false, 'left', borders)
}

// ============================================================
// ИНТЕРФЕЙСЫ ДАННЫХ
// ============================================================

export interface InvoiceDocxData {
  invoiceNumber: string
  invoiceDate: string
  organizationName: string
  organizationInn: string
  organizationKpp: string
  organizationAddress: string
  organizationBank: string
  organizationBik: string
  organizationRs: string
  organizationKs: string
  customerName?: string
  customerInn?: string
  customerKpp?: string
  customerOgrn?: string
  customerAddress?: string
  services: Array<{
    name: string
    quantity: number
    price: number
    total: number
  }>
  totalAmount: number
  totalAmountWords: string
  directorName: string
  accountantName: string
}

export interface ActDocxData {
  actNumber: string
  actDate: string
  organizationName: string
  organizationInn: string
  organizationOgrn?: string
  organizationAddress: string
  organizationBank: string
  organizationBik: string
  organizationRs: string
  organizationKs: string
  organizationPhone?: string
  customerName: string
  customerInn?: string
  customerKpp?: string
  customerOgrn?: string
  customerAddress?: string
  customerBank?: string
  customerRs?: string
  customerKs?: string
  customerBik?: string
  services: Array<{
    name: string
    quantity: number
    price: number
    total: number
  }>
  totalAmount: number
  totalAmountWords: string
  directorName: string
}

// ============================================================
// ГЕНЕРАЦИЯ СЧЕТА В ФОРМАТЕ WORD
// ============================================================

/**
 * Генерирует счет в формате Word (.docx)
 * @param data Данные для генерации счета
 */
export async function generateInvoiceDocx(data: InvoiceDocxData): Promise<void> {
  // Константы для полей (в twips: 1mm = 56.7 twips)
  const MARGIN_TOP = 1134 // 20mm
  const MARGIN_RIGHT = 851 // 15mm
  const MARGIN_BOTTOM = 1134 // 20mm
  const MARGIN_LEFT = 851 // 15mm

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN_TOP,
              right: MARGIN_RIGHT,
              bottom: MARGIN_BOTTOM,
              left: MARGIN_LEFT,
            },
          },
        },
        children: [
          // ============================================================
          // БЛОК 0: Предупреждение мелким шрифтом
          // ============================================================
          new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({
                text: 'Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и паспорта.',
                size: 16, // 8pt = 16 half-points
                font: 'Times New Roman',
              }),
            ],
          }),

          // ============================================================
          // БЛОК 1: Банковский блок с данными (7 строк, 3 колонки)
          // ============================================================
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Строка 1: [empty] [БИК] [empty]
              new TableRow({
                children: [
                  createEmptyCell(35, { top: true, right: true, bottom: true, left: true }),
                  createCell(`БИК ${data.organizationBik || ''}`, 30, false, 'left', { top: true, right: true, bottom: true, left: true }),
                  createEmptyCell(35, { top: true, right: true, bottom: true, left: true }),
                ],
              }),
              // Строка 2: [empty] [Сч. №] [empty]
              new TableRow({
                children: [
                  createEmptyCell(35, { left: true }),
                  createCell(`Сч. № ${data.organizationKs || ''}`, 30, false, 'left', { left: true }),
                  createEmptyCell(35, { left: true }),
                ],
              }),
              // Строка 3: [Банк получателя] [empty] [empty]
              new TableRow({
                children: [
                  createCell(data.organizationBank || '', 35, false, 'left', { left: true }),
                  createEmptyCell(30, { left: true }),
                  createEmptyCell(35, { left: true }),
                ],
              }),
              // Строка 4: [ИНН] [КПП] [Сч. №]
              new TableRow({
                children: [
                  createCell(`ИНН ${data.organizationInn || ''}`, 35, false, 'left', { left: true }),
                  createCell(`КПП ${data.organizationKpp || ''}`, 30, false, 'left', { left: true }),
                  createCell(`Сч. № ${data.organizationRs || ''}`, 35, false, 'left', { left: true }),
                ],
              }),
              // Строка 5: [empty] [empty] [empty]
              new TableRow({
                children: [
                  createEmptyCell(35, { left: true }),
                  createEmptyCell(30, { left: true }),
                  createEmptyCell(35, { left: true }),
                ],
              }),
              // Строка 6: [empty] [empty] [empty]
              new TableRow({
                children: [
                  createEmptyCell(35, { left: true }),
                  createEmptyCell(30, { left: true }),
                  createEmptyCell(35, { left: true }),
                ],
              }),
              // Строка 7: [Получатель] [empty] [empty]
              new TableRow({
                children: [
                  createCell(data.organizationName || '', 35, false, 'left', { left: true, bottom: true }),
                  createEmptyCell(30, { left: true, bottom: true }),
                  createEmptyCell(35, { left: true, bottom: true }),
                ],
              }),
            ],
          }),

          // ============================================================
          // БЛОК 2: Заголовок счета
          // ============================================================
          new Paragraph({
            spacing: { before: 120, after: 120 },
            alignment: 'center',
            children: [
              new TextRun({ text: `СЧЕТ № ${data.invoiceNumber} от ${data.invoiceDate}`, size: 28, bold: true }),
            ],
          }),

          // ============================================================
          // БЛОК 3: Таблица сторон (Поставщик/Покупатель)
          // ============================================================
          new Paragraph({
            children: [
              new TextRun({ text: 'Поставщик:', size: 22, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${data.organizationName}, ИНН ${data.organizationInn}`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Адрес: ${data.organizationAddress}`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Банк: ${data.organizationBank}, БИК ${data.organizationBik}`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `р/с ${data.organizationRs}`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `к/с ${data.organizationKs}`, size: 22 }),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun({ text: 'Покупатель:', size: 22, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ 
                text: data.customerName || '', 
                size: 22 
              }),
            ],
          }),
          ...(data.customerInn || data.customerKpp || data.customerOgrn ? [
            new Paragraph({
              children: [
                new TextRun({ 
                  text: `${data.customerInn ? `ИНН ${data.customerInn}` : ''}${data.customerInn && data.customerKpp ? ', ' : ''}${data.customerKpp ? `КПП ${data.customerKpp}` : ''}${(data.customerInn || data.customerKpp) && data.customerOgrn ? ', ' : ''}${data.customerOgrn ? `ОГРН ${data.customerOgrn}` : ''}`, 
                  size: 22 
                }),
              ],
            }),
          ] : []),
          ...(data.customerAddress ? [
            new Paragraph({
              children: [
                new TextRun({ text: `Адрес: ${data.customerAddress}`, size: 22 }),
              ],
            }),
          ] : []),
          new Paragraph({}),

          // ============================================================
          // БЛОК 4-5: Таблица услуг (заголовок + строки)
          // ============================================================
          new Table({
            width: { size: 10206, type: WidthType.DXA },
            rows: [
              // Заголовок таблицы
              new TableRow({
                children: [
                  createCell('№', 20, true, 'center'),
                  createCell('Наименование работ, услуг', 44, true, 'center'),
                  createCell('Кол-во', 7, true, 'center'),
                  createCell('Ед', 5, true, 'center'),
                  createCell('Цена', 12, true, 'center'),
                  createCell('Сумма', 12, true, 'center'),
                ],
              }),
              // Строки услуг
              ...data.services.map((service, index) => [
                // Основная строка услуги
                new TableRow({
                  children: [
                    createCell(String(index + 1), 20, false, 'center', { right: true, bottom: true, left: true }),
                    createCell(service.name, 44, false, 'left', { right: true, bottom: true, left: true }),
                    createCell(String(service.quantity), 7, false, 'center', { right: true, bottom: true, left: true }),
                    createCell('шт', 5, false, 'center', { right: true, bottom: true, left: true }),
                    createCell(service.price.toLocaleString('ru-RU'), 12, false, 'center', { right: true, bottom: true, left: true }),
                    createCell(service.total.toLocaleString('ru-RU'), 12, false, 'center', { right: true, bottom: true, left: true }),
                  ],
                }),
                // Дополнительная строка 1: Итого
                new TableRow({
                  children: [
                    createCell('Итого:', 20, true, 'left', { right: true, bottom: true, left: true }),
                    createEmptyCell(44, { right: true, bottom: true, left: true }),
                    createEmptyCell(7, { right: true, bottom: true, left: true }),
                    createEmptyCell(5, { right: true, bottom: true, left: true }),
                    createEmptyCell(12, { right: true, bottom: true, left: true }),
                    createCell(data.totalAmount.toLocaleString('ru-RU'), 12, false, 'center', { right: true, bottom: true, left: true }),
                  ],
                }),
                // Дополнительная строка 2: В том числе НДС
                new TableRow({
                  children: [
                    createCell('В том числе НДС:', 20, false, 'left', { right: true, bottom: true, left: true }),
                    createEmptyCell(44, { right: true, bottom: true, left: true }),
                    createEmptyCell(7, { right: true, bottom: true, left: true }),
                    createEmptyCell(5, { right: true, bottom: true, left: true }),
                    createEmptyCell(12, { right: true, bottom: true, left: true }),
                    createCell('—', 12, false, 'center', { right: true, bottom: true, left: true }),
                  ],
                }),
                // Дополнительная строка 3: Всего к оплате
                new TableRow({
                  children: [
                    createCell('Всего к оплате:', 20, true, 'left', { right: true, bottom: true, left: true }),
                    createEmptyCell(44, { right: true, bottom: true, left: true }),
                    createEmptyCell(7, { right: true, bottom: true, left: true }),
                    createEmptyCell(5, { right: true, bottom: true, left: true }),
                    createEmptyCell(12, { right: true, bottom: true, left: true }),
                    createCell(data.totalAmount.toLocaleString('ru-RU'), 12, true, 'center', { right: true, bottom: true, left: true }),
                  ],
                }),
              ]).flat(),
            ],
          }),

          // ============================================================
          // БЛОК 7: Сумма прописью
          // ============================================================
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun({ text: `Всего наименований ${data.services.length}, на сумму ${data.totalAmount.toLocaleString('ru-RU')} руб.`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: data.totalAmountWords, size: 22, bold: true }),
            ],
          }),
          new Paragraph({ spacing: { after: 720 } }),

          // ============================================================
          // БЛОК 8: Подписи
          // ============================================================
          new Paragraph({
            children: [
              new TextRun({ text: 'Руководитель', size: 22 }),
              new TextRun({ text: '__________________', size: 22 }),
              new TextRun({ text: ` (${data.directorName})`, size: 22 }),
            ],
          }),
          new Paragraph({ spacing: { after: 480 } }), // Увеличенный отступ после руководителя (480 twips = 24pt)
          new Paragraph({
            children: [
              new TextRun({ text: 'Бухгалтер', size: 22 }),
              new TextRun({ text: '__________________', size: 22 }),
              new TextRun({ text: ` (${data.accountantName})`, size: 22 }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const fileName = `Счет_${data.invoiceNumber}.docx`
  saveAs(blob, fileName)
}

// ============================================================
// ГЕНЕРАЦИЯ АКТА В ФОРМАТЕ WORD
// ============================================================

/**
 * Генерирует акт в формате Word (.docx)
 * @param data Данные для генерации акта
 */
export async function generateActDocx(data: ActDocxData): Promise<void> {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 700,
              right: 500,
              bottom: 700,
              left: 850,
            },
          },
        },
        children: [
          // Заголовок
          new Paragraph({
            alignment: 'center',
            children: [
              new TextRun({ text: `АКТ № ${data.actNumber}`, size: 28, bold: true }),
            ],
          }),
          new Paragraph({
            alignment: 'center',
            children: [
              new TextRun({ text: `от ${data.actDate}`, size: 22 }),
            ],
          }),
          new Paragraph({}),
          
          // Исполнитель
          new Paragraph({
            children: [
              new TextRun({ text: 'Исполнитель:', size: 22, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: data.organizationName, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Юр. Адрес: ${data.organizationAddress}`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ 
                text: `ИНН ${data.organizationInn}${data.organizationOgrn ? ` ОГРН ${data.organizationOgrn}` : ''}`, 
                size: 22 
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `р/сч ${data.organizationRs} в ${data.organizationBank}`, size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `кор/сч ${data.organizationKs} БИК ${data.organizationBik}`, size: 22 }),
            ],
          }),
          new Paragraph({}),
          
          // Заказчик
          new Paragraph({
            children: [
              new TextRun({ text: 'Заказчик:', size: 22, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: data.customerName, size: 22 }),
            ],
          }),
          ...(data.customerInn || data.customerKpp || data.customerOgrn ? [
            new Paragraph({
              children: [
                new TextRun({ 
                  text: `${data.customerInn ? `ИНН ${data.customerInn}` : ''}${data.customerInn && data.customerKpp ? ' ' : ''}${data.customerKpp ? `КПП ${data.customerKpp}` : ''}${(data.customerInn || data.customerKpp) && data.customerOgrn ? ' ' : ''}${data.customerOgrn ? `ОГРН ${data.customerOgrn}` : ''}`, 
                  size: 22 
                }),
              ],
            }),
          ] : []),
          ...(data.customerAddress ? [
            new Paragraph({
              children: [
                new TextRun({ text: `Юр. Адрес: ${data.customerAddress}`, size: 22 }),
              ],
            }),
          ] : []),
          ...(data.customerRs && data.customerBank ? [
            new Paragraph({
              children: [
                new TextRun({ text: `Р/сч ${data.customerRs} в ${data.customerBank}`, size: 22 }),
              ],
            }),
          ] : []),
          ...(data.customerKs && data.customerBik ? [
            new Paragraph({
              children: [
                new TextRun({ text: `К/сч ${data.customerKs} БИК ${data.customerBik}`, size: 22 }),
              ],
            }),
          ] : []),
          new Paragraph({}),
          
          // Таблица услуг
          new Table({
            width: { size: 10206, type: WidthType.DXA },
            rows: [
              // Заголовок таблицы
              new TableRow({
                children: [
                  createCell('№', 5, true, 'center'),
                  createCell('Наименование работ, услуг', 35, true, 'center'),
                  createCell('Кол-во', 12, true, 'center'),
                  createCell('Ед', 8, true, 'center'),
                  createCell('Цена', 20, true, 'center'),
                  createCell('Сумма', 20, true, 'center'),
                ],
              }),
              // Строки услуг
              ...data.services.map((service, index) =>
                new TableRow({
                  children: [
                    createCell(String(index + 1), 5, false, 'center', { right: true, bottom: true, left: true }),
                    createCell(service.name, 35, false, 'left', { right: true, bottom: true, left: true }),
                    createCell(String(service.quantity), 12, false, 'center', { right: true, bottom: true, left: true }),
                    createCell('шт', 8, false, 'center', { right: true, bottom: true, left: true }),
                    createCell(service.price.toLocaleString('ru-RU'), 20, false, 'center', { right: true, bottom: true, left: true }),
                    createCell(service.total.toLocaleString('ru-RU'), 20, false, 'center', { right: true, bottom: true, left: true }),
                  ],
                })
              ),
              // Итого
              new TableRow({
                children: [
                  createCell('', 5, false, 'center'),
                  createCell('Итого:', 35, true, 'left'),
                  createCell('', 12, false, 'center'),
                  createCell('', 8, false, 'center'),
                  createCell('', 20, false, 'center'),
                  createCell(data.totalAmount.toLocaleString('ru-RU'), 20, true, 'center'),
                ],
              }),
              // Без НДС
              new TableRow({
                children: [
                  createCell('', 5, false, 'center'),
                  createCell('Без налога (НДС):', 35, false, 'left'),
                  createCell('', 12, false, 'center'),
                  createCell('', 8, false, 'center'),
                  createCell('', 20, false, 'center'),
                  createCell('—', 20, false, 'center'),
                ],
              }),
              // Всего с НДС
              new TableRow({
                children: [
                  createCell('', 5, false, 'center'),
                  createCell('Всего (с учетом НДС):', 35, true, 'left'),
                  createCell('', 12, false, 'center'),
                  createCell('', 8, false, 'center'),
                  createCell('', 20, false, 'center'),
                  createCell(data.totalAmount.toLocaleString('ru-RU'), 20, true, 'center'),
                ],
              }),
            ],
          }),
          new Paragraph({}),
          new Paragraph({}),
          
          // Сумма прописью
          new Paragraph({
            children: [
              new TextRun({ text: `Всего оказано услуг на сумму: ${data.totalAmountWords} без НДС.`, size: 22 }),
            ],
          }),
          new Paragraph({}),
          new Paragraph({}),

          // Подтверждение
          new Paragraph({
            children: [
              new TextRun({ text: 'Вышеперечисленные услуги выполнены полностью в срок.', size: 22 }),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun({ text: 'Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.', size: 22 }),
            ],
          }),
          new Paragraph({}),
          new Paragraph({}),
          
          // Подписи
          new Paragraph({
            children: [
              new TextRun({ text: 'От Исполнителя:', size: 22, bold: true }),
              new TextRun({ text: ' __________________', size: 22 }),
              new TextRun({ text: ' (ГАЛКИН В. В.)', size: 22 }),
            ],
          }),
          new Paragraph({ spacing: { after: 720 } }),
          new Paragraph({
            children: [
              new TextRun({ text: 'От Заказчика:', size: 22, bold: true }),
              new TextRun({ text: ' __________________', size: 22 }),
              new TextRun({ text: ' М.П.', size: 22 }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const fileName = `Акт_${data.actNumber}.docx`
  saveAs(blob, fileName)
}
