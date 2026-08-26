#!/usr/bin/env node
/**
 * Unit tests for lib/_supabase-wrapper.ts (Phase 1.4).
 * Runs the actual production wrapper module via --experimental-strip-types.
 *
 * Run: node --experimental-strip-types --no-warnings --test test-supabase-wrapper.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const wrapperPath = path.join(process.cwd(), 'lib', '_supabase-wrapper.ts');
const { setSessionToken, getSessionToken, wrappedFetch } =
  await import(pathToFileURL(wrapperPath).href);

// Polyfill window so wrapper's isClientSession() works in Node.
// (Wrapper checks `window.Telegram`; in real browsers window === globalThis,
// in Node we set globalThis.window = globalThis so the same code works.)
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// === Test infrastructure ===
let fetchCalls = [];
let fetchResponses = []; // queue of mocked responses
const originalFetch = globalThis.fetch;

// Extract headers from Headers instance, plain object, or array of pairs.
// Production wrapper passes a Headers instance via injectAuth() — spread on
// Headers object gives {} (not iterable as key-value pairs), so we iterate.
function extractHeaders(h) {
  const out = {};
  if (!h) return out;
  if (h instanceof Headers) {
    for (const [k, v] of h.entries()) out[k] = v;
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = v;
  } else {
    Object.assign(out, h);
  }
  return out;
}
globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  fetchCalls.push({
    url: urlStr,
    method: options?.method || 'GET',
    headers: extractHeaders(options?.headers),
    body: options?.body,
  });
  if (urlStr.includes('/api/telegram-auth')) {
    return new Response(JSON.stringify({ token: 'fresh.telegram.token' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  const next = fetchResponses.shift() || { status: 200, body: [] };
  return new Response(JSON.stringify(next.body), {
    status: next.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

function reset() {
  fetchCalls = [];
  fetchResponses = [];
  setSessionToken(null);
  delete globalThis.Telegram;
}

// ============================================================
test('T1: module exports setSessionToken, getSessionToken, wrappedFetch', () => {
  assert.equal(typeof setSessionToken, 'function');
  assert.equal(typeof getSessionToken, 'function');
  assert.equal(typeof wrappedFetch, 'function');
});

// ============================================================
test('T2: setSessionToken(null) — getSessionToken returns null', () => {
  reset();
  setSessionToken('initial.token');
  assert.equal(getSessionToken(), 'initial.token');
  setSessionToken(null);
  assert.equal(getSessionToken(), null);
});

// ============================================================
test('T3: wrappedFetch injects Authorization: Bearer <token> when currentToken set', async () => {
  reset();
  setSessionToken('my.test.jwt');
  fetchResponses.push({ status: 200, body: [] });
  await wrappedFetch('https://example.com/api', {});
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].headers['authorization'], 'Bearer my.test.jwt');
});

// ============================================================
test('T4: wrappedFetch WITHOUT token — no Authorization header (anon path)', async () => {
  reset();
  fetchResponses.push({ status: 200, body: [] });
  await wrappedFetch('https://example.com/api', {});
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].headers['authorization'], undefined);
});

// ============================================================
test('T5: 401 in staff mode (no Telegram WebApp) — returns 401 unchanged, NO retry', async () => {
  reset();
  setSessionToken('staff.token');
  fetchResponses.push({ status: 401, body: { error: 'unauthorized' } });
  const res = await wrappedFetch('https://example.com/api', {});
  assert.equal(res.status, 401);
  assert.equal(fetchCalls.length, 1, 'expected exactly 1 call, NO silent re-auth');
});

// ============================================================
test('T6: 401 in client mode (Telegram WebApp present) — ONE retry with fresh token, then succeeds', async () => {
  reset();
  globalThis.Telegram = { WebApp: { initData: 'fake_init_data' } };
  setSessionToken('initial.client.token');
  fetchResponses.push({ status: 401, body: { error: 'expired' } });
  fetchResponses.push({ status: 200, body: [] });

  const res = await wrappedFetch('https://example.com/api', {});
  assert.equal(res.status, 200, 'retry should have succeeded');
  // 3 calls total: initial supabase 401 + /api/telegram-auth + retried supabase 200
  assert.equal(fetchCalls.length, 3, 'expected 3 calls: initial 401 + telegram-auth + retry 200');
  const supabaseCalls = fetchCalls.filter(c => !c.url.includes('/api/telegram-auth'));
  assert.equal(supabaseCalls.length, 2, 'expected 2 supabase calls: initial + retried');

  // First call: stale token
  assert.equal(supabaseCalls[0].headers['authorization'], 'Bearer initial.client.token');
  // Second call (retry): NEW token from /api/telegram-auth
  assert.equal(supabaseCalls[1].headers['authorization'], 'Bearer fresh.telegram.token');
  // currentToken was updated
  assert.equal(getSessionToken(), 'fresh.telegram.token');
});

// ============================================================
test('T7: local retriedThisRequest — concurrent 401s each get their own retry (race-condition proof)', async () => {
  reset();
  globalThis.Telegram = { WebApp: { initData: 'fake' } };
  setSessionToken('client.token');

  // Override fetch to count 401s vs telegram-auth calls separately
  let supabaseCalls401 = 0;
  let telegramAuthCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/telegram-auth')) {
      telegramAuthCalls++;
      return new Response(JSON.stringify({ token: 'fresh' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    supabaseCalls401++;
    return new Response('[]', {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  };

  // Fire 3 concurrent requests — all get 401
  await Promise.all([
    wrappedFetch('https://example.com/a', {}).catch(() => {}),
    wrappedFetch('https://example.com/b', {}).catch(() => {}),
    wrappedFetch('https://example.com/c', {}).catch(() => {}),
  ]);

  // Each initial 401 should trigger ONE telegram-auth retry. With module-level
  // flag, only the first would retry; with local flag, all 3 retry independently.
  // Total: 3 initial 401s + 3 telegram-auth + 3 retry 401s = 9 fetch calls;
  // 6 of those are supabase 401s, 3 are telegram-auth.
  assert.equal(supabaseCalls401, 6, 'expected 6 supabase 401s (3 initial + 3 retries)');
  assert.equal(telegramAuthCalls, 3,
    `expected 3 telegram-auth calls (one per concurrent request), got ${telegramAuthCalls}`);
});

// ============================================================
test('T8: cleanup — restore real fetch', () => {
  globalThis.fetch = originalFetch;
});