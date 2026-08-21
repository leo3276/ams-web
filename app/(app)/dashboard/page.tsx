'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/lib/types';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedTransactions,
  setCachedTransactions,
  getCachedInventory,
  setCachedInventory,
  getCachedInvoices,
  setCachedInvoices,
  getCachedSuppliers,
} from '@/lib/offlineStore';

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

export interface LiveLedgerEntry extends Transaction {
  isInflow: boolean;
  deltaAmount: number;
  runningCash: number;
  runningBank: number;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
}

const TYPE_LABELS: Record<string, string> = {
  revenue: 'Revenue Inflow',
  cost_of_goods: 'Cost of Goods',
  operating_expense: 'Operating Expense',
  fixed_asset: 'Fixed Asset Purchase',
  current_asset: 'Current Asset Purchase',
  short_term_liability: 'Supplier Liability',
  long_term_liability: 'Long-term Debt',
  drawings: 'Owner Drawings',
};

export default function DashboardPage() {
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [periodLabel, setPeriodLabel] = useState('');
  const [pnl, setPnl] = useState<PnLSummary | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetSummary | null>(null);
  const [liveEntries, setLiveEntries] = useState<LiveLedgerEntry[]>([]);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'all' | 'cash' | 'bank'>('all');

  const [uncollectedInvoicesAmount, setUncollectedInvoicesAmount] = useState(0);
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const shouldShow = localStorage.getItem('ams:show_migration_welcome');
      if (shouldShow === 'true') {
        setShowMigrationModal(true);
      }
    }
  }, []);

  const handleDismissModal = () => {
    setShowMigrationModal(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ams:show_migration_welcome');
    }
  };

  const loadDashboard = useCallback(async () => {
    const { start, end, label } = currentMonthRange();
    setPeriodLabel(label);

    // 1. Instantly load from local cache
    const cachedBiz = getCachedBusiness();
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setBusinessName(cachedBiz.name);
      setCurrency(cachedBiz.currency || 'GHS');
    }

    const cachedTxs = getCachedTransactions(cachedBiz?.id);
    if (cachedTxs.length > 0) {
      const rev = cachedTxs.filter((t) => t.type === 'revenue').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const exp = cachedTxs.filter((t) => t.type === 'operating_expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const cogs = cachedTxs.filter((t) => t.type === 'cost_of_goods').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      setPnl({
        revenue: rev,
        costOfGoods: cogs,
        operatingExpenses: exp,
        netProfit: rev - cogs - exp,
      });
    }

    const cachedInv = getCachedInventory(cachedBiz?.id);
    if (cachedInv.length > 0) {
      const totalVal = cachedInv.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
      setInventoryValue(totalVal);
    }

    setLoading(false);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name, currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      const business = businesses?.[0];
      if (!business) return;

      setBusinessId(business.id);
      setBusinessName(business.name);
      setCurrency(business.currency || 'GHS');
      setCachedBusiness({ id: business.id, name: business.name, currency: business.currency || 'GHS' });

      const today = new Date().toISOString().slice(0, 10);

      const [pnlRes, bsRes, invRes, itemsRes, allTxRes, staffRes] = await Promise.all([
        supabase.rpc('get_pnl_report', { p_business_id: business.id, p_start_date: start, p_end_date: end }),
        supabase.rpc('get_balance_sheet', { p_business_id: business.id, p_as_of_date: end }),
        supabase.from('invoices').select('*').eq('business_id', business.id),
        supabase.from('inventory_items').select('*').eq('business_id', business.id),
        supabase.from('transactions').select('*').eq('business_id', business.id).order('transaction_date', { ascending: true }),
        supabase.from('business_members').select('*').eq('business_id', business.id),
      ]);

      const allTxs = allTxRes.data ?? [];
      setCachedTransactions(allTxs, business.id);

      // Process Running Cash & Bank entries chronologically & calculate period P&L
      let runningC = 0;
      let runningB = 0;
      let currentPurchased = 0;

      let periodRev = 0;
      let periodCogs = 0;
      let periodOpex = 0;

      const processedEntries: LiveLedgerEntry[] = allTxs.map((t: any) => {
        const amt = Number(t.amount || 0);
        const isBank = t.payment_method === 'bank';
        const inPeriod = t.transaction_date >= start && t.transaction_date <= end;
        const isSupplierBill =
          t.type === 'short_term_liability' ||
          t.type === 'long_term_liability' ||
          (t.category && t.category.includes('Accounts Payable')) ||
          (t.vendor && t.vendor.startsWith('Supplier:'));

        let deltaCash = 0;
        let deltaBank = 0;
        let isInflow = false;

        if (t.type === 'revenue') {
          if (inPeriod) periodRev += amt;
          isInflow = true;
          if (isBank) deltaBank = amt; else deltaCash = amt;
        } else if (t.type === 'cost_of_goods') {
          if (inPeriod) periodCogs += amt;
          isInflow = false;
          if (isBank) deltaBank = -amt; else deltaCash = -amt;
        } else if (t.type === 'operating_expense') {
          if (inPeriod) periodOpex += amt;
          isInflow = false;
          if (isBank) deltaBank = -amt; else deltaCash = -amt;
        } else if (['drawings', 'fixed_asset'].includes(t.type)) {
          isInflow = false;
          if (isBank) deltaBank = -amt; else deltaCash = -amt;
        } else if (t.type === 'current_asset') {
          currentPurchased += amt;
          isInflow = false;
          if (isBank) deltaBank = -amt; else deltaCash = -amt;
        } else if ((t.type === 'short_term_liability' || t.type === 'long_term_liability') && !isSupplierBill) {
          isInflow = true;
          if (isBank) deltaBank = amt; else deltaCash = amt;
        }

        runningC = Math.max(0, runningC + deltaCash);
        runningB = Math.max(0, runningB + deltaBank);

        return {
          ...t,
          isInflow,
          deltaAmount: isInflow ? amt : -amt,
          runningCash: runningC,
          runningBank: runningB,
        };
      });

      // Newest entries first for live feed
      setLiveEntries([...processedEntries].reverse());

      const cachedSups = getCachedSuppliers(business.id);
      let tradePayablesInventory = 0;
      let tradePayablesCashLoan = 0;
      let tradePayablesFixedAsset = 0;
      let tradePayablesService = 0;

      cachedSups.forEach((s) => {
        const b = Number(s.balance_owed || 0);
        if (b <= 0) return;
        if (s.debt_type === 'cash_loan') tradePayablesCashLoan += b;
        else if (s.debt_type === 'fixed_asset') tradePayablesFixedAsset += b;
        else if (s.debt_type === 'service_expense') tradePayablesService += b;
        else tradePayablesInventory += b;
      });

      // Staff Salaries (Monthly payroll from staff roster + recorded salary transactions)
      const staffList = staffRes.data ?? [];
      const monthlyRosterPayroll = staffList.reduce((sum: number, m: any) => sum + Number(m.salary || 0), 0);
      const recordedSalaryTxs = allTxs
        .filter((t: any) => t.type === 'operating_expense' && (t.category === 'Payroll & Salaries' || (t.vendor && t.vendor.startsWith('Salary:'))))
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
      const accruedPayroll = Math.max(0, monthlyRosterPayroll - recordedSalaryTxs);

      const netCash = runningC + tradePayablesCashLoan;
      const netBank = runningB;
      const finalCurrentOther = currentPurchased + tradePayablesInventory;
      const finalCurrentAssets = netCash + netBank + finalCurrentOther;
      const finalShortTerm = tradePayablesInventory + tradePayablesCashLoan + tradePayablesService;
      const finalLongTerm = tradePayablesFixedAsset;

      const finalRev = periodRev;
      const finalCogs = periodCogs;
      const finalOpex = periodOpex + tradePayablesService + accruedPayroll;

      setPnl({
        revenue: finalRev,
        costOfGoods: finalCogs,
        operatingExpenses: finalOpex,
        netProfit: finalRev - finalCogs - finalOpex,
      });

      setBalanceSheet({
        cash: netCash,
        bank: netBank,
        currentAssetsOther: finalCurrentOther,
        totalCurrentAssets: finalCurrentAssets,
        totalLiabilities: finalShortTerm + finalLongTerm,
        totalEquity: finalCurrentAssets - (finalShortTerm + finalLongTerm),
      });

      if (invRes.data) {
        const uncollected = invRes.data
          .filter((inv) => inv.status !== 'paid')
          .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
        setUncollectedInvoicesAmount(uncollected);

        const overdue = invRes.data.filter(
          (inv) => inv.status !== 'paid' && inv.due_date && inv.due_date < today
        ).length;
        setOverdueInvoicesCount(overdue);
        setCachedInvoices(invRes.data as any, business.id);
      }

      if (itemsRes.data) {
        const totalVal = itemsRes.data.reduce(
          (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0),
          0
        );
        setInventoryValue(totalVal);
        setCachedInventory(itemsRes.data as any, business.id);
      }
    } catch (_err) {
      // offline mode operates smoothly on cache
    }
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
      cash,
      bank,
      totalCashBank,
      taxReserve,
      weeklyOpBuffer,
      safeToSpend,
      runwayDays,
    };
  }, [balanceSheet, pnl]);

  // Filtered entries according to active tab
  const filteredEntries = useMemo(() => {
    if (activeLedgerTab === 'cash') {
      return liveEntries.filter((t) => t.payment_method === 'cash' || !t.payment_method);
    }
    if (activeLedgerTab === 'bank') {
      return liveEntries.filter((t) => t.payment_method === 'bank');
    }
    return liveEntries;
  }, [liveEntries, activeLedgerTab]);

  const cashEntriesCount = useMemo(() => liveEntries.filter((t) => t.payment_method === 'cash' || !t.payment_method).length, [liveEntries]);
  const bankEntriesCount = useMemo(() => liveEntries.filter((t) => t.payment_method === 'bank').length, [liveEntries]);

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
          <p className="text-xs text-textSecondary mt-0.5">Real-time liquidity, cash runway, and live cash/bank entries for {periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sales"
            className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shadow-sm flex items-center gap-1.5"
          >
            <span>🛒</span> Record Sale
          </Link>
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

        {/* CASH & BANK EXPLICIT BREAKDOWN CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs">
          {/* Cash in Hand */}
          <div
            onClick={() => setActiveLedgerTab('cash')}
            className={`cursor-pointer flex items-center justify-between p-3 rounded-xl border transition ${
              activeLedgerTab === 'cash' ? 'bg-amber-500/10 border-amber-500 shadow-xs' : 'bg-surface2/80 border-border hover:bg-surface2'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💵</span>
                <span className="text-[11px] font-bold uppercase text-textSecondary">Cash in Hand (Drawer)</span>
              </div>
              <p className="font-black text-textPrimary text-base mt-0.5">
                {currency} {liquidity.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-textMuted mt-0.5">{cashEntriesCount} cash entries</p>
            </div>
            <span className="text-xs font-bold text-accentText bg-accentBg px-2 py-1 rounded-md">
              Filter ▾
            </span>
          </div>

          {/* Bank & MoMo */}
          <div
            onClick={() => setActiveLedgerTab('bank')}
            className={`cursor-pointer flex items-center justify-between p-3 rounded-xl border transition ${
              activeLedgerTab === 'bank' ? 'bg-blue-500/10 border-blue-500 shadow-xs' : 'bg-surface2/80 border-border hover:bg-surface2'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🏦</span>
                <span className="text-[11px] font-bold uppercase text-textSecondary">Bank &amp; MoMo Account</span>
              </div>
              <p className="font-black text-textPrimary text-base mt-0.5">
                {currency} {liquidity.bank.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-textMuted mt-0.5">{bankEntriesCount} bank/momo entries</p>
            </div>
            <span className="text-xs font-bold text-accentText bg-accentBg px-2 py-1 rounded-md">
              Filter ▾
            </span>
          </div>

          {/* Combined Total Liquid Cash & Bank */}
          <div
            onClick={() => setActiveLedgerTab('all')}
            className={`cursor-pointer flex items-center justify-between p-3 rounded-xl border transition ${
              activeLedgerTab === 'all' ? 'bg-emerald-500/10 border-emerald-500 shadow-xs' : 'bg-surface2/80 border-border hover:bg-surface2'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💰</span>
                <span className="text-[11px] font-bold uppercase text-textSecondary">Total Cash &amp; Bank</span>
              </div>
              <p className="font-black text-emerald-600 dark:text-emerald-400 text-base mt-0.5">
                {currency} {liquidity.totalCashBank.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-textMuted mt-0.5">{liveEntries.length} total ledger entries</p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-1 rounded-md">
              Combined ✓
            </span>
          </div>
        </div>

        {/* Tied Working Capital */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 text-xs">
          <div className="flex items-center justify-between bg-surface2/40 p-2.5 rounded-lg border border-border/60">
            <div>
              <span className="text-textMuted">Uncollected Customer Invoices:</span>
              <p className="font-bold text-danger text-sm">{currency} {uncollectedInvoicesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <span className="text-xs font-bold text-danger bg-dangerBg px-2 py-0.5 rounded">
              {overdueInvoicesCount > 0 ? `${overdueInvoicesCount} overdue` : 'Trade Receivables'}
            </span>
          </div>

          <div className="flex items-center justify-between bg-surface2/40 p-2.5 rounded-lg border border-border/60">
            <div>
              <span className="text-textMuted">Tied Inventory Valuation:</span>
              <p className="font-bold text-textPrimary text-sm">{currency} {inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <span className="text-base">📦</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1.5 MOBILE COMPANION APP RECOMMENDATION (OCR & REMOTE)  */}
      {/* ======================================================== */}
      <div className="bg-surface2 border border-border rounded-xl p-5 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-accentText/10 text-accentText flex items-center justify-center text-2xl flex-shrink-0">
              📱
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-accentText/10 text-accentText">
                  Mobile Companion
                </span>
                <span className="text-[10px] font-bold text-success flex items-center gap-1">
                  ● Live Sync
                </span>
              </div>
              <h3 className="text-base font-bold text-textPrimary mt-1">
                Install AMS on Your Phone for Instant AI OCR &amp; Remote Assessment
              </h3>
              <p className="text-xs text-textSecondary mt-0.5 max-w-2xl leading-relaxed">
                Take AMS everywhere: Snap paper receipts &amp; supplier waybills with your camera for instant AI ledger extraction, and monitor live shop sales, cashier drawers, and stock levels even when away from your store.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="px-3 py-2 rounded-lg bg-surface1 border border-border text-[11px] font-medium text-textSecondary">
              📸 <strong className="text-textPrimary">Camera OCR</strong> + 🛡️ <strong className="text-textPrimary">Remote Assessment</strong>
            </div>
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
      {/* 3. LIVE CASH & BANK LEDGER ENTRIES STREAM                */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Entries Stream Table */}
        <div className="lg:col-span-2 bg-surface2 border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <span>⚡ Live Cash &amp; Bank Entries</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-accentText/10 text-accentText">
                  Real-Time Stream
                </span>
              </h2>
              <p className="text-xs text-textSecondary mt-0.5">
                Showing every transaction with its running balance impact on Cash &amp; Bank
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-surface1 p-1 rounded-lg border border-border">
              <button
                onClick={() => setActiveLedgerTab('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  activeLedgerTab === 'all'
                    ? 'bg-textPrimary text-surface0 shadow-xs'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                All ({liveEntries.length})
              </button>
              <button
                onClick={() => setActiveLedgerTab('cash')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition flex items-center gap-1 ${
                  activeLedgerTab === 'cash'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                <span>💵</span> Cash ({cashEntriesCount})
              </button>
              <button
                onClick={() => setActiveLedgerTab('bank')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition flex items-center gap-1 ${
                  activeLedgerTab === 'bank'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                <span>🏦</span> Bank ({bankEntriesCount})
              </button>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-2xl">📋</p>
              <p className="text-xs text-textMuted italic">
                {activeLedgerTab === 'cash'
                  ? 'No cash drawer transactions recorded yet.'
                  : activeLedgerTab === 'bank'
                  ? 'No bank or MoMo transactions recorded yet.'
                  : 'No transactions recorded yet. Click "+ Add Entry" to record your first sale or expense!'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-x-auto">
              {filteredEntries.slice(0, 10).map((t) => {
                const isBank = t.payment_method === 'bank';
                const runningBal = isBank ? t.runningBank : t.runningCash;

                return (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-3 text-xs hover:bg-surface1/50 px-2 rounded-lg transition">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0 shadow-xs ${
                        t.isInflow
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                          : 'bg-rose-50 text-rose-600 border border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40'
                      }`}>
                        {t.isInflow ? '↓' : '↑'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-textPrimary truncate text-xs">{t.vendor}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-textSecondary mt-0.5 flex-wrap">
                          <span>{t.transaction_date}</span>
                          <span>·</span>
                          <span className="font-medium text-textMuted">{TYPE_LABELS[t.type] || t.type}</span>
                          <span>·</span>
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                            isBank
                              ? 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40'
                              : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                          }`}>
                            {isBank ? '🏦 BANK / MOMO' : '💵 CASH'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`font-black text-sm ${t.isInflow ? 'text-success' : 'text-textPrimary'}`}>
                        {t.isInflow ? '+' : '-'} {currency} {Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-textMuted mt-0.5">
                        {isBank ? 'Bank Bal:' : 'Cash Bal:'} <strong className="text-textSecondary">{currency} {runningBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-border text-xs">
            <span className="text-textMuted">Showing {Math.min(10, filteredEntries.length)} of {filteredEntries.length} live entries</span>
            <Link href="/bookkeeping" className="font-bold text-accentText hover:underline flex items-center gap-1">
              Open Full Double-Entry General Ledger →
            </Link>
          </div>
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
              href="/suppliers"
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface1 hover:bg-accentBg transition group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🏭</span>
                <div>
                  <p className="text-xs font-bold text-textPrimary group-hover:text-accentText">Creditor Debt Book</p>
                  <p className="text-[11px] text-textMuted">Suppliers, short-term bills &amp; settlements</p>
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
                  <p className="text-xs font-bold text-textPrimary group-hover:text-accentText">Inventory &amp; Stock</p>
                  <p className="text-[11px] text-textMuted">Stock valuation, restock alerts &amp; margins</p>
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
                  <p className="text-xs font-bold text-textPrimary group-hover:text-accentText">Financial Reports</p>
                  <p className="text-[11px] text-textMuted">P&amp;L, Balance Sheet &amp; Cash Flow PDF</p>
                </div>
              </div>
              <span className="text-xs text-textMuted">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Migration Welcome Modal */}
      {showMigrationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface1 border border-border max-w-lg w-full rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl font-black">
                  🚀
                </div>
                <div>
                  <h3 className="text-base font-bold text-textPrimary">Welcome to AMS!</h3>
                  <p className="text-xs text-textSecondary">Your professional business workstation</p>
                </div>
              </div>
              <button
                onClick={handleDismissModal}
                className="text-textSecondary hover:text-textPrimary p-1 rounded-lg transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 bg-surface2/60 border border-border p-4 rounded-2xl">
              <p className="text-xs text-textPrimary font-bold">
                Do you have existing spreadsheets or paper records?
              </p>
              <p className="text-xs text-textSecondary leading-relaxed">
                You don't need to manually re-type your business. Our <strong>Universal Data Migration Engine</strong> imports everything in under 60 seconds:
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-surface0 border border-border p-2.5 rounded-xl flex items-center gap-2">
                  <span className="text-base">📦</span>
                  <div>
                    <p className="text-[11px] font-bold text-textPrimary">Products &amp; Stock</p>
                    <p className="text-[10px] text-textSecondary">Prices &amp; quantities</p>
                  </div>
                </div>

                <div className="bg-surface0 border border-border p-2.5 rounded-xl flex items-center gap-2">
                  <span className="text-base">👥</span>
                  <div>
                    <p className="text-[11px] font-bold text-textPrimary">Customer Books</p>
                    <p className="text-[10px] text-textSecondary">Debts &amp; WhatsApp</p>
                  </div>
                </div>

                <div className="bg-surface0 border border-border p-2.5 rounded-xl flex items-center gap-2">
                  <span className="text-base">🧾</span>
                  <div>
                    <p className="text-[11px] font-bold text-textPrimary">Invoices</p>
                    <p className="text-[10px] text-textSecondary">Past bills &amp; status</p>
                  </div>
                </div>

                <div className="bg-surface0 border border-border p-2.5 rounded-xl flex items-center gap-2">
                  <span className="text-base">🏢</span>
                  <div>
                    <p className="text-[11px] font-bold text-textPrimary">Fixed Assets</p>
                    <p className="text-[10px] text-textSecondary">Equipment &amp; vehicles</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <Link
                href="/migrate"
                onClick={handleDismissModal}
                className="w-full sm:flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl transition text-center shadow-lg flex items-center justify-center gap-1.5"
              >
                <span>⚡</span> Import My Existing Files Now
              </Link>
              <button
                onClick={handleDismissModal}
                className="w-full sm:w-auto py-3 px-4 bg-surface2 hover:bg-surface0 border border-border text-textSecondary hover:text-textPrimary font-bold text-xs rounded-xl transition text-center"
              >
                Explore Dashboard First
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
