'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/Icons';
import { ARCHETYPES, BusinessArchetypeId } from '@/lib/archetypes/config';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  setCachedBusiness,
  getCachedBusiness,
  getBusinessSecurityPin,
  setBusinessSecurityPin,
  getAccountantSecurityPin,
  setAccountantSecurityPin,
  resolveActiveBusiness,
  CachedBusiness,
} from '@/lib/offlineStore';

const CURRENCIES = [
  { code: 'GHS', label: 'Ghana Cedi (GH₵)', symbol: 'GH₵' },
  { code: 'USD', label: 'US Dollar ($)', symbol: '$' },
  { code: 'NGN', label: 'Nigerian Naira (₦)', symbol: '₦' },
  { code: 'GBP', label: 'British Pound (£)', symbol: '£' },
  { code: 'EUR', label: 'Euro (€)', symbol: '€' },
  { code: 'KES', label: 'Kenyan Shilling (KSh)', symbol: 'KSh' },
  { code: 'ZAR', label: 'South African Rand (R)', symbol: 'R' },
];

const FISCAL_STARTS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function BusinessProfilePage() {
  const router = useRouter();
  const { setArchetypeId } = useArchetype();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [existingBusinessId, setExistingBusinessId] = useState<string | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState<BusinessArchetypeId>('retail_wholesale');
  const [currency, setCurrency] = useState('GHS');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [fiscalStart, setFiscalStart] = useState('January');
  const [branchSecurityPin, setBranchSecurityPin] = useState('1234');
  const [accountantPin, setAccountantPin] = useState('8888');

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const isNewOrOnboarding =
          typeof window !== 'undefined' &&
          (window.location.search.includes('onboarding=true') || window.location.search.includes('new=true'));
        setIsOnboarding(isNewOrOnboarding);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const userId = session.user.id;
        const b = await resolveActiveBusiness(userId);

        if (b) {
          setExistingBusinessId(b.id);
          setBusinessName(b.name && b.name !== 'My Enterprise' ? b.name : '');
          setCurrency(b.currency || 'GHS');
          setFiscalStart((b as any).fiscal_year_start || 'January');
          setPhone(b.phone || localStorage.getItem(`ams:business_phone_${b.id}`) || '');
          setAddress(b.address || localStorage.getItem(`ams:business_address_${b.id}`) || '');
          setTaxId(b.tax_id || b.taxId || localStorage.getItem(`ams:business_tax_id_${b.id}`) || '');
          setBranchSecurityPin(getBusinessSecurityPin(b.id) || '1234');
          const existingAccPin = getAccountantSecurityPin(b.id);
          if (existingAccPin) setAccountantPin(existingAccPin);

          const storedArch = localStorage.getItem('ams:active_archetype_v1') as BusinessArchetypeId;
          if (storedArch && storedArch in ARCHETYPES) {
            setSelectedArchetype(storedArch);
          } else if (b.industry && (b.industry in ARCHETYPES)) {
            setSelectedArchetype(b.industry as BusinessArchetypeId);
          }
        }
      } catch (_e) {}
      setCheckingAuth(false);
    };

    checkAuthAndLoad();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    const cleanName = businessName.trim();
    if (!cleanName) {
      setErrorMsg('Please enter your business or company name.');
      setLoading(false);
      return;
    }

    try {
      const currentCached = getCachedBusiness();
      let savedBizId = existingBusinessId || currentCached?.id || `biz_${Date.now()}`;

      // 1. Update PINs
      setBusinessSecurityPin(savedBizId, branchSecurityPin || '1234');
      if (accountantPin) {
        setAccountantSecurityPin(savedBizId, accountantPin.trim());
      }

      // 2. Build updated business object
      const updatedBusinessData: CachedBusiness = {
        id: savedBizId,
        name: cleanName,
        currency,
        user_id: currentCached?.user_id || 'owner',
        business_type: 'sole_proprietorship',
        industry: selectedArchetype,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        tax_id: taxId.trim() || undefined,
        taxId: taxId.trim() || undefined,
        fiscal_year_start: fiscalStart,
      };

      setCachedBusiness(updatedBusinessData);
      setExistingBusinessId(savedBizId);

      // Save to localStorage keys
      localStorage.setItem('ams:active_archetype_v1', selectedArchetype);
      if (phone.trim()) localStorage.setItem(`ams:business_phone_${savedBizId}`, phone.trim());
      if (address.trim()) localStorage.setItem(`ams:business_address_${savedBizId}`, address.trim());
      if (taxId.trim()) localStorage.setItem(`ams:business_tax_id_${savedBizId}`, taxId.trim());

      await setArchetypeId(selectedArchetype);

      // 3. Sync to Supabase
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          const dbPayload = {
            name: cleanName,
            business_type: 'sole_proprietorship',
            industry: selectedArchetype,
            currency,
            tax_id: taxId.trim() || null,
            fiscal_year_start: fiscalStart,
          };

          if (savedBizId && savedBizId !== 'default_biz') {
            const { data: existingCheck } = await supabase
              .from('businesses')
              .select('id')
              .eq('id', savedBizId)
              .maybeSingle();

            if (existingCheck?.id) {
              await supabase.from('businesses').update(dbPayload).eq('id', savedBizId);
            } else {
              await supabase.from('businesses').insert({
                id: savedBizId,
                user_id: userId,
                ...dbPayload,
              });
            }
          }
        }
      } catch (_supabaseErr) {
        // Offline cache takes priority
      }

      // Broadcast update across the entire app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ams:business-updated', { detail: updatedBusinessData }));
        window.dispatchEvent(new Event('ams:business-updated'));
      }

      setLoading(false);
      setSuccessMsg('✓ Business profile and settings updated successfully!');

      // If in onboarding mode, redirect to dashboard
      if (isOnboarding) {
        setTimeout(() => {
          router.push('/dashboard');
        }, 800);
      }
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

  return (
    <div className="min-h-screen bg-surface2 py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Back Link */}
        {existingBusinessId && !isOnboarding && (
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-textSecondary hover:text-textPrimary transition"
            >
              ← Back to Dashboard
            </Link>
          </div>
        )}

        {/* Onboarding Welcome Banner */}
        {isOnboarding && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border shadow-xs flex items-start gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-textPrimary shrink-0 mt-0.5">
              <Icon name="briefcase" size={18} />
            </span>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-textPrimary">Welcome to AMS! Set up your business profile</h2>
              <p className="text-xs text-textSecondary leading-relaxed">
                Provide your company name, industry, operating currency, and contact information below so AMS recognizes your business on all invoices, receipts, and balance sheets.
              </p>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-textPrimary shrink-0">
              <Icon name="briefcase" size={18} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-textPrimary tracking-tight">
              {isOnboarding ? 'Complete Business Setup' : 'Business Profile & Settings'}
            </h1>
          </div>
          <p className="text-xs text-textSecondary max-w-2xl">
            Configure your enterprise identity, industry archetype, currency, and security authorizations.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* SECTION 1: BUSINESS IDENTITY & CONTACT */}
          <div className="bg-surface1 p-5 sm:p-6 rounded-2xl border border-border shadow-xs space-y-4">
            <div className="pb-3 border-b border-border">
              <h2 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Icon name="briefcase" size={14} /> Company Identity &amp; Contact Details
              </h2>
              <p className="text-[11px] text-textSecondary mt-0.5">
                These details appear on your printed invoices, delivery notes, and tax schedules.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Business / Store Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mensah Trading &amp; Retail Ltd"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Operating Currency *
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary font-medium"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Business Phone / WhatsApp
                </label>
                <input
                  type="tel"
                  placeholder="+233 24 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Tax Identification Number (TIN / Ghana Card)
                </label>
                <input
                  type="text"
                  placeholder="e.g. P0012345678"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Business Location / Street Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Plot 14, Commercial Area, Ring Road Central, Accra"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: INDUSTRY & ARCHETYPE SELECTOR */}
          <div className="bg-surface1 p-5 sm:p-6 rounded-2xl border border-border shadow-xs space-y-3">
            <div>
              <h2 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Icon name="sliders" size={14} /> Business Archetype &amp; Industry
              </h2>
              <p className="text-[11px] text-textSecondary mt-0.5">
                Tailors AMS charts of accounts, terminology, sales interfaces, and KPI dashboards to your industry.
              </p>
            </div>

            <div className="pt-1">
              <select
                value={selectedArchetype}
                onChange={(e) => setSelectedArchetype(e.target.value as BusinessArchetypeId)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary font-semibold"
              >
                {(Object.entries(ARCHETYPES) as [BusinessArchetypeId, typeof ARCHETYPES[BusinessArchetypeId]][]).map(([id, arch]) => (
                  <option key={id} value={id}>
                    {arch.label} ({arch.shortName})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-textMuted mt-1.5">
                {ARCHETYPES[selectedArchetype]?.description}
              </p>
            </div>
          </div>

          {/* SECTION 3: FINANCIAL YEAR & SECURITY PINS */}
          <div className="bg-surface1 p-5 sm:p-6 rounded-2xl border border-border shadow-xs space-y-4">
            <div className="pb-3 border-b border-border">
              <h2 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Icon name="calendar" size={14} /> Accounting Year &amp; Security Passcodes
              </h2>
              <p className="text-[11px] text-textSecondary mt-0.5">
                Financial reporting cycle and authorization PINs for owner actions and accountant access.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Financial Year Start Month
                </label>
                <select
                  value={fiscalStart}
                  onChange={(e) => setFiscalStart(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary"
                >
                  {FISCAL_STARTS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-[10px] text-textMuted mt-1">Defines annual reporting cycle</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Owner Master PIN (4-6 digits)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={branchSecurityPin}
                  onChange={(e) => setBranchSecurityPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="1234"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary font-mono font-bold tracking-widest text-center"
                />
                <p className="text-[10px] text-textMuted mt-1">Master authority for owner logins</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                  Accountant Access PIN
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={accountantPin}
                  onChange={(e) => setAccountantPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="8888"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-textPrimary text-textPrimary font-mono font-bold tracking-widest text-center"
                />
                <p className="text-[10px] text-textMuted mt-1">Read-only audit &amp; journal verification</p>
              </div>
            </div>
          </div>

          {/* NOTICES */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-semibold flex items-center gap-2">
              <Icon name="alert" size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              {successMsg}
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {existingBusinessId && !isOnboarding && (
              <Link
                href="/dashboard"
                className="px-5 py-2.5 text-xs font-semibold rounded-xl border border-border text-textSecondary hover:bg-surface2 transition"
              >
                Cancel
              </Link>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 text-sm font-bold rounded-xl bg-textPrimary text-white hover:opacity-90 transition shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Settings…</span>
                </>
              ) : (
                <>
                  <span>{isOnboarding ? 'Complete Setup & Launch Dashboard →' : 'Save Business Settings'}</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
