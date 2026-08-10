'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const INDUSTRIES = ['Food and beverage', 'Retail', 'Services', 'Other'];
const CURRENCIES = ['GHS', 'USD', 'NGN', 'EUR'];
const FISCAL_STARTS = ['January', 'April', 'July'];

export default function BusinessProfilePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [fiscalStart, setFiscalStart] = useState(FISCAL_STARTS[0]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      setErrorMsg('Not logged in. Please log in again.');
      return;
    }

    const { error } = await supabase.from('businesses').insert({
      user_id: userId,
      name: businessName,
      industry,
      currency,
      fiscal_year_start: fiscalStart,
    });

    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push('/bookkeeping');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface2 px-4">
      <form onSubmit={handleFinish} className="w-full max-w-sm">
        <h1 className="text-2xl font-medium text-textPrimary mb-1">Set up your business</h1>
        <p className="text-sm text-textSecondary mb-6">This shapes your reports and categories.</p>

        <label className="block text-sm text-textSecondary mb-1">Business name</label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accentText"
          placeholder="Kwame's Bakery"
          required
        />

        <label className="block text-sm text-textSecondary mb-1">Industry</label>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4"
        >
          {INDUSTRIES.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Fiscal year start</label>
            <select
              value={fiscalStart}
              onChange={(e) => setFiscalStart(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            >
              {FISCAL_STARTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-textPrimary text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'Finish setup'}
        </button>
      </form>
    </div>
  );
}
