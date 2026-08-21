const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wwbmayypdzisopdqlefg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Ym1heXlwZHppc29wZHFsZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI4MDMsImV4cCI6MjEwMTY3ODgwM30.f0RH0P7dsU4B2FSKfu7GNXYNFLT6KLRruSyGWY30puE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('Testing Supabase connection and checking suppliers table...');

  const { data: checkData, error: checkErr } = await supabase
    .from('suppliers')
    .select('id')
    .limit(1);

  if (checkErr) {
    console.log('suppliers check status:', checkErr.code, checkErr.message);
  } else {
    console.log('suppliers table exists and is operational! Data count:', checkData?.length);
  }
}

main();
