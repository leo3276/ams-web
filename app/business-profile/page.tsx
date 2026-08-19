'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const INDUSTRIES = [
  'Retail & Supermarket / Provision Shop',
  'Food & Beverage / Restaurant / Bar / Bakery',
  'Wholesale Distribution & FMCG',
  'Fashion, Boutique & Apparel / Tailoring',
  'Pharmacy, Chemist & Health Store',
  'Electronics, Phones & Computer Accessories',
  'Hardware, Building Materials & Timber',
  'Beauty Salon, Barbershop & Cosmetics',
  'Auto Parts, Mechanic & Vehicle Services',
  'Agriculture, Poultry & Farming',
  'Construction, Carpentry & Real Estate',
  'Transportation, Haulage & Logistics',
  'Professional Services, Legal & Consulting',
  'IT, Software, Graphic Design & Digital Agency',
  'Hospitality, Hotels & Guest Houses',
  'Education, Schools & Training Centers',
  'Printing, Publishing & Stationeries',
  'Energy, Fuel Station & Solar Solutions',
  'Media, Event Planning & Photography',
  'Healthcare, Clinics & Diagnostic Labs',
  'Manufacturing & Light Industrial',
  'General Trading & Import/Export',
];
const CURRENCIES = ['GHS', 'USD', 'NGN', 'EUR', 'GBP', 'KES', 'ZAR'];
const FISCAL_STARTS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function BusinessProfilePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [fiscalStart, setFiscalStart] = useState(FISCAL_STARTS[0]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // No one can land on this page without logging in first — send them
        // to login instead of showing a form that will just fail on submit.
        router.push('/login');
        return;
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, [router]);

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
      {checkingAuth ? (
        <p className="text-sm text-textSecondary">Loading…</p>
      ) : (
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
      )}
    </div>
  );
}
