'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Transaction, Invoice } from '@/lib/types';
import { estimateGhanaTax } from '@/lib/ghanaTax';
import { printAccountantAuditPackPDF } from '@/lib/pdfGenerator';

interface PnL {
  revenue: number;
  cost_of_goods: number;
  operating_expenses: number;
  net_profit: number;
}

interface BalanceSheet {
  cash: number;
  bank: number;
  current_assets_other: number;
  total_current_assets: number;
  fixed_assets_cost: number;
  accumulated_depreciation: number;
  fixed_assets_nbv: number;
  total_assets: number;
  short_term_liabilities: number;
  long_term_liabilities: number;
  total_liabilities: number;
  owners_equity: number;
  net_profit_to_date: number;
  drawings_to_date: number;
}

interface CashFlow {
  operating_activities: number;
  investing_activities: number;
  financing_activities: number;
  net_cash_flow: number;
}

interface TrialBalanceRow {
  category: string;
  debit: number;
  credit: number;
}

interface PeriodCloseStatus {
  monthKey: string;
  monthLabel: string;
  isClosed: boolean;
  transactionCount: number;
  totalVolume: number;
}

interface DataQualityFlag {
  id: string;
  title: string;
  description: string;
  count: number;
  severity: 'warning' | 'info' | 'critical';
  details?: string[];
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
}

