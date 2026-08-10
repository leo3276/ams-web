'use client';

import { createClient } from '@supabase/supabase-js';

// Use the EXACT SAME Project URL and anon key as src/lib/supabase.ts in the
// mobile app. Same Supabase project = same accounts, same data, both apps
// just being different windows into one database.
const SUPABASE_URL = 'YOUR_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
