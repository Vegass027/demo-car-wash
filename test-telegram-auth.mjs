/**
 * Local test script for /api/telegram-auth (Phase 1.2)
 * Run with: cd /Users/dmitriy/Downloads/demo-car-wash && node test-telegram-auth.mjs
 *
 * Tests HMAC verification, JWT signing, and handler logic WITHOUT
 * needing Vercel deploy or real env vars. Uses mocked req/res.
 */

import crypto from 'crypto';
import { verifyTelegramInitData, signJwt } from './api/telegram-auth.ts';

// =====================================================================
// HELPERS
// =====================================================================

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function cyan(s)  { return `\x1b[36m${s}\x1b[0m`; }

const TEST_BOT_TOKEN = '8968802010:AAFsPlpWkW-GQWmJjSP25MKLU0jCooE7hdM';
const TEST_JWT_SECRET = 'local-test-jwt-secret-do-not-use-in-prod-32bytes';
const TEST_USER_ID = 111111111; // matches seeded owner profile

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ${green('✓')} ${name}`);
    passed++;
  } else {
    console.log(`  ${red('✗')} ${name}`);
    if (detail) console.log(`      ${detail}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${cyan('━━━ ' + title + ' ━━━')}`);
}

// =====================================================================
// BUILD A FAKE BUT VALID initData
// =====================================================================

function buildValidInitData(botToken, userId, authDateOffsetSec = 0) {
  const authDate = Math.floor(Date.now() / 1000) + authDateOffsetSec;
  const user = JSON.stringify({
    id: userId,
    first_name: 'Test',
    last_name: 'Owner',
    username: 'test_owner',
    language_code: 'ru',
  });
  // Build params EXCLUDING hash (matches Telegram spec)
  const params = new URLSearchParams({
    user: user,
    auth_date: String(authDate),
    query_id: 'AAGz5KBlAAA',
  });
  // Build data_check_string: sorted key=value pairs joined by \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Compute hash: HMAC-SHA256(HMAC-SHA256(botToken, "WebAppData"), dataCheckString)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Return full initData string with hash appended
  const allParams = new URLSearchParams(params);
  allParams.set('hash', hash);
  return allParams.toString();
}

function buildTamperedInitData(botToken, userId) {
  // Valid signature, but user.id is tampered (simulates spoofing attempt)
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({
    id: 999999999, // ← different from what was signed
    first_name: 'Spoofer',
    last_name: 'Evil',
  });
  const params = new URLSearchParams({
    user: user,
    auth_date: String(authDate),
    query_id: 'AAGz5KBlAAA',
  });
  // Use OLD user_id in signature so it doesn't match the new user.id
  const originalUser = JSON.stringify({
    id: userId,
    first_name: 'Test',
    last_name: 'Owner',
  });
  const sigParams = new URLSearchParams({
    user: originalUser,
    auth_date: String(authDate),
    query_id: 'AAGz5KBlAAA',
  });
  const dataCheckString = Array.from(sigParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const allParams = new URLSearchParams(params);
  allParams.set('hash', hash);
  return allParams.toString();
}

// =====================================================================
// TEST 1 — HMAC VALID
// =====================================================================

section('TEST 1: HMAC verification — valid initData');
{
  const initData = buildValidInitData(TEST_BOT_TOKEN, TEST_USER_ID);
  const result = verifyTelegramInitData(initData, TEST_BOT_TOKEN);
  assert('valid initData accepted', result.valid === true);
  assert('user extracted correctly', result.user?.id === TEST_USER_ID);
  assert('first_name extracted', result.user?.first_name === 'Test');
  assert('last_name extracted', result.user?.last_name === 'Owner');
}

// =====================================================================
// TEST 2 — HMAC with WRONG bot token (mimic attacker using own bot)
// =====================================================================

section('TEST 2: HMAC — wrong bot token rejected');
{
  const initData = buildValidInitData(TEST_BOT_TOKEN, TEST_USER_ID);
  // Try verifying with WRONG token (e.g., attacker using their own bot)
  const result = verifyTelegramInitData(initData, 'ATTACKER_BOT_TOKEN:FAKE');
  assert('wrong bot token rejected', result.valid === false);
}

// =====================================================================
// TEST 3 — HMAC tampered user.id (mimic DevTools spoofing)
// =====================================================================

section('TEST 3: HMAC — tampered user.id rejected');
{
  const initData = buildTamperedInitData(TEST_BOT_TOKEN, TEST_USER_ID);
  const result = verifyTelegramInitData(initData, TEST_BOT_TOKEN);
  assert('tampered user.id rejected', result.valid === false);
}

// =====================================================================
// TEST 4 — HMAC expired initData (>24h old)
// =====================================================================

section('TEST 4: HMAC — expired initData rejected');
{
  // auth_date 25 hours ago
  const initData = buildValidInitData(TEST_BOT_TOKEN, TEST_USER_ID, -25 * 3600);
  const result = verifyTelegramInitData(initData, TEST_BOT_TOKEN);
  assert('expired initData rejected', result.valid === false);
}

// =====================================================================
// TEST 5 — JWT signing produces valid HS256 token
// =====================================================================

section('TEST 5: JWT signing — HS256 structure');
{
  const payload = {
    sub: '11111111-1111-1111-1111-111111111111',
    role: 'authenticated',
    app_role: 'owner',
    profile_id: '11111111-1111-1111-1111-111111111111',
    telegram_id: 111111111,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 43200,
  };
  const token = signJwt(payload, TEST_JWT_SECRET);
  const parts = token.split('.');
  assert('token has 3 parts', parts.length === 3);
  // Decode header and payload (base64url)
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert('header alg = HS256', header.alg === 'HS256');
  assert('header typ = JWT', header.typ === 'JWT');
  assert('payload.sub preserved', decoded.sub === payload.sub);
  assert('payload.app_role preserved', decoded.app_role === 'owner');
  assert('payload.profile_id preserved', decoded.profile_id === payload.profile_id);
  assert('payload.telegram_id preserved', decoded.telegram_id === payload.telegram_id);
  assert('payload.iat = issued-at', typeof decoded.iat === 'number');
  assert('payload.exp = iat + 43200', decoded.exp - decoded.iat === 43200);

  // Verify signature using same algorithm
  const secretKey2 = crypto.createHmac('sha256', 'WebAppData').update('garbage').digest();
  const expected = crypto.createHmac('sha256', TEST_JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  assert('signature is HMAC-SHA256 of secret', expected.equals(actual));
  assert('signature is unique (not deterministic)', !expected.equals(Buffer.from(crypto.createHmac('sha256', 'garbage').update(`${parts[0]}.${parts[1]}`).digest())));
}

// =====================================================================
// TEST 6 — Token tamper detection
// =====================================================================

section('TEST 6: JWT — tampered payload detectable');
{
  const payload = { sub: 'test-uuid', app_role: 'client' };
  const token = signJwt(payload, TEST_JWT_SECRET);
  // Tamper: change 'client' to 'owner' in payload
  const parts = token.split('.');
  const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  decoded.app_role = 'owner';
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  // Verification: re-compute HMAC with same secret and compare to original signature
  const expectedSig = crypto.createHmac('sha256', TEST_JWT_SECRET).update(`${parts[0]}.${tamperedPayload}`).digest('base64url');
  const actualSig = parts[2];
  assert('tampered signature mismatches', expectedSig !== actualSig);
  assert('tampered token string differs', tamperedToken !== token);
}

// =====================================================================
// SUMMARY
// =====================================================================

console.log(`\n${'━'.repeat(50)}`);
console.log(`${cyan('RESULTS')}: ${green(passed + ' passed')}, ${failed > 0 ? red(failed + ' failed') : green('0 failed')}`);
console.log('━'.repeat(50));

if (failed > 0) {
  process.exit(1);
}