'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ReportTab = 'pnl' | 'balance_sheet' | 'cash_flow' | 'trial_balance';

interface PnL {
  revenue: number;
  cost_of_goods: number;
  operating_expenses: number;
  net_profit: number;
}
interface BalanceSheet {
  cash: number;
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

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'long' }) };
}

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('pnl');
  const [periodLabel, setPeriodLabel] = useState('');
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
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

    const { start, end, label } = currentMonthRange();
    setPeriodLabel(label);

    const [pnlRes, bsRes, cfRes, tbRes] = await Promise.all([
      supabase.rpc('get_pnl_report', { p_business_id: businessId, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_balance_sheet', { p_business_id: businessId, p_as_of_date: end }),
      supabase.rpc('get_cash_flow_statement', { p_business_id: businessId, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_trial_balance', { p_business_id: businessId, p_start_date: start, p_end_date: end }),
    ]);

    if (pnlRes.data?.[0]) setPnl(pnlRes.data[0]);
    if (bsRes.data?.[0]) setBalanceSheet(bsRes.data[0]);
    if (cfRes.data?.[0]) setCashFlow(cfRes.data[0]);
    if (tbRes.data) setTrialBalance(tbRes.data);

    const firstError = pnlRes.error || bsRes.error || cfRes.error || tbRes.error;
    if (firstError) setErrorMsg(firstError.message);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  return (
    <div>
      <h1 className="text-2xl font-medium text-textPrimary mb-6">Reports</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <TabButton label="P&L" active={tab === 'pnl'} onClick={() => setTab('pnl')} />
        <TabButton label="Balance sheet" active={tab === 'balance_sheet'} onClick={() => setTab('balance_sheet')} />
        <TabButton label="Cash flow" active={tab === 'cash_flow'} onClick={() => setTab('cash_flow')} />
        <TabButton label="Trial balance" active={tab === 'trial_balance'} onClick={() => setTab('trial_balance')} />
      </div>

      {loading && <p className="text-sm text-textSecondary">Loading…</p>}
      {!loading && errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && !errorMsg && tab === 'pnl' && pnl && (
        <Card title={`Profit & loss · ${periodLabel}`}>
          <Row label="Revenue" value={pnl.revenue} />
          <Row label="Cost of goods" value={pnl.cost_of_goods} />
          <Row label="Operating expenses" value={pnl.operating_expenses} />
          <TotalRow label="Net profit" value={pnl.net_profit} />
        </Card>
      )}

      {!loading && !errorMsg && tab === 'balance_sheet' && balanceSheet && (
        <Card title="Balance sheet · as of today">
          <p className="text-xs uppercase text-textMuted mb-1 mt-1">Current assets</p>
          <Row label="Cash" value={balanceSheet.cash} />
          <Row label="Other current assets" value={balanceSheet.current_assets_other} />
          <SubtotalRow label="Total current assets" value={balanceSheet.total_current_assets} />

          <p className="text-xs uppercase text-textMuted mb-1 mt-4">Fixed assets</p>
          <Row label="Cost" value={balanceSheet.fixed_assets_cost} />
          <Row label="Accumulated depreciation" value={-balanceSheet.accumulated_depreciation} />
          <SubtotalRow label="Net book value" value={balanceSheet.fixed_assets_nbv} />

          <TotalRow label="Total assets" value={balanceSheet.total_assets} />

          <p className="text-xs uppercase text-textMuted mb-1 mt-4">Liabilities</p>
          <Row label="Short-term liabilities" value={balanceSheet.short_term_liabilities} />
          <Row label="Long-term liabilities" value={balanceSheet.long_term_liabilities} />
          <SubtotalRow label="Total liabilities" value={balanceSheet.total_liabilities} />

          <TotalRow label="Owner's equity" value={balanceSheet.owners_equity} />

          <div className="bg-surface2 rounded-lg p-4 mt-4">
            <p className="text-xs uppercase font-medium text-textSecondary mb-2">
              What moved equity (informational)
            </p>
            <Row label="Net profit to date" value={balanceSheet.net_profit_to_date} />
            <Row label="Drawings to date" value={-balanceSheet.drawings_to_date} />
            <p className="text-xs text-textMuted mt-2 leading-relaxed">
              Shown for context only — already reflected inside Owner&apos;s equity above via cash,
              not added again on top of it.
            </p>
          </div>

          <p className="text-xs text-textMuted mt-4 leading-relaxed">
            Cash is worked out from your transaction history, not a tracked bank balance.
            Depreciation reduces equity here but isn&apos;t subtracted from net profit in the P&amp;L
            — that gap is the depreciation expense.
          </p>
        </Card>
      )}

      {!loading && !errorMsg && tab === 'cash_flow' && cashFlow && (
        <Card title={`Cash flow · ${periodLabel}`}>
          <Row label="Operating activities" value={cashFlow.operating_activities} />
          <Row label="Investing activities" value={cashFlow.investing_activities} />
          <Row label="Financing activities" value={cashFlow.financing_activities} />
          <TotalRow label="Net cash flow" value={cashFlow.net_cash_flow} />
        </Card>
      )}

      {!loading && !errorMsg && tab === 'trial_balance' && (
        <Card title={`Trial balance · ${periodLabel}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textMuted text-xs uppercase border-b border-border">
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Debit</th>
                <th className="pb-2 font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.map((row) => (
                <tr key={row.category} className="border-b border-border">
                  <td className="py-1.5 text-textPrimary">{row.category}</td>
                  <td className="py-1.5 text-textPrimary">
                    {row.debit > 0 ? row.debit.toLocaleString() : '—'}
                  </td>
                  <td className="py-1.5 text-textPrimary">
                    {row.credit > 0 ? row.credit.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-medium text-textPrimary">Totals</td>
                <td className="pt-2 text-textPrimary">
                  {trialBalance.reduce((s, r) => s + r.debit, 0).toLocaleString()}
                </td>
                <td className="pt-2 text-textPrimary">
                  {trialBalance.reduce((s, r) => s + r.credit, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-textMuted mt-4 leading-relaxed">
            This is a category summary, not a formal double-entry trial balance — debit and credit
            totals aren&apos;t expected to match exactly. The difference reflects net profit and
            financing activity for the period.
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface1 rounded-lg p-6 max-w-md">
      <p className="text-sm text-textSecondary mb-4">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border text-sm">
      <span className="text-textPrimary">{label}</span>
      <span className="text-textPrimary">{value.toLocaleString()}</span>
    </div>
  );
}

function SubtotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-1.5 pt-2 border-t border-border text-sm">
      <span className="text-textPrimary font-medium">{label}</span>
      <span className="text-textPrimary font-medium">{value.toLocaleString()}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between pt-3 mt-2 border-t border-border">
      <span className="text-sm font-medium text-textPrimary">{label}</span>
      <span className={`text-sm font-medium ${value >= 0 ? 'text-success' : 'text-danger'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm shrink-0 ${
        active ? 'bg-textPrimary text-white' : 'bg-surface2 border border-border text-textPrimary'
      }`}
    >
      {label}
    </button>
  );
}
