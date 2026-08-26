/**
 * lib/supabase.ts
 *
 * Phase 1.4 of carwash-full-security-lockdown-plan.md.
 * Supabase singleton with custom fetch wrapper that injects
 * Authorization: Bearer <jwt> header when a session token is set.
 *
 * Public API:
 *   - supabase            : SupabaseClient (existing usage unchanged in 17 files)
 *   - setSessionToken(t)  : set/clear JWT (re-exported from _supabase-wrapper)
 *
 * Wrapper logic lives in lib/_supabase-wrapper.ts (no Vite-specific APIs,
 * testable in plain Node). This file is just createClient wiring.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { wrappedFetch, setSessionToken } from './_supabase-wrapper';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export { setSessionToken };

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    global: { fetch: wrappedFetch },
    auth: {
      // We don't use supabase-js auth — JWT comes from /api/login or
      // /api/telegram-auth. Disable auto-refresh and session detection
      // so supabase-js doesn't fight our wrapper.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);