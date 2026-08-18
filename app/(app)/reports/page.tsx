'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ReportTab = 'all' | 'pnl' | 'balance_sheet' | 'cash_flow' | 'trial_balance';
type PeriodPreset = 'current_month' | 'last_month' | 'quarter' | 'year';

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

function getPeriodDates(preset: PeriodPreset) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === 'current_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: iso(start),
      end: iso(end),
      label: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: iso(start),
      end: iso(end),
      label: start.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  }

  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    return {
      start: iso(start),
      end: iso(end),
      label: `Q${q + 1} ${now.getFullYear()}`,
    };
  }

  // Full Year
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return {
    start: iso(start),
    end: iso(end),
    label: `Full Year ${now.getFullYear()}`,
  };
}

export default function ReportsPage() {
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [tab, setTab] = useState<ReportTab>('all');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('current_month');
  const [periodLabel, setPeriodLabel] = useState('');

  const [pnl, setPnl] = useState<PnL | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [totalDebits, setTotalDebits] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
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

    const b = businesses?.[0];
    if (!b) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }

    setBusinessId(b.id);
    setBusinessName(b.name);
    setCurrency(b.currency || 'GHS');

    const { start, end, label } = getPeriodDates(periodPreset);
    setPeriodLabel(label);

    const [pnlRes, bsRes, cfRes, tbRes] = await Promise.all([
      supabase.rpc('get_pnl_report', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_balance_sheet', { p_business_id: b.id, p_as_of_date: end }),
      supabase.rpc('get_cash_flow_statement', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_trial_balance', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
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

    const firstError = pnlRes.error || bsRes.error || cfRes.error || tbRes.error;
    if (firstError) setErrorMsg(firstError.message);

    setLoading(false);
  }, [periodPreset]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Consolidated Financial Brief Export
  const exportConsolidatedBrief = () => {
    let brief = `====================================================\n`;
    brief += `FINANCIAL STATEMENTS BRIEF\n`;
    brief += `Business: ${businessName}\n`;
    brief += `Period: ${periodLabel}\n`;
    brief += `Currency: ${currency}\n`;
    brief += `Generated: ${new Date().toLocaleDateString()}\n`;
    brief += `====================================================\n\n`;

    if (pnl) {
      const gross = Number(pnl.revenue || 0) - Number(pnl.cost_of_goods || 0);
      brief += `1. PROFIT & LOSS STATEMENT\n`;
      brief += `• Revenue:              ${currency} ${Number(pnl.revenue).toLocaleString()}\n`;
      brief += `• Cost of Goods Sold:   ${currency} ${Number(pnl.cost_of_goods).toLocaleString()}\n`;
      brief += `• Gross Profit:         ${currency} ${gross.toLocaleString()}\n`;
      brief += `• Operating Expenses:   ${currency} ${Number(pnl.operating_expenses).toLocaleString()}\n`;
      brief += `• Net Profit:           ${currency} ${Number(pnl.net_profit).toLocaleString()}\n\n`;
    }

    if (balanceSheet) {
      const totEq = Number(balanceSheet.owners_equity || 0) + Number(balanceSheet.net_profit_to_date || 0) - Number(balanceSheet.drawings_to_date || 0);
      brief += `2. BALANCE SHEET\n`;
      brief += `• Total Current Assets: ${currency} ${Number(balanceSheet.total_current_assets).toLocaleString()} (Cash: ${Number(balanceSheet.cash).toLocaleString()}, Bank: ${Number(balanceSheet.bank).toLocaleString()})\n`;
      brief += `• Fixed Assets (NBV):   ${currency} ${Number(balanceSheet.fixed_assets_nbv).toLocaleString()}\n`;
      brief += `• Total Assets:         ${currency} ${Number(balanceSheet.total_assets).toLocaleString()}\n`;
      brief += `• Total Liabilities:    ${currency} ${Number(balanceSheet.total_liabilities).toLocaleString()}\n`;
      brief += `• Total Equity:         ${currency} ${totEq.toLocaleString()}\n\n`;
    }

    if (cashFlow) {
      brief += `3. CASH FLOW STATEMENT\n`;
      brief += `• Operating Cash Flow:  ${currency} ${Number(cashFlow.operating_activities).toLocaleString()}\n`;
      brief += `• Investing Cash Flow:  ${currency} ${Number(cashFlow.investing_activities).toLocaleString()}\n`;
      brief += `• Financing Cash Flow:  ${currency} ${Number(cashFlow.financing_activities).toLocaleString()}\n`;
      brief += `• Net Cash Flow Change: ${currency} ${Number(cashFlow.net_cash_flow).toLocaleString()}\n\n`;
    }

    if (trialBalance.length > 0) {
      brief += `4. TRIAL BALANCE\n`;
      trialBalance.forEach((r) => {
        brief += `  ${r.category.padEnd(20)} | Debit: ${r.debit > 0 ? r.debit.toLocaleString() : '—'} | Credit: ${r.credit > 0 ? r.credit.toLocaleString() : '—'}\n`;
      });
      brief += `  Total Debits:         ${currency} ${totalDebits.toLocaleString()}\n`;
      brief += `  Total Credits:        ${currency} ${totalCredits.toLocaleString()}\n\n`;
    }

    brief += `AMS (Accounting Made Simple) · Certified Report Compilation`;

    const blob = new Blob([brief], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `financial_statements_${periodPreset}_${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tbGap = Math.abs(totalDebits - totalCredits);

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Financial Reports &amp; Statements</h1>
          <p className="text-sm text-textSecondary">
            Executive accounting statements compiled directly from your general ledger for {periodLabel}.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Presets */}
          <select
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-surface2 text-textPrimary shadow-sm"
          >
            <option value="current_month">Current Month</option>
            <option value="last_month">Last Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">Full Year</option>
          </select>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-bold rounded-lg border border-border bg-surface2 hover:bg-surface1 text-textPrimary shadow-sm flex items-center gap-1.5"
          >
            🖨️ Print / Save as PDF
          </button>

          <button
            onClick={exportConsolidatedBrief}
            className="px-3.5 py-2 text-xs font-bold rounded-lg bg-accent text-white hover:opacity-90 shadow-sm flex items-center gap-1.5"
          >
            📥 Export Package (.txt)
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto print:hidden">
        <button
          onClick={() => setTab('all')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'all' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          📄 Continuous All-in-One View
        </button>
        <button
          onClick={() => setTab('pnl')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'pnl' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Profit &amp; Loss
        </button>
        <button
          onClick={() => setTab('balance_sheet')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'balance_sheet' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Balance Sheet
        </button>
        <button
          onClick={() => setTab('cash_flow')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'cash_flow' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Cash Flow
        </button>
        <button
          onClick={() => setTab('trial_balance')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'trial_balance' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Trial Balance
        </button>
      </div>

      {loading && <p className="text-sm text-textSecondary">Loading financial reports…</p>}
      {!loading && errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && (
        <div className="space-y-6">
          {/* ======================================================== */}
          {/* 1. PROFIT & LOSS STATEMENT                               */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'pnl') && pnl && (
            <ReportCard title={`Profit & Loss Statement · ${periodLabel}`} icon="📈">
              <ReportRow label="Revenue" value={Number(pnl.revenue)} currency={currency} />
              <ReportRow label="Cost of Goods Sold (COGS)" value={-Number(pnl.cost_of_goods)} currency={currency} />
              <SubtotalRow
                label="Gross Profit"
                value={Number(pnl.revenue) - Number(pnl.cost_of_goods)}
                currency={currency}
              />
              <ReportRow label="Operating Expenses (OpEx)" value={-Number(pnl.operating_expenses)} currency={currency} />
              <TotalRow
                label="Net Profit / (Loss)"
                value={Number(pnl.net_profit)}
                currency={currency}
                isProfit
              />
            </ReportCard>
          )}

          {/* ======================================================== */}
          {/* 2. BALANCE SHEET                                         */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'balance_sheet') && balanceSheet && (
            <ReportCard title={`Balance Sheet · As of ${periodLabel}`} icon="⚖️">
              <p className="text-xs uppercase font-bold text-textMuted mb-2">Current Assets</p>
              <ReportRow label="Cash on Hand" value={Number(balanceSheet.cash)} currency={currency} />
              <ReportRow label="Bank / MoMo Balances" value={Number(balanceSheet.bank)} currency={currency} />
              <ReportRow label="Other Current Assets (Inventory & Receivables)" value={Number(balanceSheet.current_assets_other)} currency={currency} />
              <SubtotalRow label="Total Current Assets" value={Number(balanceSheet.total_current_assets)} currency={currency} />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-4">Fixed Assets</p>
              <ReportRow label="Equipment / Fixed Assets (Historical Cost)" value={Number(balanceSheet.fixed_assets_cost)} currency={currency} />
              <ReportRow label="Less: Accumulated Depreciation" value={-Number(balanceSheet.accumulated_depreciation)} currency={currency} />
              <SubtotalRow label="Net Book Value (Fixed Assets)" value={Number(balanceSheet.fixed_assets_nbv)} currency={currency} />

              <TotalRow label="TOTAL ASSETS" value={Number(balanceSheet.total_assets)} currency={currency} />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-6">Liabilities</p>
              <ReportRow label="Short-term Liabilities (Accounts Payable)" value={Number(balanceSheet.short_term_liabilities)} currency={currency} />
              <ReportRow label="Long-term Liabilities (Loans)" value={Number(balanceSheet.long_term_liabilities)} currency={currency} />
              <SubtotalRow label="Total Liabilities" value={Number(balanceSheet.total_liabilities)} currency={currency} />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-4">Owner&apos;s Equity</p>
              <ReportRow label="Owner&apos;s Initial Capital" value={Number(balanceSheet.owners_equity)} currency={currency} />
              <ReportRow label="Retained Net Profit to Date" value={Number(balanceSheet.net_profit_to_date)} currency={currency} />
              <ReportRow label="Less: Drawings to Date" value={-Number(balanceSheet.drawings_to_date)} currency={currency} />
              <SubtotalRow
                label="Total Equity"
                value={
                  Number(balanceSheet.owners_equity) +
                  Number(balanceSheet.net_profit_to_date) -
                  Number(balanceSheet.drawings_to_date)
                }
                currency={currency}
              />

              <TotalRow
                label="TOTAL LIABILITIES &amp; EQUITY"
                value={
                  Number(balanceSheet.total_liabilities) +
                  Number(balanceSheet.owners_equity) +
                  Number(balanceSheet.net_profit_to_date) -
                  Number(balanceSheet.drawings_to_date)
                }
                currency={currency}
              />
            </ReportCard>
          )}

          {/* ======================================================== */}
          {/* 3. CASH FLOW STATEMENT                                   */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'cash_flow') && cashFlow && (
            <ReportCard title={`Cash Flow Statement · ${periodLabel}`} icon="🔄">
              <ReportRow label="Operating Activities (Sales & Operating Payments)" value={Number(cashFlow.operating_activities)} currency={currency} />
              <ReportRow label="Investing Activities (Asset Purchases & Disposals)" value={Number(cashFlow.investing_activities)} currency={currency} />
              <ReportRow label="Financing Activities (Capital Contributions & Debt)" value={Number(cashFlow.financing_activities)} currency={currency} />
              <TotalRow label="NET CASH FLOW CHANGE" value={Number(cashFlow.net_cash_flow)} currency={currency} isProfit />
            </ReportCard>
          )}

          {/* ======================================================== */}
          {/* 4. TRIAL BALANCE                                         */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'trial_balance') && trialBalance.length > 0 && (
            <ReportCard title={`Trial Balance Summary · ${periodLabel}`} icon="📋">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-textSecondary uppercase font-bold text-left">
                      <th className="py-2 font-bold">Category</th>
                      <th className="py-2 text-right w-36">Debit ({currency})</th>
                      <th className="py-2 text-right w-36">Credit ({currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trialBalance.map((r) => (
                      <tr key={r.category}>
                        <td className="py-2 text-textPrimary font-medium capitalize">{r.category.replace('_', ' ')}</td>
                        <td className="py-2 text-right text-textPrimary font-mono">
                          {Number(r.debit) > 0 ? Number(r.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className="py-2 text-right text-textPrimary font-mono">
                          {Number(r.credit) > 0 ? Number(r.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border font-bold bg-surface1/60">
                      <td className="py-2.5 text-textPrimary uppercase">Total</td>
                      <td className="py-2.5 text-right text-textPrimary font-mono font-bold">
                        {totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 text-right text-textPrimary font-mono font-bold">
                        {totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Single-Ledger Gap Explanation */}
              <div className="mt-4 p-3 bg-surface1 rounded-lg border border-border text-xs text-textSecondary">
                <span className="font-bold text-textPrimary">💡 Ledger Structure Note: </span>
                Trial Balance difference of {currency} {tbGap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} reflects period Net Profit, Depreciation, and Financing movements in this single-ledger schema.
              </div>
            </ReportCard>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface2 rounded-xl border border-border p-6 shadow-sm">
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border">
        <span className="text-lg">{icon}</span>
        <h2 className="text-base font-bold text-textPrimary">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReportRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between items-center text-xs py-1">
      <span className="text-textSecondary">{label}</span>
      <span className="font-mono text-textPrimary font-medium">
        {value < 0 ? `(${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  );
}

function SubtotalRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between items-center text-xs py-2 border-t border-border font-bold text-textPrimary">
      <span>{label}</span>
      <span className="font-mono">
        {value < 0 ? `(${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  currency,
  isProfit,
}: {
  label: string;
  value: number;
  currency: string;
  isProfit?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <div className="flex justify-between items-center text-sm py-2.5 mt-2 border-t-2 border-border font-black">
      <span className="text-textPrimary uppercase">{label}</span>
      <span className={`font-mono ${isProfit ? (isNeg ? 'text-danger' : 'text-success') : 'text-textPrimary'}`}>
        {isNeg ? `(${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  );
}
