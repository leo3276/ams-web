const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wwbmayypdzisopdqlefg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Ym1heXlwZHppc29wZHFsZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI4MDMsImV4cCI6MjEwMTY3ODgwM30.f0RH0P7dsU4B2FSKfu7GNXYNFLT6KLRruSyGWY30puE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
  const { data: businesses } = await supabase.from('businesses').select('*');
  console.log('ALL BUSINESSES (' + (businesses ? businesses.length : 0) + '):', businesses);

  const { data: transactions } = await supabase.from('transactions').select('*').limit(20);
  console.log('ALL TRANSACTIONS (' + (transactions ? transactions.length : 0) + '):', transactions);

  const { data: members } = await supabase.from('business_members').select('*');
  console.log('ALL BUSINESS_MEMBERS (' + (members ? members.length : 0) + '):', members);

  const { data: invoices } = await supabase.from('invoices').select('*').limit(20);
  console.log('ALL INVOICES (' + (invoices ? invoices.length : 0) + '):', invoices);
}

inspect().catch(console.error);
