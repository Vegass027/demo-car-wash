-- migrations/044_services_equivalent_paid_service.sql
--
-- Issue 16 — worker payout from nominal (list) price (universal principle).
--
-- Adds ONE reference column `equivalent_paid_service_id` on services.
-- For bonus/free services whose all 5 price_* columns are 0 (e.g.
-- `free-body-wash`), this column points to the retail-priced service whose
-- list price should be used as the worker's commission basis. For all
-- other services the column stays NULL (default) and the service's own
-- price_<car_type> is used (no behavior change for paid services).
--
-- Single source of truth for retail prices remains in the referenced
-- service's price_* columns — there is NO duplicated `nominal_price_*`
-- column to keep in sync, so a future price change stays consistent
-- without manual coordination.
--
-- Migration is forward-only. Historical bookings retain their original
-- `bookings.services_with_quantities[*].total` (which remains identical for
-- rows without zero-priced lines; verified 0 such rows on DEMO) and the
-- earnings calculator falls back to that path for legacy rows.

BEGIN;

ALTER TABLE services
  ADD COLUMN equivalent_paid_service_id uuid
  REFERENCES services(id) ON DELETE SET NULL;

-- Cheap defense against future misconfiguration (admin UI or migration
-- mistake pointing a service at itself).
ALTER TABLE services
  ADD CONSTRAINT chk_services_equivalent_not_self
  CHECK (equivalent_paid_service_id IS NULL OR equivalent_paid_service_id <> id);

-- Backfill: free-body-wash → body-wash (1 row only).
UPDATE services
SET equivalent_paid_service_id = (SELECT id FROM services WHERE service_id = 'body-wash')
WHERE service_id = 'free-body-wash'
  AND equivalent_paid_service_id IS NULL;

-- Sanity: target exists and has a positive sedan price (otherwise the
-- whole principle collapses). RAISE EXCEPTION aborts the transaction.
DO $$
DECLARE
  v_id    uuid;
  v_price numeric;
BEGIN
  SELECT equivalent_paid_service_id INTO v_id
    FROM services WHERE service_id = 'free-body-wash';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'backfill_failed: equivalent_paid_service_id is NULL after update';
  END IF;
  SELECT price_sedan INTO v_price FROM services WHERE id = v_id;
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'backfill_target_invalid: body-wash has no positive price_sedan (%)', v_price;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_services_equivalent_paid
  ON public.services(equivalent_paid_service_id);

COMMIT;
