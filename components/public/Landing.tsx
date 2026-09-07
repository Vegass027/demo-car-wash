import React from 'react';
import React, { useState } from 'react';
import { Droplets, ArrowRight, Check, ChevronRight, ChevronLeft, Send, X } from 'lucide-react';
import { Button } from '../ui/button';

// Telegram bot link — открой бота, нажми /start, бот откроет Mini App.
const TG_BOT_URL = 'https://t.me/demo_car_wash_bot';

// ----------------------------------------------------------------------------
// Lightbox для скриншотов: клик → полноэкранный просмотр.
// ----------------------------------------------------------------------------
const Lightbox: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => (
  <div
    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
    onClick={onClose}
  >
    <button
      onClick={onClose}
      className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
      aria-label="Закрыть"
    >
      <X className="w-5 h-5" />
    </button>
    <img
      src={src}
      alt={alt}
      className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    />
  </div>
);

interface LandingProps {
  onEnterDemo: () => void;
}

// ============================================================================
// 8 sections matching CRM_landing_texts.md.
// Each section: h2 title, "Что внутри" bullet list, "Заключительный спич"
// pull-quote (Problem → Solution). All real product imagery from /public/landing/.
// ============================================================================

type Section = {
  id: string;
  emoji: string;
  title: string;
  titleAccent: string;
  intro: string;
  bullets: string[];
  problem: string;
  solution: string;
  image: string;
  imageAlt: string;
  tone: 'white' | 'slate';
};

