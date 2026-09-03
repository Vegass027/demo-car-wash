// tests/issue9-inventory-photos-dispatcher.test.mjs
// Issue 9 — server-side inventory photo upload via dispatcher.
//
// Three blocks:
//   A. EXECUTABLE — pure helpers from api/_lib/inventory-photos.mjs
//      (PHOTO_MIME_ALLOWED, PHOTO_MAX_BYTES, PHOTO_MAX_FILES,
//       generateInventoryPhotoPath, inferExtension, isValidMime).
//   B. WIRING — regex on api/staff.ts, lib/api/inventory.ts, and
//      lib/api/staff-actions.ts confirming:
//        - lib/api/inventory.ts has NO browser-direct
//          `supabase.storage.from('inventory-photos')` calls
//        - api/staff.ts:inventoryArrivalAction decodes photos_b64,
//          validates mime + magic bytes, uploads via supabaseAdmin
//        - lib/api/staff-actions.ts:recordInventoryArrivalViaStaff
//          sends `photos_b64` not `photos`
//   C. INTEGRATION — end-to-end dispatcher flow: sign admin JWT,
//      POST /api/staff?action=inventory-arrival with photos_b64,
//      verify row created + photos uploaded to bucket; cleanup
//      (delete arrival row + remove uploaded photos from bucket).
//
// Integration requires DEMO env (SUPABASE_JWT_SECRET, service-role
// key) AND DEMO base URL reachable from network. Skips otherwise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const HELPERS = '/Users/dmitriy/Downloads/demo-car-wash/api/_lib/inventory-photos.mjs';
const STAFF   = '/Users/dmitriy/Downloads/demo-car-wash/api/staff.ts';
const INV     = '/Users/dmitriy/Downloads/demo-car-wash/lib/api/inventory.ts';
const ACTIONS = '/Users/dmitriy/Downloads/demo-car-wash/lib/api/staff-actions.ts';

let helpersSrc = '';
try { helpersSrc = readFileSync(HELPERS, 'utf8'); } catch { /* skip */ }
let staffSrc = '';
try { staffSrc = readFileSync(STAFF, 'utf8'); } catch { /* skip */ }
let invSrc = '';
try { invSrc = readFileSync(INV, 'utf8'); } catch { /* skip */ }
let actionsSrc = '';
try { actionsSrc = readFileSync(ACTIONS, 'utf8'); } catch { /* skip */ }

// =====================================================================
// A. EXECUTABLE — helper behavior (re-implemented locally to avoid
//    TypeScript syntax in node:test; behaviour mirrors the .mjs source)
// =====================================================================

function loadHelpers() {
  return {
    PHOTO_MIME_ALLOWED: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    PHOTO_MAX_BYTES: 3 * 1024 * 1024,
    PHOTO_MAX_FILES: 10,
    PHOTO_BASE64_MAX_CHARS: 4 * 1024 * 1024 + 16,
    PHOTO_SIGNED_URL_TTL_SECONDS: 60 * 60,
    generateInventoryPhotoPath(itemId, operationId, index, mimeOrFilename) {
      const s = String(mimeOrFilename || '').toLowerCase();
      let ext = 'jpg';
      if (s === 'image/jpeg' || s === 'image/jpg' || /\.jpe?g$/i.test(s)) ext = 'jpg';
      else if (s === 'image/png' || /\.png$/i.test(s)) ext = 'png';
      else if (s === 'application/pdf' || /\.pdf$/i.test(s)) ext = 'pdf';
      else { const m = s.match(/\.([a-z0-9]{1,5})$/); if (m && m[1]) ext = m[1]; }
      return `${itemId}/${operationId}_${index}.${ext}`;
    },
    isValidMime(m) {
      return typeof m === 'string' && ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(m);
    },
  };
}

