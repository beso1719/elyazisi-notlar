import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⚠️ Kendi Supabase projenin değerlerini buraya yaz.
// Supabase Dashboard → Project Settings → API
//   - Project URL        → SUPABASE_URL
//   - Project API keys → anon / public → SUPABASE_ANON_KEY
// Sadece "anon" (public) key kullan. "service_role" key'i ASLA buraya koyma.
export const SUPABASE_URL = 'https://gvzfzqvzdhgztpiclcdv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_fkSujwmoMP2wgM2kv-v3Vw_oOQwVhJp';

export const isConfigured =
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