const SECTIONS: Section[] = [
  {
    id: 'moyka',
    emoji: '🧽',
    title: 'Автомойка',
    titleAccent: 'боксы, очередь, выручка',
    intro:
      'Каждый заказ проходит через админскую панель. Видно: кто моет, когда освободится бокс, сколько денег в кассе.',
    bullets: [
      'Таймлайн боксов в реальном времени — видно, кто моет, когда освободится, есть ли накладки. Никакого журнала и Excel.',
      'Запись клиента за 30 секунд — телефон → авто → услуги → система сама считает цену и подбирает бокс.',
      'Запись юрлица с подписью водителя — выбор машины из автопарка, подпись на экране попадает в акт.',
      'Закрытие заказа в один тап — оплата фиксируется, бокс освобождается, зарплата мойщика пересчитывается.',
      'Очередь мойщиков — solo или pair (доля 50/50 автоматически).',
      'Защита от злоупотреблений — 3 отмены за неделю — блок на сутки без разборок.',
      'Запись «с улицы» и временное закрытие бокса (ремонт, обед).',
      'Онлайн-запись через Telegram 24/7 и лояльность — 10-я мойка бесплатно, считается автоматически.',
    ],
    problem: 'Записи теряются, боксы простаивают, зарплата мойщиков — на салфетке, а юрлица требуют акт, которого у вас нет.',
    solution:
      'Один экран вместо блокнота — бокс, заказ, оплата видны сразу. Клиент записывается сам через Telegram, юрлицо получает акт с подписью водителя, а вы закрываете смену за один тап.',
    image: '/landing/moyka.png',
    imageAlt: 'Таймлайн боксов автомойки — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'shinomontazh',
    emoji: '🛞',
    title: 'Шиномонтаж',
    titleAccent: 'сезон без хаоса',
    intro:
      'Отдельный поток записи, не пересекается с мойкой. Каталог по радиусам, автосложение длительности, автозарплата мастера.',
    bullets: [
      'Отдельный поток записи, не пересекается с мойкой.',
      'Каталог: шиномонтаж по радиусам (R13–R18), балансировка с выбором числа колёс, ремонт прокола, сезонное хранение, мойка колёс.',
      'Автосложение длительности услуг — система не даёт наложить два заказа на одного мастера.',
      'Таймлайн мастеров, запись клиента — те же шаги, что в мойке.',
      'Автозарплата: 50% с услуг, 300 ₽ за место хранения.',
      'Перенос записи в один тап и база клиентов с историей — кому звонить перед сезоном.',
    ],
    problem: 'В сезон — очередь на полдня, мастера путают записи, кто-то уходит без оплаты.',
    solution:
      'Клиент сам бронирует время и услугу в боте, мастер видит только свою очередь, а система не даст поставить два заказа в одно окно — накладок не будет.',
    image: '/landing/shinomontazh.png',
    imageAlt: 'Таймлайн шиномонтажа — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'svodka',
    emoji: '📊',
    title: 'Сводка',
    titleAccent: 'итоги дня на одном экране',
    intro:
      'Один экран — выручка, зарплаты, расходы, чистая прибыль за день. Разбивка по направлениям и способам оплаты.',
    bullets: [
      'Один экран — выручка, зарплаты, расходы, чистая прибыль за день.',
      'Выручка по направлениям (мойка, шиномонтаж, товары) и по способам оплаты (нал, перевод, безнал, QR, ведомости).',
      'Зарплаты по сотрудникам — автоматически, по факту закрытия заказов.',
      'Документы для юрлиц — ведомость, акт, счёт-фактура в PDF с подписью, отправка бухгалтеру прямо в Telegram.',
      'Архив и накопительный итог за месяц.',
    ],
    problem: 'Час на подсчёт кассы вечером, ещё полтора — на акты для юрлиц утром в Excel.',
    solution:
      'Сводка уже посчитана — выручка, зарплаты, расходы, чистая прибыль на одном экране. Акт для юрлица уходит бухгалтеру в Telegram за один клик.',
    image: '/landing/svodka.png',
    imageAlt: 'Сводка дня — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'personal',
    emoji: '👥',
    title: 'Персонал',
    titleAccent: 'зарплата сама',
    intro:
      '40% от выручки, парные смены, авансы, выплаты — больше не нужно считать вручную.',
    bullets: [
      'Карточка сотрудника: контакты, ставка, баланс, статус смены.',
      'Управление сменами: «На смену» / «Закончил», работа в паре с автоделением доли.',
      'Авансы и выплаты в один клик, полная история начислений по дням.',
      'Заметки к сотруднику, сезонное хранение как отдельный заработок для шиномонтажников.',
      'Управление списком: добавить, отключить, вернуть.',
    ],
    problem: 'Мойщики спорят о зарплате, авансы — нал из кармана без учёта, уволившийся сотрудник унёс с собой забытые 8000 ₽ на балансе.',
    solution:
      'У каждого свой баланс и полная история начислений по дням. Аванс — одна кнопка, выплата зарплаты — перевод на карту с автоматической фиксацией.',
    image: '/landing/personal.png',
    imageAlt: 'Карточки сотрудников — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'analitika',
    emoji: '📈',
    title: 'Аналитика',
    titleAccent: 'для владельца, не в Excel',
    intro:
      'Вся финансовая картина в одном экране. Сколько заработали, сколько потратили, что осталось. По любому периоду.',
    bullets: [
      'Выручка по дням, сотрудникам, услугам — точные цифры вместо «мне кажется».',
      'Топ-5 клиентов и топ-5 моделей авто.',
      'Сравнение периодов (месяц к месяцу) по выручке, зарплатам, расходам, прибыли.',
      'Правка расходов и отчёты по юрлицам — сколько приезжали, на какую сумму.',
      'Архив ежедневных отчётов с выгрузкой документов.',
    ],
    problem: 'Бизнес вроде идёт, но нет ответа, в плюсе вы или нет, кто из сотрудников реально приносит деньги.',
    solution:
      'Топ клиентов, топ сотрудников, выручка по дням и сравнение с прошлым месяцем — решения на основе цифр, а не интуиции.',
    image: '/landing/analitika.png',
    imageAlt: 'Аналитика — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'sklad',
    emoji: '📦',
    title: 'Склад',
    titleAccent: 'товары и расходники',
    intro:
      'Учёт остатков, приходы, продажи — без сюрпризов на кассе. Подсветка когда заканчивается.',
    bullets: [
      'Учёт остатков: категории, приход, продажа, минимальный остаток с подсветкой.',
      'История приходов по товару, автосписание при продаже, обновление остатка без перезагрузки.',
      'Удаление категорий с подтверждением.',
    ],
    problem: 'Товар закончился в момент, когда клиент уже стоит у кассы; остатки и закупочные цены — на глазок.',
    solution:
      'Остаток, минимум, история приходов — всё на экране. Товар заканчивается — карточка подсвечивается заранее, продажа сразу списывает остаток.',
    image: '/landing/sklad.png',
    imageAlt: 'Склад — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'cheki',
    emoji: '🧾',
    title: 'Чеки и оплата',
    titleAccent: 'ЮKassa и СБП встроены',
    intro:
      'Оплата через ЮKassa и СБП прямо в системе, QR-оплата за 5 секунд. Чеки по 54-ФЗ автоматически.',
    bullets: [
      'Оплата через ЮKassa и СБП прямо в системе, QR-оплата за 5 секунд.',
      'Автоматические чеки по 54-ФЗ и email-чек клиенту.',
      'Webhook-подтверждение оплаты, привязка к заказу — никаких «потерянных» платежей.',
      'Автоотмена неоплаченных заказов через 15 минут.',
      'Оффлайн-оплата без чека — просто отметка «оплачено».',
    ],
    problem: 'Клиенты хотят платить картой или по QR, а у вас только наличные; чеки по 54-ФЗ выбиваются вручную и теряются.',
    solution:
      'СБП и ЮKassa встроены в систему, чек по 54-ФЗ уходит клиенту на почту автоматически — отдельная касса не нужна.',
    image: '/landing/online-booking.jpg',
    imageAlt: 'Онлайн-запись и оплата — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'upravlenie-boksami',
    emoji: '🧽',
    title: 'Управление боксами',
    titleAccent: 'когда бокс сломался — клиенты не страдают',
    intro:
      'Временное закрытие бокса на час, на день или до ремонта. Существующие записи не теряются.',
    bullets: [
      'Временное закрытие бокса — на час, на день или до ремонта.',
      'Только админ может закрывать/открывать, статус виден в реальном времени серым цветом на таймлайне.',
      'Существующие записи не теряются, если не включён режим «закрыть со сбросом» — тогда клиентам приходит уведомление об отмене.',
    ],
    problem: 'Бокс сломался, а на него уже записаны клиенты — приходится обзванивать и переносить вручную.',
    solution:
      'Один клик — бокс закрыт на нужные часы или день, новые записи туда не идут. При экстренном закрытии клиенты получают уведомление об отмене автоматически.',
    image: '/landing/moyka.png',
    imageAlt: 'Управление боксами — реальный интерфейс CRM',
    tone: 'slate',
  },
];

