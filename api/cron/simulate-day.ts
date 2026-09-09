import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = {
  maxDuration: 60,
};

/**
 * Симуляция активности мойки за указанный день.
 * Запускается Vercel Cron в 19:00 МСК каждый день.
 * Создаёт смены, бронирования, закрытия, зарплаты и расходы
 * за день в рабочем окне 08:00–19:00 МСК.
 */

interface ActiveAdmin { id: string; full_name: string }
interface ActiveWorker { id: string; full_name: string }
interface ActiveTireWorker { id: string; full_name: string }
interface ActiveClient { id: string; full_name: string; phone: string | null }
interface ActiveClientCar { id: string; car_model: string; plate_number: string; car_type: string }
interface ActiveService { id: string; name: string; price_sedan: number; price_crossover: number; price_jeep: number; price_large_suv: number; price_minivan: number }
interface ActiveOrg { id: string; name: string; contact_phone: string | null }
interface ActiveOrgDriver { id: string; organization_id: string; full_name: string; phone: string | null }
interface ActiveOrgCar { id: string; organization_id: string; car_model: string; plate_number: string; car_type: string }
interface ActiveTireService { id: string; name: string; price: number }

// Рабочее окно (MSK = UTC+3)
const WORK_START_HOUR = 8;     // 08:00
const WORK_END_HOUR = 19;      // 19:00 (не позже)
// Окна для смен (MSK)
const ADMIN_SHIFT_START_HOUR_FROM = 8;
const ADMIN_SHIFT_START_HOUR_TO = 9;
const ADMIN_SHIFT_END_HOUR_FROM = 18;
const ADMIN_SHIFT_END_HOUR_TO = 21;
const WORKER_SHIFT_START_HOUR_FROM = 7;
const WORKER_SHIFT_START_HOUR_TO = 9;
const WORKER_SHIFT_END_HOUR_FROM = 17;
const WORKER_SHIFT_END_HOUR_TO = 21;
// Комиссии
const CARWASH_COMMISSION = 0.4;
const TIRE_COMMISSION = 0.5;
const STORAGE_FEE = 300;
// Кол-во сущностей за день
const BOOKINGS_PER_DAY = [8, 15];
const TIRE_BOOKINGS_PER_DAY = [3, 6];
const EXPENSES_PER_DAY = [1, 3];

