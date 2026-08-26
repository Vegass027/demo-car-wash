/**
 * /api/client-get-my-cars
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Returns combined profile state so ClientBookingWrapper
 * can drop the three anon SELECTs (clients, client_cars, organization_drivers):
 *
 *   {
 *     client: { id, phone, online_booking_blocked_until },
 *     combined_cars: [{ id, car_model, plate_number, car_type,
 *                       type: 'personal' | 'organization',
 *                       organization_id?, organization_name? }],
 *   }
 *
 * Auth: verifyJwt, app_role='client'.
 * All reads via service_role (BYPASSRLS). No PII leak: only client's own rows.
 *
 * Drive driverOrganizationIds (used in DayTimeline highlighted render) from
 * combined_cars type=='organization' entries so the client never has to make
 * a separate request.
 */

import { createClient } from '@supabase/supabase-js';
import { requireClient } from './_lib/require-client.js';
import { ValidationError } from './_lib/validation.js';

export const config = { maxDuration: 10 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const guard = await requireClient(req);
    if ('errorRes' in guard) return res.status(guard.errorRes.status).json(guard.errorRes.body);
    const { profile_id } = guard.claims;

    // 1) own client record (id + phone + blocked)
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, phone, online_booking_blocked_until')
      .eq('profile_id', profile_id)
      .maybeSingle();

    if (clientErr) {
      console.error('[client-get-my-cars] clients lookup error:', clientErr.message);
      return res.status(500).json({ error: 'db_error' });
    }

    if (!clientRow) {
      // Profile created without link-client-profile; UI must surface this and re-run /api/telegram-auth.
      return res.status(404).json({
        error: 'client_profile_not_linked',
        hint: 'Reopen the Telegram Mini App',
      });
    }

    const ownClientId = clientRow.id as string;
    const ownPhone = (clientRow.phone ?? null) as string | null;
    const blockedUntil = (clientRow.online_booking_blocked_until ?? null) as string | null;

    const combined_cars: Array<{
      id: string;
      car_model: string;
      plate_number: string;
      car_type: string;
      type: 'personal' | 'organization';
      organization_id?: string;
      organization_name?: string;
    }> = [];

    // 2) own personal cars
    const { data: personalCars, error: personalErr } = await supabaseAdmin
      .from('client_cars')
      .select('id, car_model, plate_number, car_type')
      .eq('client_id', ownClientId)
      .eq('is_active', true);

    if (personalErr) {
      console.error('[client-get-my-cars] client_cars lookup error:', personalErr.message);
      return res.status(500).json({ error: 'db_error' });
    }

    for (const car of personalCars ?? []) {
      combined_cars.push({
        id: car.id,
        car_model: car.car_model,
        plate_number: car.plate_number,
        car_type: car.car_type,
        type: 'personal',
      });
    }

    // 3) org cars via driver lookup (own phone). Only if client has a phone set.
    if (ownPhone) {
      const { data: drivers, error: driverErr } = await supabaseAdmin
        .from('organization_drivers')
        .select('id, organization_id')
        .eq('phone', ownPhone)
        .eq('is_active', true)
        .limit(1);

      if (driverErr) {
        console.error('[client-get-my-cars] org_drivers lookup error:', driverErr.message);
        return res.status(500).json({ error: 'db_error' });
      }

      const driver = drivers?.[0];
      if (driver) {
        const orgId = driver.organization_id as string;

        const [{ data: org, error: orgErr }, { data: orgCars, error: orgCarsErr }] =
          await Promise.all([
            supabaseAdmin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
            supabaseAdmin
              .from('organization_cars')
              .select('id, car_model, plate_number, car_type')
              .eq('organization_id', orgId)
              .eq('is_active', true),
          ]);

        if (orgErr || orgCarsErr) {
          console.error('[client-get-my-cars] org/org_cars lookup error:', orgErr?.message, orgCarsErr?.message);
          return res.status(500).json({ error: 'db_error' });
        }

        const organizationName = (org?.name ?? '') as string;
        for (const car of orgCars ?? []) {
          combined_cars.push({
            id: car.id,
            car_model: car.car_model,
            plate_number: car.plate_number,
            car_type: car.car_type ?? 'SEDAN',
            type: 'organization',
            organization_id: orgId,
            organization_name: organizationName,
          });
        }
      }
    }

    return res.status(200).json({
      data: {
        client: {
          id: ownClientId,
          phone: ownPhone,
          online_booking_blocked_until: blockedUntil,
        },
        combined_cars,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-get-my-cars] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
