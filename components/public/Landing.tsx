import React, { useState } from 'react';
import {
  Calendar, Users, BarChart3, Package, Receipt,
  Wrench, Wallet, FileText, Smartphone, Shield,
  ChevronRight, Car, Droplets, Send,
  CheckCircle2, Clock, Settings, Lock, Truck,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';

interface LandingProps {
  onEnterDemo: () => void;
}

const FEATURES = [
  {
    icon: Calendar,
    color: 'blue',
    title: 'Запись клиентов',
    desc: 'Онлайн-бронирование через Telegram Mini App + админская панель с визуальным таймлайном по боксам.',
    bullets: ['Запись в 1 клик из Telegram', 'Календарь по 3 боксам', 'Автообновление статусов'],
  },
  {
    icon: Users,
    color: 'green',
    title: 'Управление сотрудниками',
    desc: 'Мойщики, мастера шиномонтажа, админы. Назначение, парные смены, начисления, авансы, выплаты.',
    bullets: ['Соло / парный режим', 'Расчёт ЗП 40% от выручки', 'История транзакций'],
  },
  {
    icon: Wrench,
    color: 'orange',
    title: 'Шиномонтаж',
    desc: 'Полный учёт шиномонтажных заказов: фото колёс, состояние, цены по классам авто, отчёты для организаций.',
    bullets: ['Фото-фиксация состояния', 'Цены по типу авто', 'PDF ведомости для юрлиц'],
  },
  {
    icon: BarChart3,
    color: 'purple',
    title: 'Аналитика и отчёты',
    desc: 'Ежедневные, месячные, по сотрудникам, по организациям. PDF-экспорт и история расходов.',
    bullets: ['Автообновление по крону', 'Чистая прибыль в реальном времени', 'PDF за любой период'],
  },
  {
    icon: Wallet,
    color: 'emerald',
    title: 'Касса и смены',
    desc: 'Открытие/закрытие смен, выдача чека клиенту, контроль остатков в кассе.',
    bullets: ['Открытие отдельных часов', 'Списание/пополнение кассы', 'Связь с Z-отчётами'],
  },
  {
    icon: Receipt,
    color: 'rose',
    title: 'Расходы и чеки',
    desc: 'Учёт расходов по категориям, загрузка чеков, история с возможностью правки суммы.',
    bullets: ['Категории расходов', 'Хранение чеков в Storage', 'История с фильтром по дате'],
  },
  {
    icon: Package,
    color: 'cyan',
    title: 'Склад',
    desc: 'Учёт прихода и расхода химии, инвентаря, ведомостей. Уведомления о низких остатках.',
    bullets: ['Карточки товаров', 'История приходов', 'Ведомости остатков'],
  },
  {
    icon: FileText,
    color: 'indigo',
    title: 'Юридические лица',
    desc: 'Учёт организаций, водителей, машин. PDF-счета и акты для бухгалтерии.',
    bullets: ['Реквизиты в одном месте', 'Связь с водителями', 'Авто-нумерация счетов'],
  },
];

const STACK = [
  { icon: Smartphone, label: 'Telegram Mini App' },
  { icon: Shield, label: 'RLS + ACL' },
  { icon: Settings, label: 'Vercel serverless' },
  { icon: Lock, label: 'Bcrypt + JWT' },
];

export const Landing: React.FC<LandingProps> = ({ onEnterDemo }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* TOP BAR */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-lg">Автомойка CRM</div>
            <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">DEMO</span>
          </div>
          <Button onClick={onEnterDemo} className="gap-1.5">
            Войти в демо <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* HERO */}
      <section className="px-4 py-12 sm:py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Готово к тестированию · Telegram Mini App + Web
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            CRM для автомойки и шиномонтажа
          </h1>
          <p className="text-base sm:text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            Запись клиентов, касса, сотрудники, расходы, аналитика и PDF-отчёты —
            всё в одном приложении. Без Excel, без бумажных ведомостей.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={onEnterDemo} size="lg" className="gap-2">
              Открыть демо <ChevronRight className="w-4 h-4" />
            </Button>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              Посмотреть функции
            </a>
          </div>
          <div className="mt-12 mx-auto max-w-3xl">
            <div className="rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="text-xs text-slate-500 ml-2">carwash-crm.vercel.app/dashboard</div>
              </div>
              <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gradient-to-br from-blue-50 to-purple-50">
                {[
                  { label: 'Заказов сегодня', value: '24', color: 'text-blue-600' },
                  { label: 'Выручка', value: '23 150 ₽', color: 'text-emerald-600' },
                  { label: 'Расходы', value: '4 800 ₽', color: 'text-rose-600' },
                  { label: 'Прибыль', value: '18 350 ₽', color: 'text-purple-600' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500">{kpi.label}</div>
                    <div className={cn('text-lg font-bold mt-1', kpi.color)}>{kpi.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="px-4 py-12 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">Функции</h2>
          <p className="text-center text-slate-600 mb-10 max-w-2xl mx-auto">
            Полный набор для ежедневной работы мойки и шиномонтажа.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => {
              const isOpen = expanded === f.title;
              return (
                <Card
                  key={f.title}
                  className={cn(
                    'cursor-pointer hover:shadow-lg transition-shadow',
                    `border-${f.color}-200`
                  )}
                  onClick={() => setExpanded(isOpen ? null : f.title)}
                >
                  <CardContent className="p-5">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                      `bg-${f.color}-100`
                    )}>
                      <f.icon className={cn('w-5 h-5', `text-${f.color}-600`)} />
                    </div>
                    <h3 className="font-semibold mb-1">{f.title}</h3>
                    <p className="text-sm text-slate-600 mb-3">{f.desc}</p>
                    {isOpen && (
                      <ul className="space-y-1.5 mt-3 pt-3 border-t border-slate-100">
                        {f.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-1.5 text-xs text-slate-700">
                            <CheckCircle2 className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', `text-${f.color}-500`)} />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isOpen && (
                      <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                        Нажмите чтобы развернуть <ChevronRight className="w-3 h-3" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* STACK */}
      <section className="px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Технологический стек</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STACK.map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                <s.icon className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <div className="text-sm font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Готовы попробовать?</h2>
          <p className="text-blue-100 mb-6">
            Демо-режим показывает все функции на тестовых данных. Без регистрации.
          </p>
          <Button
            onClick={onEnterDemo}
            size="lg"
            variant="secondary"
            className="gap-2 bg-white text-blue-600 hover:bg-blue-50"
          >
            Войти в демо <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-4 py-6 border-t border-slate-200 text-center text-xs text-slate-500">
        <div className="flex flex-wrap justify-center gap-3 mb-2">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Крон отчётов: 17:00 UTC ежедневно</span>
          <span className="flex items-center gap-1"><Send className="w-3 h-3" /> Telegram Mini App</span>
          <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> Шиномонтаж</span>
          <span className="flex items-center gap-1"><Car className="w-3 h-3" /> Автомойка</span>
        </div>
        © {new Date().getFullYear()} Carwash CRM Demo
      </footer>
    </div>
  );
};
