'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ARCHETYPES, BusinessArchetypeId } from '@/lib/archetypes/config';
import { useArchetype } from '@/lib/ArchetypeContext';
import { setCachedBusiness, getCachedBusiness, getBusinessSecurityPin, setBusinessSecurityPin, getAccountantSecurityPin, setAccountantSecurityPin, resolveActiveBusiness } from '@/lib/offlineStore';

const CURRENCIES = ['GHS', 'USD', 'NGN', 'EUR', 'GBP', 'KES', 'ZAR'];
const FISCAL_STARTS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function BusinessProfilePage() {
  const router = useRouter();
  const { setArchetypeId } = useArchetype();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [existingBusinessId, setExistingBusinessId] = useState<string | null>(null);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState<BusinessArchetypeId>('retail_wholesale');
  const [currency, setCurrency] = useState('GHS');
  const [fiscalStart, setFiscalStart] = useState('January');
  const [branchSecurityPin, setBranchSecurityPin] = useState('1234');
  const [accountantPin, setAccountantPin] = useState('8888');

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const userId = session.user.id;
        const b = await resolveActiveBusiness(userId);

        if (b) {
          setExistingBusinessId(b.id);
          setBusinessName(b.name || '');
          setCurrency(b.currency || 'GHS');
          setFiscalStart((b as any).fiscal_year_start || 'January');
          setBranchSecurityPin(getBusinessSecurityPin(b.id));
          const existingAccPin = getAccountantSecurityPin(b.id);
          if (existingAccPin) setAccountantPin(existingAccPin);
          setSelectedArchetype('retail_wholesale');
        } else {
          setSelectedArchetype('retail_wholesale');
        }
      } catch (_e) {}
      setCheckingAuth(false);
    };

    checkAuthAndLoad();
  }, []); // Run once on mount to avoid overwriting typed input

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    const cleanName = businessName.trim();
    if (!cleanName) {
      setErrorMsg('Please enter your business or school name.');
      setLoading(false);
      return;
    }

    try {
      const activeArch = ARCHETYPES[selectedArchetype];
      const industryLabel = activeArch.subCategories[0] || activeArch.label;
      const currentCached = getCachedBusiness();
      let savedBizId = existingBusinessId || currentCached?.id || 'default_biz';

      // 1. Always update local storage, PINs & Known Businesses registry for this branch
      setBusinessSecurityPin(savedBizId, branchSecurityPin || '1234');
      if (accountantPin) {
        setAccountantSecurityPin(savedBizId, accountantPin.trim());
      }

      const updatedBusinessData = {
        id: savedBizId,
        name: cleanName,
        currency,
        user_id: currentCached?.user_id || 'owner',
        business_type: selectedArchetype,
      };

      setCachedBusiness(updatedBusinessData as any);
      setExistingBusinessId(savedBizId);

      await setArchetypeId(selectedArchetype);

      // 2. Sync to Supabase in background/try-catch
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          if (savedBizId && savedBizId !== 'default_biz') {
            // Check if business exists in DB
            const { data: existingCheck } = await supabase
              .from('businesses')
              .select('id')
              .eq('id', savedBizId)
              .maybeSingle();

            if (existingCheck?.id) {
              await supabase
                .from('businesses')
                .update({
                  name: cleanName,
                  business_type: selectedArchetype,
                  industry: industryLabel,
                  currency,
                  fiscal_year_start: fiscalStart,
                })
                .eq('id', savedBizId);
            } else {
              await supabase
                .from('businesses')
                .insert({
                  id: savedBizId,
                  user_id: userId,
                  name: cleanName,
                  business_type: selectedArchetype,
                  industry: industryLabel,
                  currency,
                  fiscal_year_start: fiscalStart,
                });
            }
          }
        }
      } catch (_supabaseErr) {
        // Local cache handles offline mode
      }

      // Broadcast update to layout navbar and all open views
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('ams:business-updated'));
      }

      setLoading(false);
      setSuccessMsg('✓ Business name, currency & Security PINs successfully updated!');
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err?.message || 'Failed to save business settings.');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface2">
        <p className="text-sm text-textSecondary">Loading business settings…</p>
      </div>
    );
  }

  const currentArch = ARCHETYPES[selectedArchetype];

  return (
    <div className="min-h-screen bg-surface2 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Back Link if existing business */}
        {existingBusinessId && (
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-textSecondary hover:text-textPrimary transition"
            >
              ← Back to Dashboard
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🏢</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-textPrimary tracking-tight">
              {existingBusinessId ? 'Business Profile & Security Settings' : 'Set Up Your Business Profile'}
            </h1>
          </div>
          <p className="text-sm text-textSecondary max-w-2xl">
            Manage your company identity, reporting currency, and branch security access PINs for AMS.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          
          {/* STEP 1: BUSINESS BASIC INFO */}
          <div className="bg-surface1 p-6 rounded-2xl border border-border shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <span>🏢</span> Business Information &amp; Security PINs
                </h2>
                <p className="text-xs text-textSecondary mt-0.5">
                  Configure your business identity, currency, and authorization passcodes.
                </p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-textPrimary text-white hover:opacity-90 transition shadow-sm disabled:opacity-50 self-start sm:self-auto flex items-center gap-1.5"
              >
                {loading ? '⏳ Saving…' : '💾 Save Settings'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Business / Store Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Star Academy"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Operating Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Owner Master PIN
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={branchSecurityPin}
                  onChange={(e) => setBranchSecurityPin(e.target.value)}
                  placeholder="e.g. 1234"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-mono font-bold tracking-widest text-center"
                />
                <p className="text-[10px] text-textSecondary mt-1">Full owner master access</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Accountant Access PIN
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={accountantPin}
                  onChange={(e) => setAccountantPin(e.target.value)}
                  placeholder="e.g. 8888"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-mono font-bold tracking-widest text-center"
                />
                <p className="text-[10px] text-textSecondary mt-1">For external accountant</p>
              </div>
            </div>
          </div>

          {/* STEP 2: FINANCIAL YEAR & REPORTING SETTINGS */}
          <div className="bg-surface1 p-6 rounded-2xl border border-border shadow-xs space-y-4">
            <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
              <span>📅</span> Accounting &amp; Financial Year
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Financial Year Start Month
                </label>
                <select
                  value={fiscalStart}
                  onChange={(e) => setFiscalStart(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                >
                  {FISCAL_STARTS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-[10px] text-textSecondary mt-1">Used for P&amp;L and Annual Balance Sheet reporting</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Tax / VAT Compliance Method
                </label>
                <div className="px-3.5 py-2.5 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-bold flex items-center justify-between">
                  <span>Standard VAT (21.9% GRA Composite) + WHT</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                </div>
                <p className="text-[10px] text-textSecondary mt-1">Ghana Revenue Authority (GRA) Compliant</p>
              </div>
            </div>
          </div>

          {/* NOTICES */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-xl bg-successBg border border-success/30 text-success text-sm font-bold">
              ✓ {successMsg}
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <div className="flex items-center justify-end gap-3 pt-4">
            {existingBusinessId && (
              <Link
                href="/dashboard"
                className="px-5 py-2.5 text-xs font-semibold rounded-xl border border-border text-textSecondary hover:bg-surface1 transition"
              >
                Cancel
              </Link>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 text-sm font-extrabold rounded-xl bg-textPrimary text-white hover:opacity-90 transition shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Saving Settings…</span>
                </>
              ) : (
                <>
                  <span>✓ Save Business Settings</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
