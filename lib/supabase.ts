'use client';

import { createClient } from '@supabase/supabase-js';

// Use the EXACT SAME Project URL and anon key as src/lib/supabase.ts in the
// mobile app. Same Supabase project = same accounts, same data, both apps
// just being different windows into one database.
const SUPABASE_URL = 'https://ynqlfjoybxzrgczktrht.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TNSuN78Dgv888OYbxWMX5A_HL7JJOwb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