const IMPACT = [
  { value: '−2 ч', label: 'админских задач в день', icon: '⏱' },
  { value: '+20%', label: 'выручки за 2 месяца', icon: '↗' },
  { value: '100%', label: 'учёт смен и расходов', icon: '✓' },
  { value: '24/7', label: 'онлайн-запись', icon: '◉' },
];

const VOICES = [
  {
    quote:
      'За первый месяц перестали путаться со сменами. Мойщики видят свою выручку в реальном времени — конфликтов про деньги больше нет.',
    name: 'Сергей',
    role: 'владелец мойки в Ростове',
  },
  {
    quote:
      'Telegram-бот для записи — это то, что нужно. Клиенты записываются сами поздно вечером. Телефон молчит.',
    name: 'Андрей',
    role: 'два поста автомойки',
  },
  {
    quote:
      'Раньше в конце месяца я час считал зарплату на калькуляторе. Сейчас нажимаю кнопку и всё готово.',
    name: 'Ольга',
    role: 'администратор',
  },
];

// ----------------------------------------------------------------------------

const SectionBlock: React.FC<{ s: Section; index: number }> = ({ s, index }) => {
  const isEven = index % 2 === 0;
  const bgClass = s.tone === 'white' ? 'bg-white' : 'bg-slate-50';
  const textPrimary = 'text-slate-900';
  const textSecondary = 'text-slate-600';
  const cardBg = s.tone === 'white' ? 'bg-slate-50' : 'bg-white';
  const borderColor = 'border-slate-200';
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <section id={s.id} className={`py-20 lg:py-28 ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-3xl lg:text-4xl">{s.emoji}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7BC74D]">
            Раздел {index + 1} / {SECTIONS.length}
          </span>
        </div>

        <div className={`grid lg:grid-cols-12 gap-10 lg:gap-12 items-start ${isEven ? '' : 'lg:flex-row-reverse'}`}>
          {/* LEFT: text — узкая колонка */}
          <div className={isEven ? 'lg:col-span-4' : 'lg:col-span-4 lg:col-start-9 lg:order-2'}>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3 leading-[1.05] ${textPrimary}`}>
              {s.title}.
              <br />
              <span className="text-[#7BC74D]">{s.titleAccent}.</span>
            </h2>
            <p className={`text-lg ${textSecondary} mb-6 leading-relaxed`}>{s.intro}</p>

            {/* Что внутри */}
            <div className={`${cardBg} rounded-2xl border ${borderColor} p-5 mb-6`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">
                Что внутри
              </div>
              <ul className="space-y-2.5">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-slate-700">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {/* Inline Telegram CTA — только в секции moyka (online booking упоминается именно здесь) */}
              {s.id === 'moyka' && (
                <a
                  href={TG_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center justify-center gap-2 w-full px-4 h-11 rounded-xl bg-[#229ED9] hover:bg-[#1E8FC4] text-white font-semibold transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  Записаться через Telegram-бот
                </a>
              )}
            </div>

            {/* Проблема → Решение (без лейбла «Заключительный спич») */}
            <div className="border-l-4 border-[#7BC74D] pl-4">
              <div className={`text-sm ${textSecondary} leading-relaxed`}>
                <span className="font-semibold text-slate-900">Проблема: </span>
                {s.problem}
              </div>
              <div className={`text-sm ${textSecondary} leading-relaxed mt-2`}>
                <span className="font-semibold text-[#7BC74D]">Решение: </span>
                {s.solution}
              </div>
            </div>
          </div>

          {/* RIGHT: real product image — широкая колонка с zoom */}
          <div className={isEven ? 'lg:col-span-8' : 'lg:col-span-8 lg:order-1 lg:row-start-1'}>
            <button
              type="button"
              onClick={() => setZoom(s.image)}
              className={`group block w-full rounded-3xl overflow-hidden border ${borderColor} shadow-2xl shadow-slate-900/15 bg-white cursor-zoom-in transition-transform hover:scale-[1.01]`}
              aria-label={`Увеличить скриншот: ${s.imageAlt}`}
            >
              <img
                src={s.image}
                alt={s.imageAlt}
                className="w-full h-auto block"
                loading="lazy"
              />
            </button>
            <div className="mt-2 text-center text-xs text-slate-400">
              Кликните, чтобы рассмотреть детали →
            </div>
          </div>
        </div>
      </div>

      {zoom && (
        <Lightbox
          src={zoom}
          alt={SECTIONS.find((x) => x.image === zoom)?.imageAlt ?? ''}
          onClose={() => setZoom(null)}
        />
      )}
    </section>
  );
};

// ----------------------------------------------------------------------------

export const Landing: React.FC<LandingProps> = ({ onEnterDemo }) => {
  const [voiceIdx, setVoiceIdx] = React.useState(0);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      {/* NAV */}
      <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7BC74D] to-[#5BA634] flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-[17px] tracking-tight">Автомойка CRM</div>
              <div className="text-[10px] text-slate-500 tracking-widest uppercase">Demo</div>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-6 text-sm text-slate-700">
            {SECTIONS.slice(0, 6).map((s) => (
              <a key={s.id} href={`#${s.id}`} className="hover:text-slate-900 transition-colors whitespace-nowrap">
                {s.title}
              </a>
            ))}
          </div>
          <Button
            onClick={onEnterDemo}
            className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-5 h-10 gap-1.5 shadow-sm"
          >
            Войти в демо <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 pt-12 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
                Мойка и&nbsp;шиномонтаж.
                <br />
                <span className="text-[#7BC74D]">Без Excel.</span>
              </h1>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-xl">
                CRM, которая записывает клиентов, считает зарплаты сотрудникам
                и показывает прибыль. Восемь разделов — от боксов до аналитики.
              </p>
              <div className="flex flex-wrap gap-3 mb-8">
                <Button
                  onClick={onEnterDemo}
                  size="lg"
                  className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-7 h-12 gap-2 shadow-md"
                >
                  Открыть демо <ArrowRight className="w-4 h-4" />
                </Button>
                <a
                  href={TG_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 h-12 rounded-full bg-white border-2 border-[#7BC74D] text-[#5BA634] font-semibold hover:bg-[#7BC74D]/5 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  Онлайн-запись в Telegram
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#7BC74D]" /> Без регистрации
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#7BC74D]" /> Тестовые данные
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#7BC74D]" /> Открывается за 1 клик
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative rounded-3xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/15 bg-white">
                <img
                  src="/landing/moyka.png"
                  alt="Автомойка CRM — таймлайн боксов"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8 SECTIONS */}
      {SECTIONS.map((s, i) => (
        <SectionBlock key={s.id} s={s} index={i} />
      ))}

      {/* IMPACT */}
      <section className="py-20 lg:py-24 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7BC74D] mb-2">
              Итог
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3">
              Что меняется после перехода
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {IMPACT.map((s, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-[#7BC74D]/40 hover:shadow-lg hover:shadow-[#7BC74D]/5 transition-all"
              >
                <div className="text-3xl mb-3 text-[#7BC74D]">{s.icon}</div>
                <div className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-1">
                  {s.value}
                </div>
                <div className="text-xs text-slate-500 leading-snug">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VOICES */}
      <section className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7BC74D] mb-2">
              Отзывы
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Что говорят те, кто уже работает
            </h2>
          </div>
          <div className="relative">
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${voiceIdx * 100}%)` }}
              >
                {VOICES.map((v, i) => (
                  <div key={i} className="w-full flex-shrink-0 px-1">
                    <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-10 sm:p-14">
                      <svg
                        className="w-10 h-10 text-[#7BC74D]/30 mb-6"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
                      </svg>
                      <p className="text-xl sm:text-2xl text-slate-800 leading-relaxed mb-8 font-medium">
                        «{v.quote}»
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7BC74D] to-[#5BA634] flex items-center justify-center text-white font-bold text-sm">
                          {v.name[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{v.name}</div>
                          <div className="text-sm text-slate-500">{v.role}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setVoiceIdx((i) => (i - 1 + VOICES.length) % VOICES.length)}
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-white transition-colors bg-slate-50"
                aria-label="Предыдущий отзыв"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div className="flex items-center gap-1.5">
                {VOICES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setVoiceIdx(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === voiceIdx ? 'bg-[#7BC74D] w-6' : 'bg-slate-300 w-2'
                    }`}
                    aria-label={`Отзыв ${i + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={() => setVoiceIdx((i) => (i + 1) % VOICES.length)}
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-white transition-colors bg-slate-50"
                aria-label="Следующий отзыв"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#7BC74D]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-4">
            Попробуйте демо — это бесплатно
          </h2>
          <p className="text-white/85 text-lg mb-8 max-w-2xl mx-auto">
            Открывается за один клик. Тестовые данные уже загружены — мойка, шиномонтаж,
            сотрудники, клиенты, организации. Логин и пароль покажутся на экране входа.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={onEnterDemo}
              size="lg"
              className="bg-white hover:bg-slate-50 text-[#5BA634] font-bold rounded-full px-8 h-13 text-base shadow-lg gap-2"
            >
              Войти в демо <ArrowRight className="w-5 h-5" />
            </Button>
            <a
              href={TG_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-7 h-13 rounded-full bg-[#229ED9] hover:bg-[#1E8FC4] text-white font-bold text-base shadow-lg transition-colors"
            >
              <Send className="w-5 h-5" />
              Открыть Telegram-бот
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 bg-slate-900 text-slate-400">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7BC74D] to-[#5BA634] flex items-center justify-center">
                  <Droplets className="w-4 h-4 text-white" />
                </div>
                <div className="font-bold text-white">Автомойка CRM</div>
              </div>
              <div className="text-sm leading-relaxed">
                Восемь разделов для мойки и шиномонтажа. Telegram-бот для записи,
                онлайн-оплата, чеки 54-ФЗ.
              </div>
            </div>
            <div>
              <div className="text-white font-semibold text-sm mb-3">Разделы</div>
              <div className="space-y-1.5 text-sm">
                {SECTIONS.slice(0, 4).map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="block hover:text-white transition-colors">
                    {s.emoji} {s.title}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white font-semibold text-sm mb-3">Ещё разделы</div>
              <div className="space-y-1.5 text-sm">
                {SECTIONS.slice(4).map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="block hover:text-white transition-colors">
                    {s.emoji} {s.title}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white font-semibold text-sm mb-3">Демо</div>
              <div className="space-y-1.5 text-sm">
                <button onClick={onEnterDemo} className="block hover:text-white transition-colors">
                  Открыть демо
                </button>
                <div className="text-xs text-slate-500">Тестовые данные · Demo-аккаунты</div>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>© Автомойка CRM · demo-сборка</div>
            <div className="text-slate-500">8 разделов · 7 реальных скриншотов</div>
          </div>
        </div>
      </footer>
    </div>
  );
};
