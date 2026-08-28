// Phase B smoke test — 8 new client dispatcher actions.
// Requires manually-signed client JWT (test client profile_id from DB).
// Run AFTER deploy. Run: /usr/local/bin/node phase-b-smoke.mjs
import crypto from 'crypto';

const DEMO_URL = 'https://demo-car-wash.vercel.app';
const TEST_CLIENT_PROFILE_ID = 'de8998b6-0725-46de-89e5-a89061daa2b5'; // [TEST ONLY] Tire Test Client
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'zFjGTAEPZc7Xl0NV6Pyg4vgl5WxbA9xEZSwrv63n/zPk+AQcWlL5YYnpquuCYZXuDcwubZCoNGlgQTDHE/4v8Q==';

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signClientJwt(profileId) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: profileId,
    role: 'authenticated',
    app_role: 'client',
    profile_id: profileId,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${sig}`;
}

const TOKEN = signClientJwt(TEST_CLIENT_PROFILE_ID);

async function call(action, body = {}) {
  const res = await fetch(`${DEMO_URL}/api/client?action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

const results = [];
function record(name, ok, detail, status) {
  results.push({ name, ok, detail, status });
  console.log(`${ok ? '✅' : '❌'} [${name}] HTTP ${status}: ${detail}`);
}

async function main() {
  // === 8 Phase B actions ===
  for (const action of [
    'get-my-cancellation-count',
    'get-my-block-status',
    'get-my-loyalty-progress',
    'get-my-free-wash-status',
    'get-my-washes-until-next-free-wash',
    'get-my-profile',
    'get-my-client',
    'get-my-client-email',
  ]) {
    const r = await call(action);
    const okShape = r.status === 200 && r.data?.data && typeof r.data.data === 'object';
    record(action, okShape, JSON.stringify(r.data).slice(0, 200), r.status);
  }

  // === Body identity injection attempt (must NOT be honored) ===
  console.log('\n=== Security: identity injection via body ===');
  // Try to read another profile_id by passing it in body.
  // Per spec: handlers MUST ignore body.profile_id and use claims.profile_id.
  const r = await call('get-my-profile', {
    profile_id: '00000000-0000-0000-0000-000000000000', // attacker claim
    // other body fields...
  });
  // If dispatcher is correct: returns TEST_CLIENT_PROFILE_ID (55555-...) data, NOT 00000000
  const gotCorrectId = r.data?.data?.profile?.id === TEST_CLIENT_PROFILE_ID;
  record(
    'get-my-profile ignores body.profile_id',
    gotCorrectId,
    `returned id=${r.data?.data?.profile?.id} (expected ${TEST_CLIENT_PROFILE_ID})`,
    r.status
  );

  // === Auth: missing token ===
  console.log('\n=== Security: missing token ===');
  const r2 = await fetch(`${DEMO_URL}/api/client?action=get-my-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const noAuthOk = r2.status === 401;
  record(
    'no token → 401',
    noAuthOk,
    `status=${r2.status}`,
    r2.status
  );

  // === Auth: wrong role ===
  console.log('\n=== Security: wrong role (admin token trying client endpoint) ===');
  // Get admin token
  const adminLogin = await fetch(`${DEMO_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'demo_admin', password: 'test1234' }),
  });
  const adminData = await adminLogin.json();
  const adminToken = adminData.token;
  const r3 = await fetch(`${DEMO_URL}/api/client?action=get-my-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({}),
  });
  const wrongRoleOk = r3.status === 403;
  record(
    'admin token on client endpoint → 403',
    wrongRoleOk,
    `status=${r3.status}`,
    r3.status
  );

  // === Unknown action ===
  console.log('\n=== Unknown action ===');
  const r4 = await call('this-action-does-not-exist');
  record(
    'unknown action → 404',
    r4.status === 404,
    `status=${r4.status}`,
    r4.status
  );

  // === Summary ===
  console.log('\n=== SUMMARY ===');
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log(`PASS: ${ok} / ${results.length}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) {
    console.log('\nFAILED:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  ❌ [${r.name}]: ${r.detail}`);
    });
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
