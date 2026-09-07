import React, { useState } from 'react';
import {
  Droplets, ChevronRight, ArrowRight, Wrench, Sparkles,
  Clock, TrendingUp, Shield, Heart, Check, Plus, ChevronLeft,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { InProgressCard } from '../admin/InProgressCard';
import type { TireBooking, TireServiceItem } from '../../lib/api/tire-bookings';

interface LandingProps {
  onEnterDemo: () => void;
}

// ============================================================================
// Mock data for REAL CRM components rendered inline as mockup previews.
// Data is hardcoded — no network calls. Components come from the actual
// codebase (InProgressCard) so the visual is 1:1 with what users see.
// ============================================================================

const MOCK_TIRE_SERVICES: TireServiceItem[] = [
  { service_id: 'tire-change', name: 'Сезонная смена', quantity: 4, price: 500, total: 2000, nominal_unit_price: 500 },
];

const MOCK_BOOKING: TireBooking = {
  id: 'mock-1',
  client_name: 'Алексей Петров',
  phone: '+7 999 123-45-67',
  car_model: 'КИА Рио',
  plate_number: 'А123БВ 161',
  booking_date: '2026-09-05',
  start_time: '14:30',
  estimated_duration: 60,
  services: MOCK_TIRE_SERVICES,
  total_price: 2000,
  payment_method: 'Карта',
  is_paid: false,
  status: 'in_progress',
  is_org: false,
};

const LINEUP = [
  {
    tag: 'Основное',
    name: 'Автомойка',
    spec: 'от 900 ₽',
    desc: 'Кузов, салон, воск, полировка. Всё что вы делаете каждый день — в одном интерфейсе.',
    accent: 'from-blue-50 to-cyan-50',
    icon: Droplets,
  },
  {
    tag: 'Сезонное',
    name: 'Шиномонтаж',
    spec: 'от 1 500 ₽',
    desc: 'Сезон смены без хаоса: календарь, фото колёс при приёмке, цены по типу авто, PDF ведомости.',
    accent: 'from-amber-50 to-orange-50',
    icon: Wrench,
    popular: true,
  },
  {
    tag: 'Премиум',
    name: 'Детейлинг',
    spec: 'от 5 000 ₽',
    desc: 'Полировка кузова, химчистка салона, керамика — с фото до/после и подробным чеком для клиента.',
    accent: 'from-violet-50 to-pink-50',
    icon: Sparkles,
  },
];

const IMPACT = [
  { value: '−2 ч', label: 'админских задач в день', icon: Clock },
  { value: '+20%', label: 'выручки за 2 месяца', icon: TrendingUp },
  { value: '100%', label: 'учёт смен и расходов', icon: Shield },
  { value: '24/7', label: 'онлайн-запись', icon: Heart },
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
            <a href="#showcase" className="hover:text-slate-900 transition-colors">Возможности</a>
            <a href="#lineup" className="hover:text-slate-900 transition-colors">Услуги</a>
            <a href="#impact" className="hover:text-slate-900 transition-colors">Зачем</a>
            <a href="#voices" className="hover:text-slate-900 transition-colors">Отзывы</a>
          </div>
          <Button
            onClick={onEnterDemo}
            className="bg-[#7BC74D] hover:bg-[#6AB73E] text-white font-semibold rounded-full px-5 h-10 gap-1.5 shadow-sm"
          >
            Войти в демо <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* HERO — light, split layout, REAL InProgressCard mockup */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 pt-12 pb-20 lg:pt-20 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
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

            {/* HERO MOCKUP — REAL InProgressCard rendered at scale */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-[#7BC74D]/15 to-blue-500/10 blur-2xl -z-10" />
              <div className="space-y-3">
                <div className="transform scale-90 origin-top">
                  <InProgressCard
                    booking={MOCK_BOOKING}
                    onClick={() => {}}
                    isNextBooking={false}
                  />
                </div>
                <div className="transform scale-90 origin-top">
                  <InProgressCard
                    booking={{ ...MOCK_BOOKING, id: 'mock-2', client_name: 'Мария Иванова', car_model: 'Хавал', plate_number: 'М456НК 161', start_time: '15:30' }}
                    onClick={() => {}}
                    isNextBooking
                  />
                </div>
              </div>
              {/* Floating stats cards */}
              <div className="hidden sm:block absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-lg shadow-slate-900/5 border border-slate-100 p-4 w-48">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Выручка</div>
                <div className="text-2xl font-bold text-slate-900">23 150 ₽</div>
                <div className="text-[10px] text-[#7BC74D] font-semibold mt-0.5">+18% к вчера</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SHOWCASE */}
      <section id="showcase" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Что вы получите в&nbsp;первый&nbsp;же день
            </h2>
            <p className="text-lg text-slate-600">
              Три рабочих контура, которые раньше вели в Excel, переписке и на бумажках —
              теперь в одном приложении.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="group rounded-2xl border border-slate-200 bg-white p-7 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/40 transition-all">
              <div className="w-11 h-11 rounded-xl bg-[#7BC74D]/10 flex items-center justify-center mb-5">
                <Sparkles className="w-5 h-5 text-[#7BC74D]" />
              </div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">Запись из Telegram</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Клиент сам выбирает услугу и время. Никаких звонков и переписок — бот работает в 11 вечера так же, как утром.
              </p>
            </div>
            <div className="group rounded-2xl border border-slate-200 bg-white p-7 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/40 transition-all">
              <div className="w-11 h-11 rounded-xl bg-[#7BC74D]/10 flex items-center justify-center mb-5">
                <Shield className="w-5 h-5 text-[#7BC74D]" />
              </div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">Касса под контролем</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Видите сколько денег в каждом боксе, кто не сдал смену, где расхождение между наличкой и безналом.
              </p>
            </div>
            <div className="group rounded-2xl border border-slate-200 bg-white p-7 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/40 transition-all">
              <div className="w-11 h-11 rounded-xl bg-[#7BC74D]/10 flex items-center justify-center mb-5">
                <TrendingUp className="w-5 h-5 text-[#7BC74D]" />
              </div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">Счета и акты</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                PDF формируется в один клик — для юрлиц, для бухгалтерии, для клиента. Подпись — стилусом на экране.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* LINEUP */}
      <section id="lineup" className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Подходит для&nbsp;любого формата
            </h2>
            <p className="text-lg text-slate-600">
              Один интерфейс — три направления. Автомойка, шиномонтаж и детейлинг работают одинаково.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {LINEUP.map((s) => (
              <div
                key={s.name}
                className={cn(
                  'group rounded-2xl border bg-white overflow-hidden hover:shadow-xl hover:shadow-slate-200/40 transition-all',
                  s.popular ? 'border-[#7BC74D] shadow-md ring-1 ring-[#7BC74D]/20' : 'border-slate-200'
                )}
              >
                <div className={cn(
                  'aspect-[4/3] relative overflow-hidden bg-gradient-to-br flex items-center justify-center',
                  s.accent
                )}>
                  <s.icon className="w-24 h-24 text-slate-400/40" strokeWidth={1} />
                  {s.popular && (
                    <div className="absolute top-3 right-3 bg-[#7BC74D] text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full">
                      Популярное
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">{s.tag}</div>
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-xl font-bold tracking-tight">{s.name}</h3>
                    <div className="text-lg font-bold text-[#7BC74D]">{s.spec}</div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">{s.desc}</p>
                  <a href="#" className="inline-flex items-center text-sm font-medium text-[#7BC74D] hover:gap-2 gap-1 transition-all">
                    Узнать больше <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IMPACT */}
      <section id="impact" className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
                Больше времени&nbsp;на&nbsp;дело,
                <br />
                меньше — на&nbsp;отчётность.
              </h2>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Цифры, которые показывают что происходит после перехода
                с бумажных ведомостей и Excel.
              </p>
              <div className="space-y-3">
                {[
                  'Сотрудники видят свою выручку в реальном времени',
                  'Конфликты про деньги исчезают за неделю',
                  'Клиенты возвращаются через удобную запись в Telegram',
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
            <div className="grid grid-cols-2 gap-4">
              {IMPACT.map((s, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-[#7BC74D]/40 hover:shadow-lg hover:shadow-[#7BC74D]/5 transition-all"
                >
                  <s.icon className="w-7 h-7 text-[#7BC74D] mb-3" strokeWidth={1.5} />
                  <div className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-1">{s.value}</div>
                  <div className="text-xs text-slate-500 leading-snug">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* VOICES */}
      <section id="voices" className="py-20 lg:py-24 bg-slate-50">
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
                    <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-10 sm:p-14">
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
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
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
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
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
