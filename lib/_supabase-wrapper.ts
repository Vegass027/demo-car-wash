/**
 * lib/_supabase-wrapper.ts
 *
 * Pure JWT-injection fetch wrapper for supabase-js.
 * No Vite-specific APIs (no import.meta.env) — testable in plain Node.
 *
 * Public API:
 *   - setSessionToken(t)  : set/clear current JWT in module-level singleton
 *   - wrappedFetch        : custom fetch that adds Authorization and handles 401 retry
 *
 * Used by lib/supabase.ts which wires it into createClient().
 * Behavior:
 *   - When currentToken set: every request gets Authorization: Bearer <jwt>
 *   - On 401 in client session (Telegram WebApp present): one silent re-auth
 *     via /api/telegram-auth, then retry
 *   - On 401 in any other mode: return 401 unchanged (staff/anonymous)
 *
 * retriedThisRequest is LOCAL per wrappedFetch invocation, not module-level —
 * App.tsx fires many parallel supabase calls; module-level flag would race
 * between concurrent awaits.
 */

import { setRealtimeAuth } from './realtime-auth';

const SESSION_STORAGE_KEY = 'sb_token';

// Module-level singleton — the only place the current JWT lives.
let currentToken: string | null = null;

// Centralized 401 handler for staff sessions.
// When a staff user's JWT expires mid-session (12h TTL), any of 17+ importers
// of supabase-js may hit a 401. Without a central handler, the failure is
// silent (form doesn't save, no explanation). App.tsx registers one callback
// here on mount; when invoked, it clears UI state and shows a re-login prompt.
let onSessionExpired: (() => void) | null = null;

export function registerSessionExpiredHandler(cb: (() => void) | null): void {
  onSessionExpired = cb;
}

/**
 * Single source of truth for the JWT lifecycle (Phase D).
 * Every REST + Realtime auth path goes through here:
 *   - Staff login (Login.tsx)
 *   - Telegram client login (lib/client-auth.ts)
 *   - Silent Telegram re-auth (wrappedFetch 401-retry)
 *   - Staff 401-expiry clear (wrappedFetch cleanup branch)
 *   - Manual logout (App.tsx handleLogout)
 *   - Future refresh flow
 *
 * Centralizing `void setRealtimeAuth(t)` here means future lifecycle code
 * that touches auth will see realtime WS get sync'd automatically without
 * having to remember to wire it.
 *
 * Logout semantics: setSessionToken(null) syncs WebSocket (no-op in our
 * realtime-js config because cached fallback) and the caller is responsible
 * for `supabase.removeAllChannels()` to actually tear down active WS.
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
  void setRealtimeAuth(t);
}

/**
 * Current token getter — used by lib/supabase.ts to verify state in tests,
 * and by potential future helpers.
 */
export function getSessionToken(): string | null {
  return currentToken;
}

// Restore on first module load (browser only). sessionStorage may throw in
// private mode or if disabled — swallow silently. Staff never writes here.
// Run AFTER setSessionToken declaration so we go through the same
// centralized lifecycle (and trigger a single setRealtimeAuth attempt).
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) setSessionToken(stored);
  } catch {
    /* sessionStorage недоступен — staff-only path */
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
 * Custom fetch for supabase-js.
 * retriedThisRequest is LOCAL — see file-level comment.
 */
export async function wrappedFetch(
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

  // Staff 401 (no silent retry): notify App.tsx so it can show re-login UI.
  // Token is cleared so subsequent requests are anonymous (matching what
  // a logged-out user would see). App.tsx handler is responsible for
  // clearing userId/userRole state and showing the Login screen.
  if (res.status === 401 && !isClientSession() && currentToken !== null) {
    setSessionToken(null);
    onSessionExpired?.();
  }

  return res;
}