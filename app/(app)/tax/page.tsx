'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { estimateGhanaTax, BusinessType } from '@/lib/ghanaTax';
import { printTaxSummaryPDF } from '@/lib/pdfGenerator';

type PeriodPreset = 'month' | 'quarter' | 'year';

function getPeriodRange(preset: PeriodPreset) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { start: iso(start), end: iso(end), label: `Q${q + 1} ${now.getFullYear()}` };
  }
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return { start: iso(start), end: iso(end), label: `Full Year ${now.getFullYear()}` };
}

export default function TaxPage() {
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Business Tax Config
  const [businessType, setBusinessType] = useState<BusinessType>('sole_proprietorship');
  const [taxId, setTaxId] = useState('');
  const [nextFilingDate, setNextFilingDate] = useState('');
  const [filingFrequency, setFilingFrequency] = useState('quarterly');

  // Edit Mode
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [draftBusinessType, setDraftBusinessType] = useState<BusinessType>('sole_proprietorship');
  const [draftTaxId, setDraftTaxId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftFrequency, setDraftFrequency] = useState('quarterly');
  const [savingConfig, setSavingConfig] = useState(false);

  // Period Preset
  const [preset, setPreset] = useState<PeriodPreset>('quarter');
  const [periodLabel, setPeriodLabel] = useState('');

  // Financial Data
  const [revenue, setRevenue] = useState(0);
  const [cogs, setCogs] = useState(0);
  const [opex, setOpex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTaxData = useCallback(async () => {
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
      .select('id, name, currency, business_type, tax_id, next_tax_filing_date, tax_filing_frequency')
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
    setNextFilingDate(b.next_tax_filing_date || '');
    setFilingFrequency(b.tax_filing_frequency || 'quarterly');

    setDraftBusinessType(b.business_type || 'sole_proprietorship');
    setDraftTaxId(b.tax_id || '');
    setDraftDate(b.next_tax_filing_date || '');
    setDraftFrequency(b.tax_filing_frequency || 'quarterly');

    const { start, end, label } = getPeriodRange(preset);
    setPeriodLabel(label);

    const { data: pnlRows } = await supabase.rpc('get_pnl_report', {
      p_business_id: b.id,
      p_start_date: start,
      p_end_date: end,
    });

    const pnl = pnlRows?.[0];
    setRevenue(Number(pnl?.revenue || 0));
    setCogs(Number(pnl?.cost_of_goods || 0));
    setOpex(Number(pnl?.operating_expenses || 0));

    setLoading(false);
  }, [preset]);

  useEffect(() => {
    loadTaxData();
  }, [loadTaxData]);

  // Tax Calculations
  const grossProfit = revenue - cogs;
  const taxableIncome = Math.max(0, grossProfit - opex);

  const taxResult = useMemo(() => {
    return estimateGhanaTax(taxableIncome, businessType);
  }, [taxableIncome, businessType]);

  // Save Tax Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    setSavingConfig(true);
    const { error } = await supabase
      .from('businesses')
      .update({
        business_type: draftBusinessType,
        tax_id: draftTaxId.trim() || null,
        next_tax_filing_date: draftDate || null,
        tax_filing_frequency: draftFrequency,
      })
      .eq('id', businessId);

    setSavingConfig(false);

    if (error) {
      alert(error.message);
      return;
    }

    setBusinessType(draftBusinessType);
    setTaxId(draftTaxId.trim());
    setNextFilingDate(draftDate);
    setFilingFrequency(draftFrequency);
    setIsEditingConfig(false);
  };

  // Filing Countdown
  const daysToFiling = useMemo(() => {
    if (!nextFilingDate) return null;
    const due = new Date(nextFilingDate);
    const today = new Date(new Date().toDateString());
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [nextFilingDate]);

  if (loading) return <p className="text-sm text-textSecondary">Loading tax schedule…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-accentText uppercase tracking-wider">{businessName}</span>
            <span className="text-xs text-textMuted">· TIN: {taxId || 'Not Configured'}</span>
          </div>
          <h1 className="text-2xl font-bold text-textPrimary">Tax Filing Preparation &amp; Schedules</h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Ghana Revenue Authority (GRA) compliant income tax estimation, deductions summary, and filing schedules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              printTaxSummaryPDF(
                {
                  revenue,
                  taxableIncome,
                  estimatedTax: taxResult.estimatedTax,
                  effectiveRate: taxResult.effectiveRate,
                  periodLabel,
                  businessType,
                  nextFilingDate,
                },
                { name: businessName, taxId, currency }
              )
            }
            className="px-3.5 py-2 text-xs font-bold rounded-lg bg-textPrimary text-white hover:opacity-90 shadow-sm flex items-center gap-1.5"
          >
            📄 Export Stylish Tax PDF
          </button>
          <button
            onClick={() => setIsEditingConfig(!isEditingConfig)}
            className="px-3.5 py-2 text-xs font-bold rounded-lg bg-accent text-white hover:opacity-90 shadow-sm flex items-center gap-1.5"
          >
            ⚙️ {isEditingConfig ? 'Cancel Edit' : 'Edit Tax Profile'}
          </button>
        </div>
      </div>

      {/* Tax Profile Editor Drawer */}
      {isEditingConfig && (
        <form onSubmit={handleSaveConfig} className="bg-surface1 p-5 rounded-xl border border-border space-y-4 shadow-sm print:hidden">
          <h3 className="text-sm font-bold text-textPrimary">Update Business Tax Profile</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1">Business Entity Type</label>
              <select
                value={draftBusinessType}
                onChange={(e) => setDraftBusinessType(e.target.value as BusinessType)}
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-border bg-surface2 text-textPrimary"
              >
                <option value="sole_proprietorship">Sole Proprietorship (Graduated)</option>
                <option value="corporate">Corporate / Company (25% Flat)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1">Tax ID / TIN</label>
              <input
                type="text"
                placeholder="e.g. P0012345678"
                value={draftTaxId}
                onChange={(e) => setDraftTaxId(e.target.value)}
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-border bg-surface2 text-textPrimary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1">Next Filing Date</label>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-border bg-surface2 text-textPrimary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1">Filing Frequency</label>
              <select
                value={draftFrequency}
                onChange={(e) => setDraftFrequency(e.target.value)}
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-border bg-surface2 text-textPrimary"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={savingConfig}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-accent text-white hover:opacity-90"
            >
              {savingConfig ? 'Saving…' : 'Save Tax Profile'}
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* 1. TAX READINESS & FILING HERO                           */}
      {/* ======================================================== */}
      <div className="bg-surface1 border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-textSecondary">Estimated Tax Obligation ({periodLabel})</span>
            <p className="text-3xl font-black text-textPrimary mt-1">
              {currency} {taxResult.estimatedTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-textMuted mt-1">
              Effective Tax Rate: <span className="font-bold text-textPrimary">{(taxResult.effectiveRate * 100).toFixed(1)}%</span> on {currency} {taxableIncome.toLocaleString()} chargeable income.
            </p>
          </div>

          {/* Filing Deadline Countdown */}
          <div className="bg-surface2 border border-border rounded-lg p-3.5 flex items-center gap-4 shrink-0">
            <div className="w-12 h-12 rounded-full bg-accentBg text-accentText flex items-center justify-center text-xl font-black">
              🏛️
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-textMuted">Next Filing Deadline</p>
              <p className="text-base font-bold text-textPrimary">{nextFilingDate || 'Not Scheduled'}</p>
              {daysToFiling != null && (
                <p className={`text-xs font-bold mt-0.5 ${daysToFiling <= 7 ? 'text-danger' : 'text-accentText'}`}>
                  {daysToFiling < 0 ? `🚨 Overdue by ${Math.abs(daysToFiling)} days` : `⏳ ${daysToFiling} days remaining`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-2 pt-4 print:hidden">
          <span className="text-xs font-semibold text-textSecondary mr-1">Calculation Period:</span>
          {(['month', 'quarter', 'year'] as PeriodPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1 text-xs rounded-lg font-bold capitalize transition ${
                preset === p ? 'bg-accentText text-white' : 'bg-surface2 text-textSecondary hover:bg-border'
              }`}
            >
              {p === 'month' ? 'This Month' : p === 'quarter' ? 'This Quarter' : 'Full Year'}
            </button>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. DEDUCTIONS & CHARGEABLE INCOME BREAKDOWN              */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Income & Allowable Deductions */}
        <div className="bg-surface2 border border-border rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-textPrimary">Income &amp; Deductions Breakdown</h2>

          <div className="space-y-2 text-xs divide-y divide-border">
            <div className="flex justify-between items-center pt-2">
              <span className="text-textSecondary">Gross Business Revenue</span>
              <span className="font-mono font-bold text-textPrimary">+{currency} {revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-textSecondary">Less: Cost of Goods Sold (COGS)</span>
              <span className="font-mono text-danger font-medium">-{currency} {cogs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between items-center pt-2 font-bold text-textPrimary bg-surface1/60 p-1.5 rounded">
              <span>Gross Business Profit</span>
              <span className="font-mono">{currency} {grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-textSecondary">Less: Allowable Operating Expenses (OpEx)</span>
              <span className="font-mono text-danger font-medium">-{currency} {opex.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between items-center pt-3 border-t-2 border-border font-black text-sm text-textPrimary">
              <span>NET CHARGEABLE TAXABLE INCOME</span>
              <span className="font-mono text-accentText">{currency} {taxableIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* GRA Tax Brackets Calculation Breakdown */}
        <div className="bg-surface2 border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-textPrimary">GRA Tax Computation</h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-accentBg text-accentText">
              {businessType === 'corporate' ? '25% Corporate' : 'Progressive Individual'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-textSecondary uppercase font-bold">
                  <th className="py-2">Bracket Slice</th>
                  <th className="py-2 text-right">Taxable Slice</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {taxResult.bracketBreakdown.map((b, i) => (
                  <tr key={i}>
                    <td className="py-2 text-textPrimary font-sans">{b.label}</td>
                    <td className="py-2 text-right text-textSecondary">{currency} {b.slice.toLocaleString()}</td>
                    <td className="py-2 text-right text-textSecondary">{(b.rate * 100).toFixed(1)}%</td>
                    <td className="py-2 text-right font-bold text-textPrimary">{currency} {b.tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-bold bg-surface1/60 text-textPrimary">
                  <td className="py-2.5 font-sans uppercase">Total Tax Due</td>
                  <td colSpan={2}></td>
                  <td className="py-2.5 text-right font-black text-warning">
                    {currency} {taxResult.estimatedTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-xs text-textMuted leading-relaxed">
        💡 <span className="font-semibold text-textSecondary">Disclaimer:</span> Tax calculations follow mid-2026 Ghana Revenue Authority (GRA) published statutory rate schedules. Actual tax liabilities may vary based on specific capital allowances, personal tax reliefs, and withheld taxes. Always verify with your licensed CPA before official filing.
      </p>
    </div>
  );
}
