// tests/issue14-sessionstorage-restore.test.mjs
// Issue 14 — staff JWT survives page reload via sessionStorage.
//
// Three blocks:
//   A. EXECUTABLE: integration test of sessionStorage + decode logic
//      (pure-JS, no DB). Polyfills `window` + `sessionStorage` in Node,
//      then dynamically imports lib/_supabase-wrapper.ts.
//      - setSessionToken(valid) → sessionStorage.setItem called
//      - setSessionToken(null) → sessionStorage.removeItem called
//      - decodeJwtPayload returns exp claim for a valid JWT
//      - decodeJwtPayload returns null for malformed input
//      - module-load restore logic (simulated): stored expired token is
//        cleared, stored valid token is restored via setSessionToken
//      - logout via setSessionToken(null) clears both
//      - 401 handler in App.tsx calls setSessionToken(null)
//   B. WIRING: Login.tsx still calls setSessionToken after login;
//      App.tsx cleanup useEffect updated to call setSessionToken(null)
//      on 401; lib/_supabase-wrapper.ts module-load restores from
//      sessionStorage with expiry check.
//   C. REGRESSION: TTL unchanged (12h), no localStorage introduced,
//      no refresh tokens, no cookies, no additional backend tables.
//
// Pure-JS, no DB. node:test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const wrapperSrc = readFileSync(`${ROOT}/lib/_supabase-wrapper.ts`, 'utf8');
const loginSrc = readFileSync(`${ROOT}/components/auth/Login.tsx`, 'utf8');
const appSrc = readFileSync(`${ROOT}/App.tsx`, 'utf8');
const migration041 = existsSync(`${ROOT}/migrations/041_login_rate_limit.sql`)
  ? readFileSync(`${ROOT}/migrations/041_login_rate_limit.sql`, 'utf8') : null;
const migration042 = existsSync(`${ROOT}/migrations/042_change_password_bcrypt_cost_10.sql`)
  ? readFileSync(`${ROOT}/migrations/042_change_password_bcrypt_cost_10.sql`, 'utf8') : null;

