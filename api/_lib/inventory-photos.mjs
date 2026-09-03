// api/_lib/inventory-photos.mjs
// Pure helpers for Issue 9 — server-side inventory photo upload via
// dispatcher (Issue 3 pattern, identical to expense-receipts.mjs).
//
// Why this exists: Issue 7 migration 040 added `inventory-photos` bucket +
// 3 staff-only storage policies. RLS gate `(auth.jwt() ->> 'app_role') IN
// ('admin','owner')` is correct in principle, BUT the project's staff JWT
// (api/login.ts:signJwt with app_role=admin/owner) is NOT a Supabase Auth
// session — Supabase Auth does not surface our custom claims through
// `auth.jwt()`. So RLS *always* blocks browser-direct uploads. The fix is
// to upload server-side via service_role (which bypasses RLS) using a
// dispatcher endpoint, identical to expense-receipts.
//
// SINGLE SOURCE OF TRUTH. Any change here propagates to:
//   - api/_lib/validation.ts (re-exports with TS types)
//   - api/staff.ts:inventoryArrivalAction (imports from validation.ts)
//   - tests/issue9-inventory-photos-dispatcher.test.mjs (imports directly)

// Storage constraints — same as bucket config in migration 040.
export const PHOTO_MIME_ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

// Effective raw file size cap (server-authoritative).
// Bucket-level cap is 5MB; this 3MB cap is the dispatcher limit so that
// 3MB raw → ~4MB base64 → fits Vercel Hobby 4.5MB body cap. Applies
// per-file; total request body grows linearly with file count.
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PHOTO_BASE64_MAX_CHARS = 4 * 1024 * 1024 + 16;

// Per-request cap (server-authoritative). Prevents one upload from
// exhausting Vercel body cap with 10×3MB photos + RPC payload.
export const PHOTO_MAX_FILES = 10;

// Storage path convention (matches what lib/api/inventory.ts used to
// generate client-side before Issue 9): <item_id>/<operation_id>_<index>.<ext>
//
// item_id — uuid of inventory_items row.
// operation_id — uuid PK on inventory_arrivals (idempotency key).
// index — photo index in the request, used to distinguish multiple
//         photos of the same arrival.
//
// Server-generates the path; never trusts client-supplied paths.
export function generateInventoryPhotoPath(itemId, operationId, index, mimeOrFilename) {
  const ext = mimeOrFilename && typeof mimeOrFilename === 'string'
    ? inferExtension(mimeOrFilename)
    : 'jpg';
  return `${itemId}/${operationId}_${index}.${ext}`;
}

export function inferExtension(mimeOrFilename) {
  if (!mimeOrFilename) return 'jpg';
  const s = String(mimeOrFilename).toLowerCase();
  if (s === 'image/jpeg' || s === 'image/jpg' || /\.jpe?g$/i.test(s)) return 'jpg';
  if (s === 'image/png'  || /\.png$/i.test(s))  return 'png';
  if (s === 'application/pdf' || /\.pdf$/i.test(s)) return 'pdf';
  // Fallback: try filename
  const m = s.match(/\.([a-z0-9]{1,5})$/);
  return (m && m[1]) || 'jpg';
}

// Signed URL TTL for inventory photos. Short on purpose: the URLs are
// minted on demand by sign-inventory-photos each time the UI opens a
// history item (mirror of Issue 3 get-receipt-url with TTL 3600). 1
// hour is enough for an admin to view + download a receipt-style photo;
// refreshing once a day per row would be excessive.
export const PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60;

// Quick helper used by tests + handlers.
export function isValidMime(m) {
  return typeof m === 'string' && PHOTO_MIME_ALLOWED.includes(m);
}

// Path safety: storage path must be of form <uuid>/<uuid>_<index>.<ext>.
// Rejects URL-shaped strings (with '?', 'http', or trailing query params),
// absolute paths, and '../' traversal. Same defense-in-depth as
// isReceiptPath in expense-receipts.mjs.
//
// Why this matters: sign-inventory-photos reads photo paths from the DB
// and signs them. A malformed entry (corrupted row, client-tampered DB,
// manual SQL injection in some other RPC) must not be passed back to
// storage.createSignedUrl, which would happily sign arbitrary paths
// (including paths outside the bucket).
const INVENTORY_PHOTO_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9]+\.(jpg|png|pdf)$/i;

export function isInventoryPhotoPath(s) {
  return typeof s === 'string'
    && s.length > 0
    && s.length <= 512
    && INVENTORY_PHOTO_PATH_RE.test(s);
}
