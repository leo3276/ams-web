'use client';

import { createClient } from '@supabase/supabase-js';

// Use the EXACT SAME Project URL and anon key as src/lib/supabase.ts in the
// mobile app. Same Supabase project = same accounts, same data, both apps
// just being different windows into one database.
const SUPABASE_URL = 'https://wwbmayypdzisopdqlefg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Ym1heXlwZHppc29wZHFsZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI4MDMsImV4cCI6MjEwMTY3ODgwM30.f0RH0P7dsU4B2FSKfu7GNXYNFLT6KLRruSyGWY30puE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
