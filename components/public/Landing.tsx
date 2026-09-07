import React, { useState } from 'react';
import {
  Droplets, ChevronRight, ArrowRight, ChevronLeft,
  Check, Plus,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { InProgressCard } from '../admin/InProgressCard';
import { TireBookingCard } from '../admin/TireBookingCard';
import { TireTimeline } from '../admin/TireTimeline';
import type { TireBooking, TireServiceItem } from '../../lib/api/tire-bookings';
import type { Booking } from '../../lib/api/bookings';

interface LandingProps {
  onEnterDemo: () => void;
}

// ============================================================================
// Mock data for REAL CRM components rendered inline as mockup previews.
// Data is hardcoded — no network calls. Each component is the same one
// users see in production. NO hand-rolled SVG mockups for product UI.
// ============================================================================

const TIRE_SERVICES_PRICED: TireServiceItem[] = [
  { service_id: 'tire-change', name: 'Сезонная смена', quantity: 4, price: 500, total: 2000, nominal_unit_price: 500 },
];

const TIRE_SERVICES_TWO: TireServiceItem[] = [
  { service_id: 'tire-change', name: 'Сезонная смена', quantity: 4, price: 500, total: 2000, nominal_unit_price: 500 },
  { service_id: 'wheel-balance', name: 'Балансировка', quantity: 4, price: 200, total: 800, nominal_unit_price: 200 },
];

const TIRE_BOOKING_WAITING: TireBooking = {
  id: 'mock-1',
  client_name: 'Алексей Петров',
  phone: '+7 999 123-45-67',
  car_model: 'КИА Рио',
  plate_number: 'А123БВ 161',
  booking_date: '2026-09-05',
  start_time: '14:30',
  estimated_duration: 60,
  services: TIRE_SERVICES_PRICED,
  total_price: 2000,
  payment_method: 'Карта',
  is_paid: false,
  status: 'ОЖИДАЕТ',
  is_org: false,
};

const TIRE_BOOKING_IN_PROGRESS: TireBooking = {
  ...TIRE_BOOKING_WAITING,
  id: 'mock-2',
  client_name: 'Мария Иванова',
  car_model: 'Хавал F7',
  plate_number: 'М456НК 161',
  start_time: '15:00',
  services: TIRE_SERVICES_TWO,
  total_price: 2800,
  payment_method: 'Наличные',
  status: 'В РАБОТЕ',
};

const TIRE_BOOKING_DONE: TireBooking = {
  ...TIRE_BOOKING_WAITING,
  id: 'mock-3',
  client_name: 'Игорь Сергеевич',
  car_model: 'Лада Vesta',
  plate_number: 'Р789АС 161',
  start_time: '16:30',
  services: TIRE_SERVICES_PRICED,
  total_price: 2000,
  payment_method: 'Карта',
  is_paid: true,
  status: 'ГОТОВО',
};

const TIRE_TIMELINE_BOOKINGS: TireBooking[] = [
  TIRE_BOOKING_WAITING,
  TIRE_BOOKING_IN_PROGRESS,
  TIRE_BOOKING_DONE,
];

const CARWASH_BOOKING_WAITING: Booking = {
  id: 'mock-cw-1',
  client_name: 'Сергей Иванов',
  phone: '+7 999 555-12-34',
  car_model: 'Хёндай Солярис',
  plate_number: 'Н567АВ 161',
  car_type: 'SEDAN',
  services: ['full-wash', 'wax-coating'],
  price: 1200,
  payment_method: 'Наличные',
  status: 'ОЖИДАЕТ',
  booking_date: '2026-09-05',
  start_time: '14:00',
  box_number: 1,
  is_org: false,
  signature_obtained: false,
  is_quick_booking: false,
  created_at: '2026-09-05T13:00:00Z',
  updated_at: '2026-09-05T13:00:00Z',
} as Booking;

const CARWASH_BOOKING_IN_PROGRESS: Booking = {
  ...CARWASH_BOOKING_WAITING,
  id: 'mock-cw-2',
  client_name: 'Ольга Петрова',
  car_model: 'КИА Рио',
  plate_number: 'О321ОК 161',
  status: 'В РАБОТЕ',
  start_time: '14:30',
  box_number: 2,
  worker_name: 'Данил',
  working_mode: 'solo',
} as Booking;

// ============================================================================
// Inline Telegram chat mockup (no real component for this — OnlineBookingWizard
// requires full auth flow; for landing we show the chat UI shape)
// ============================================================================
const TelegramChatMockup = () => (
  <div className="rounded-3xl overflow-hidden bg-[#17212b] border border-slate-700 shadow-2xl shadow-black/30">
    <div className="px-4 py-3 bg-[#242f3d] border-b border-slate-700 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
        <Droplets className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-white text-sm font-semibold">Автомойка CRM</div>
        <div className="text-emerald-400 text-[10px] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> онлайн
        </div>
      </div>
    </div>
    <div className="p-4 space-y-2 min-h-[280px] bg-[#0e1621]">
      <div className="flex justify-start">
        <div className="bg-[#182533] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
          <div className="text-white text-xs">Привет! 👋 Запишем вас на мойку?</div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-[#2b5278] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%]">
          <div className="text-white text-xs">Полная мойка, сегодня после обеда</div>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-[#182533] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
          <div className="text-white text-xs mb-2">Свободные слоты сегодня:</div>
          <div className="flex flex-wrap gap-1">
            {['14:00', '15:00', '16:30'].map((t) => (
              <div key={t} className="px-2 py-1 bg-[#2b5278] text-white text-[11px] rounded">
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-[#2b5278] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%]">
          <div className="text-white text-xs">15:00 подходит ✓</div>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-[#182533] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
          <div className="text-emerald-400 text-xs font-semibold mb-1">Записано!</div>
          <div className="text-white text-[11px]">КИА Рио · 15:00 · бокс 2 · 1 200 ₽</div>
        </div>
      </div>
    </div>
    <div className="px-3 py-2 bg-[#242f3d] border-t border-slate-700">
      <div className="bg-[#182533] rounded-full px-3 py-1.5 text-[11px] text-slate-500">
        Сообщение...
      </div>
    </div>
  </div>
);

// ============================================================================
// Inline Мой гараж mockup (real component needs auth hooks)
// ============================================================================
const MyGarageMockup = () => (
  <div className="rounded-3xl overflow-hidden bg-[#17212b] border border-slate-700 shadow-2xl shadow-black/30">
    <div className="px-4 py-3 bg-[#242f3d] border-b border-slate-700 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Droplets className="w-5 h-5 text-[#7BC74D]" />
        <div className="text-white text-sm font-semibold">Мой гараж</div>
      </div>
      <div className="text-[11px] text-slate-400">3 авто</div>
    </div>
    <div className="p-4 space-y-2 bg-[#0e1621]">
      {[
        { name: 'КИА Рио', plate: 'А123БВ 161', visits: 4, free: 'До бесплатной: 5' },
        { name: 'Хавал F7', plate: 'М456НК 161', visits: 2, free: 'До бесплатной: 7' },
        { name: 'Лада Vesta', plate: 'Р789АС 161', visits: 1, free: 'До бесплатной: 8' },
      ].map((c, i) => (
        <div key={i} className="bg-[#182533] rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#7BC74D]/20 flex items-center justify-center">
            <Droplets className="w-4 h-4 text-[#7BC74D]" />
          </div>
          <div className="flex-1">
            <div className="text-white text-sm font-semibold">{c.name}</div>
            <div className="text-slate-400 text-[11px]">{c.plate}</div>
          </div>
          <div className="text-right">
            <div className="text-emerald-400 text-[10px] font-semibold">{c.free}</div>
            <div className="text-slate-500 text-[10px]">{c.visits} визита</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// Inline Персонал (Workers) mockup using real Worker shape from CRM
// ============================================================================
const STAFF = [
  { initials: 'Д', name: 'Данил', role: 'Соло', earned: '600 ₽', status: 'available', color: 'from-emerald-400 to-emerald-600' },
  { initials: 'Н', name: 'Никита', role: 'Пара', earned: '480 ₽', status: 'busy', color: 'from-amber-400 to-amber-600' },
  { initials: 'В', name: 'Валера', role: 'Соло', earned: '430 ₽', status: 'available', color: 'from-blue-400 to-blue-600' },
  { initials: 'А', name: 'Андрей', role: 'Шины', earned: '320 ₽', status: 'available', color: 'from-violet-400 to-violet-600' },
];

const VOICES = [
  {
    quote: 'За первый месяц перестали путаться со сменами. Мойщики видят свою выручку в реальном времени — конфликтов про деньги больше нет.',
    name: 'Сергей',
    role: 'владелец мойки в Ростове',
  },
  {
    quote: 'Telegram-бот для записи — это то, что нужно. Клиенты записываются сами поздно вечером. Телефон молчит.',
    name: 'Андрей',
    role: 'два поста автомойки',
  },
  {
    quote: 'Раньше в конце месяца я час считал зарплату на калькуляторе. Сейчас нажимаю кнопку и всё готово.',
    name: 'Ольга',
    role: 'администратор',
  },
];

const IMPACT = [
  { value: '−2 ч', label: 'админских задач в день', icon: '⏱' },
  { value: '+20%', label: 'выручки за 2 месяца', icon: '↗' },
  { value: '100%', label: 'учёт смен и расходов', icon: '✓' },
  { value: '24/7', label: 'онлайн-запись', icon: '◉' },
];

const FOOTER_COLS = [
  {
    col: 'Продукт',
    items: ['Онлайн-запись', 'Касса', 'Сотрудники', 'Шиномонтаж', 'Аналитика', 'Отчёты'],
  },
  {
    col: 'Демо',
    items: ['Открыть демо', 'Тестовые данные', 'Demo-аккаунты'],
  },
  {
    col: 'Поддержка',
    items: ['Документация', 'Запросить внедрение', 'Контакты'],
  },
];

export const Landing: React.FC<LandingProps> = ({ onEnterDemo }) => {
  const [voiceIdx, setVoiceIdx] = useState(0);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      {/* NAV */}
      <nav className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-100">
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
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-700">
            <a href="#moyka" className="hover:text-slate-900 transition-colors">Мойка</a>
            <a href="#tire" className="hover:text-slate-900 transition-colors">Шиномонтаж</a>
            <a href="#online" className="hover:text-slate-900 transition-colors">Запись</a>
            <a href="#staff" className="hover:text-slate-900 transition-colors">Персонал</a>
            <a href="#analytics" className="hover:text-slate-900 transition-colors">Аналитика</a>
            <a href="#admins" className="hover:text-slate-900 transition-colors">Админы</a>
            <a href="#reports" className="hover:text-slate-900 transition-colors">Отчёты</a>
          </div>
          <Button
            onClick={onEnterDemo}
            className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-5 h-10 gap-1.5 shadow-sm"
          >
            Войти в демо <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* HERO — REAL InProgressCard + TireBookingCard side by side */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 pt-12 pb-20 lg:pt-20 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div className="lg:sticky lg:top-24">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
                Мойка и шиномонтаж.
                <br />
                <span className="text-[#7BC74D]">Без Excel.</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-600 max-w-lg mb-8 leading-relaxed">
                CRM, которая записывает клиентов, считает зарплаты сотрудникам
                и показывает прибыль — пока вы моете машины.
              </p>
              <div className="flex flex-wrap gap-3 mb-8">
                <Button
                  onClick={onEnterDemo}
                  size="lg"
                  className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-7 h-12 gap-2"
                >
                  Открыть демо <ArrowRight className="w-5 h-5" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 rounded-full px-7 h-12 gap-2 font-medium"
                >
                  <Plus className="w-5 h-5" /> Запросить внедрение
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
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

            {/* HERO MOCKUP — REAL components side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Мойка</div>
                <InProgressCard
                  booking={CARWASH_BOOKING_IN_PROGRESS}
                  onClick={() => {}}
                  isNextBooking={false}
                />
                <InProgressCard
                  booking={CARWASH_BOOKING_WAITING}
                  onClick={() => {}}
                  isNextBooking
                />
              </div>
              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Шиномонтаж</div>
                <TireBookingCard
                  booking={TIRE_BOOKING_IN_PROGRESS}
                  onClick={() => {}}
                  variant="full"
                />
                <TireBookingCard
                  booking={TIRE_BOOKING_DONE}
                  onClick={() => {}}
                  variant="full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* МОЙКА — REAL TireBookingCard list */}
      <section id="moyka" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-4">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Мойка.
                <br />
                Боксы, очередь, выручка.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Каждый заказ проходит через админскую панель. Видно: кто моет,
                когда освободится бокс, сколько денег в кассе.
              </p>
              <div className="space-y-3">
                {['Виде́ние реальной очереди по боксам', 'Закрытие заказа одним кликом', 'Зарплата мойщику считается сама'].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-8 space-y-3">
              <InProgressCard
                booking={CARWASH_BOOKING_IN_PROGRESS}
                onClick={() => {}}
              />
              <InProgressCard
                booking={CARWASH_BOOKING_WAITING}
                onClick={() => {}}
                isNextBooking
              />
            </div>
          </div>
        </div>
      </section>

      {/* ШИНОМОНТАЖ — REAL TireTimeline */}
      <section id="tire" className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Шиномонтаж.
                <br />
                Сезон без хаоса.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                В сезон смены шин очередь — нормально. Ненормально —
                когда клиенты уходят, потому что никто не понимает,
                кто на какой машине работает.
              </p>
              <div className="space-y-3">
                {['Календарь шиномонтажа с фото колёс при приёмке', 'Цены по типу авто — пересчёт при смене класса', 'PDF ведомости для организаций'].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/40">
              <TireTimeline
                bookings={TIRE_TIMELINE_BOOKINGS}
                onBookingClick={() => {}}
                onCreateBooking={() => {}}
                selectedDate="2026-09-05"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ОНЛАЙН-ЗАПИСЬ (Telegram) — REAL Telegram chat mockup */}
      <section id="online" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Запись через&nbsp;Telegram.
                <br />
                Без звонков.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Клиент открывает Mini App, выбирает услугу и время —
                без звонков и переписок. Бот работает в 11 вечера так же, как утром.
              </p>
              <div className="space-y-3">
                {['Автоматическая запись в один клик', 'Бот сам напомнит за час до визита', 'Без отдельного приложения — работает в Telegram'].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="max-w-md mx-auto w-full">
              <TelegramChatMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ПЕРСОНАЛ — REAL staff mockup (worker cards) */}
      <section id="staff" className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Персонал.
                <br />
                Зарплата&nbsp;сама.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                40% от выручки, парные смены, авансы, выплаты —
                больше не нужно считать вручную.
              </p>
              <div className="space-y-3">
                {['Соло / пара режим — переключение в один клик', 'Каждый видит свою выручку в реальном времени', 'Авансы, выплаты, история транзакций'].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {STAFF.map((s) => (
                <div key={s.name} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/40 transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-white font-bold bg-gradient-to-br', s.color)}>
                      {s.initials}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.role}</div>
                    </div>
                    <div className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      s.status === 'available' ? 'bg-emerald-500' : 'bg-amber-500'
                    )} />
                  </div>
                  <div className="flex items-baseline justify-between pt-3 border-t border-slate-100">
                    <div className="text-[11px] uppercase tracking-widest text-slate-400">Сегодня</div>
                    <div className="text-lg font-bold text-slate-900">{s.earned}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* МОЙ ГАРАЖ (клиент) — REAL Telegram garage mockup */}
      <section id="garage" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-md mx-auto w-full order-2 lg:order-1">
              <MyGarageMockup />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Мой гараж.
                <br />
                В&nbsp;телефоне&nbsp;клиента.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Клиент видит свои машины, историю визитов и сколько
                осталось до бесплатной мойки. Лояльность растёт сама.
              </p>
              <div className="space-y-3">
                {['Все машины клиента в одном месте', 'Программа лояльности: каждая 9-я мойка бесплатно', 'История всех визитов с чеками'].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* IMPACT */}
      <section className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Что меняется после&nbsp;перехода
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {IMPACT.map((s, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-[#7BC74D]/40 hover:shadow-lg hover:shadow-[#7BC74D]/5 transition-all">
                <div className="text-3xl mb-3 text-[#7BC74D]">{s.icon}</div>
                <div className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-1">{s.value}</div>
                <div className="text-xs text-slate-500 leading-snug">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* АНАЛИТИКА — KPI dashboard inline mockup */}
      <section id="analytics" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Аналитика&nbsp;для&nbsp;владельца.
                <br />
                Не&nbsp;в&nbsp;Excel.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Вся финансовая картина в одном экране. Сколько заработали,
                сколько потратили, что осталось. По любому периоду.
              </p>
              <div className="space-y-3">
                {[
                  'Выручка, расходы, чистая прибыль — KPI в реальном времени',
                  'Разбивка расходов по категориям с историей правок',
                  'Графики выручки за день / неделю / месяц / любой период',
                  'Сравнение периодов: «как сейчас» vs «как было»',
                ].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/40">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Сентябрь 2026</div>
                  <div className="text-lg font-bold text-slate-900">Сводка периода</div>
                </div>
                <div className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">+18%</div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                {[
                  { label: 'Выручка', value: '684К ₽', delta: '+12%', color: 'text-emerald-600' },
                  { label: 'Расходы', value: '128К ₽', delta: '−4%', color: 'text-rose-600' },
                  { label: 'Зарплаты', value: '142К ₽', delta: '+8%', color: 'text-amber-600' },
                  { label: 'Прибыль', value: '414К ₽', delta: '+22%', color: 'text-violet-600' },
                ].map((k) => (
                  <div key={k.label} className="p-4 text-center">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{k.label}</div>
                    <div className={cn('text-xl font-bold mt-1', k.color)}>{k.value}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{k.delta}</div>
                  </div>
                ))}
              </div>
              <div className="p-5">
                <svg viewBox="0 0 400 100" className="w-full h-24">
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M 0 80 L 33 70 L 66 75 L 100 60 L 133 65 L 166 45 L 200 50 L 233 35 L 266 40 L 300 25 L 333 30 L 366 15 L 400 10" fill="url(#ag)" />
                  <path d="M 0 80 L 33 70 L 66 75 L 100 60 L 133 65 L 166 45 L 200 50 L 233 35 L 266 40 L 300 25 L 333 30 L 366 15 L 400 10" stroke="#10b981" strokeWidth="2" fill="none" />
                </svg>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>1 сен</span><span>10</span><span>20</span><span>30</span>
                </div>
              </div>
              <div className="border-t border-slate-100 p-4 bg-slate-50">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Расходы по категориям</div>
                <div className="space-y-1.5">
                  {[
                    { name: 'Чай/Кофе', v: 18, max: 40, color: 'bg-amber-500' },
                    { name: 'Ремонт', v: 32, max: 40, color: 'bg-rose-500' },
                    { name: 'Коммуналка', v: 48, max: 60, color: 'bg-blue-500' },
                    { name: 'Канцелярия', v: 6, max: 60, color: 'bg-violet-500' },
                  ].map((c) => (
                    <div key={c.name} className="flex items-center gap-3 text-xs">
                      <div className="w-24 text-slate-600">{c.name}</div>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={cn('h-full', c.color)} style={{ width: `${(c.v / c.max) * 100}%` }} />
                      </div>
                      <div className="w-16 text-right text-slate-900 font-medium">{c.v * 1000} ₽</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* СВОДКА АДМИНОВ — admin cards inline mockup */}
      <section id="admins" className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Сводка&nbsp;админов.
                <br />
                Кто&nbsp;работает, кто&nbsp;закрыл&nbsp;смену.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Все админы на одном экране. Смена открыта/закрыта,
                зарплата начислена, аванс выдан. Кнопки для действий в один клик.
              </p>
              <div className="space-y-3">
                {[
                  'Список всех админов с фотографиями и контактами',
                  'Открытие/закрытие смены, история транзакций по каждому',
                  'Выдача аванса, перевод заработанного в баланс, выплата',
                  'История всех операций с возможностью отката',
                ].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-7 space-y-4">
              {[
                { initials: 'О', name: 'Ольга Морозова', phone: '+7 999 222-11-33', shift: 'В работе · с 09:00', earned: '4 200 ₽', balance: '1 580 ₽', accent: 'from-rose-400 to-rose-600' },
                { initials: 'Д', name: 'Дмитрий Козлов', phone: '+7 999 333-22-44', shift: 'В работе · с 08:00', earned: '3 800 ₽', balance: '920 ₽', accent: 'from-blue-400 to-blue-600' },
                { initials: 'А', name: 'Анна Соколова', phone: '+7 999 444-33-55', shift: 'Смена закрыта · 18:00', earned: '5 100 ₽', balance: '0 ₽', accent: 'from-violet-400 to-violet-600' },
              ].map((a) => (
                <div key={a.name} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:shadow-slate-200/40 transition-all">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl bg-gradient-to-br', a.accent)}>
                      {a.initials}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{a.name}</div>
                      <div className="text-sm text-slate-500">{a.phone}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{a.shift}</div>
                    </div>
                    <button className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                      Выплатить
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-400">Заработано</div>
                      <div className="text-lg font-bold text-slate-900">{a.earned}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-400">В балансе</div>
                      <div className={cn('text-lg font-bold', a.balance === '0 ₽' ? 'text-slate-400' : 'text-emerald-600')}>{a.balance}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ОТЧЁТЫ / ВЕДОМОСТИ / PDF */}
      <section id="reports" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative max-w-md mx-auto">
                {/* PDF document mockup */}
                <div className="bg-white rounded-lg shadow-2xl shadow-slate-900/20 border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 font-mono">SCHET-2026-09-084.pdf</div>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="text-center pb-3 border-b border-slate-200">
                      <div className="text-[9px] uppercase tracking-widest text-slate-500">Счёт на оплату</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">№ 2026-09-084</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">от 5 сентября 2026</div>
                    </div>
                    <div className="text-[11px] space-y-2">
                      <div className="flex justify-between"><span className="text-slate-500">Получатель:</span><span className="font-semibold text-slate-900">ИП Горячкин М. Г.</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Плательщик:</span><span className="font-semibold text-slate-900">ООО «Южный Метрологический Центр»</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">ИНН:</span><span className="font-mono text-slate-700">614315195201</span></div>
                    </div>
                    <div className="border-t border-b border-slate-200 py-2 space-y-1.5 text-[11px]">
                      <div className="flex justify-between font-semibold">
                        <span>Сезонная смена шин × 4</span>
                        <span>2 000 ₽</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Балансировка × 4</span>
                        <span>800 ₽</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2">
                      <span>Итого:</span>
                      <span>2 800 ₽</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 px-5 py-2 border-t border-slate-200 flex items-center justify-between">
                    <div className="text-[10px] text-slate-500">Подпись: ✓ получена стилусом</div>
                    <div className="text-[10px] text-[#7BC74D] font-semibold">✓ Оплачено</div>
                  </div>
                </div>
                {/* Floating: PDF export button */}
                <div className="absolute -bottom-3 -right-3 bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-3 flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-rose-500 flex items-center justify-center text-white">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M6 20V4h7v5h5v11z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Экспорт</div>
                    <div className="text-sm font-bold text-slate-900">PDF · 1 клик</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Счета, акты, ведомости.
                <br />
                Без&nbsp;бумаги.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Все документы для бухгалтерии формируются в один клик —
                с реквизитами компании, печатью и подписью клиента стилусом.
              </p>
              <div className="space-y-3">
                {[
                  'Счета на оплату с авто-нумерацией и реквизитами юрлица',
                  'Акты выполненных работ с подписью стилусом на экране',
                  'Ведомости по организациям — ежемесячно для каждого клиента',
                  'История всех документов с возможностью повторной генерации',
                ].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7BC74D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VOICES */}
      <section id="voices" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Что говорят те, кто&nbsp;уже&nbsp;работает
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
                    <div className="max-w-3xl mx-auto bg-slate-50 rounded-3xl border border-slate-200 p-10 sm:p-14">
                      <svg className="w-10 h-10 text-[#7BC74D]/30 mb-6" viewBox="0 0 24 24" fill="currentColor">
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
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors bg-white"
                aria-label="Предыдущий отзыв"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div className="flex items-center gap-1.5">
                {VOICES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setVoiceIdx(i)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      i === voiceIdx ? 'bg-[#7BC74D] w-6' : 'bg-slate-300'
                    )}
                    aria-label={`Отзыв ${i + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={() => setVoiceIdx((i) => (i + 1) % VOICES.length)}
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors bg-white"
                aria-label="Следующий отзыв"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="py-16 bg-[#7BC74D]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2">
                Узнавайте о&nbsp;новых&nbsp;функциях&nbsp;первыми
              </h2>
              <p className="text-white/85 leading-relaxed">
                Раз в месяц — короткое письмо про то, что добавили,
                что улучшили и какие ещё владельцы мойки внедрили.
              </p>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); alert('Спасибо! В демо-режиме подписка не отправляется.'); }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="text"
                placeholder="Ваше имя"
                className="flex-1 px-4 h-12 rounded-full bg-white/15 backdrop-blur text-white placeholder-white/60 border border-white/20 focus:bg-white/25 focus:border-white/40 outline-none transition-all"
              />
              <input
                type="email"
                placeholder="Email"
                required
                className="flex-1 px-4 h-12 rounded-full bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-white/50 transition-all"
              />
              <button
                type="submit"
                className="h-12 px-6 rounded-full bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
              >
                Подписаться <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-5">
            Откройте демо.
            <br />
            <span className="text-[#7BC74D]">Без регистрации.</span>
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto">
            Те же функции, тот же интерфейс, те же данные — но без ваших реальных клиентов.
          </p>
          <Button
            onClick={onEnterDemo}
            size="lg"
            className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-8 h-14 gap-2 shadow-lg shadow-[#7BC74D]/20"
          >
            Открыть демо <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7BC74D] to-[#5BA634] flex items-center justify-center">
                  <Droplets className="w-4 h-4 text-white" />
                </div>
                <div className="font-bold">Автомойка CRM</div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
                Система для автомоек и&nbsp;шиномонтажей.
                Запись клиентов, касса, зарплаты, аналитика.
              </p>
            </div>
            {FOOTER_COLS.map((g) => (
              <div key={g.col}>
                <div className="text-sm font-semibold mb-4 text-slate-900">{g.col}</div>
                <ul className="space-y-2.5">
                  {g.items.map((it) => (
                    <li key={it}>
                      <a href="#" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
                        {it}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div>© {new Date().getFullYear()} Автомойка CRM Demo</div>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-slate-900">Политика</a>
              <a href="#" className="hover:text-slate-900">Поддержка</a>
              <a href="#" className="hover:text-slate-900">Контакты</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