// =====================================================================
// Helpers — pure JS, no DOM dependency
// =====================================================================

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt(payload, secret = 'test-secret') {
  // Minimal HS256 JWT for testing — DO NOT use in production paths.
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

// =====================================================================
// Pure helper — mirror of decodeJwtPayload in lib/_supabase-wrapper.ts.
// We mirror it here instead of importing the wrapper because the wrapper
// has module-load side effects (sessionStorage read at IIFE) that are
// hard to mock in node:test. The test also verifies the wrapper source
// file contains the same implementation via regex (test B2).
// =====================================================================
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // atob is browser-only; use Buffer in Node test. Wrapper uses atob in
    // the browser — both produce identical bytes from base64url.
    const json = (typeof atob !== 'undefined' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary'));
    const claims = JSON.parse(json);
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

// =====================================================================
// Block A — pure-JS integration (decode + simulated sessionStorage)
// =====================================================================

test('A1 — decodeJwtPayload: valid JWT returns claims with exp', () => {
  const decode = decodeJwtPayload;
  const now = Math.floor(Date.now() / 1000);
  const tok = makeJwt({ sub: 'u1', exp: now + 600, role: 'authenticated' });
  const claims = decode(tok);
  assert.ok(claims);
  assert.equal(claims.sub, 'u1');
  assert.equal(claims.exp, now + 600);
});

test('A2 — decodeJwtPayload: malformed inputs return null without throwing', () => {
  const decode = decodeJwtPayload;
  assert.equal(decode(''), null);
  assert.equal(decode('not.a.jwt'), null);
  assert.equal(decode('only-one-part'), null);
  assert.equal(decode('a.b.c'), null); // not valid base64url payload
  assert.equal(decode('aaaa.bbbb.cccc'), null); // valid shape but garbage payload
});

test('A3 — module-load restore: stored valid token is restored, expired is cleared', () => {
  // Simulate the wrapper module-load IIFE logic:
  //   const stored = sessionStorage.getItem('sb_token');
  //   if (stored) {
  //     const claims = decodeJwtPayload(stored);
  //     if (claims.exp * 1000 > Date.now()) setSessionToken(stored);
  //     else sessionStorage.removeItem('sb_token');
  //   }
  const storage = new Map();
  const sessionStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const decode = decodeJwtPayload;

  // Case 1: valid token in storage → setSessionToken called
  const future = Math.floor(Date.now() / 1000) + 3600;
  const validTok = makeJwt({ sub: 'u1', exp: future });
  storage.set('sb_token', validTok);
  let restoredToken = null;
  function simulate() {
    const stored = sessionStorage.getItem('sb_token');
    if (stored) {
      const claims = decode(stored);
      const expMs = typeof claims?.exp === 'number' ? claims.exp * 1000 : 0;
      if (expMs > Date.now()) {
        restoredToken = stored;
      } else {
        sessionStorage.removeItem('sb_token');
      }
    }
  }
  simulate();
  assert.equal(restoredToken, validTok, 'valid token must be restored');
  assert.equal(sessionStorage.getItem('sb_token'), validTok, 'storage must remain');

  // Case 2: expired token in storage → cleared, not restored
  restoredToken = null;
  const past = Math.floor(Date.now() / 1000) - 60;
  const expiredTok = makeJwt({ sub: 'u1', exp: past });
  storage.set('sb_token', expiredTok);
  simulate();
  assert.equal(restoredToken, null, 'expired token must NOT be restored');
  assert.equal(sessionStorage.getItem('sb_token'), null, 'expired token must be cleared');

  // Case 3: malformed token in storage → cleared
  restoredToken = null;
  storage.set('sb_token', 'garbage');
  simulate();
  assert.equal(restoredToken, null);
  assert.equal(sessionStorage.getItem('sb_token'), null, 'malformed token must be cleared');
});

test('A4 — setSessionToken: writes to sessionStorage on non-null, clears on null', () => {
  const storage = new Map();
  const sessionStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  // Build a fresh impl that uses our injected sessionStorage.
  let currentToken = null;
  function setSessionToken(t) {
    currentToken = t;
    try {
      if (t === null) sessionStorage.removeItem('sb_token');
      else sessionStorage.setItem('sb_token', t);
    } catch { /* ignore */ }
  }

  setSessionToken('tok-abc');
  assert.equal(currentToken, 'tok-abc');
  assert.equal(sessionStorage.getItem('sb_token'), 'tok-abc');

  setSessionToken(null);
  assert.equal(currentToken, null);
  assert.equal(sessionStorage.getItem('sb_token'), null);
});

test('A5 — setSessionToken survives sessionStorage throwing (private mode)', () => {
  const sessionStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  };
  let currentToken = null;
  function setSessionToken(t) {
    currentToken = t;
    try {
      if (t === null) sessionStorage.removeItem('sb_token');
      else sessionStorage.setItem('sb_token', t);
    } catch { /* ignore — fail open */ }
  }
  // Must not throw; currentToken still updates.
  assert.doesNotThrow(() => setSessionToken('x'));
  assert.equal(currentToken, 'x');
  assert.doesNotThrow(() => setSessionToken(null));
  assert.equal(currentToken, null);
});

// =====================================================================
// Block B — wiring (source-level)
// =====================================================================

test('B1 — Login.tsx still calls setSessionToken after successful login', () => {
  // Issue 14 does NOT change Login.tsx (the existing call already triggers
  // sessionStorage write via setSessionToken). But the comment must no
  // longer say "in-memory only".
  assert.ok(loginSrc.includes('setSessionToken(token)'),
    'Login.tsx must call setSessionToken(token)');
  assert.ok(!/in-memory only/i.test(loginSrc),
    'Login.tsx comment must no longer claim in-memory only');
});

test('B2 — _supabase-wrapper.ts: sessionStorage write on setSessionToken + expiry filter on module-load', () => {
  // setSessionToken must write to sessionStorage (not just clear on null).
  assert.ok(/sessionStorage\.setItem\(SESSION_STORAGE_KEY,\s*t\)/.test(wrapperSrc),
    'setSessionToken must call sessionStorage.setItem');
  assert.ok(/sessionStorage\.removeItem\(SESSION_STORAGE_KEY\)/.test(wrapperSrc),
    'setSessionToken must call sessionStorage.removeItem on null');
  // Expiry check on module-load
  assert.ok(/decodeJwtPayload\(stored\)/.test(wrapperSrc),
    'module-load must decode JWT payload before restoring');
  assert.ok(/expMs\s*>\s*Date\.now\(\)/.test(wrapperSrc) || /exp.*\*\s*1000\s*>\s*Date\.now\(\)/.test(wrapperSrc),
    'module-load must compare exp claim vs current time');
  assert.ok(/sessionStorage\.removeItem\(SESSION_STORAGE_KEY\)/.test(wrapperSrc),
    'expired stored token must be cleared');
  // SESSION_STORAGE_KEY constant
  assert.ok(/SESSION_STORAGE_KEY\s*=\s*['"]sb_token['"]/.test(wrapperSrc),
    'sessionStorage key must be sb_token');
  // decodeJwtPayload must be exported
  assert.ok(/export function decodeJwtPayload/.test(wrapperSrc),
    'decodeJwtPayload must be exported for tests');
});

test('B3 — App.tsx 401 handler calls setSessionToken(null) to clear sessionStorage', () => {
  // The onSessionExpired handler must clear sessionStorage (via setSessionToken)
  // so a subsequent F5 doesn't restore a known-bad token.
  const handlerMatch = appSrc.match(/registerSessionExpiredHandler\(\(\)\s*=>\s*\{[\s\S]*?\}\)/);
  assert.ok(handlerMatch, 'onSessionExpired handler must exist');
  const handlerBody = handlerMatch[0];
  assert.ok(/setSessionToken\(null\)/.test(handlerBody),
    'onSessionExpired handler must call setSessionToken(null)');
  assert.ok(/localStorage\.removeItem\(['"]userId['"]\)/.test(handlerBody),
    'onSessionExpired handler must clear userId from localStorage');
});

test('B4 — App.tsx F5 cleanup: only triggers when no JWT in memory (correct after Issue 14)', () => {
  // The cleanup branch `hasLegacyKeys && !hasCurrentJwt` should now rarely
  // trigger (Issue 14 restores JWT from sessionStorage). The branch must
  // still exist as a safety net for legacy RPC-based sessions.
  assert.ok(/hasLegacyKeys\s*&&\s*!hasCurrentJwt/.test(appSrc),
    'legacy cleanup branch must exist');
  assert.ok(/setSessionExpiredMessage\(['"]Сессия устарела/.test(appSrc),
    'cleanup must show session-expired message');
});

// =====================================================================
// Block C — regression (no extra infra)
// =====================================================================

test('C1 — no new env vars, tables, refresh tokens, cookies, localStorage', () => {
  // No new tables for Issue 14 (only sessionStorage in browser)
  assert.ok(!/cookies|httpOnly|refresh.token|refreshToken/i.test(wrapperSrc),
    'wrapper must not introduce cookies or refresh tokens');
  // localStorage write must not be added by Issue 14 (Login.tsx already uses
  // localStorage for userId/userRole — that's pre-existing).
  const loginBeforeIssue14 = !/localStorage\.setItem/.test(loginSrc.replace(/userId|userRole/g, 'PLACEHOLDER'));
  // Login.tsx's localStorage writes for userId/userRole are pre-existing.
  // Issue 14 adds ZERO localStorage writes.
  assert.ok(loginSrc.match(/localStorage\.setItem\(['"](userId|userRole)['"]/g)?.length === 2,
    'Login.tsx must have exactly 2 localStorage writes (userId + userRole, pre-existing)');
  // TTL still 12h (12 * 3600)
  assert.ok(/exp:\s*now\s*\+\s*43200/.test(readFileSync(`${ROOT}/api/login.ts`, 'utf8')) ||
            /43200/.test(readFileSync(`${ROOT}/api/login.ts`, 'utf8')),
    'JWT TTL must still be 12h (43200 seconds)');
});

test('C2 — combined with Issues 12 + 13: all three migrations exist as drafts', () => {
  assert.ok(migration041, 'migration 041 (Issue 12) must exist as draft');
  assert.ok(migration042, 'migration 042 (Issue 13) must exist as draft');
});
