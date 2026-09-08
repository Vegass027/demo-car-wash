import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, Check, X, ChevronDown, Droplets, Phone, Send } from 'lucide-react';
import { Button } from '../ui/button';

// Telegram bot link — открой бота, нажми /start, бот откроет Mini App.
const TG_BOT_URL = 'https://t.me/demo_car_wash_bot';

// Акцентный цвет сайта — зелёный #5BA634 (тёмный) / #7BC74D (светлый).
const ACCENT_GREEN = '#5BA634';
const ACCENT_GREEN_LIGHT = '#7BC74D';
const ACCENT_ORANGE = '#F97316'; // для мобильных буллетов ●

// Helper: span с зелёным акцентом (полужирный).
const G = ({ children }: { children: ReactNode }) => (
  <span style={{ color: ACCENT_GREEN }} className="font-bold">
    {children}
  </span>
);

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
// Каждая секция: эмодзи + h2 заголовок + h2 подзаголовок + параграфы (JSX,
// с зелёными акцентами через <G>). Реальные скриншоты из /public/landing/.
// ============================================================================

type Section = {
  id: string;
  emoji: string;
  title: string;
  titleAccent: string;
  paragraphs: ReactNode[];
  image: string;
  imageAlt: string;
  tone: 'white' | 'slate';
};

const SECTIONS: Section[] = [
  {
    id: 'moyka',
    emoji: '🧽',
    title: 'Автомойка',
    titleAccent: 'Все боксы и заказы — перед глазами',
    paragraphs: [
      <>
        <G>Таймлайн в реальном времени</G> показывает загрузку боксов, текущие заказы и время освобождения. Администратор{' '}
        <G>записывает клиента за 30 секунд</G>: телефон, автомобиль, услуги — система сама рассчитывает стоимость{' '}
        <G>изходя из класса авто и ваше прайс листу</G>.
      </>,
      <>
        <G>Заказы закрываются в один тап</G>: оплата фиксируется, а зарплата мойщику пересчитывается{' '}
        <G>автоматически</G>. Можно работать одному или в паре с <G>автоматическим делением доли 50/50</G>.
      </>,
      <>
        Для корпоративных клиентов предусмотрена запись автомобиля <G>из автопарка и подпись водителя на экране</G>{' '}
        — она попадает в акт.
      </>,
      <>
        Записи с улицы, <G>временное закрытие боксов</G>, очередь мойщиков и{' '}
        <G>защита от частых отмен</G> помогают <G>поддерживать порядок даже в загруженные смены</G>.
      </>,
    ],
    image: '/landing/moyka.png',
    imageAlt: 'Таймлайн боксов автомойки — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'upravlenie-boksami',
    emoji: '🧽',
    title: 'Управление боксами',
    titleAccent: 'Бокс закрыт — записи под контролем',
    paragraphs: [
      <>
        Если оборудование вышло из строя, начался ремонт или нужно закрыть бокс на обед, администратор может{' '}
        <G>закрыть бокс на нужное время</G>.
      </>,
      <>
        <G>Новые записи на закрытый бокс не попадут</G>. <G>Уже созданные заказы сохраняются</G>.
      </>,
      <>
        <G>Все изменения сразу отображаются на таймлайне</G>, поэтому команда видит актуальную загрузку{' '}
        <G>без звонков и уточнений</G>.
      </>,
    ],
    image: '/landing/blok-boksov.png',
    imageAlt: 'Управление боксами автомойки — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'shinomontazh',
    emoji: '🛞',
    title: 'Шиномонтаж',
    titleAccent: 'Отдельная запись для шиномонтажа',
    paragraphs: [
      <>
        Мойка и шиномонтаж работают <G>в разных потоках, поэтому записи не смешиваются</G>. Клиент выбирает
        нужную услугу шиномонтажа по <G>вашему прайс листу</G>.
      </>,
      <>
        Мастер видит свою очередь, а начисления формируются <G>по факту выполненных услуг</G>. Все настройки
        условий зарплаты персоналу настраиваются владельцем. <G>История визитов помогает заранее связаться с
        клиентами перед началом сезона</G>.
      </>,
    ],
    image: '/landing/shinomontazh.png',
    imageAlt: 'Таймлайн шиномонтажа — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'online-booking',
    emoji: '💬',
    title: 'Онлайн-запись через Telegram',
    titleAccent: 'Клиенты записываются сами — круглосуточно',
    paragraphs: [
      <>
        Telegram Mini App показывает <G>свободные слоты на сегодня и на ближайшие 3 дня</G>. Клиент выбирает
        время, автомобиль и услугу <G>без звонка администратору</G>.
      </>,
      <>
        Бот сохранит автомобили и историю посещений. <G>Новая запись сразу появляется на таймлайне</G> —{' '}
        <G>без бумажных журналов и переписок</G>.
      </>,
      <>
        Есть <G>настраиваемая бонус система для клиента</G>.
      </>,
    ],
    image: '/landing/online-booking-2.png',
    imageAlt: 'Онлайн-запись в Telegram — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'personal',
    emoji: '👥',
    title: 'Персонал',
    titleAccent: 'Балансы и смены без ручного учета',
    paragraphs: [
      <>
        В карточке каждого сотрудника хранятся контакты, ставка, баланс и статус смены. Сотрудник отмечает начало
        и окончание работы, а при работе в паре система <G>автоматически делит долю чека</G>.
      </>,
      <>
        Авансы и выплаты <G>фиксируются в один клик</G>. В истории начислений видно, сколько сотрудник
        заработал и какие выплаты уже получил.
      </>,
      <>
        Сотрудников можно добавлять, отключать и возвращать в список <G>без потери истории</G>.
      </>,
    ],
    image: '/landing/personal.png',
    imageAlt: 'Карточки сотрудников — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'svodka',
    emoji: '📊',
    title: 'Сводка',
    titleAccent: 'Итоги дня — на одном экране',
    paragraphs: [
      <>
        Сводка показывает выручку, расходы, зарплаты и чистую прибыль за выбранный день или период.
      </>,
      <>
        Данные можно посмотреть по направлениям, способам оплаты и сотрудникам.{' '}
        <G>Зарплаты рассчитываются автоматически после закрытия заказов</G>.
      </>,
      <>
        Для работы с юрлицами система <G>формирует ведомость, акт и счет-фактуру в PDF</G>. В акте
        отображается <G>подпись водителя</G>, а <G>ежедневные отчеты сохраняются в архиве</G>.
      </>,
    ],
    image: '/landing/svodka.png',
    imageAlt: 'Сводка дня — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'analitika',
    emoji: '📈',
    title: 'Аналитика',
    titleAccent: 'Решения на основе реальных цифр',
    paragraphs: [
      <>
        Система показывает <G>выручку по дням, сотрудникам и услугам</G>, загрузку по периодам и эффективность команды.
      </>,
      <>
        <G>В Telegram-боте</G> доступны отчеты по сменам, записям, выручке, популярным услугам, загрузке, сотрудникам и скорости мойки.
      </>,
      <>
        В Mini App можно выбрать день, неделю, месяц или любой произвольный период.{' '}
        <G>Отчеты по юрлицам покажут, кто приезжал и на какую сумму</G>.
      </>,
      <>
        Историю автомобиля можно найти <G>по его номеру прямо в Telegram</G>. Готовые отчеты доступны в архиве и{' '}
        <G>выгружаются в PDF или DOCX</G>.
      </>,
    ],
    image: '/landing/analitika-2.png',
    imageAlt: 'Аналитика — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'sklad',
    emoji: '📦',
    title: 'Склад',
    titleAccent: 'Остатки и расходники без учета «на глаз»',
    paragraphs: [
      <>
        В складе видны категории товаров, приходы, продажи, чеки и текущие остатки. Когда товар/расхдник заканчивается,{' '}
        <G>карточка подсвечивается</G>.
      </>,
      <>
        <G>Продажа автоматически списывает товар со склада</G>, а история приходов сохраняет информацию по каждой позиции.
      </>,
      <>
        Так проще вовремя заметить и контролировать нехватку расходников и не искать нужный товар в последний момент.
      </>,
    ],
    image: '/landing/sklad.png',
    imageAlt: 'Склад — реальный интерфейс CRM',
    tone: 'slate',
  },
];

