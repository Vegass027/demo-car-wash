/**
 * Issue 8 — pure helpers for merge-on-update and append-on-create
 * operations on Organization/Client arrays.
 *
 * Extracted from App.tsx so they can be unit-tested without React
 * renderer (project has no React Testing Library installed). App.tsx
 * and BookingWizard consumers should use these helpers instead of
 * inlining the same logic, to keep merge semantics in one place.
 */

export interface Identifiable {
  id: string;
}

/**
 * Replace the matching item in the list by id, merging fields with spread.
 * Returns the same array reference if no match (defensive — caller may
 * still want to append if the id was missing).
 */
export function mergeById<T extends Identifiable>(list: T[], item: T): T[] {
  let found = false;
  const next = list.map((existing) => {
    if (existing.id !== item.id) return existing;
    found = true;
    return { ...existing, ...item };
  });
  return found ? next : [...next, item];
}

/**
 * Append an item only if no element with the same id exists. Returns the
 * same array reference when the id is already present (idempotent — safe
 * for re-entrant flows where the same create response is delivered twice).
 */
export function appendIfNew<T extends Identifiable>(list: T[], item: T): T[] {
  if (list.some((existing) => existing.id === item.id)) return list;
  return [...list, item];
}
