/**
 * lib/supabase.ts
 *
 * Phase 1.4 of carwash-full-security-lockdown-plan.md.
 * Supabase singleton with custom fetch wrapper that injects
 * Authorization: Bearer <jwt> header when a session token is set.
 *
 * Public API:
 *   - supabase            : SupabaseClient (existing usage unchanged in 17 files)
 *   - setSessionToken(t)  : set/clear JWT in module-level currentToken
 *
 * Behavior:
 *   - Module load (browser only): restore currentToken from sessionStorage['sb_token']
 *   - Every supabase-js request: wrappedFetch injects Authorization if currentToken set
 *   - On 401 (client session only): one silent retry via /api/telegram-auth
 *   - On 401 (staff session): no retry, returns 401 (caller handles via setSessionToken(null))
 *
 * Staff: token is in-memory only — Login.tsx does NOT write to sessionStorage.
 *        Reload = re-login (per plan §"Хранение токена").
 * Client: token in memory + sessionStorage backup (per plan §"Хранение токена").
 * First render reads sessionStorage to skip the auth round-trip.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

const SESSION_STORAGE_KEY = 'sb_token';

// Module-level singleton — the only place the current JWT lives.
let currentToken: string | null = null;

// Restore on first module load (browser only). sessionStorage may throw in
// private mode or if disabled — swallow silently. Staff never writes here,
// so for staff this is a no-op; for client this skips the silent re-auth
// round-trip on first render.
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) currentToken = stored;
  } catch {
    /* sessionStorage недоступен — staff-only path */
  }
}

/**
 * Set or clear the current session token.
 * Callers (Login.tsx, Client*Wrapper.tsx) own sessionStorage policy:
 *   - Login.tsx (admin/owner): setSessionToken(token) only — staff never persists.
 *   - Client*Wrapper.tsx: setSessionToken(token) + sessionStorage.setItem (caller).
 *
 * Passing null ALWAYS clears sessionStorage too — defends against stale
 * client tokens being auto-restored in the next tab after logout.
 */
export function setSessionToken(t: string | null): void {
  currentToken = t;
  if (typeof window !== 'undefined' && t === null) {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function injectAuth(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers);
  if (currentToken) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }
  return { ...options, headers };
}

function isClientSession(): boolean {
  if (typeof window === 'undefined') return false;
  const tg = (window as any).Telegram?.WebApp;
  return !!tg && !!tg.initData;
}

/**
 * Silent re-auth for client (Telegram Mini App) only.
 * Uses the current initData which is always fresh (Telegram rotates it
 * on every WebApp reload). Returns the new JWT, or null on failure.
 * Uses raw fetch (not wrappedFetch) — would otherwise recurse on 401.
 */
async function silentTelegramReauth(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const tg = (window as any).Telegram?.WebApp;
  if (!tg?.initData) return null;
  try {
    const res = await fetch('/api/telegram-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Custom fetch for supabase-js that:
 *   1. Injects Authorization: Bearer <jwt> when currentToken is set
 *   2. On 401, in CLIENT session only, retries ONCE with fresh token
 *      from /api/telegram-auth
 *
 * retriedThisRequest is LOCAL (per-invocation), not module-level —
 * App.tsx fires many parallel supabase calls; a module-level flag
 * would race between concurrent awaits and either skip retries that
 * should happen or retry twice when we shouldn't.
 */
async function wrappedFetch(
  url: RequestInfo | URL,
  options: RequestInit = {}
): Promise<Response> {
  let retriedThisRequest = false;

  let res = await fetch(url, injectAuth(options));

  if (res.status === 401 && !retriedThisRequest && isClientSession()) {
    retriedThisRequest = true;
    const newToken = await silentTelegramReauth();
    if (newToken) {
      setSessionToken(newToken);
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, newToken);
      } catch {
        /* ignore */
      }
      res = await fetch(url, injectAuth(options));
    }
  }

  return res;
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    global: { fetch: wrappedFetch },
    auth: {
      // We don't use supabase-js auth — JWT comes from /api/login or
      // /api/telegram-auth. Disable auto-refresh and session detection
      // so supabase-js doesn't fight our wrapper.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);