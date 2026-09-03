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
 * Decode JWT payload (no signature verification — server is the authority).
 * Returns the claims object or null on malformed input. Used at module-load
 * to filter expired tokens BEFORE setting currentToken.
 *
 * Why client-side filter: we never want to restore a token that's already
 * past `exp`. The server will reject it with 401 on the next call, but
 * keeping it in memory means a brief window of failed requests on reload.
 *
 * Exported for unit tests (Issue 14).
 */
export function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const claims = JSON.parse(json);
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Single source of truth for the JWT lifecycle (Phase D + Issue 14).
 * Every REST + Realtime auth path goes through here:
 *   - Staff login (Login.tsx)
 *   - Telegram client login (lib/client-auth.ts)
 *   - Silent Telegram re-auth (wrappedFetch 401-retry)
 *   - Staff 401-expiry clear (wrappedFetch cleanup branch)
 *   - Manual logout (App.tsx handleLogout)
 *   - Page reload restore (Issue 14)
 *
 * Centralizing `void setRealtimeAuth(t)` here means future lifecycle code
 * that touches auth will see realtime WS get sync'd automatically without
 * having to remember to wire it.
 *
 * Logout semantics: setSessionToken(null) syncs WebSocket (no-op in our
 * realtime-js config because cached fallback) and the caller is responsible
 * for `supabase.removeAllChannels()` to actually tear down active WS.
 *
 * Issue 14 (staff F5-resilience): staff path now writes to sessionStorage
 * so the JWT survives a page reload within the same tab. Telegram client
 * path already used sessionStorage for the same reason (line below). The
 * expiry filter on restore means an expired stored token is silently
 * cleared rather than causing a flash of failed requests.
 */
export function setSessionToken(t: string | null): void {
  currentToken = t;
  if (typeof window !== 'undefined') {
    try {
      if (t === null) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } else {
        sessionStorage.setItem(SESSION_STORAGE_KEY, t);
      }
    } catch {
      /* sessionStorage unavailable (private mode, disabled) — ignore */
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
// private mode or if disabled — swallow silently.
//
// Issue 14: this branch now also serves the staff F5-resilience path.
// Before Issue 14, only Telegram client tokens were ever written to
// sessionStorage; staff tokens lived in module-level memory only and were
// lost on every page reload. After Issue 14, staff Login.tsx calls
// setSessionToken(token) which writes to sessionStorage here, and this
// IIFE restores it on the next module evaluation (every page load).
//
// Expiry filter: if the stored token's `exp` claim is in the past, we
// silently clear it and skip restoration. Prevents a flash of 401s on
// reload after the 12-hour TTL has elapsed while the tab stayed open.
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const claims = decodeJwtPayload(stored);
      const expMs = typeof claims?.exp === 'number' ? claims.exp * 1000 : 0;
      if (expMs > Date.now()) {
        setSessionToken(stored);
      } else {
        // Expired — clean up silently.
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  } catch {
    /* sessionStorage недоступен */
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
      // setSessionToken persists to sessionStorage (Issue 14).
      setSessionToken(newToken);
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