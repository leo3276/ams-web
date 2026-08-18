'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/lib/types';

interface PnLSummary {
  revenue: number;
  costOfGoods: number;
  operatingExpenses: number;
  netProfit: number;
}

interface BalanceSheetSummary {
  cash: number;
  bank: number;
  currentAssetsOther: number;
  totalCurrentAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
}

const TYPE_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  cost_of_goods: 'Cost of Goods',
  operating_expense: 'Operating Expense',
  fixed_asset: 'Fixed Asset',
  current_asset: 'Current Asset',
  short_term_liability: 'Liability',
  long_term_liability: 'Long-term Debt',
  drawings: 'Drawings',
};

export default function DashboardPage() {
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [periodLabel, setPeriodLabel] = useState('');
  const [pnl, setPnl] = useState<PnLSummary | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetSummary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [uncollectedInvoicesAmount, setUncollectedInvoicesAmount] = useState(0);
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);

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
      .select('id, name, currency')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const business = businesses?.[0];
    if (!business) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }

    setBusinessId(business.id);
    setBusinessName(business.name);
    setCurrency(business.currency || 'GHS');

    const { start, end, label } = currentMonthRange();
    setPeriodLabel(label);

    const today = new Date().toISOString().slice(0, 10);

    const [pnlRes, bsRes, txRes, invRes, itemsRes] = await Promise.all([
      supabase.rpc('get_pnl_report', { p_business_id: business.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_balance_sheet', { p_business_id: business.id, p_as_of_date: end }),
      supabase.from('transactions').select('*').eq('business_id', business.id).order('transaction_date', { ascending: false }).limit(6),
      supabase.from('invoices').select('*').eq('business_id', business.id),
      supabase.from('inventory_items').select('quantity, unit_cost').eq('business_id', business.id),
    ]);

    if (pnlRes.data?.[0]) {
      const p = pnlRes.data[0];
      setPnl({
        revenue: Number(p.revenue || 0),
        costOfGoods: Number(p.cost_of_goods || 0),
        operatingExpenses: Number(p.operating_expenses || 0),
        netProfit: Number(p.net_profit || 0),
      });
    }

    if (bsRes.data?.[0]) {
      const b = bsRes.data[0];
      setBalanceSheet({
        cash: Number(b.cash || 0),
        bank: Number(b.bank || 0),
        currentAssetsOther: Number(b.current_assets_other || 0),
        totalCurrentAssets: Number(b.total_current_assets || 0),
        totalLiabilities: Number(b.total_liabilities || 0),
        totalEquity: Number(b.total_equity || 0),
      });
    }

    setRecent(txRes.data ?? []);

    // Uncollected Invoices
    const invoices = invRes.data ?? [];
    let uncollected = 0;
    let overdue = 0;
    invoices.forEach((inv) => {
      if (inv.status !== 'paid' && inv.status !== 'cancelled') {
        uncollected += Number(inv.amount || 0);
        if (inv.due_date < today) {
          overdue++;
        }
      }
    });
    setUncollectedInvoicesAmount(uncollected);
    setOverdueInvoicesCount(overdue);

    // Inventory Value
    const items = itemsRes.data ?? [];
    const invCost = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0);
    setInventoryValue(invCost);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Safe-to-Spend Calculation
  const liquidity = useMemo(() => {
    const cash = balanceSheet?.cash || 0;
    const bank = balanceSheet?.bank || 0;
    const totalCashBank = cash + bank;

    // 15% estimated tax reserve from net profit
    const netProf = pnl?.netProfit || 0;
    const taxReserve = netProf > 0 ? netProf * 0.15 : 0;

    // 7-day operating overhead buffer (monthly opex / 4)
    const monthlyOpex = pnl?.operatingExpenses || 0;
    const weeklyOpBuffer = monthlyOpex > 0 ? monthlyOpex / 4 : 0;

    const safeToSpend = Math.max(0, totalCashBank - taxReserve - weeklyOpBuffer);

    // Runway calculation
    const dailyBurn = monthlyOpex > 0 ? monthlyOpex / 30 : 0;
    const runwayDays = dailyBurn > 0 ? Math.round(totalCashBank / dailyBurn) : totalCashBank > 0 ? 999 : 0;

    return {
      totalCashBank,
      taxReserve,
      weeklyOpBuffer,
      safeToSpend,
      runwayDays,
    };
  }, [balanceSheet, pnl]);

  if (loading) return <p className="text-sm text-textSecondary">Loading executive dashboard…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  const grossProfit = (pnl?.revenue || 0) - (pnl?.costOfGoods || 0);
  const marginPct = (pnl?.revenue || 0) > 0 ? (grossProfit / (pnl?.revenue || 1)) * 100 : 0;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-accentText uppercase tracking-wider">{businessName}</p>
          <h1 className="text-2xl font-bold text-textPrimary">Executive Financial Dashboard</h1>
          <p className="text-xs text-textSecondary mt-0.5">Real-time liquidity, cash runway, and business performance for {periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/invoices"
            className="px-3.5 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90 transition shadow-sm flex items-center gap-1.5"
          >
            <span>+</span> Issue Invoice
          </Link>
          <Link
            href="/bookkeeping"
            className="px-3.5 py-2 rounded-lg border border-border bg-surface2 text-textPrimary text-xs font-bold hover:bg-surface1 transition flex items-center gap-1.5"
          >
            <span>+</span> Add Entry
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. SAFE-TO-SPEND LIQUIDITY HERO RADAR                    */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-br from-surface1 to-surface2 border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-textSecondary">Safe-to-Spend Liquidity</span>
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-successBg text-success">
                Shielded Cash
              </span>
            </div>
            <p className="text-3xl font-extrabold text-textPrimary">
              {currency} {liquidity.safeToSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-textMuted mt-1">
              Actual available capital after reserving {currency} {liquidity.taxReserve.toFixed(0)} for taxes &amp; {currency} {liquidity.weeklyOpBuffer.toFixed(0)} for 7-day operating overhead.
            </p>
          </div>

          {/* Runway Card */}
          <div className="bg-surface2 border border-border rounded-lg p-3.5 flex items-center gap-4 shrink-0">
            <div className="w-12 h-12 rounded-full bg-accentBg text-accentText flex items-center justify-center text-xl font-black">
              ⏳
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-textMuted">Cash Runway</p>
              <p className="text-xl font-extrabold text-textPrimary">
                {liquidity.runwayDays >= 999 ? '∞ Unlimited' : `${liquidity.runwayDays} Days`}
              </p>
              <p className="text-[11px] text-textSecondary">At current daily burn rate</p>
            </div>
          </div>
        </div>

        {/* Trapped Capital Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs">
          <div className="flex items-center justify-between bg-surface2/60 p-2.5 rounded-lg border border-border/80">
            <div>
              <span className="text-textMuted">Total Bank &amp; Cash:</span>
              <p className="font-bold text-textPrimary text-sm">{currency} {liquidity.totalCashBank.toLocaleString()}</p>
            </div>
            <span className="text-lg">🏦</span>
          </div>

          <div className="flex items-center justify-between bg-surface2/60 p-2.5 rounded-lg border border-border/80">
            <div>
              <span className="text-textMuted">Uncollected Invoices:</span>
              <p className="font-bold text-danger text-sm">{currency} {uncollectedInvoicesAmount.toLocaleString()}</p>
            </div>
            <span className="text-xs font-bold text-danger bg-dangerBg px-2 py-0.5 rounded">
              {overdueInvoicesCount > 0 ? `${overdueInvoicesCount} overdue` : 'Receivables'}
            </span>
          </div>

          <div className="flex items-center justify-between bg-surface2/60 p-2.5 rounded-lg border border-border/80">
            <div>
              <span className="text-textMuted">Tied Inventory Capital:</span>
              <p className="font-bold text-textPrimary text-sm">{currency} {inventoryValue.toLocaleString()}</p>
            </div>
            <span className="text-lg">📦</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CORE MONTHLY KPI GRID                                 */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface2 rounded-xl p-4 border border-border shadow-sm">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Monthly Revenue</p>
          <p className="text-2xl font-black text-textPrimary">
            {currency} {(pnl?.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-success font-medium mt-1">Inflows this period</p>
        </div>

        <div className="bg-surface2 rounded-xl p-4 border border-border shadow-sm">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Cost of Goods (COGS)</p>
          <p className="text-2xl font-black text-textPrimary">
            {currency} {(pnl?.costOfGoods || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-textMuted mt-1">Direct production / stock cost</p>
        </div>

        <div className="bg-surface2 rounded-xl p-4 border border-border shadow-sm">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Operating Expenses</p>
          <p className="text-2xl font-black text-textPrimary">
            {currency} {(pnl?.operatingExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-textMuted mt-1">Rent, utilities, fuel, overhead</p>
        </div>

        <div className="bg-surface2 rounded-xl p-4 border border-border shadow-sm">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Net Profit</p>
          <p className={`text-2xl font-black ${(pnl?.netProfit || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
            {currency} {(pnl?.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-textMuted mt-1">{marginPct.toFixed(1)}% gross margin</p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. RECENT ACTIVITY & QUICK HUBS                          */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Ledger Transactions */}
        <div className="lg:col-span-2 bg-surface2 border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-textPrimary">Recent Ledger Activity</h2>
            <Link href="/bookkeeping" className="text-xs font-bold text-accentText hover:underline">
              View All Entries →
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="text-xs text-textMuted py-8 text-center italic">
              No transactions recorded yet. Click &quot;+ Add Entry&quot; above to log your first transaction!
            </p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((t) => {
                const isInflow = t.type === 'revenue';
                return (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-3">
                      <p className="font-bold text-textPrimary truncate">{t.vendor}</p>
                      <p className="text-textMuted text-[11px]">
                        {t.transaction_date} · {TYPE_LABELS[t.type] || t.type} · {t.payment_method?.toUpperCase()}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${isInflow ? 'text-success' : 'text-textPrimary'}`}>
                        {isInflow ? '+' : '-'} {currency} {Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Hub & Quick Shortcuts */}
        <div className="space-y-4">
          <div className="bg-surface2 border border-border rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-textPrimary">Quick Hubs</h2>

            <Link
              href="/invoices"
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface1 hover:bg-accentBg transition group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🧾</span>
                <div>
                  <p className="text-xs font-bold text-textPrimary group-hover:text-accentText">Invoices &amp; Receivables</p>
                  <p className="text-[11px] text-textMuted">Send invoices &amp; chase unpaid debt</p>
                </div>
              </div>
              <span className="text-xs text-textMuted">→</span>
            </Link>

            <Link
              href="/inventory"
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface1 hover:bg-accentBg transition group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">📦</span>
                <div>
                  <p className="text-xs font-bold text-textPrimary group-hover:text-accentText">Inventory &amp; Valuations</p>
                  <p className="text-[11px] text-textMuted">Catalog prices, profit margins &amp; stock</p>
                </div>
              </div>
              <span className="text-xs text-textMuted">→</span>
            </Link>

            <Link
              href="/reports"
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface1 hover:bg-accentBg transition group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">📈</span>
                <div>
                  <p className="text-xs font-bold text-textPrimary group-hover:text-accentText">Financial Reports &amp; Statements</p>
                  <p className="text-[11px] text-textMuted">P&amp;L, Balance Sheet, Cash Flow, Tax</p>
                </div>
              </div>
              <span className="text-xs text-textMuted">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
