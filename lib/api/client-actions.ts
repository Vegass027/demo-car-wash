/**
 * lib/api/client-actions.ts
 *
 * Phase B (Slice #3e) — typed wrappers around /api/client dispatcher.
 *
 * Mirrors lib/api/staff-actions.ts pattern. All wrappers take ZERO
 * arguments — identity is resolved server-side from the client JWT
 * (claims.profile_id in api/client.ts requireClient()). No client
 * code passes profile_id in body. Even if a stale caller does, the
 * dispatcher handlers physically do not read body.profile_id.
 *
 * Why this file exists:
 * - Browser-side reads on Category C tables (booking_cancellations,
 *   loyalty_carwash_progress, clients.email) used to go through
 *   supabase.from(...).select(...) directly. After Slice #3e Phase D
 *   migration 030 those anon/authenticated grants will be tightened
 *   to authenticated-only — anon-key reads would 401 / 42501.
 * - Phase B ports these reads to /api/client dispatcher with
 *   service_role. Result: client UI still works after Phase D/E
 *   migrations land.
 *
 * 8 actions exposed:
 *   getMyCancellationCountAction
 *   getMyBlockStatusAction
 *   getMyLoyaltyProgressAction
 *   getMyFreeWashStatusAction
 *   getMyWashesUntilNextFreeWashAction
 *   getMyProfileAction
 *   getMyClientAction
 *   getMyClientEmailAction
 */

import { getSessionToken } from '../_supabase-wrapper';

// ---------- dispatcher plumbing ----------

async function dispatchClientCall<T>(
  action: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`/api/client?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json?.error as string) || `client_${action}_failed`;
    throw new Error(`${err} (HTTP ${res.status})`);
  }
  return json as T;
}

// ---------- response shapes ----------

export interface CancellationCountResponse { count: number }
export interface BlockStatusResponse { blocked: boolean; until: string | null }
export interface LoyaltyProgressRow {
  id: string;
  client_id: string;
  total_washes_with_body: number;
  free_wash_pending: boolean;
  last_booking_id: string | null;
  last_wash_date: string | null;
  created_at: string;
  updated_at: string;
}
export interface LoyaltyProgressResponse { progress: LoyaltyProgressRow | null }
export interface FreeWashStatusResponse { hasFreeWash: boolean }
export interface WashesUntilFreeResponse { remaining: number }
export interface MyProfileRow {
  id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  telegram_id: number | null;
  last_auth_method: string | null;
  created_at: string;
}
export interface MyProfileResponse { profile: MyProfileRow }
export interface MyClientRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  online_booking_blocked_until: string | null;
  profile_id: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface MyClientResponse { client: MyClientRow }
export interface MyClientEmailResponse { email: string | null }

// ---------- 8 wrappers ----------

export async function getMyCancellationCountAction(): Promise<CancellationCountResponse> {
  return (await dispatchClientCall<{ data: CancellationCountResponse }>('get-my-cancellation-count')).data;
}

export async function getMyBlockStatusAction(): Promise<BlockStatusResponse> {
  return (await dispatchClientCall<{ data: BlockStatusResponse }>('get-my-block-status')).data;
}

export async function getMyLoyaltyProgressAction(): Promise<LoyaltyProgressResponse> {
  return (await dispatchClientCall<{ data: LoyaltyProgressResponse }>('get-my-loyalty-progress')).data;
}

export async function getMyFreeWashStatusAction(): Promise<FreeWashStatusResponse> {
  return (await dispatchClientCall<{ data: FreeWashStatusResponse }>('get-my-free-wash-status')).data;
}

export async function getMyWashesUntilNextFreeWashAction(): Promise<WashesUntilFreeResponse> {
  return (await dispatchClientCall<{ data: WashesUntilFreeResponse }>('get-my-washes-until-next-free-wash')).data;
}

export async function getMyProfileAction(): Promise<MyProfileResponse> {
  return (await dispatchClientCall<{ data: MyProfileResponse }>('get-my-profile')).data;
}

export async function getMyClientAction(): Promise<MyClientResponse> {
  return (await dispatchClientCall<{ data: MyClientResponse }>('get-my-client')).data;
}

export async function getMyClientEmailAction(): Promise<MyClientEmailResponse> {
  return (await dispatchClientCall<{ data: MyClientEmailResponse }>('get-my-client-email')).data;
}