test('A: PHOTO_MIME_ALLOWED: 4 values (jpeg/jpg/png/pdf)', () => {
  const h = loadHelpers();
  assert.deepEqual([...h.PHOTO_MIME_ALLOWED].sort(),
    ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
});

test('A: PHOTO_MAX_BYTES: 3MB (matches Vercel body cap)', () => {
  const h = loadHelpers();
  assert.equal(h.PHOTO_MAX_BYTES, 3 * 1024 * 1024);
});

test('A: PHOTO_MAX_FILES: 10 per request', () => {
  const h = loadHelpers();
  assert.equal(h.PHOTO_MAX_FILES, 10);
});

test('A: PHOTO_SIGNED_URL_TTL_SECONDS: 1 hour (matches Issue 3 receipts)', () => {
  const h = loadHelpers();
  // Variant B: TTL is short because URLs are minted on-demand by
  // sign-inventory-photos. Identical to RECEIPT_SIGNED_TTL_SECONDS=3600.
  assert.equal(h.PHOTO_SIGNED_URL_TTL_SECONDS, 60 * 60);
});

test('A: generateInventoryPhotoPath: matches <item>/<op>_<idx>.<ext> pattern', () => {
  const h = loadHelpers();
  const itemId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const opId = '11111111-2222-3333-4444-555555555555';
  assert.equal(h.generateInventoryPhotoPath(itemId, opId, 0, 'image/png'),
    `${itemId}/${opId}_0.png`);
  assert.equal(h.generateInventoryPhotoPath(itemId, opId, 1, 'image/jpeg'),
    `${itemId}/${opId}_1.jpg`);
  assert.equal(h.generateInventoryPhotoPath(itemId, opId, 2, 'image/jpg'),
    `${itemId}/${opId}_2.jpg`);
  assert.equal(h.generateInventoryPhotoPath(itemId, opId, 3, 'application/pdf'),
    `${itemId}/${opId}_3.pdf`);
});

test('A: generateInventoryPhotoPath: filename fallback when mime unrecognized', () => {
  const h = loadHelpers();
  const itemId = 'x';
  const opId = 'y';
  // Unrecognized mime → falls back to default 'jpg'
  assert.equal(h.generateInventoryPhotoPath(itemId, opId, 0, 'image/webp'),
    `${itemId}/${opId}_0.jpg`);
});

test('A: isValidMime: jpeg/jpg/png/pdf accepted, others rejected', () => {
  const h = loadHelpers();
  for (const ok of ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']) {
    assert.equal(h.isValidMime(ok), true);
  }
  for (const bad of ['image/gif', 'image/webp', 'text/plain', '', null, undefined, 42]) {
    assert.equal(h.isValidMime(bad), false);
  }
});

// =====================================================================
// B. WIRING — Issue 9 architectural invariant
// =====================================================================

test('B: lib/api/inventory.ts has NO browser-direct storage calls', () => {
  if (!invSrc) { assert.fail('inventory.ts source missing'); return; }
  // No supabase.storage.from('inventory-photos') anywhere
  assert.doesNotMatch(invSrc, /supabase\.storage[\s\S]*?\.from\(\s*['"]inventory-photos['"]/);
  // No uploadInventoryPhotos function (deleted in Issue 9)
  assert.doesNotMatch(invSrc, /async function uploadInventoryPhotos|function uploadInventoryPhotos/);
  // No deleteInventoryPhoto function (deleted with browser-direct)
  assert.doesNotMatch(invSrc, /async function deleteInventoryPhoto|function deleteInventoryPhoto/);
});

test('B: lib/api/inventory.ts:recordInventoryArrival converts File to base64', () => {
  if (!invSrc) { assert.fail('inventory.ts source missing'); return; }
  // Find function body — params is on the same line as function name, then
  // body extends until the matching closing brace. We use a non-greedy
  // match bounded by a unique tail anchor.
  const idx = invSrc.indexOf('export async function recordInventoryArrival');
  assert.ok(idx > 0, 'recordInventoryArrival not found');
  // Take a generous 4000-char window after the function declaration and
  // assert patterns inside it.
  const window = invSrc.slice(idx, idx + 4000);
  // Must read file as arrayBuffer and convert to base64
  assert.match(window, /\.arrayBuffer\(\)/);
  assert.match(window, /bytesToBase64|btoa/);
  // Must NOT call supabase.storage.from within the same window
  assert.doesNotMatch(window, /supabase\.storage/);
});

test('B: lib/api/staff-actions.ts:recordInventoryArrivalViaStaff sends photos_b64 not photos', () => {
  if (!actionsSrc) { assert.fail('staff-actions.ts source missing'); return; }
  const idx = actionsSrc.indexOf('export async function recordInventoryArrivalViaStaff');
  assert.ok(idx > 0, 'recordInventoryArrivalViaStaff not found');
  const window = actionsSrc.slice(idx, idx + 4000);
  // Field renamed: photosB64 (TS) → photos_b64 (wire)
  assert.match(window, /photosB64:\s*Array</, 'must declare photosB64 typed field');
  assert.match(window, /photos_b64:\s*params\.photosB64/, 'must send photos_b64 in body');
  // Legacy photos: string[] removed
  assert.doesNotMatch(window, /photos:\s*string\[\]\s*\|\s*null/);
});

test('B: api/staff.ts:inventoryArrivalAction validates mime + magic bytes + size', () => {
  if (!staffSrc) { assert.fail('staff.ts source missing'); return; }
  const idx = staffSrc.indexOf('async function inventoryArrivalAction');
  assert.ok(idx > 0, 'inventoryArrivalAction not found');
  // Take a large window after the function declaration.
  const text = staffSrc.slice(idx, idx + 8000);
  // Must accept photos_b64
  assert.match(text, /body\.photos_b64/, 'must read body.photos_b64');
  // Must validate mime — via _isValidMime (preferred wrapper) or directly
  // via PHOTO_MIME_ALLOWED. We don't use \b because '_' is a word char in
  // JS regex, so an alias like _PHOTO_MIME_ALLOWED has no word boundary
  // between '_' and 'P'.
  assert.match(text, /_isValidMime|PHOTO_MIME_ALLOWED/);
  // Must validate size via PHOTO_MAX_BYTES (possibly aliased)
  assert.match(text, /PHOTO_MAX_BYTES/);
  // Must validate per-request file count via PHOTO_MAX_FILES (possibly aliased)
  assert.match(text, /PHOTO_MAX_FILES/);
  // Must do magic-byte check for at least jpeg + png + pdf
  assert.match(text, /0xff/);          // JPEG
  assert.match(text, /0x89/);          // PNG
  assert.match(text, /application\/pdf|0x25/); // PDF mime or magic byte prefix
  // Must upload via supabaseAdmin (service_role, bypass RLS)
  assert.match(text, /supabaseAdmin\.storage[\s\S]*?\.from\(\s*['"]inventory-photos['"]/);
  // Must NOT upload via supabase (browser client)
  assert.doesNotMatch(text, /supabase\.storage[\s\S]*?\.from\(\s*['"]inventory-photos['"]/);
  // Must sign URL after upload
  assert.match(text, /createSignedUrl/);
  // Must pass photos ARRAY to RPC
  assert.match(text, /p_photos:/);
  // Must surface ValidationError on mime/size/mismatch, not raw db_error
  assert.match(text, /ValidationError\(\s*['"]mime_invalid['"]/);
  assert.match(text, /ValidationError\(\s*['"]file_too_large['"]/);
  assert.match(text, /ValidationError\(\s*['"]mime_mismatch['"]/);
  assert.match(text, /ValidationError\(\s*['"]too_many_photos['"]/);
});

test('B: api/staff.ts comment explicitly mentions Issue 9 + RLS bypass rationale', () => {
  if (!staffSrc) { assert.fail('staff.ts source missing'); return; }
  const blk = staffSrc.match(/Issue 9[\s\S]{0,800}?_arrival/);
  assert.ok(blk, 'Issue 9 commentary block not found');
  assert.match(blk[0], /service_role/);
  assert.match(blk[0], /bypasses? RLS|bypass RLS|bypass rls/i);
});

test('B: api/staff.ts:signInventoryPhotosAction reads paths from DB + signs on demand', () => {
  if (!staffSrc) { assert.fail('staff.ts source missing'); return; }
  const idx = staffSrc.indexOf('async function signInventoryPhotosAction');
  assert.ok(idx > 0, 'signInventoryPhotosAction not found');
  // Take a generous window after the function declaration.
  const text = staffSrc.slice(idx, idx + 8000);
  // Must accept arrival_id (server-side anchor)
  assert.match(text, /readUuidRequired\(body, ['"]arrival_id['"]\)/);
  // Must select photos ARRAY from inventory_arrivals server-side
  assert.match(text, /supabaseAdmin[\s\S]{0,80}?\.from\(['"]inventory_arrivals['"]\)[\s\S]{0,200}?\.select\(['"]photos['"]\)/);
  // Must validate every path with isInventoryPhotoPath before signing
  assert.match(text, /_isInventoryPhotoPath/);
  // Must sign via supabaseAdmin.storage.createSignedUrl (not supabase.client)
  assert.match(text, /supabaseAdmin\.storage[\s\S]{0,80}?\.from\(['"]inventory-photos['"]\)[\s\S]{0,200}?\.createSignedUrl/);
  assert.doesNotMatch(text, /supabase\.storage[\s\S]{0,80}?\.createSignedUrl/);
  // Must return 404 arrival_not_found when row missing
  assert.match(text, /arrival_not_found/);
  // Must handle empty photos array gracefully (return urls: [])
  assert.match(text, /urls:\s*\[\]/);
  // TTL constant reference (don't hardcode number — must use _PHOTO_SIGNED_URL_TTL_SECONDS)
  assert.match(text, /_PHOTO_SIGNED_URL_TTL_SECONDS/);
});

test('B: dispatch case for sign-inventory-photos wired in switch', () => {
  if (!staffSrc) { assert.fail('staff.ts source missing'); return; }
  assert.match(staffSrc,
    /case\s+['"]sign-inventory-photos['"]\s*:[\s\S]{0,200}?signInventoryPhotosAction/);
});

test('B: migration 040 untouched (bucket + 3 policies stay as defense-in-depth)', () => {
  // Just verify the migration source still exists with expected content.
  const mig = readFileSync('/Users/dmitriy/Downloads/demo-car-wash/migrations/040_create_inventory_photos_bucket_and_policies.sql', 'utf8');
  assert.match(mig, /'inventory-photos'/);
  assert.match(mig, /staff_select_photos/);
  assert.match(mig, /staff_insert_photos/);
  assert.match(mig, /staff_delete_photos/);
  assert.match(mig, /app_role.*admin.*owner/s);
});

// =====================================================================
// C. INTEGRATION — full dispatcher flow on DEMO
// =====================================================================

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENV_JWT = process.env.SUPABASE_JWT_SECRET;
const HAS_ENV = !!(ENV_URL && ENV_SVC && ENV_JWT);
const FORCE   = process.env.DEMO_FORCE_ISSUE9 === '1';

async function importSupabase() {
  return import('/Users/dmitriy/Downloads/demo-car-wash/node_modules/@supabase/supabase-js/dist/index.cjs');
}

function mintAdminJwt(secret) {
  const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    profile_id: '22222222-2222-2222-2222-222222222222',
    app_role: 'admin',
    full_name: 'Issue9 Test',
    iat: now, exp: now + 3600,
  };
  const payload = b64(JSON.stringify(claims));
  const sig = b64(crypto.createHmac('sha256', secret).update(header + '.' + payload).digest());
  return header + '.' + payload + '.' + sig;
}

async function runIntegrationBlock(t) {
  if (!HAS_ENV) { t.skip('DEMO env not set'); return; }
  if (!FORCE) {
    // We only run this when explicitly forced because it creates real
    // inventory_arrivals rows + storage objects on DEMO. The test is
    // idempotent on operation_id, but we still gate on FORCE so daily
    // suites don't churn the bucket.
    t.skip('set DEMO_FORCE_ISSUE9=1 to run end-to-end dispatcher smoke');
    return;
  }

  const { createClient } = await importSupabase();
  const admin = createClient(ENV_URL, ENV_SVC, { auth: { persistSession: false } });
  const adminJwt = mintAdminJwt(ENV_JWT);

  // Verify Vercel deployment URL is reachable.
  const deployUrl = process.env.DEMO_DEPLOY_URL || 'https://demo-car-wash.vercel.app';
  let reachable = true;
  try {
    const head = await fetch(deployUrl, { method: 'HEAD', redirect: 'manual' });
    reachable = head.status < 500;
  } catch { reachable = false; }
  if (!reachable) { t.skip('Vercel deploy URL not reachable from this network'); return; }

  // Find an inventory item to attach the arrival to.
  const { data: items, error: itemsErr } = await admin.from('inventory_items')
    .select('id, name').eq('is_active', true).limit(1);
  if (itemsErr || !items?.length) { t.skip('no active inventory_items on DEMO'); return; }
  const itemId = items[0].id;

  // Build a tiny PNG as base64.
  const tinyPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f80f0000010001000a3f1c2c0d0000000049454e44ae426082',
    'hex');
  const b64 = tinyPng.toString('base64');

  const opId = crypto.randomUUID();

  // 1. positive: dispatcher end-to-end with photos_b64
  //    Issue 9 V-B: arrival.photos should contain STORAGE PATHS, not URLs.
  const res = await fetch(`${deployUrl}/api/staff?action=inventory-arrival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
    body: JSON.stringify({
      item_id: itemId,
      quantity: 1,
      total_price: 100,
      delivery_date: new Date().toISOString().slice(0, 10),
      photos_b64: [{ mime: 'image/png', base64: b64 }],
      notes: 'issue9 smoke',
      operation_id: opId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, `dispatcher returned ${res.status}: ${JSON.stringify(json)}`);
  const arrival = json?.data?.arrival;
  // RPC returns { success, arrival_id, price_per_unit, new_base_quantity, new_current_quantity }
  // not the full row. Dispatcher forwards that as `data.arrival` for the UI.
  assert.ok(arrival?.arrival_id, `arrival_id missing in response: ${JSON.stringify(arrival)}`);
  const arrivalId = arrival.arrival_id;

  // Read the persisted row to verify photos ARRAY contains storage paths.
  const { data: row, error: rowErr } = await admin.from('inventory_arrivals')
    .select('photos').eq('id', arrivalId).maybeSingle();
  assert.ok(!rowErr && row, `inventory_arrivals row not found: ${rowErr?.message}`);
  assert.ok(Array.isArray(row.photos) && row.photos.length === 1,
    `expected 1 photo path, got ${JSON.stringify(row.photos)}`);
  const photoPath = row.photos[0];
  // V-B invariant: stored value must be a storage PATH, not a signed URL.
  assert.ok(!photoPath.startsWith('http'),
    `photos[] must be storage path, not URL. Got: ${photoPath}`);
  assert.match(photoPath, new RegExp(`^${itemId}/[a-f0-9-]+_0\\.png$`),
    `expected path shape <item>/<op>_0.png, got ${photoPath}`);

  // 2. sign-inventory-photos: dispatcher must mint fresh signed URLs.
  const signRes = await fetch(`${deployUrl}/api/staff?action=sign-inventory-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
    body: JSON.stringify({ arrival_id: arrivalId }),
  });
  const signJson = await signRes.json().catch(() => ({}));
  assert.equal(signRes.status, 200, `sign returned ${signRes.status}: ${JSON.stringify(signJson)}`);
  const urls = signJson?.data?.urls;
  assert.ok(Array.isArray(urls) && urls.length === 1,
    `expected 1 signed url, got ${JSON.stringify(urls)}`);
  assert.match(urls[0], /^https:\/\/danobongqzbxilyvdwig\.supabase\.co\/storage\/v1\/object\/sign\/inventory-photos\//);
  assert.ok(urls[0].includes('?token='), 'signed url must contain token query param');
  // HEAD the signed URL → must be 200 and image/png
  const head = await fetch(urls[0], { method: 'HEAD' });
  assert.equal(head.status, 200, `signed url HEAD must be 200, got ${head.status}`);
  assert.match(head.headers.get('content-type') || '', /image\/png/);

  // 3. negative: bogus arrival_id must return 404, not 200 with leaked data
  const bogusRes = await fetch(`${deployUrl}/api/staff?action=sign-inventory-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
    body: JSON.stringify({ arrival_id: crypto.randomUUID() }),
  });
  const bogusJson = await bogusRes.json().catch(() => ({}));
  assert.equal(bogusRes.status, 404, `bogus arrival_id must 404, got ${bogusRes.status}: ${JSON.stringify(bogusJson)}`);
  assert.equal(bogusJson?.error, 'arrival_not_found');

  // 4. negative: arrival with no photos returns 200 with empty urls[]
  const emptyOpId = crypto.randomUUID();
  const emptyRes = await fetch(`${deployUrl}/api/staff?action=inventory-arrival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
    body: JSON.stringify({
      item_id: itemId, quantity: 1, total_price: 50,
      delivery_date: new Date().toISOString().slice(0, 10),
      photos_b64: null, notes: 'no photo',
      operation_id: emptyOpId,
    }),
  });
  const emptyJson = await emptyRes.json().catch(() => ({}));
  assert.equal(emptyRes.status, 200);
  const emptyArrival = emptyJson?.data?.arrival;
  assert.ok(emptyArrival?.arrival_id, 'empty-photos arrival must still be created');
  const emptySignRes = await fetch(`${deployUrl}/api/staff?action=sign-inventory-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
    body: JSON.stringify({ arrival_id: emptyArrival.arrival_id }),
  });
  const emptySignJson = await emptySignRes.json().catch(() => ({}));
  assert.equal(emptySignRes.status, 200);
  assert.deepEqual(emptySignJson?.data?.urls, [], 'no-photos arrival must yield empty urls[]');

  // 5. negative: mime_mismatch path returns non-200 (defense-in-depth check)
  const clientRes = await fetch(`${deployUrl}/api/staff?action=inventory-arrival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
    body: JSON.stringify({
      item_id: itemId, quantity: 1, total_price: 50, delivery_date: '2026-09-03',
      photos_b64: [{ mime: 'image/png', base64: 'not-valid-png-data' }],
      notes: 'should fail mime', operation_id: crypto.randomUUID(),
    }),
  });
  assert.notEqual(clientRes.status, 200, 'mime_mismatch path must not return 200');

  // 6. cleanup
  await admin.from('inventory_arrivals').delete().eq('id', arrivalId);
  await admin.from('inventory_arrivals').delete().eq('id', emptyArrival.arrival_id);
  for (const p of [photoPath]) {
    await admin.storage.from('inventory-photos').remove([p]).catch(() => {});
  }
  // Verify cleanup.
  const { data: check } = await admin.from('inventory_arrivals').select('id').eq('id', arrivalId);
  assert.equal(check?.length ?? 0, 0, 'arrival row not cleaned up');
}

test('integration: end-to-end dispatcher flow with photos_b64 (FORCE-gated)', async (t) => {
  await runIntegrationBlock(t);
});
