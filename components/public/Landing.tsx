import React, { useState } from 'react';
import { Droplets, ArrowRight, Check, X } from 'lucide-react';
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
// 8 sections matching CRM_landing_texts.md (финальная версия).
// Каждая секция: номер + h2 заголовок + h2 подзаголовок + параграфы.
// Реальные скриншоты из /public/landing/.
// ============================================================================

type Section = {
  id: string;
  number: string;
  title: string;
  titleAccent: string;
  paragraphs: string[];
  image: string;
  imageAlt: string;
  tone: 'white' | 'slate';
};

const SECTIONS: Section[] = [
  {
    id: 'moyka',
    number: '1',
    title: 'Автомойка',
    titleAccent: 'Все боксы и заказы — перед глазами',
    paragraphs: [
      'Таймлайн в реальном времени показывает загрузку боксов, текущие заказы и время освобождения. Администратор записывает клиента за 30 секунд: телефон, автомобиль, услуги — система сама рассчитывает стоимость изходя из класса авто и ваше прайс листу.',
      'Заказы закрываются в один тап: оплата фиксируется, а зарплата мойщику пересчитывается автоматически. Можно работать одному или в паре с автоматическим делением доли 50/50.',
      'Для корпоративных клиентов предусмотрена запись автомобиля из автопарка и подпись водителя на экране — она попадает в акт.',
      'Записи с улицы, временное закрытие боксов, очередь мойщиков и защита от частых отмен помогают поддерживать порядок даже в загруженные смены.',
    ],
    image: '/landing/moyka.png',
    imageAlt: 'Таймлайн боксов автомойки — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'upravlenie-boksami',
    number: '2',
    title: 'Управление боксами',
    titleAccent: 'Бокс закрыт — записи под контролем',
    paragraphs: [
      'Если оборудование вышло из строя, начался ремонт или нужно закрыть бокс на обед, администратор может закрыть бокс на нужное время.',
      'Новые записи на закрытый бокс не попадут. Уже созданные заказы сохраняются.',
      'Все изменения сразу отображаются на таймлайне, поэтому команда видит актуальную загрузку без звонков и уточнений.',
    ],
    image: '/landing/blok-boksov.png',
    imageAlt: 'Управление боксами автомойки — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'shinomontazh',
    number: '3',
    title: 'Шиномонтаж',
    titleAccent: 'Отдельная запись для шиномонтажа',
    paragraphs: [
      'Мойка и шиномонтаж работают в разных потоках, поэтому записи не смешиваются. Клиент выбирает нужную услугу шиномонтажа по вашему прайс листу.',
      'Мастер видит свою очередь, а начисления формируются по факту выполненных услуг. Все настройки условий зарплаты персоналу настраиваются владельцем. История визитов помогает заранее связаться с клиентами перед началом сезона.',
    ],
    image: '/landing/shinomontazh.png',
    imageAlt: 'Таймлайн шиномонтажа — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'online-booking',
    number: '4',
    title: 'Онлайн-запись через Telegram',
    titleAccent: 'Клиенты записываются сами — круглосуточно',
    paragraphs: [
      'Telegram Mini App показывает свободные слоты на сегодня и на ближайшие 3 дня. Клиент выбирает время, автомобиль и услугу без звонка администратору.',
      'Бот сохранит автомобили и историю посещений. Новая запись сразу появляется на таймлайне — без бумажных журналов и переписок.',
      'Есть настраиваемая бонус система для клиента.',
    ],
    image: '/landing/online-booking.jpg',
    imageAlt: 'Онлайн-запись в Telegram — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'personal',
    number: '5',
    title: 'Персонал',
    titleAccent: 'Балансы и смены без ручного учета',
    paragraphs: [
      'В карточке каждого сотрудника хранятся контакты, ставка, баланс и статус смены. Сотрудник отмечает начало и окончание работы, а при работе в паре система автоматически делит долю чека.',
      'Авансы и выплаты фиксируются в один клик. В истории начислений видно, сколько сотрудник заработал и какие выплаты уже получил.',
      'Сотрудников можно добавлять, отключать и возвращать в список без потери истории.',
    ],
    image: '/landing/personal.png',
    imageAlt: 'Карточки сотрудников — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'svodka',
    number: '6',
    title: 'Сводка',
    titleAccent: 'Итоги дня — на одном экране',
    paragraphs: [
      'Сводка показывает выручку, расходы, зарплаты и чистую прибыль за выбранный день или период.',
      'Данные можно посмотреть по направлениям, способам оплаты и сотрудникам. Зарплаты рассчитываются автоматически после закрытия заказов.',
      'Для работы с юрлицами система формирует ведомость, акт и счет-фактуру в PDF. В акте отображается подпись водителя, а ежедневные отчеты сохраняются в архиве.',
    ],
    image: '/landing/svodka.png',
    imageAlt: 'Сводка дня — реальный интерфейс CRM',
    tone: 'slate',
  },
  {
    id: 'analitika',
    number: '7',
    title: 'Аналитика',
    titleAccent: 'Решения на основе реальных цифр',
    paragraphs: [
      'Система показывает выручку по дням, сотрудникам и услугам, загрузку по периодам и эффективность команды.',
      'В Telegram-боте доступны отчеты по сменам, записям, выручке, популярным услугам, загрузке, сотрудникам и скорости мойки.',
      'В Mini App можно выбрать день, неделю, месяц или любой произвольный период. Отчеты по юрлицам покажут, кто приезжал и на какую сумму.',
      'Историю автомобиля можно найти по его номеру прямо в Telegram. Готовые отчеты доступны в архиве и выгружаются в PDF или DOCX.',
    ],
    image: '/landing/analitika.png',
    imageAlt: 'Аналитика — реальный интерфейс CRM',
    tone: 'white',
  },
  {
    id: 'sklad',
    number: '8',
    title: 'Склад',
    titleAccent: 'Остатки и расходники без учета «на глаз»',
    paragraphs: [
      'В складе видны категории товаров, приходы, продажи, чеки и текущие остатки. Когда товар/расхдник заканчивается, карточка подсвечивается.',
      'Продажа автоматически списывает товар со склада, а история приходов сохраняет информацию по каждой позиции.',
      'Так проще вовремя заметить и контролировать нехватку расходников и не искать нужный товар в последний момент.',
    ],
    image: '/landing/sklad.png',
    imageAlt: 'Склад — реальный интерфейс CRM',
    tone: 'slate',
  },
];

