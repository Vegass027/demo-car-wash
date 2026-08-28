/**
 * lib/realtime-auth.ts
 *
 * Realtime auth lifecycle for supabase-js WebSocket subscriptions.
 *
 * Why a separate module: keeping `supabase.realtime` reference here
 * avoids a sync import cycle between `lib/_supabase-wrapper.ts`
 * (which calls `setSessionToken()` from many lifecycle paths) and
 * `lib/supabase.ts` (which owns `createClient()` and exports `supabase`).
 *
 * Wiring order at module-load time:
 *
 *   1. `App.tsx` (or any importer) → `import 'lib/supabase'`
 *   2. `lib/supabase.ts` loads `_supabase-wrapper.ts` first (sync).
 *   3. `_supabase-wrapper.ts` module-eval restores JWT from sessionStorage
 *      by calling `setSessionToken(stored)` — which inside may call
 *      `setRealtimeAuth(stored)`. This is a no-op because no client is
 *      registered yet.
 *   4. `lib/supabase.ts` runs `createClient(...)` → supabase ready.
 *   5. `lib/supabase.ts` calls `registerRealtimeClient(supabase.realtime, getSessionToken())`.
 *      If step 3 set `currentToken`, the optional `initialToken` argument
 *      synchronously fires `client.setAuth(initialToken)` so the WS
 *      receives the restored JWT from the first channel subscription.
 *   6. UI mounts; channels `.subscribe()`; supabase-js uses the auth
 *      attached by step 5.
 *
 * Public API:
 *   - registerRealtimeClient(client, initialToken?)
 *       Called exactly once, from `lib/supabase.ts`, immediately after
 *       `createClient()`. Passing `initialToken !== null` synchronously
 *       attaches auth to active WS. Idempotent on subsequent calls
 *       (overwrites previous registration).
 *   - setRealtimeAuth(token | null)
 *       Idempotent. No-op until `registerRealtimeClient` has been called.
 *       Use `null` to clear — in this realtime-js version, `setAuth(null)`
 *       falls back to cached value so a logout must additionally call
 *       `supabase.removeAllChannels()` to disconnect active WS.
 *   - getRealtimeClient()
 *       For diagnostics / future tests. Returns the registered client or
 *       null if registration hasn't happened yet.
 */

type RealtimeClientLike = {
  setAuth(token: string | null): Promise<void>;
};

let _realtimeClient: RealtimeClientLike | null = null;

export function registerRealtimeClient(
  client: RealtimeClientLike,
  initialToken: string | null = null
): void {
  _realtimeClient = client;
  if (initialToken !== null && initialToken !== '') {
    client.setAuth(initialToken).catch((e) => {
      console.warn('[realtime-auth] initial sync setAuth failed:', e);
    });
  }
}

export async function setRealtimeAuth(token: string | null): Promise<void> {
  if (!_realtimeClient) return;
  try {
    await _realtimeClient.setAuth(token);
  } catch (e) {
    console.warn('[realtime-auth] setAuth failed:', e);
  }
}

export function getRealtimeClient(): RealtimeClientLike | null {
  return _realtimeClient;
}
