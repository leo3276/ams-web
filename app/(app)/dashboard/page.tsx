'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/lib/types';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'short' }) };
}

const TYPE_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  cost_of_goods: 'Cost of goods',
  operating_expense: 'Operating expense',
  asset: 'Asset',
  liability: 'Liability',
};

export default function DashboardPage() {
  const [businessName, setBusinessName] = useState('');
  const [revenue, setRevenue] = useState(0);
  const [profit, setProfit] = useState(0);
  const [monthLabel, setMonthLabel] = useState('');
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
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
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const business = businesses?.[0];
    if (!business) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }
    setBusinessName(business.name);

    const { start, end, label } = currentMonthRange();
    setMonthLabel(label);

    const { data: pnlRows } = await supabase.rpc('get_pnl_report', {
      p_business_id: business.id,
      p_start_date: start,
      p_end_date: end,
    });
    const pnl = pnlRows?.[0];
    setRevenue(Number(pnl?.revenue ?? 0));
    setProfit(Number(pnl?.net_profit ?? 0));

    const { data: recentData } = await supabase
      .from('transactions')
      .select('*')
      .eq('business_id', business.id)
      .order('transaction_date', { ascending: false })
      .limit(5);

    setRecent(recentData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) return <p className="text-sm text-textSecondary">Loading…</p>;
  if (errorMsg) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div>
      <p className="text-sm text-textSecondary mb-1">{businessName}</p>
      <h1 className="text-2xl font-medium text-textPrimary mb-6">Overview</h1>

      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6 max-w-md">
        <div className="bg-surface1 rounded-lg p-4">
          <p className="text-sm text-textSecondary mb-1">Revenue ({monthLabel})</p>
          <p className="text-xl font-medium text-textPrimary">{revenue.toLocaleString()}</p>
        </div>
        <div className="bg-surface1 rounded-lg p-4">
          <p className="text-sm text-textSecondary mb-1">Profit</p>
          <p className={`text-xl font-medium ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
            {profit.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-6 max-w-md">
        <Link
          href="/bookkeeping"
          className="flex-1 text-center bg-textPrimary text-white rounded-lg py-2.5 text-sm font-medium"
        >
          Go to Bookkeeping
        </Link>
        <Link
          href="/reports"
          className="flex-1 text-center border border-border rounded-lg py-2.5 text-sm font-medium text-textPrimary"
        >
          View Reports
        </Link>
      </div>

      <p className="text-sm text-textSecondary mb-2">Recent</p>
      {recent.length === 0 ? (
        <p className="text-sm text-textSecondary">No transactions yet.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden max-w-md">
          {recent.map((t) => {
            const isInflow = t.type === 'revenue';
            return (
              <div
                key={t.id}
                className="flex justify-between items-center px-3 py-2.5 border-b border-border last:border-b-0 text-sm"
              >
                <div className="min-w-0 mr-2">
                  <p className="text-textPrimary truncate">{t.vendor}</p>
                  <p className="text-textSecondary text-xs">{TYPE_LABELS[t.type] ?? t.type}</p>
                </div>
                <p className={`shrink-0 ${isInflow ? 'text-success' : 'text-danger'}`}>
                  {isInflow ? '+' : '-'}
                  {Number(t.amount).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
