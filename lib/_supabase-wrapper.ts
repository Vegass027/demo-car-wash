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

const SESSION_STORAGE_KEY = 'sb_token';

// Module-level singleton — the only place the current JWT lives.
let currentToken: string | null = null;

// Restore on first module load (browser only). sessionStorage may throw in
// private mode or if disabled — swallow silently. Staff never writes here.
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

/**
 * Current token getter — used by lib/supabase.ts to verify state in tests,
 * and by potential future helpers.
 */
export function getSessionToken(): string | null {
  return currentToken;
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

  return res;
}