// ----------------------------------------------------------------------------
// SectionBlock: эмодзи + заголовок + параграфы (в рамке) + большой скриншот.
// ----------------------------------------------------------------------------
const SectionBlock: React.FC<{ s: Section }> = ({ s }) => {
  const bgClass = s.tone === 'white' ? 'bg-white' : 'bg-slate-50';
  const borderColor = 'border-slate-200';
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <section id={s.id} className={`py-16 lg:py-20 ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-6 mb-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3 leading-[1.05] text-slate-900">
          <span className="mr-2 text-4xl lg:text-5xl">{s.emoji}</span>
          {s.title}. <span style={{ color: ACCENT_GREEN_LIGHT }}>{s.titleAccent}</span>
        </h2>
      </div>

      {/* Картинка слева + текст в рамке справа на одной линии (на PC), стек на мобиле.
          max-w-7xl (1280px) + col-span-9 image + col-span-3 text —
          картинка использует почти всю ширину страницы. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 grid lg:grid-cols-12 gap-6 lg:gap-6 items-start">
        {/* Картинка слева (9/12 колонок на PC) — большая, на всю ширину */}
        <div className="lg:col-span-9">
          <button
            type="button"
            onClick={() => setZoom(s.image)}
            className={`group block w-full rounded-2xl overflow-hidden border ${borderColor} shadow-2xl shadow-slate-900/15 bg-white cursor-zoom-in transition-transform hover:scale-[1.005]`}
            aria-label={`Увеличить скриншот: ${s.imageAlt}`}
          >
            <img
              src={s.image}
              alt={s.imageAlt}
              className="w-full h-auto block"
              loading="lazy"
            />
          </button>
          <div className="mt-3 text-center text-xs text-slate-400">
            Кликните на скриншот, чтобы открыть на весь экран →
          </div>
        </div>

        {/* Текст в рамке справа (3/12 колонок на PC) — компактная sticky-колонка
            с max-h + overflow-y-auto: текст не превращается в портянку,
            если параграфов много — внутренний скролл в рамке. */}
        <div className="lg:col-span-3 lg:sticky lg:top-24">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm max-h-[640px] overflow-y-auto">
            {s.paragraphs.map((p, i) => (
              <p key={i} className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed mb-3 last:mb-0 flex items-start gap-2">
                <span
                  className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: ACCENT_ORANGE }}
                  aria-hidden="true"
                />
                <span className="flex-1">{p}</span>
              </p>
            ))}
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
// Landing
// ----------------------------------------------------------------------------

// Выпадающее меню разделов в шапке — клик вне закрывает.
const Nav: React.FC<{ onEnterDemo: () => void }> = ({ onEnterDemo }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 grid grid-cols-3 items-center gap-2">
        {/* Логотип (на мобиле только иконка, на PC — иконка + название) */}
        <div className="flex items-center gap-2.5 justify-self-start">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7BC74D] to-[#5BA634] flex items-center justify-center">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight hidden sm:block">
            <div className="font-bold text-[17px] tracking-tight">Автомойка CRM</div>
          </div>
        </div>

        {/* Обе кнопки (Разделы + Войти в демо) — СТРОГО по центру экрана */}
        <div className="flex items-center justify-center gap-3 col-start-2">
          {/* Выпадающее меню разделов */}
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-haspopup="menu"
              className="inline-flex items-center gap-2 h-10 px-3 sm:px-4 rounded-full bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <span>Разделы</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[300px] max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/15 py-2 z-30"
              >
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-xl flex-shrink-0">{s.emoji}</span>
                    <span className="flex-1 truncate">
                      <span className="font-semibold text-slate-900">{s.title}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {s.titleAccent}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Кнопка Войти в демо */}
          <Button
            onClick={onEnterDemo}
            className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-3 sm:px-5 h-10 gap-1.5 shadow-sm"
          >
            Войти в демо <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Пустой 3-й столбец — балансирует grid так, что центральная колонка ровно по центру */}
        <div aria-hidden="true" />
      </div>
    </nav>
  );
};

export const Landing: React.FC<LandingProps> = ({ onEnterDemo }) => {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased overflow-x-hidden">
      {/* NAV — только выпадающее меню разделов + кнопка Войти в демо */}
      <Nav onEnterDemo={onEnterDemo} />

      {/* HERO — текст из CRM_landing_texts.md «# Заголовок» */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 pt-16 pb-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
            Мойка и&nbsp;шиномонтаж.
            <br />
            <span className="text-[#7BC74D]">Без Excel.</span>
          </h1>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            CRM для управления всей точкой: записи, боксы, сотрудники, зарплаты, склад и&nbsp;прибыль — в одной системе. Восемь разделов, которые помогают работать быстрее и&nbsp;держать бизнес под контролем.
          </p>
          <div className="flex flex-wrap gap-3 mb-8 justify-center">
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
              Онлайн-запись в Telegram
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
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
      </section>

      {/* 8 секций по тексту из CRM_landing_texts.md */}
      {SECTIONS.map((s) => (
        <SectionBlock key={s.id} s={s} />
      ))}

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
              className="bg-white hover:bg-slate-50 text-[#5BA634] font-bold rounded-full px-10 h-16 text-lg shadow-lg gap-2"
            >
              Войти в демо <ArrowRight className="w-5 h-5" />
            </Button>
            <a
              href={TG_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-10 h-16 rounded-full bg-[#229ED9] hover:bg-[#1E8FC4] text-white font-bold text-lg shadow-lg transition-colors"
            >
              Открыть демо онлайн запись
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      {/* Блок Контакты (в рамке, виден и на PC, и на мобиле) */}
      <section className="py-10 bg-white">
        <div className="max-w-md mx-auto px-6">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 shadow-sm text-center">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4 leading-tight text-slate-900">
              Контакты для связи
            </h2>
            <div className="flex flex-col items-center gap-2.5">
              <a
                href="tel:+79930838101"
                className="inline-flex items-center gap-2.5 text-base text-slate-700 hover:text-[#5BA634] transition-colors"
              >
                <span
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-[#7BC74D]/10 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Phone className="w-4 h-4 text-[#5BA634]" />
                </span>
                <span className="font-medium">+7 993 083 81 01</span>
              </a>
              <a
                href="https://t.me/ivanov1331"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 text-base text-slate-700 hover:text-[#229ED9] transition-colors"
              >
                <span
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-[#229ED9]/10 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Send className="w-4 h-4 text-[#229ED9]" />
                </span>
                <span className="font-medium">@ivanov1331</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER — упрощённый: только логотип + центрированный копирайт */}
      <footer className="py-10 bg-slate-900 text-slate-400">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7BC74D] to-[#5BA634] flex items-center justify-center">
              <Droplets className="w-4 h-4 text-white" />
            </div>
            <div className="font-bold text-white">Автомойка CRM</div>
          </div>
          <div className="text-xs text-slate-500">
            © Автомойка CRM · demo-сборка
          </div>
        </div>
      </footer>
    </div>
  );
};
