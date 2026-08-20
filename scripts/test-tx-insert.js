const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wwbmayypdzisopdqlefg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Ym1heXlwZHppc29wZHFsZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI4MDMsImV4cCI6MjEwMTY3ODgwM30.f0RH0P7dsU4B2FSKfu7GNXYNFLT6KLRruSyGWY30puE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testInsert() {
  const { data, error } = await supabase.from('transactions').insert({
    business_id: '169c6093-da5a-4ded-b0d2-8811dad971f9',
    transaction_date: '2026-08-20',
    vendor: 'Test Vendor',
    type: 'operating_expense',
    category: 'Payroll & Salaries',
    amount: 100,
    payment_method: 'bank'
  }).select();

  console.log('Insert into transactions test result:', { data, error });
}

testInsert().catch(console.error);
