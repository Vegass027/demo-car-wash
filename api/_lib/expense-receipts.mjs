// api/_lib/expense-receipts.mjs
// Pure helpers for Slice #3f (Issue 3 expense receipts).
// No TypeScript, no imports — natively testable by node:test .mjs files
// AND importable from .ts handlers via re-export through validation.ts.
//
// SINGLE SOURCE OF TRUTH. Any change here propagates to:
//   - api/_lib/validation.ts (re-exports with TS types)
//   - api/staff.ts handlers (imports from validation.ts)
//   - tests/issue3-expense-receipts.test.mjs (imports directly)

// DB enum mirror (must match migration CHECK + DB enum).
export const EXPENSE_CATEGORIES = ['tea_coffee', 'repair', 'utilities', 'stationery', 'other'];
export const CATEGORIES_REQUIRING_COMMENT = ['repair', 'utilities', 'other'];

// Storage constraints — see migration 037.
export const RECEIPT_MIME_ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

// Effective raw file size cap (server-authoritative).
// Bucket-level cap is 5MB; this 3MB cap is the dispatcher limit so that
// 3MB raw → ~4MB base64 → fits Vercel Hobby 4.5MB body cap.
export const RECEIPT_MAX_BYTES = 3 * 1024 * 1024;
// Buffer for base64 string (≈ 4/3 of RECEIPT_MAX_BYTES + slack).
export const RECEIPT_BASE64_MAX_CHARS = 4 * 1024 * 1024 + 16;

// Path safety: storage path must be of form <uuid>/<safe-name>.
// Prevents "../" traversal and absolute paths.
const RECEIPT_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;

export function isExpenseCategory(s) {
  return typeof s === 'string' && EXPENSE_CATEGORIES.includes(s);
}

export function isReceiptPath(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 512 && RECEIPT_PATH_RE.test(s);
}

// Strip unsafe filename chars. Cap length to 80.
// Used when server-generates the receipt storage path.
export function sanitizeReceiptName(name) {
  const base = String(name == null ? '' : name)
    .split(/[\\/]/).pop()               // strip any path components
    .replace(/[^\w.\-]/g, '_')          // word chars + dot + dash only
    .replace(/_+/g, '_')                // collapse runs
    .replace(/^_+|_+$/g, '')            // trim
    .slice(0, 80);
  return base || 'file';
}

// Server-generates the receipt storage path.
// NEVER trust client-supplied paths — they could point to other users'
// folders or be traversal attacks.
export function generateReceiptPath(profileId, originalName) {
  const ts = Date.now();
  const clean = sanitizeReceiptName(originalName);
  return `${profileId}/${ts}_${clean}`;
}
