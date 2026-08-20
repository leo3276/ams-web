const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wwbmayypdzisopdqlefg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Ym1heXlwZHppc29wZHFsZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI4MDMsImV4cCI6MjEwMTY3ODgwM30.f0RH0P7dsU4B2FSKfu7GNXYNFLT6KLRruSyGWY30puE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAllTables() {
  const t1 = await supabase.from('transactions').insert({
    business_id: '169c6093-da5a-4ded-b0d2-8811dad971f9',
    transaction_date: '2026-08-20',
    vendor: 'Test',
    type: 'operating_expense',
    category: 'Test',
    amount: 1,
    payment_method: 'cash'
  });
  console.log('transactions RLS:', t1.error ? t1.error.message : 'OK');

  const t2 = await supabase.from('invoices').insert({
    business_id: '169c6093-da5a-4ded-b0d2-8811dad971f9',
    invoice_number: 'INV-TEST-001',
    customer_name: 'Test Customer',
    amount: 1,
    status: 'draft',
    due_date: '2026-08-20'
  });
  console.log('invoices RLS:', t2.error ? t2.error.message : 'OK');

  const t3 = await supabase.from('inventory_items').insert({
    business_id: '169c6093-da5a-4ded-b0d2-8811dad971f9',
    name: 'Test Item',
    quantity: 1,
    unit_cost: 1,
    unit_price: 2
  });
  console.log('inventory_items RLS:', t3.error ? t3.error.message : 'OK');
}

testAllTables().catch(console.error);
