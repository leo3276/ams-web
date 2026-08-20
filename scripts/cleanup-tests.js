const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wwbmayypdzisopdqlefg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Ym1heXlwZHppc29wZHFsZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI4MDMsImV4cCI6MjEwMTY3ODgwM30.f0RH0P7dsU4B2FSKfu7GNXYNFLT6KLRruSyGWY30puE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function cleanup() {
  await supabase.from('transactions').delete().eq('vendor', 'Test');
  await supabase.from('invoices').delete().eq('invoice_number', 'INV-TEST-001');
  await supabase.from('inventory_items').delete().eq('name', 'Test Item');
  console.log('Test artifacts cleaned up successfully!');
}

cleanup().catch(console.error);
