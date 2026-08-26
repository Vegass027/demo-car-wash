/**
 * lib/client-auth.ts
 *
 * Telegram Mini App authentication helper. Phase 1.6b of
 * carwash-full-security-lockdown-plan.md.
 *
 * Centralizes the 3-step auth flow shared by ClientBookingWrapper,
 * ClientTireBookingWrapper, and MyGarage:
 *   1. Init Telegram WebApp SDK
 *   2. Verify isTelegramWebApp() + has initData
 *   3. POST /api/telegram-auth → HMAC verification server-side
 *      → JWT issued → setSessionToken + sessionStorage backup
 *
 * Returns profile_id + telegram_id from the response. Throws
 * TelegramAuthError with discriminated `kind` so each wrapper
 * can render typed UI without parsing HTTP details.
 *
 * Recovery flow:
 *   - 'not_in_telegram' / 'no_init_data': "Open via Telegram bot" — no retry
 *   - 'invalid_signature' / 'stale_data': "Reload Mini App" button
 *   - 'service_unavailable': "retry" button (re-call loginViaTelegram)
 *   - 'network': "retry" button
 *   - 'role_not_permitted': "Contact admin" — no retry (server enforces)
 *
 * console.error with server status is logged for developer debugging
 * but never surfaces in the user message.
 */

import { setSessionToken, getSessionToken } from './supabase';
import { initTelegramWebApp, isTelegramWebApp } from '../shared/telegram/telegram';

const SESSION_STORAGE_KEY = 'sb_token';

export type TelegramAuthError =
  | { kind: 'not_in_telegram' }
  | { kind: 'no_init_data' }
  | { kind: 'invalid_signature' }
  | { kind: 'stale_data' }
  | { kind: 'role_not_permitted' }
  | { kind: 'service_unavailable' }
  | { kind: 'network' }
  | { kind: 'unknown' };

export interface TelegramAuthResult {
  profile_id: string;
  telegram_id: number;
  app_role: 'client' | 'admin' | 'owner';
  full_name?: string;
}

/**
 * Inflight dedup for loginViaTelegram(). When 3 components mount in
 * quick succession (e.g., navigate carwash → tire → garage in <1s),
 * each calls loginViaTelegram() simultaneously → 3 parallel
 * /api/telegram-auth requests, 3 audit_logs entries, last-arrival
 * wins through setSessionToken. Dedup returns the same promise to
 * all callers, so only 1 network round-trip.
 *
 * `finally { inflightAuth = null }` runs on both success and throw
 * so a failed auth doesn't deadlock subsequent retries.
 */
let inflightAuth: Promise<TelegramAuthResult> | null = null;

export async function loginViaTelegram(): Promise<TelegramAuthResult> {
  if (inflightAuth) return inflightAuth;

  inflightAuth = doLoginViaTelegram().finally(() => {
    inflightAuth = null;
  });
  return inflightAuth;
}

async function doLoginViaTelegram(): Promise<TelegramAuthResult> {
  // 1. Init Telegram SDK (idempotent — safe to call multiple times).
  await initTelegramWebApp();

  // 2. Verify context.
  if (!isTelegramWebApp()) {
    throw { kind: 'not_in_telegram' } satisfies TelegramAuthError;
  }
  const initData = (window as any).Telegram?.WebApp?.initData;
  if (!initData || typeof initData !== 'string') {
    throw { kind: 'no_init_data' } satisfies TelegramAuthError;
  }

  // 3. POST /api/telegram-auth.
  let res: Response;
  try {
    res = await fetch('/api/telegram-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
  } catch (e) {
    console.error('[client-auth] network error:', e);
    throw { kind: 'network' } satisfies TelegramAuthError;
  }

  if (!res.ok) {
    console.error('[client-auth] /api/telegram-auth failed:', res.status);
    if (res.status === 400) throw { kind: 'stale_data' } satisfies TelegramAuthError;
    if (res.status === 401) throw { kind: 'invalid_signature' } satisfies TelegramAuthError;
    if (res.status === 403) throw { kind: 'role_not_permitted' } satisfies TelegramAuthError;
    if (res.status === 500) throw { kind: 'service_unavailable' } satisfies TelegramAuthError;
    throw { kind: 'unknown' } satisfies TelegramAuthError;
  }

  const data = await res.json() as {
    token: string;
    profile_id: string;
    telegram_id: number;
    app_role: 'client' | 'admin' | 'owner';
    full_name?: string;
  };

  // 4. Inject JWT into module singleton + sessionStorage backup.
  // Client uses sessionStorage so first render after Mini App reload
  // skips silent re-auth round-trip (per Phase 1.4 design).
  setSessionToken(data.token);
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, data.token);
  } catch {
    /* private mode — sessionStorage unavailable */
  }

  return {
    profile_id: data.profile_id,
    telegram_id: data.telegram_id,
    app_role: data.app_role,
    full_name: data.full_name,
  };
}

/**
 * Map TelegramAuthError.kind → user-facing message + suggested recovery action.
 * Single source of truth for the 3 wrappers — they all render the same UI.
 */
export function telegramAuthErrorUI(kind: TelegramAuthError['kind']): {
  message: string;
  recovery: 'reload_mini_app' | 'retry' | 'none';
} {
  switch (kind) {
    case 'not_in_telegram':
    case 'no_init_data':
      return { message: 'Откройте приложение через Telegram бота', recovery: 'none' };
    case 'invalid_signature':
    case 'stale_data':
      return { message: 'Данные авторизации устарели. Перезагрузите Mini App', recovery: 'reload_mini_app' };
    case 'role_not_permitted':
      return { message: 'Доступ только для клиентов. Обратитесь к администратору', recovery: 'none' };
    case 'service_unavailable':
      return { message: 'Сервис временно недоступен. Попробуйте позже', recovery: 'retry' };
    case 'network':
      return { message: 'Нет связи с сервером. Проверьте интернет', recovery: 'retry' };
    case 'unknown':
      return { message: 'Не удалось авторизоваться. Попробуйте позже', recovery: 'retry' };
  }
}

/**
 * Convenience for recovery buttons. Reloads the Telegram Mini App via
 * the SDK — Telegram re-runs WebApp, provides fresh initData, and
 * /api/telegram-auth succeeds. Falls back to window.location.reload()
 * if Telegram WebApp is unavailable (emulated / broken context).
 */
export function reloadMiniApp(): void {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.reload) {
    tg.reload();
  } else {
    window.location.reload();
  }
}

/**
 * Lightweight wrapper: returns true if we already have a valid token
 * (in memory or sessionStorage). Use to skip the auth round-trip on
 * first render after Mini App reload — performance optimization only.
 */
export function hasExistingToken(): boolean {
  return !!getSessionToken();
}