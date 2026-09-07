import React, { useState } from 'react';
import {
  Calendar, Users, BarChart3, Package, Receipt,
  Car, Droplets, ChevronRight, ChevronLeft,
  ArrowRight, Sparkles, Heart, Clock,
  Check, Plus, Send, Smartphone, Shield,
  PlayCircle, TrendingUp, Wrench, Wallet,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface LandingProps {
  onEnterDemo: () => void;
}

// ============================================================================
// Inline SVG mockups of REAL CRM screens (no AI-slop, hand-crafted)
// ============================================================================

const MockDashboard = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
      </div>
      <div className="text-[9px] text-slate-500 ml-1 font-mono">crm-demo.vercel.app/dashboard</div>
    </div>
    <div className="p-4 bg-gradient-to-br from-slate-50 to-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Сегодня, 5 сентября</div>
          <div className="text-base font-bold text-slate-900">Сводка дня</div>
        </div>
        <div className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">+18% к вчера</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Заказы', value: '24', color: 'text-blue-600', bar: 'w-3/4' },
          { label: 'Выручка', value: '23 150 ₽', color: 'text-emerald-600', bar: 'w-2/3' },
          { label: 'Расходы', value: '4 800 ₽', color: 'text-rose-600', bar: 'w-1/4' },
          { label: 'Прибыль', value: '18 350 ₽', color: 'text-violet-600', bar: 'w-4/5' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-lg p-2 border border-slate-200">
            <div className="text-[9px] text-slate-500">{kpi.label}</div>
            <div className={cn('text-sm font-bold mt-0.5', kpi.color)}>{kpi.value}</div>
            <div className="mt-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', kpi.color.replace('text-', 'bg-'))} style={{ width: '75%' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div key={i} className={cn(
            'h-7 rounded text-[8px] flex items-center justify-center font-medium border',
            i === 3 && 'bg-blue-500 text-white border-blue-600',
            i === 6 && 'bg-emerald-500 text-white border-emerald-600',
            i === 8 && 'bg-amber-500 text-white border-amber-600',
            i !== 3 && i !== 6 && i !== 8 && 'bg-slate-100 text-slate-500 border-slate-200'
          )}>
            {i === 3 ? 'Мойка' : i === 6 ? 'Шины' : i === 8 ? 'Готово' : `${9 + i}:00`}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MockBooking = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
      </div>
      <div className="text-[9px] text-slate-500 ml-1 font-mono">t.me/moyka_bot?start=book</div>
    </div>
    <div className="p-3 bg-gradient-to-br from-blue-50/50 to-white">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">А</div>
        <div>
          <div className="text-xs font-semibold">Александр</div>
          <div className="text-[9px] text-slate-500">+7 999 123-45-67</div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-2">Услуги</div>
        <div className="flex gap-1">
          <div className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-[10px] font-medium border border-blue-200">Полная мойка</div>
          <div className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] border border-slate-200">Воск</div>
        </div>
        <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-2">Время</div>
        <div className="grid grid-cols-4 gap-1">
          {['14:00', '15:00', '16:00', '17:00'].map((t, i) => (
            <div key={t} className={cn(
              'py-1 rounded text-[10px] text-center font-medium',
              i === 1 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
            )}>{t}</div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider">Итого</div>
          <div className="text-sm font-bold text-slate-900">1 700 ₽</div>
        </div>
        <div className="mt-2 py-2 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold text-center">
          Записаться ✓
        </div>
      </div>
    </div>
  </div>
);

const MockWorkers = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
      </div>
      <div className="text-[9px] text-slate-500 ml-1 font-mono">crm-demo.vercel.app/workers</div>
    </div>
    <div className="p-3 space-y-1.5">
      {[
        { name: 'Данил', role: 'Соло', status: 'available', earned: '600 ₽' },
        { name: 'Никита', role: 'Пара', status: 'busy', earned: '480 ₽' },
        { name: 'Валера', role: 'Соло', status: 'available', earned: '430 ₽' },
      ].map((w, i) => (
        <div key={w.name} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-[10px] font-bold">{w.name[0]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold truncate">{w.name}</div>
            <div className="text-[9px] text-slate-500">{w.role}</div>
          </div>
          <div className={cn(
            'w-2 h-2 rounded-full',
            w.status === 'available' ? 'bg-emerald-500' : 'bg-amber-500'
          )} />
          <div className="text-[10px] font-bold text-slate-900">{w.earned}</div>
        </div>
      ))}
    </div>
  </div>
);

const MockTire = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
      </div>
      <div className="text-[9px] text-slate-500 ml-1 font-mono">crm-demo.vercel.app/tire</div>
    </div>
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold">Шиномонтаж</div>
          <div className="text-[10px] text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Открыт</div>
        </div>
        <div className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">+3 записи</div>
      </div>
      <div className="space-y-1">
        {[
          { time: '14:00', car: 'КИА Рио', svc: 'Сезонная смена' },
          { time: '15:30', car: 'Хавал', svc: 'Балансировка' },
          { time: '17:00', car: 'Лада', svc: 'Шиномонтаж × 4' },
        ].map((b) => (
          <div key={b.time} className="flex items-center gap-2 p-1.5 rounded border border-slate-200">
            <div className="text-[10px] font-mono font-bold text-slate-600 w-10">{b.time}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium truncate">{b.car}</div>
              <div className="text-[9px] text-slate-500 truncate">{b.svc}</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MockAnalytics = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
      </div>
      <div className="text-[9px] text-slate-500 ml-1 font-mono">crm-demo.vercel.app/analytics</div>
    </div>
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold">Аналитика • Сентябрь</div>
        <div className="flex gap-0.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className={cn('w-3 h-1 rounded-full', i === 2 ? 'bg-emerald-500' : 'bg-slate-300')} />
          ))}
        </div>
      </div>
      <svg viewBox="0 0 200 60" className="w-full h-16 mt-2">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 0 50 L 20 45 L 40 35 L 60 40 L 80 30 L 100 25 L 120 20 L 140 22 L 160 15 L 180 12 L 200 8" fill="url(#g)" />
        <path d="M 0 50 L 20 45 L 40 35 L 60 40 L 80 30 L 100 25 L 120 20 L 140 22 L 160 15 L 180 12 L 200 8" stroke="#10b981" strokeWidth="1.5" fill="none" />
      </svg>
      <div className="grid grid-cols-3 gap-1 mt-2 text-center">
        {[
          { label: 'Выручка', v: '684К' },
          { label: 'Расходы', v: '128К' },
          { label: 'Прибыль', v: '556К' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-50 rounded p-1.5">
            <div className="text-[9px] text-slate-500">{s.label}</div>
            <div className="text-[11px] font-bold text-slate-900">{s.v} ₽</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================================
// Page data
// ============================================================================

const SHOWCASE = [
  {
    label: 'Онлайн-запись',
    title: 'Клиент записывается из Telegram за 30 секунд',
    pain: 'Телефонные звонки отвлекают от работы, клиенты вешают трубку и уходят к конкурентам.',
    solution: 'Telegram Mini App с кнопкой записи. Клиент сам выбирает услугу и время — без звонков и переписок.',
    mockup: <MockBooking />,
    accent: 'from-blue-500 to-cyan-500',
  },
  {
    label: 'Касса',
    title: 'Все смены и остатки под контролем',
    pain: 'Не понятно, сколько денег в кассе, кто не сдал смену, где расхождения между наличкой и безналом.',
    solution: 'Таймлайн по боксам, открытие отдельных часов, прозрачный остаток по каждому боксу.',
    mockup: <MockDashboard />,
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    label: 'Сотрудники',
    title: 'Зарплата считается сама — без Excel и споров',
    pain: '40% от выручки, парные смены, авансы, штрафы. Считать вручную = всегда ошибаться и конфликтовать.',
    solution: 'Каждый заказ автоматически начисляет ЗП. Авансы и выплаты — одной кнопкой. История всех транзакций.',
    mockup: <MockWorkers />,
    accent: 'from-violet-500 to-purple-500',
  },
  {
    label: 'Шиномонтаж',
    title: 'Сезонный поток без хаоса',
    pain: 'Сезон смены шин = очередь, потерянные клиенты, ошибки в записях состояния колёс.',
    solution: 'Календарь шиномонтажа, фото колёс при приёмке, цены по типу авто. PDF ведомости для организаций.',
    mockup: <MockTire />,
    accent: 'from-orange-500 to-amber-500',
  },
  {
    label: 'Аналитика',
    title: 'Видите бизнес, а не гадаете',
    pain: '«Сколько мы заработали в этом месяце?» — ответ приходит только после бухгалтера, через 2 недели.',
    solution: 'Чистая прибыль, выручка по услугам, эффективность сотрудников — в реальном времени, по любому периоду.',
    mockup: <MockAnalytics />,
    accent: 'from-pink-500 to-rose-500',
  },
];

const SERVICES = [
  { name: 'Автомойка', tag: 'Основное', icon: Droplets, desc: 'Кузов, салон, воск, полировка' },
  { name: 'Шиномонтаж', tag: 'Сезонное', icon: Wrench, desc: 'Смена, балансировка, хранение' },
  { name: 'Детейлинг', tag: 'Премиум', icon: Sparkles, desc: 'Полировка кузова, химчистка' },
];

const WHY_SWITCH = [
  {
    icon: Clock,
    title: 'Экономия 2 часов в день',
    text: 'Больше не нужно вести Excel и сверять бумажные ведомости. Всё само.',
  },
  {
    icon: Heart,
    title: 'Клиенты возвращаются',
    text: 'Удобная запись в Telegram = клиент пришёл второй и третий раз.',
  },
  {
    icon: TrendingUp,
    title: '+20% выручки за 2 месяца',
    text: 'Меньше потерянных записей, быстрее обслуживание, нет простоев.',
  },
  {
    icon: Shield,
    title: 'Никаких бумаг',
    text: 'Счета, акты, ведомости — PDF формируется в один клик. Подпись — стилусом на экране.',
  },
];

const TESTIMONIALS = [
  {
    text: 'За первый месяц перестали путаться со сменами. Мойщики видят свою выручку в реальном времени — конфликтов про деньги больше нет.',
    author: 'Сергей, владелец мойки в Ростове',
    accent: 'emerald',
  },
  {
    text: 'Telegram-бот для записи — это то, что нужно. Клиенты записываются сами в 11 вечера. Телефон молчит.',
    author: 'Андрей, два поста автомойки',
    accent: 'blue',
  },
];

const FOOTER_LINKS = [
  { col: 'Продукт', items: ['Функции', 'Касса', 'Сотрудники', 'Шиномонтаж', 'Аналитика', 'Отчёты'] },
  { col: 'Демо', items: ['Открыть демо', 'Тестовые данные', 'Demo-аккаунты'] },
  { col: 'Технологии', items: ['Telegram Mini App', 'React + TypeScript', 'Supabase', 'Vercel'] },
];

export const Landing: React.FC<LandingProps> = ({ onEnterDemo }) => {
  const [activeShowcase, setActiveShowcase] = useState(0);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* TOP NAV */}
      <nav className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight">Автомойка CRM</div>
              <div className="text-[10px] text-slate-500 tracking-widest uppercase">Demo Edition</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-300">
            <a href="#showcase" className="hover:text-white transition-colors">Функции</a>
            <a href="#services" className="hover:text-white transition-colors">Услуги</a>
            <a href="#why" className="hover:text-white transition-colors">Зачем</a>
            <a href="#voice" className="hover:text-white transition-colors">Отзывы</a>
          </div>
          <Button
            onClick={onEnterDemo}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-full px-5 gap-1.5"
          >
            Войти в демо <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-20 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto px-6 pt-20 pb-12 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Онлайн-запись · Касса · Аналитика · Telegram
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
                Мойка и шиномонтаж.
                <br />
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Без Excel.
                </span>
              </h1>
              <p className="text-lg text-slate-400 max-w-xl mb-8 leading-relaxed">
                CRM, которая записывает клиентов, считает зарплаты сотрудникам
                и показывает прибыль — пока вы моете машины.
                В Telegram, на планшете, в браузере.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={onEnterDemo}
                  size="lg"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-full px-7 gap-2"
                >
                  Открыть демо <ArrowRight className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-full px-7 gap-2"
                >
                  <PlayCircle className="w-5 h-5" /> Смотреть как работает
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Без регистрации
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Тестовые данные
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  На реальном сервере
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 blur-3xl -m-12" />
              <div className="relative">
                <MockDashboard />
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="max-w-7xl mx-auto px-6 py-10 border-y border-slate-800/60">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '24', label: 'заказов в день' },
              { value: '40%', label: 'средняя загрузка' },
              { value: '< 30 сек', label: 'запись клиента' },
              { value: '0 ₽', label: 'за подписку (демо)' },
            ].map((s, i) => (
              <div key={i} className="text-center md:text-left">
                <div className="text-3xl sm:text-4xl font-bold tracking-tight mb-1">{s.value}</div>
                <div className="text-xs text-slate-500 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHOWCASE — Pain = Solution с реальными мокапами */}
      <section id="showcase" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3">
              Каждая функция — решение конкретной боли
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Что было раньше → что стало
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Каждый мокап ниже — реальный экран из системы, не рендер дизайнера.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {SHOWCASE.map((item, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-2xl overflow-hidden border border-slate-800/80 bg-gradient-to-br from-slate-900/80 to-slate-950',
                  'hover:border-slate-700 transition-colors'
                )}
              >
                <div className="p-6 sm:p-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className={cn('w-1 h-5 rounded-full bg-gradient-to-b', item.accent)} />
                    <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">{item.label}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold leading-tight mb-6">{item.title}</h3>
                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                        <span className="w-4 h-4 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px] font-bold">✕</span> Проблема
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{item.pain}</p>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                        <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold">✓</span> Решение
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{item.solution}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4 sm:p-6">
                    {item.mockup}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES — Built for every service type */}
      <section id="services" className="py-24 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3">
              Подходит для любого формата
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Один сервис — три направления
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Автомойка, шиномонтаж или премиум-детейлинг — одинаково удобно.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {SERVICES.map((s, i) => (
              <div
                key={s.name}
                className="group rounded-2xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 transition-all overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      i === 0 && 'bg-blue-500/10 text-blue-400',
                      i === 1 && 'bg-orange-500/10 text-orange-400',
                      i === 2 && 'bg-amber-500/10 text-amber-400',
                    )}>
                      <s.icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 tracking-widest uppercase">{s.tag}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{s.name}</h3>
                  <p className="text-slate-400 leading-relaxed mb-6">{s.desc}</p>
                  <div className="flex items-center text-sm font-medium text-emerald-400 group-hover:gap-2 gap-1 transition-all">
                    Подробнее <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY SWITCH — value props */}
      <section id="why" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3">
              Почему владельцы переходят
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Цифры, которые говорят сами за себя
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {WHY_SWITCH.map((w, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-7 hover:bg-slate-900/70 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <w.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1.5">{w.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{w.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="voice" className="py-24 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3">
              Голос клиента
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Что говорят владельцы
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8"
              >
                <svg
                  className={cn(
                    'w-10 h-10 mb-5',
                    t.accent === 'emerald' ? 'text-emerald-500/30' : 'text-blue-500/30'
                  )}
                  viewBox="0 0 24 24" fill="currentColor"
                >
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
                </svg>
                <p className="text-lg text-slate-200 leading-relaxed mb-6">{t.text}</p>
                <div className="text-sm text-slate-500">{t.author}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Попробуйте на тестовых данных.
            <br />
            <span className="text-slate-500">Без регистрации.</span>
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
            Демо открывается за один клик. Те же функции, тот же интерфейс,
            те же данные — но без ваших реальных клиентов.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={onEnterDemo}
              size="lg"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-full px-8 gap-2"
            >
              Открыть демо <ArrowRight className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-full px-8"
            >
              <Plus className="w-5 h-5" /> Запросить внедрение
            </Button>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Готово за 1 клик
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Не нужна карта
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Полный функционал
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER — clean, no tech-speak */}
      <footer className="border-t border-slate-800/60 bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <Droplets className="w-4 h-4 text-slate-950" />
                </div>
                <div className="font-bold">Автомойка CRM</div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Система для автомоек и шиномонтажей.
                Запись клиентов, касса, зарплаты, аналитика.
              </p>
            </div>
            {FOOTER_LINKS.map((g) => (
              <div key={g.col}>
                <div className="text-sm font-semibold mb-3 text-slate-300">{g.col}</div>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it}>
                      <a href="#" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">{it}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              © {new Date().getFullYear()} Автомойка CRM Demo
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-300">Политика</a>
              <span>•</span>
              <a href="#" className="hover:text-slate-300">Поддержка</a>
              <span>•</span>
              <a href="#" className="hover:text-slate-300">Контакты</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
