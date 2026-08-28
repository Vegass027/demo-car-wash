-- migrations/023_realtime_publication_membership.sql
--
-- Realign demo `supabase_realtime` publication with production
-- (10 tables, matching prod publication_lag DB state).
--
-- Idempotent: each table guards with IF NOT EXISTS via
-- pg_publication_tables check; safe to re-apply without errors.
--
-- Sandbox-verified on PG 17.6:
--   ALTER PUBLICATION ... ADD TABLE inside DO block + transaction
--   tested with throwaway `_do_test_pub` (rolled back; demo untouched).
--
-- NO diagnostic SELECT inside the migration — verification reads happen
-- separately after apply.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='bookings')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='client_cars')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_cars; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='clients')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.clients; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='closed_boxes')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.closed_boxes; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='loyalty_carwash_progress')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_carwash_progress; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='organization_cars')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_cars; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='organization_drivers')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_drivers; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='salary_settings')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_settings; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='tire_bookings')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.tire_bookings; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='tire_service_days')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.tire_service_days; END IF;
END$$;