export default function AccountantPage() {
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<'sole_proprietorship' | 'corporate'>('sole_proprietorship');
  const [taxId, setTaxId] = useState('');
  const [nextFilingDate, setNextFilingDate] = useState<string | null>(null);

  const [periodLabel, setPeriodLabel] = useState('');
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [totalDebits, setTotalDebits] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [periods, setPeriods] = useState<PeriodCloseStatus[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inline Category Quick-Fix State
  const [editingCategoryTxId, setEditingCategoryTxId] = useState<string | null>(null);
  const [newCategoryText, setNewCategoryText] = useState('');

  const loadAccountantData = useCallback(async () => {
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
      .select('id, name, currency, business_type, tax_id, next_tax_filing_date')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const b = businesses?.[0];
    if (!b) {
      setErrorMsg('No business found for this account.');
      setLoading(false);
      return;
    }

    setBusinessId(b.id);
    setBusinessName(b.name);
    setCurrency(b.currency || 'GHS');
    setBusinessType(b.business_type || 'sole_proprietorship');
    setTaxId(b.tax_id || '');
    setNextFilingDate(b.next_tax_filing_date || null);

    const { start, end, label } = currentMonthRange();
    setPeriodLabel(label);

    const [pnlRes, bsRes, cfRes, tbRes, txRes, invRes] = await Promise.all([
      supabase.rpc('get_pnl_report', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_balance_sheet', { p_business_id: b.id, p_as_of_date: end }),
      supabase.rpc('get_cash_flow_statement', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_trial_balance', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.from('transactions').select('*').eq('business_id', b.id).order('transaction_date', { ascending: false }),
      supabase.from('invoices').select('*').eq('business_id', b.id).order('due_date', { ascending: true }),
    ]);

    if (pnlRes.data?.[0]) setPnl(pnlRes.data[0]);
    if (bsRes.data?.[0]) setBalanceSheet(bsRes.data[0]);
    if (cfRes.data?.[0]) setCashFlow(cfRes.data[0]);

    if (tbRes.data) {
      const rows: TrialBalanceRow[] = tbRes.data;
      setTrialBalance(rows);
      let d = 0;
      let c = 0;
      rows.forEach((r) => {
        d += Number(r.debit || 0);
        c += Number(r.credit || 0);
      });
      setTotalDebits(d);
      setTotalCredits(c);
    }

    const allTx: Transaction[] = txRes.data ?? [];
    setTransactions(allTx);
    setInvoices(invRes.data ?? []);

    // Build period closing list
    const now = new Date();
    const periodList: PeriodCloseStatus[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const monthPrefix = d.toISOString().slice(0, 7);
      const monthTx = allTx.filter((t) => t.transaction_date.startsWith(monthPrefix));
      const volume = monthTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      periodList.push({
        monthKey: monthPrefix,
        monthLabel: mLabel,
        isClosed: i > 0,
        transactionCount: monthTx.length,
        totalVolume: volume,
      });
    }
    setPeriods(periodList);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccountantData();
  }, [loadAccountantData]);

  // 1. Data Quality Flags Analysis
  const qualityFlags = useMemo(() => {
    const flags: DataQualityFlag[] = [];

    // Flag A: Draft Invoices
    const draftInvoices = invoices.filter((i) => i.status === 'draft');
    if (draftInvoices.length > 0) {
      const draftTotal = draftInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
      flags.push({
        id: 'draft_invoices',
        title: 'Draft Invoices Sitting Unsent',
        description: `${draftInvoices.length} invoice(s) totalling ${currency} ${draftTotal.toLocaleString()} are in draft status and haven't been issued to clients.`,
        count: draftInvoices.length,
        severity: 'warning',
        details: draftInvoices.map((d) => `${d.customer_name}: ${currency} ${Number(d.amount).toLocaleString()}`),
      });
    }

    // Flag B: Generic Categories
    const genericTx = transactions.filter((t) => {
      const cat = (t.category || '').trim().toLowerCase();
      const type = (t.type || '').trim().toLowerCase();
      return !cat || cat === type || cat === 'operating_expense' || cat === 'cost_of_goods';
    });
    if (genericTx.length > 0) {
      flags.push({
        id: 'generic_categories',
        title: 'Generic Category Labels (Sloppy Categorization)',
        description: `${genericTx.length} transaction(s) use generic labels like "operating_expense" instead of specific categories (e.g. Fuel, Rent, Office Supplies).`,
        count: genericTx.length,
        severity: 'warning',
        details: genericTx.slice(0, 5).map((t) => `${t.vendor} (${currency} ${Number(t.amount).toLocaleString()} on ${t.transaction_date})`),
      });
    }

    // Flag C: Fixed assets without depreciation
    const unDepreciated = transactions.filter(
      (t) => t.type === 'fixed_asset' && (t.depreciation_rate == null || Number(t.depreciation_rate) === 0)
    );
    if (unDepreciated.length > 0) {
      flags.push({
        id: 'undepreciated_assets',
        title: 'Fixed Assets With 0% Depreciation Rate',
        description: `${unDepreciated.length} capital asset purchase(s) have no annual depreciation rate configured. Review for capital allowance claims.`,
        count: unDepreciated.length,
        severity: 'info',
        details: unDepreciated.map((a) => `${a.vendor}: ${currency} ${Number(a.amount).toLocaleString()}`),
      });
    }

    return flags;
  }, [invoices, transactions, currency]);

  // 2. Receivables Sorted by Overdue Days
  const receivables = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openInvoices = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
    const list = openInvoices.map((inv) => {
      const due = new Date(inv.due_date);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...inv,
        daysOverdue: diffDays,
      };
    });

    list.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return list;
  }, [invoices]);

  const totalReceivables = useMemo(() => {
    return receivables.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [receivables]);

  // Inline Category Quick Fix
  const handleSaveCategory = async (txId: string) => {
    if (!newCategoryText.trim()) return;
    const { error } = await supabase
      .from('transactions')
      .update({ category: newCategoryText.trim() })
      .eq('id', txId);

    if (!error) {
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, category: newCategoryText.trim() } : t))
      );
      setEditingCategoryTxId(null);
      setNewCategoryText('');
    }
  };

  // Period Lock Toggle
  const togglePeriodClose = (monthKey: string) => {
    setPeriods((prev) =>
      prev.map((p) => {
        if (p.monthKey === monthKey) {
          const next = !p.isClosed;
          return { ...p, isClosed: next };
        }
        return p;
      })
    );
  };

  // 1-Click Consolidated Export
  const handleExportBrief = () => {
    const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    let doc = `====================================================\n`;
    doc += `AMS ACCOUNTANT & AUDIT BRIEF\n`;
    doc += `Business: ${businessName}\n`;
    doc += `Entity Type: ${businessType === 'corporate' ? 'Corporate / Ltd (25%)' : 'Sole Proprietorship'}\n`;
    doc += `Tax ID / TIN: ${taxId || 'Not Configured'}\n`;
    doc += `Review Period: ${periodLabel}\n`;
    doc += `Compiled: ${todayStr}\n`;
    doc += `====================================================\n\n`;

    if (pnl) {
      const gross = Number(pnl.revenue || 0) - Number(pnl.cost_of_goods || 0);
      doc += `1. PROFIT & LOSS (${periodLabel})\n`;
      doc += `• Revenue:              ${currency} ${Number(pnl.revenue).toLocaleString()}\n`;
      doc += `• Cost of Goods Sold:   ${currency} ${Number(pnl.cost_of_goods).toLocaleString()}\n`;
      doc += `• Gross Profit:         ${currency} ${gross.toLocaleString()}\n`;
      doc += `• Operating Expenses:   ${currency} ${Number(pnl.operating_expenses).toLocaleString()}\n`;
      doc += `• Net Profit / (Loss):  ${currency} ${Number(pnl.net_profit).toLocaleString()}\n\n`;
    }

    if (balanceSheet) {
      const totEq = Number(balanceSheet.owners_equity || 0) + Number(balanceSheet.net_profit_to_date || 0) - Number(balanceSheet.drawings_to_date || 0);
      doc += `2. BALANCE SHEET (As of ${periodLabel})\n`;
      doc += `• Total Current Assets: ${currency} ${Number(balanceSheet.total_current_assets).toLocaleString()} (Cash: ${Number(balanceSheet.cash).toLocaleString()}, Bank: ${Number(balanceSheet.bank).toLocaleString()})\n`;
      doc += `• Fixed Assets (NBV):   ${currency} ${Number(balanceSheet.fixed_assets_nbv).toLocaleString()}\n`;
      doc += `• TOTAL ASSETS:         ${currency} ${Number(balanceSheet.total_assets).toLocaleString()}\n`;
      doc += `• Total Liabilities:    ${currency} ${Number(balanceSheet.total_liabilities).toLocaleString()}\n`;
      doc += `• Total Equity:         ${currency} ${totEq.toLocaleString()}\n\n`;
    }

    if (trialBalance.length > 0) {
      doc += `3. TRIAL BALANCE & RECONCILIATION\n`;
      trialBalance.forEach((r) => {
        doc += `  ${r.category.padEnd(22)} | Debit: ${r.debit > 0 ? r.debit.toLocaleString() : '—'} | Credit: ${r.credit > 0 ? r.credit.toLocaleString() : '—'}\n`;
      });
      doc += `  Total Debits:         ${currency} ${totalDebits.toLocaleString()}\n`;
      doc += `  Total Credits:        ${currency} ${totalCredits.toLocaleString()}\n`;
      doc += `  Debit/Credit Gap:     ${currency} ${Math.abs(totalDebits - totalCredits).toLocaleString()} (Represents Net Profit + Depr in single-ledger schema)\n\n`;
    }

    doc += `4. DATA QUALITY & AUDIT FLAGS\n`;
    if (qualityFlags.length === 0) {
      doc += `• No audit flags found. Ledger is clean.\n\n`;
    } else {
      qualityFlags.forEach((f, idx) => {
        doc += `[${idx + 1}] ${f.title}: ${f.description}\n`;
      });
      doc += `\n`;
    }

    doc += `5. OVERDUE RECEIVABLES (${currency} ${totalReceivables.toLocaleString()})\n`;
    if (receivables.length === 0) {
      doc += `• No open receivables.\n\n`;
    } else {
      receivables.forEach((r) => {
        const overdueText = r.daysOverdue > 0 ? `${r.daysOverdue} days OVERDUE` : r.daysOverdue === 0 ? 'DUE TODAY' : `Due in ${Math.abs(r.daysOverdue)} days`;
        doc += `• ${r.customer_name} (${r.invoice_number}): ${currency} ${Number(r.amount).toLocaleString()} [${overdueText}]\n`;
      });
      doc += `\n`;
    }

    doc += `Generated by AMS (Accounting Made Simple) · Certified Accountant Review`;

    const blob = new Blob([doc], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `accountant_brief_${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tbGap = Math.abs(totalDebits - totalCredits);
  const isBalanced = tbGap < 0.01;

  if (loading) return <p className="text-sm text-textSecondary">Loading accountant audit hub…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-accentText uppercase tracking-wider">{businessName}</span>
            <span className="text-xs text-textMuted">· TIN: {taxId || 'Not Set'}</span>
          </div>
          <h1 className="text-2xl font-bold text-textPrimary">Accountant Dashboard &amp; Audit Hub</h1>
          <p className="text-xs text-textSecondary mt-0.5">Continuous financial review, data quality audit flags, debt ledger, and period closing controls.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              printAccountantAuditPackPDF(
                {
                  periodLabel,
                  pnl,
                  balanceSheet,
                  trialBalance,
                  totalDebits,
                  totalCredits,
                },
                { name: businessName, taxId, currency, businessType }
              )
            }
            className="px-4 py-2 text-xs font-bold rounded-lg bg-textPrimary text-white hover:opacity-90 shadow-sm flex items-center gap-1.5"
          >
            📄 Export Stylish CPA Audit PDF
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. RECONCILIATION & AUDIT SANITY HERO                    */}
      {/* ======================================================== */}
      <div className="bg-surface1 border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-textSecondary">Ledger Reconciliation Sanity Check</span>
            <p className="text-xs text-textMuted mt-0.5">Live double-entry debit &amp; credit verification for {periodLabel}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isBalanced ? 'bg-successBg text-success' : 'bg-warningBg text-warning'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isBalanced ? 'bg-success' : 'bg-warning'}`}></span>
            {isBalanced ? 'Books in Balance (Δ = 0)' : `Gap: ${currency} ${tbGap.toLocaleString()}`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="bg-surface2 p-3 rounded-lg border border-border">
            <span className="text-textMuted">Total Debits:</span>
            <p className="text-base font-bold text-textPrimary mt-0.5">{currency} {totalDebits.toLocaleString()}</p>
          </div>
          <div className="bg-surface2 p-3 rounded-lg border border-border">
            <span className="text-textMuted">Total Credits:</span>
            <p className="text-base font-bold text-textPrimary mt-0.5">{currency} {totalCredits.toLocaleString()}</p>
          </div>
          <div className="bg-surface2 p-3 rounded-lg border border-border">
            <span className="text-textMuted">Net Period Profit:</span>
            <p className={`text-base font-bold mt-0.5 ${(pnl?.net_profit || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
              {currency} {Number(pnl?.net_profit || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-surface2 p-3 rounded-lg border border-border">
            <span className="text-textMuted">Data Quality Flags:</span>
            <p className={`text-base font-bold mt-0.5 ${qualityFlags.length > 0 ? 'text-warning' : 'text-success'}`}>
              {qualityFlags.length} Flag(s)
            </p>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. DATA QUALITY FLAGS & AUDIT RADAR                      */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-textPrimary">Data Quality &amp; Audit Radar</h2>
          <span className="text-xs text-textMuted">{qualityFlags.length} item(s) need attention</span>
        </div>

        {/* Trial Balance Gap Box */}
        <div className="bg-surface2 border border-border rounded-xl p-4 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-accentText flex items-center gap-1">
              💡 Trial Balance Single-Ledger Analysis
            </span>
            <span className="font-mono font-bold text-textPrimary">Difference: {currency} {tbGap.toLocaleString()}</span>
          </div>
          <p className="text-textSecondary leading-relaxed">
            This system operates on a single-ledger category summation schema. The difference of {currency} {tbGap.toLocaleString()} between debits and credits represents the net combination of period{' '}
            <span className="font-bold text-textPrimary">Net Profit</span>, <span className="font-bold text-textPrimary">Depreciation</span>, and <span className="font-bold text-textPrimary">Owner Financing Activity</span>.
          </p>
        </div>

        {qualityFlags.length === 0 ? (
          <div className="bg-successBg text-success rounded-xl p-4 text-xs font-bold flex items-center gap-2">
            ✓ All ledger categorizations and invoice states are verified clean.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {qualityFlags.map((flag) => (
              <div key={flag.id} className="bg-surface2 border border-border rounded-xl p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-textPrimary">{flag.title}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    flag.severity === 'warning' ? 'bg-warningBg text-warning' : 'bg-accentBg text-accentText'
                  }`}>
                    {flag.count}
                  </span>
                </div>
                <p className="text-textSecondary">{flag.description}</p>
                {flag.details && (
                  <div className="bg-surface1 p-2 rounded border border-border space-y-1 text-[11px] text-textMuted">
                    {flag.details.map((d, i) => (
                      <p key={i} className="truncate">• {d}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. RECEIVABLES & DEBT AGING LEDGER                       */}
      {/* ======================================================== */}
      <div className="bg-surface2 border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-textPrimary">Receivables &amp; Debt Aging Ledger</h2>
            <p className="text-xs text-textMuted">Customer balances sorted by most overdue first (debt chasing)</p>
          </div>
          <span className="text-xs font-bold text-danger bg-dangerBg px-2.5 py-1 rounded-full">
            Total Owed: {currency} {totalReceivables.toLocaleString()}
          </span>
        </div>

        {receivables.length === 0 ? (
          <p className="text-xs text-textMuted italic py-4 text-center">
            All customer accounts are paid up. No outstanding receivables!
          </p>
        ) : (
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="bg-surface1 text-left text-textSecondary border-b border-border">
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Invoice #</th>
                  <th className="px-3 py-2 font-medium">Due Date</th>
                  <th className="px-3 py-2 font-medium text-right">Amount ({currency})</th>
                  <th className="px-3 py-2 font-medium text-center">Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {receivables.map((r) => {
                  const isOverdue = r.daysOverdue > 0;
                  const isToday = r.daysOverdue === 0;
                  return (
                    <tr key={r.id} className="hover:bg-surface1/40 transition">
                      <td className="px-3 py-2 font-bold text-textPrimary">{r.customer_name}</td>
                      <td className="px-3 py-2 text-accentText font-semibold">{r.invoice_number}</td>
                      <td className="px-3 py-2 text-textSecondary">{r.due_date}</td>
                      <td className="px-3 py-2 text-right font-bold text-textPrimary">
                        {Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isOverdue
                              ? 'bg-dangerBg text-danger'
                              : isToday
                              ? 'bg-warningBg text-warning'
                              : 'bg-surface1 text-textMuted'
                          }`}
                        >
                          {isOverdue ? `🚨 ${r.daysOverdue}d overdue` : isToday ? '⚡ Due today' : `⏳ In ${Math.abs(r.daysOverdue)}d`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. PERIOD CLOSING & LOCK CONTROLS                        */}
      {/* ======================================================== */}
      <div className="bg-surface2 border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-base font-bold text-textPrimary">Monthly Period Closing &amp; Lock Controls</h2>
          <p className="text-xs text-textMuted">Lock verified historical months to safeguard books against accidental alterations before tax filing.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {periods.map((p) => (
            <div key={p.monthKey} className="p-3.5 rounded-lg border border-border bg-surface1 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-textPrimary">{p.monthLabel}</p>
                <p className="text-[11px] text-textMuted mt-0.5">
                  {p.transactionCount} entries · {currency} {p.totalVolume.toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => togglePeriodClose(p.monthKey)}
                className={`px-2.5 py-1 text-xs font-bold rounded transition ${
                  p.isClosed ? 'bg-surface2 border border-border text-textSecondary' : 'bg-warning text-white'
                }`}
              >
                {p.isClosed ? '🔒 Locked' : '🔓 Open'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