// Pseudo-random с seed=ordinal → один день = одинаковые данные при перезапуске
function seedRandom(dateStr: string) {
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = (seed * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 0xffffffff;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randItem<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randTime(rng: () => number, hourFrom: number, hourTo: number): string {
  const h = randInt(rng, hourFrom, hourTo);
  const m = randInt(rng, 0, 3) * 15; // шаг 15 минут
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function mskToUtc(dateStr: string, timeStr: string): string {
  // dateStr='YYYY-MM-DD', timeStr='HH:MM:SS' — MSK. Конвертируем в UTC (MSK-3).
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hh - 3, mm, ss);
  return new Date(utcMs).toISOString();
}

function durationForService(rng: () => number): number {
  // В минутах: 30 / 60 / 90
  const opts = [30, 60, 90];
  return randItem(rng, opts);
}

function priceForCarType(service: ActiveService, carType: string): number {
  const map: Record<string, keyof ActiveService> = {
    SEDAN: 'price_sedan',
    CROSSOVER: 'price_crossover',
    JEEP: 'price_jeep',
    LARGE_SUV: 'price_large_suv',
    MINIVAN: 'price_minivan',
  };
  const key = map[carType] || 'price_sedan';
  return Number((service as any)[key] || 500);
}

async function loadActiveData() {
  const [admins, workers, tireWorkers, clients, clientCars, services, orgs, orgDrivers, orgCars, tireServices] = await Promise.all([
    supabaseAdmin.from('admins').select('id, full_name').eq('is_active', true),
    supabaseAdmin.from('workers').select('id, full_name').eq('is_active', true),
    supabaseAdmin.from('tire_workers').select('id, full_name').eq('is_active', true),
    supabaseAdmin.from('clients').select('id, full_name, phone').eq('is_active', true).limit(100),
    supabaseAdmin.from('client_cars').select('id, car_model, plate_number, car_type').eq('is_active', true).limit(50),
    supabaseAdmin.from('services').select('id, name, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan').eq('is_active', true),
    supabaseAdmin.from('organizations').select('id, name, contact_phone').eq('is_active', true),
    supabaseAdmin.from('organization_drivers').select('id, organization_id, full_name, phone').eq('is_active', true),
    supabaseAdmin.from('organization_cars').select('id, organization_id, car_model, plate_number, car_type').eq('is_active', true),
    supabaseAdmin.from('tire_services').select('id, name, price').eq('is_active', true),
  ]);
  return {
    admins: (admins.data || []) as ActiveAdmin[],
    workers: (workers.data || []) as ActiveWorker[],
    tireWorkers: (tireWorkers.data || []) as ActiveTireWorker[],
    clients: (clients.data || []) as ActiveClient[],
    clientCars: (clientCars.data || []) as ActiveClientCar[],
    services: (services.data || []) as ActiveService[],
    orgs: (orgs.data || []) as ActiveOrg[],
    orgDrivers: (orgDrivers.data || []) as ActiveOrgDriver[],
    orgCars: (orgCars.data || []) as ActiveOrgCar[],
    tireServices: (tireServices.data || []) as ActiveTireService[],
  };
}

// Проверка что у работника/мастера ещё нет открытой смены за этот день
async function hasOpenShift(workerId: string, workerType: 'worker' | 'tire_worker' | 'admin'): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('work_shifts')
    .select('id')
    .eq('worker_id', workerId)
    .eq('worker_type', workerType)
    .is('finished_at', null)
    .limit(1);
  return !!(data && data.length > 0);
}

export default async function handler(req: any, res: any) {
  const startTime = new Date();
  console.log(`[SIMULATE-DAY] Started at: ${startTime.toISOString()}`);

  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // target_date: ?date=YYYY-MM-DD или сегодня по МСК
  const queryDate = req.query.date as string | undefined;
  const targetDate = queryDate || new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Seed — детерминированно от даты
  const rng = seedRandom(targetDate);

  console.log(`[SIMULATE-DAY] target_date=${targetDate}`);

  try {
    const data = await loadActiveData();
    console.log(`[SIMULATE-DAY] Loaded: ${data.admins.length} admins, ${data.workers.length} workers, ${data.tireWorkers.length} tire_workers, ${data.clients.length} clients, ${data.orgs.length} orgs`);

    // ========== ШАГ 1: СМЕНЫ ==========
    let shiftsCreated = 0;
    const startHrAdmin = randInt(rng, ADMIN_SHIFT_START_HOUR_FROM, ADMIN_SHIFT_START_HOUR_TO);
    const startMinAdmin = randInt(rng, 0, 3) * 15;
    const endHrAdmin = randInt(rng, ADMIN_SHIFT_END_HOUR_FROM, ADMIN_SHIFT_END_HOUR_TO);
    const endMinAdmin = randInt(rng, 0, 3) * 15;

    for (const adm of data.admins) {
      if (await hasOpenShift(adm.id, 'admin')) continue;
      const startedAtMsk = `${targetDate}T${String(startHrAdmin).padStart(2,'0')}:${String(startMinAdmin).padStart(2,'0')}:00+03:00`;
      const finishedAtMsk = `${targetDate}T${String(endHrAdmin).padStart(2,'0')}:${String(endMinAdmin).padStart(2,'0')}:00+03:00`;
      const { error } = await supabaseAdmin.from('work_shifts').insert({
        worker_type: 'admin',
        worker_id: adm.id,
        worker_name: adm.full_name,
        work_date: targetDate,
        started_at: startedAtMsk,
        finished_at: finishedAtMsk,
        status: 'finished',
        working_mode: 'solo',
      });
      if (!error) shiftsCreated++;
    }

    // Workers — рандомное кол-во (1-4), в режиме solo или pair
    const numWorkers = Math.min(data.workers.length, randInt(rng, 3, 4));
    const shuffledWorkers = [...data.workers].sort(() => rng() - 0.5);
    for (let i = 0; i < numWorkers; i++) {
      const w = shuffledWorkers[i];
      if (await hasOpenShift(w.id, 'worker')) continue;
      const sh = randInt(rng, WORKER_SHIFT_START_HOUR_FROM, WORKER_SHIFT_START_HOUR_TO);
      const sm = randInt(rng, 0, 3) * 15;
      const eh = randInt(rng, WORKER_SHIFT_END_HOUR_FROM, WORKER_SHIFT_END_HOUR_TO);
      const em = randInt(rng, 0, 3) * 15;
      const startedAtMsk = `${targetDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00+03:00`;
      const finishedAtMsk = `${targetDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00+03:00`;
      const mode = rng() < 0.25 ? 'pair' : 'solo';
      const { error } = await supabaseAdmin.from('work_shifts').insert({
        worker_type: 'worker',
        worker_id: w.id,
        worker_name: w.full_name,
        work_date: targetDate,
        started_at: startedAtMsk,
        finished_at: finishedAtMsk,
        status: 'finished',
        working_mode: mode,
      });
      if (!error) shiftsCreated++;
    }

    // Tire workers — 1-2
    const numTireWorkers = Math.min(data.tireWorkers.length, randInt(rng, 1, 2));
    for (let i = 0; i < numTireWorkers; i++) {
      const tw = data.tireWorkers[i];
      if (await hasOpenShift(tw.id, 'tire_worker')) continue;
      const sh = randInt(rng, WORKER_SHIFT_START_HOUR_FROM, WORKER_SHIFT_START_HOUR_TO);
      const sm = randInt(rng, 0, 3) * 15;
      const eh = randInt(rng, WORKER_SHIFT_END_HOUR_FROM, WORKER_SHIFT_END_HOUR_TO);
      const em = randInt(rng, 0, 3) * 15;
      const startedAtMsk = `${targetDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00+03:00`;
      const finishedAtMsk = `${targetDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00+03:00`;
      const { error } = await supabaseAdmin.from('work_shifts').insert({
        worker_type: 'tire_worker',
        worker_id: tw.id,
        worker_name: tw.full_name,
        work_date: targetDate,
        started_at: startedAtMsk,
        finished_at: finishedAtMsk,
        status: 'finished',
        working_mode: 'solo',
      });
      if (!error) shiftsCreated++;
    }

    console.log(`[SIMULATE-DAY] Step 1: Created ${shiftsCreated} shifts`);

    // ========== ШАГ 2: BOOKINGS (мойка) ==========
    let bookingsCreated = 0;
    let bookingsClosed = 0;
    let salariesCreated = 0;

    if (data.services.length > 0 && (data.clients.length > 0 || data.orgs.length > 0)) {
      const numBookings = randInt(rng, BOOKINGS_PER_DAY[0], BOOKINGS_PER_DAY[1]);
      const shuffledServices = [...data.services];

      for (let i = 0; i < numBookings; i++) {
        const startH = randInt(rng, WORK_START_HOUR, WORK_END_HOUR - 1);
        const startM = randInt(rng, 0, 3) * 15;
        const startTime = `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}:00`;
        const durationMin = durationForService(rng);
        const endDate = new Date(Date.UTC(2000, 0, 1, startH, startM) + durationMin * 60 * 1000);
        const endTime = `${String(endDate.getUTCHours()).padStart(2,'0')}:${String(endDate.getUTCMinutes()).padStart(2,'0')}:00`;
        // Пропускаем если end выходит за 19:00
        if (endDate.getUTCHours() >= 19) continue;

        const service = randItem(rng, shuffledServices);
        const isOrg = rng() < 0.2 && data.orgs.length > 0 && data.orgDrivers.length > 0;

        const status = rng() < 0.3 ? 'ОЖИДАЕТ' : (rng() < 0.85 ? 'ГОТОВО' : 'ОТМЕНЕНО');
        const isPaid = status === 'ГОТОВО';
        const completedAt = status === 'ГОТОВО' ? mskToUtc(targetDate, endTime) : null;
        const paidAt = isPaid ? mskToUtc(targetDate, endTime) : null;

        const booking: any = {
          client_name: '',
          car_model: '',
          plate_number: '',
          car_type: 'SEDAN',
          services: JSON.stringify([service.id]),
          price: 0,
          status,
          booking_date: targetDate,
          start_time: startTime,
          end_time: endTime,
          box_number: randInt(rng, 1, 3),
          booking_source: 'admin',
          signature_obtained: status === 'ГОТОВО',
          is_paid: isPaid,
          paid_at: paidAt,
          completed_at: completedAt,
          work_start_time: mskToUtc(targetDate, startTime),
          work_end_time: mskToUtc(targetDate, endTime),
        };

        if (isOrg) {
          const org = randItem(rng, data.orgs);
          const orgDriversForOrg = data.orgDrivers.filter(d => d.organization_id === org.id);
          const orgCarsForOrg = data.orgCars.filter(c => c.organization_id === org.id);
          if (orgDriversForOrg.length === 0 || orgCarsForOrg.length === 0) continue;
          const driver = randItem(rng, orgDriversForOrg);
          const car = randItem(rng, orgCarsForOrg);
          booking.is_org = true;
          booking.organization_id = org.id;
          booking.driver_id = driver.id;
          booking.car_id = car.id;
          booking.org_name = org.name;
          booking.client_name = driver.full_name;
          booking.phone = driver.phone || org.contact_phone || '';
          booking.car_model = car.car_model;
          booking.plate_number = car.plate_number;
          booking.car_type = car.car_type;
          booking.price = priceForCarType(service, car.car_type);
        } else {
          if (data.clients.length === 0 || data.clientCars.length === 0) continue;
          const client = randItem(rng, data.clients);
          const clientCarsForClient = data.clientCars.filter(c => c.car_model);
          const car = clientCarsForClient.length > 0 ? randItem(rng, clientCarsForClient) : null;
          if (!car) continue;
          booking.client_id = client.id;
          booking.client_car_id = car.id;
          booking.client_name = client.full_name;
          booking.phone = client.phone || '';
          booking.car_model = car.car_model;
          booking.plate_number = car.plate_number;
          booking.car_type = car.car_type;
          booking.price = priceForCarType(service, car.car_type);
        }

        const { data: inserted, error } = await supabaseAdmin.from('bookings').insert(booking).select('id').single();
        if (error || !inserted) continue;
        bookingsCreated++;
        if (status === 'ГОТОВО') {
          bookingsClosed++;
          // Найти worker'а на эту смену (случайно)
          const eligibleWorkers = data.workers.filter(w => w.full_name);
          if (eligibleWorkers.length > 0) {
            const w = randItem(rng, eligibleWorkers);
            const earning = Math.round(booking.price * CARWASH_COMMISSION);
            const { error: salErr } = await supabaseAdmin.from('salary_transactions').insert({
              worker_type: 'worker',
              worker_id: w.id,
              worker_name: w.full_name,
              transaction_type: 'EARNING',
              amount: earning,
              balance_after: earning,
              description: `Заказ #${inserted.id.slice(0, 8)} (simul)`,
            });
            if (!salErr) salariesCreated++;
          }
        }
      }
    }
    console.log(`[SIMULATE-DAY] Step 2: Created ${bookingsCreated} bookings, ${bookingsClosed} closed, ${salariesCreated} salaries`);

    // ========== ШАГ 3: TIRE BOOKINGS ==========
    let tireBookingsCreated = 0;
    let tireSalariesCreated = 0;

    if (data.tireServices.length > 0 && data.workers.length > 0) {
      const numTireBookings = randInt(rng, TIRE_BOOKINGS_PER_DAY[0], TIRE_BOOKINGS_PER_DAY[1]);
      const shuffledTireWorkers = [...data.tireWorkers];
      const tireWorkersIds = shuffledTireWorkers.map(w => w.id);

      for (let i = 0; i < numTireBookings; i++) {
        const startH = randInt(rng, WORK_START_HOUR, WORK_END_HOUR - 1);
        const startM = randInt(rng, 0, 3) * 15;
        const startTime = `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}:00`;
        const endDate = new Date(Date.UTC(2000, 0, 1, startH, startM) + 60 * 60 * 1000);
        const endTime = `${String(endDate.getUTCHours()).padStart(2,'0')}:${String(endDate.getUTCMinutes()).padStart(2,'0')}:00`;
        if (endDate.getUTCHours() >= 19) continue;

        const ts = randItem(rng, data.tireServices);
        const status = rng() < 0.4 ? 'ГОТОВО' : (rng() < 0.6 ? 'В РАБОТЕ' : 'ОЖИДАЕТ');

        const isOrg = rng() < 0.2 && data.orgs.length > 0 && data.orgDrivers.length > 0;
        const tb: any = {
          client_name: '',
          phone: '',
          car_model: '',
          plate_number: '',
          car_type: 'SEDAN',
          services: [{ service_id: ts.id, name: ts.name, quantity: 1, price: ts.price, total: ts.price }],
          total_price: ts.price,
          status,
          booking_date: targetDate,
          start_time: startTime,
          end_time: endTime,
          payment_method: status === 'ГОТОВО' ? 'Наличный' : null,
          is_paid: status === 'ГОТОВО',
          payment_status: status === 'ГОТОВО' ? 'paid' : 'pending',
        };

        if (isOrg) {
          const org = randItem(rng, data.orgs);
          const orgDriversForOrg = data.orgDrivers.filter(d => d.organization_id === org.id);
          const orgCarsForOrg = data.orgCars.filter(c => c.organization_id === org.id);
          if (orgDriversForOrg.length === 0 || orgCarsForOrg.length === 0) continue;
          const driver = randItem(rng, orgDriversForOrg);
          const car = randItem(rng, orgCarsForOrg);
          tb.is_org = true;
          tb.organization_id = org.id;
          tb.driver_id = driver.id;
          tb.car_id = car.id;
          tb.org_name = org.name;
          tb.client_name = driver.full_name;
          tb.phone = driver.phone || org.contact_phone || '';
          tb.car_model = car.car_model;
          tb.plate_number = car.plate_number;
          tb.car_type = car.car_type;
        } else {
          if (data.clients.length === 0 || data.clientCars.length === 0) continue;
          const client = randItem(rng, data.clients);
          const clientCarsForClient = data.clientCars;
          const car = randItem(rng, clientCarsForClient);
          tb.client_id = client.id;
          tb.client_car_id = car.id;
          tb.client_name = client.full_name;
          tb.phone = client.phone || '';
          tb.car_model = car.car_model;
          tb.plate_number = car.plate_number;
          tb.car_type = car.car_type;
        }

        const { data: inserted, error } = await supabaseAdmin.from('tire_bookings').insert(tb).select('id').single();
        if (error || !inserted) continue;
        tireBookingsCreated++;

        if (status === 'ГОТОВО' && tireWorkersIds.length > 0) {
          const twId = randItem(rng, tireWorkersIds);
          const tw = data.tireWorkers.find(w => w.id === twId)!;
          const isStorage = ts.name.toLowerCase().includes('хранение');
          const earning = isStorage
            ? STORAGE_FEE
            : Math.round(ts.price * TIRE_COMMISSION);
          const { error: salErr } = await supabaseAdmin.from('salary_transactions').insert({
            worker_type: 'tire_worker',
            worker_id: twId,
            worker_name: tw.full_name,
            transaction_type: 'EARNING',
            amount: earning,
            balance_after: earning,
            description: `Шиномонтаж #${inserted.id.slice(0, 8)} (simul)`,
          });
          if (!salErr) tireSalariesCreated++;
        }
      }
    }
    console.log(`[SIMULATE-DAY] Step 3: Created ${tireBookingsCreated} tire_bookings, ${tireSalariesCreated} tire salaries`);

    // ========== ШАГ 4: EXPENSES ==========
    let expensesCreated = 0;
    if (data.admins.length > 0) {
      const numExpenses = randInt(rng, EXPENSES_PER_DAY[0], EXPENSES_PER_DAY[1]);
      const categories = ['tea_coffee', 'repair', 'utilities', 'stationery', 'other'] as const;
      const comments = ['Закупка', 'Замена', 'Плановое', 'Срочно', 'Прочее'];
      for (let i = 0; i < numExpenses; i++) {
        const amount = randInt(rng, 1, 30) * 100;
        const cat = randItem(rng, categories);
        const adm = randItem(rng, data.admins);
        const { error } = await supabaseAdmin.from('expenses').insert({
          category: cat,
          amount,
          comment: randItem(rng, comments),
          expense_date: targetDate,
          created_by: adm.id,
        });
        if (!error) expensesCreated++;
      }
    }
    console.log(`[SIMULATE-DAY] Step 4: Created ${expensesCreated} expenses`);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`[SIMULATE-DAY] Done at: ${endTime.toISOString()}, duration: ${duration}ms`);

    return res.status(200).json({
      ok: true,
      target_date: targetDate,
      summary: {
        shifts: shiftsCreated,
        bookings: bookingsCreated,
        bookings_closed: bookingsClosed,
        carwash_salaries: salariesCreated,
        tire_bookings: tireBookingsCreated,
        tire_salaries: tireSalariesCreated,
        expenses: expensesCreated,
      },
      duration_ms: duration,
    });
  } catch (error: any) {
    console.error('[SIMULATE-DAY] Error:', error);
    return res.status(500).json({ error: 'simulate_failed', details: error?.message });
  }
}
