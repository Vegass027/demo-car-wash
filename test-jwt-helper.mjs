#!/usr/bin/env node
/**
 * Unit tests for api/_lib/jwt.ts — signJwt + verifyJwt (Phase 1.5).
 * Runs the actual production module via --experimental-strip-types.
 *
 * Run: node --experimental-strip-types --no-warnings --test test-jwt-helper.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const jwtPath = path.join(process.cwd(), 'api', '_lib', 'jwt.ts');
const { signJwt, verifyJwt, base64url } =
  await import(pathToFileURL(jwtPath).href);

const SECRET = 'test-secret-not-real-' + 'x'.repeat(40);

function makeToken(payload, headerAlg = 'HS256', headerTyp = 'JWT', secret = SECRET) {
  const header = { alg: headerAlg, typ: headerTyp };
  const enc = (obj) => base64url(JSON.stringify(obj));
  const h = enc(header);
  const p = enc(payload);
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${base64url(sig)}`;
}

function makeExpiredToken() {
  return makeToken({
    sub: 'test-user',
    role: 'authenticated',
    app_role: 'client',
    profile_id: 'p-1',
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600, // expired 1h ago
  });
}

const validPayload = {
  sub: 'profile-uuid-1',
  role: 'authenticated',
  app_role: 'client',
  profile_id: 'profile-uuid-1',
  telegram_id: 12345,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 43200,
};

// V1: valid token
test('V1: verifyJwt(valid HS256 JWT) → returns claims with profile_id', () => {
  const tok = signJwt(validPayload, SECRET);
  const claims = verifyJwt(tok, SECRET);
  assert.equal(claims.sub, validPayload.sub);
  assert.equal(claims.app_role, 'client');
  assert.equal(claims.profile_id, validPayload.profile_id);
});

// V2: invalid signature
test('V2: verifyJwt with wrong secret → throws "Invalid signature"', () => {
  const tok = signJwt(validPayload, SECRET);
  assert.throws(() => verifyJwt(tok, 'wrong-secret-' + 'y'.repeat(40)), /Invalid signature/);
});

// V3: expired
test('V3: verifyJwt with expired exp → throws "Token expired"', () => {
  const tok = makeExpiredToken();
  assert.throws(() => verifyJwt(tok, SECRET), /expired/i);
});

// V4: not 3 parts
test('V4: verifyJwt("abc") → throws "Malformed token: not 3 parts"', () => {
  assert.throws(() => verifyJwt('abc', SECRET), /not 3 parts/);
});

// V5: invalid base64url alphabet
test('V5: verifyJwt with invalid base64url in header → throws "Invalid base64url"', () => {
  // header "aaa!bbb" — "!" is not base64url alphabet. Three parts split works
  // (no "not 3 parts" error), so we expect either base64url or header error.
  const tok = `aaa!bbb.${base64url(JSON.stringify(validPayload))}.${base64url(Buffer.from('sig'))}`;
  assert.throws(() => verifyJwt(tok, SECRET), /base64url|Malformed JWT header/i);
});

// V6: malformed JSON in payload
test('V6: verifyJwt with non-JSON payload → throws "Malformed JWT payload"', () => {
  // Construct token with payload that's valid base64url but not JSON
  const headerEnc = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadEnc = base64url('not-json-{[broken');
  const sigEnc = base64url(Buffer.from('sig'));
  const data = `${headerEnc}.${payloadEnc}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest();
  const tok = `${data}.${base64url(sig)}`;
  assert.throws(() => verifyJwt(tok, SECRET), /payload/i);
});

// V7: alg=none (algorithm confusion attack)
test('V7: verifyJwt with alg=none → throws "Unsupported JWT algorithm"', () => {
  // Manually craft an alg=none token. Signature is empty (alg=none).
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(validPayload));
  // alg=none tokens typically have empty signature
  const tok = `${header}.${payload}.`;
  assert.throws(() => verifyJwt(tok, SECRET), /Unsupported JWT algorithm/i);
});

// V8: alg=HS512 (different symmetric algorithm — also attack vector)
test('V8: verifyJwt with alg=HS512 → throws "Unsupported JWT algorithm"', () => {
  const tok = makeToken(validPayload, 'HS512', 'JWT', SECRET);
  assert.throws(() => verifyJwt(tok, SECRET), /Unsupported JWT algorithm/i);
});

// V9: modified payload invalidates signature
test('V9: verifyJwt with tampered payload → throws "Invalid signature"', () => {
  const tok = signJwt(validPayload, SECRET);
  const [h, p, s] = tok.split('.');
  const tamperedPayload = base64url(JSON.stringify({ ...validPayload, app_role: 'owner' }));
  const tampered = `${h}.${tamperedPayload}.${s}`;
  assert.throws(() => verifyJwt(tampered, SECRET), /Invalid signature/);
});

// V10: empty string
test('V10: verifyJwt("") → throws "Malformed token"', () => {
  assert.throws(() => verifyJwt('', SECRET), /Malformed token/);
});

// Extra: signJwt + verifyJwt round-trip preserves all claims
test('V-extra: signJwt + verifyJwt round-trip preserves nested claims', () => {
  const complexPayload = {
    sub: 'sub-1',
    role: 'authenticated',
    app_role: 'client',
    profile_id: 'profile-id-1',
    telegram_id: 999999999,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
    custom: { nested: { key: 'value' } },
  };
  const tok = signJwt(complexPayload, SECRET);
  const claims = verifyJwt(tok, SECRET);
  assert.equal(claims.app_role, 'client');
  assert.equal(claims.profile_id, 'profile-id-1');
  assert.deepEqual(claims.custom, { nested: { key: 'value' } });
});

// Extra: missing typ in header → rejected
test('V-extra: verifyJwt with alg=HS256 but missing typ → throws', () => {
  const header = base64url(JSON.stringify({ alg: 'HS256' })); // no typ
  const payload = base64url(JSON.stringify(validPayload));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest();
  const tok = `${data}.${base64url(sig)}`;
  assert.throws(() => verifyJwt(tok, SECRET), /Unsupported JWT algorithm/);
});

// Extra: tampered signature (FIRST char changed — flipping last char can
// fall into padding bits that don't affect decoded bytes for HS256)
test('V-extra: verifyJwt with tampered signature (first char) → throws "Invalid signature"', () => {
  const tok = signJwt(validPayload, SECRET);
  const [h, p, s] = tok.split('.');
  // Flip first char of signature (guaranteed to change decoded bytes)
  const firstChar = s.slice(0, 1);
  const flipped = firstChar === 'A' ? 'B' : 'A';
  const tampered = `${h}.${p}.${flipped}${s.slice(1)}`;
  assert.throws(() => verifyJwt(tampered, SECRET), /Invalid signature/);
});