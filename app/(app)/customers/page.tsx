'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CustomerSummary {
  customer_name: string;
  customer_email: string | null;
  invoice_count: number;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  last_invoice_date: string | null;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setErrorMsg('Not logged in.');
      setLoading(false);
      return;
    }

    const { data: businesses } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const businessId = businesses?.[0]?.id;
    if (!businessId) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('get_customer_summary', { p_business_id: businessId });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setCustomers(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  if (loading) return <p className="text-sm text-textSecondary">Loading…</p>;
  if (errorMsg) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div>
      <h1 className="text-2xl font-medium text-textPrimary mb-1">Customers</h1>
      <p className="text-sm text-textSecondary mb-6">
        Sorted by total paid — your best customers first. Built automatically from your invoices.
      </p>

      {customers.length === 0 ? (
        <p className="text-sm text-textSecondary">
          No customers yet — they&apos;ll show up here once you send an invoice.
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden max-w-2xl">
          {customers.map((c) => (
            <div
              key={c.customer_name}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
            >
              <div className="w-9 h-9 rounded-full bg-accentText text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initials(c.customer_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-textPrimary truncate">{c.customer_name}</p>
                <p className="text-xs text-textSecondary">
                  {c.invoice_count} invoice{c.invoice_count !== 1 ? 's' : ''}
                  {c.total_outstanding > 0 ? ` · ${c.total_outstanding.toLocaleString()} owed` : ''}
                  {c.customer_email ? ` · ${c.customer_email}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-success">{c.total_paid.toLocaleString()}</p>
                <p className="text-xs text-textMuted">paid</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