// ----------------------------------------------------------------------------
// SectionBlock: номер + заголовок + параграфы + большой скриншот (с lightbox).
// ----------------------------------------------------------------------------
const SectionBlock: React.FC<{ s: Section }> = ({ s }) => {
  const bgClass = s.tone === 'white' ? 'bg-white' : 'bg-slate-50';
  const borderColor = 'border-slate-200';
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <section id={s.id} className={`py-16 lg:py-20 ${bgClass}`}>
      <div className="max-w-5xl mx-auto px-6 mb-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3 leading-[1.05] text-slate-900">
          <span className="mr-2">{s.number}.</span>
          {s.title}. <span className="text-[#7BC74D]">{s.titleAccent}</span>
        </h2>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 mb-8">
        <button
          type="button"
          onClick={() => setZoom(s.image)}
          className={`group block w-full max-w-[1100px] mx-auto rounded-2xl overflow-hidden border ${borderColor} shadow-2xl shadow-slate-900/15 bg-white cursor-zoom-in transition-transform hover:scale-[1.005]`}
          aria-label={`Увеличить скриншот: ${s.imageAlt}`}
        >
          <img
            src={s.image}
            alt={s.imageAlt}
            className="w-full h-auto block"
            loading="lazy"
          />
        </button>
        <div className="max-w-7xl mx-auto mt-3 text-center text-xs text-slate-400">
          Кликните на скриншот, чтобы открыть на весь экран →
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {s.paragraphs.map((p, i) => (
          <p key={i} className="text-base sm:text-lg text-slate-700 leading-relaxed mb-4 last:mb-0">
            {p}
          </p>
        ))}
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
export const Landing: React.FC<LandingProps> = ({ onEnterDemo }) => {
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
          <div className="hidden lg:flex items-center gap-5 text-sm text-slate-700">
            {SECTIONS.map((s) => (
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
              <div className="text-white font-semibold text-sm mb-3">Разделы 1–4</div>
              <div className="space-y-1.5 text-sm">
                {SECTIONS.slice(0, 4).map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="block hover:text-white transition-colors">
                    {s.number}. {s.title}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white font-semibold text-sm mb-3">Разделы 5–8</div>
              <div className="space-y-1.5 text-sm">
                {SECTIONS.slice(4).map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="block hover:text-white transition-colors">
                    {s.number}. {s.title}
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
            <div className="text-slate-500">8 разделов · 8 реальных скриншотов</div>
          </div>
        </div>
      </footer>
    </div>
  );
};
