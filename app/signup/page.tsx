'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/Icons';
import { clearAllLocalBusinessData, setCachedBusiness, setCachedUser, resolveActiveBusiness, CachedBusiness } from '@/lib/offlineStore';
import { ARCHETYPES, BusinessArchetypeId } from '@/lib/archetypes/config';

const CURRENCIES = [
  { code: 'GHS', label: 'Ghana Cedi (GH₵)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'NGN', label: 'Nigerian Naira (₦)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'KES', label: 'Kenyan Shilling (KSh)' },
  { code: 'ZAR', label: 'South African Rand (R)' },
];

const FISCAL_STARTS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface BusinessSetupState {
  businessName: string;
  archetype: BusinessArchetypeId;
  currency: string;
  phone: string;
  address: string;
  taxId: string;
  fiscalStart: string;
}

export default function SignUpPage() {
  const router = useRouter();

  // Wizard Steps: 'account' -> 'business' -> 'verify_email'
  const [step, setStep] = useState<'account' | 'business' | 'verify_email'>('account');

  // Step 1: User Account Credentials
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ownerPin, setOwnerPin] = useState('');

  // Step 2: Minimal Business Profile Setup
  const [bizData, setBizData] = useState<BusinessSetupState>({
    businessName: '',
    archetype: 'retail_wholesale',
    currency: 'GHS',
    phone: '',
    address: '',
    taxId: '',
    fiscalStart: 'January',
  });
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  // Step 3: Verification (if required)
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccessMsg, setResendSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Restore pending draft if available
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('ams:pending_signup_email');
      if (savedEmail) {
        const savedDraft = localStorage.getItem(`ams:pending_biz_setup:${savedEmail}`);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          setBizData(parsed);
        }
      }
    } catch (_e) {}
  }, []);

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const cleanPin = ownerPin.trim();

    if (!cleanName) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMsg('Please enter a valid work email address.');
      return;
    }

    if (cleanPass.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 6 || !/^\d+$/.test(cleanPin)) {
      setErrorMsg('Owner Master Security PIN must be 4 to 6 numeric digits (e.g. 1234).');
      return;
    }

    // Default business name if empty
    if (!bizData.businessName.trim()) {
      setBizData((prev) => ({
        ...prev,
        businessName: `${cleanName}'s Enterprise`,
      }));
    }

    setStep('business');
  };

  const checkBusinessAndNavigate = async (
    userId: string,
    userName?: string,
    profile?: BusinessSetupState
  ) => {
    localStorage.setItem('ams:web_primary_role_v1', 'owner');
    localStorage.setItem('ams:web_user_role_v1', 'owner');
    setCachedUser({ id: userId, email: email || undefined });

    const activeProfile = profile || bizData;
    const finalBizName = activeProfile.businessName.trim() || (userName ? `${userName}'s Enterprise` : 'My Enterprise');
    const finalCurrency = activeProfile.currency || 'GHS';
    const finalArchetype = activeProfile.archetype || 'retail_wholesale';
    const finalFiscalStart = activeProfile.fiscalStart || 'January';
    const finalTaxId = activeProfile.taxId.trim();
    const finalPhone = activeProfile.phone.trim();
    const finalAddress = activeProfile.address.trim();

    let targetBiz = await resolveActiveBusiness(userId);

    // If no business exists yet, create the user's business record
    if (!targetBiz || targetBiz.id === 'default_biz' || targetBiz.name === 'My Enterprise') {
      try {
        const { data: newBiz, error: newBizErr } = await supabase
          .from('businesses')
          .insert({
            user_id: userId,
            name: finalBizName,
            currency: finalCurrency,
            business_type: 'sole_proprietorship',
            industry: finalArchetype,
            tax_id: finalTaxId,
            fiscal_year_start: finalFiscalStart,
          })
          .select()
          .single();

        if (newBiz) {
          targetBiz = newBiz;
        } else if (newBizErr) {
          console.warn('Supabase business notice:', newBizErr.message);
        }
      } catch (err) {
        console.warn('Supabase business creation notice:', err);
      }
    }

    const cachedObj: CachedBusiness = {
      id: targetBiz?.id || `biz_${userId}_${Date.now()}`,
      name: finalBizName,
      currency: finalCurrency,
      user_id: userId,
      business_type: 'sole_proprietorship',
      industry: finalArchetype,
      fiscal_year_start: finalFiscalStart,
      tax_id: finalTaxId,
      taxId: finalTaxId,
      phone: finalPhone || undefined,
      address: finalAddress || undefined,
      owner_pin: ownerPin || undefined,
    };

    setCachedBusiness(cachedObj);

    localStorage.setItem('ams:active_archetype_v1', finalArchetype);
    if (finalPhone) localStorage.setItem(`ams:business_phone_${cachedObj.id}`, finalPhone);
    if (finalAddress) localStorage.setItem(`ams:business_address_${cachedObj.id}`, finalAddress);
    if (finalTaxId) localStorage.setItem(`ams:business_tax_id_${cachedObj.id}`, finalTaxId);

    if (ownerPin) {
      localStorage.setItem(`ams:owner_pin:${cachedObj.id}`, ownerPin);
      localStorage.setItem(`ams:owner_pin:${email.trim().toLowerCase()}`, ownerPin);
      localStorage.setItem(`ams:owner_pin:${userId}`, ownerPin);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ams:business-updated', { detail: cachedObj }));
      window.dispatchEvent(new Event('ams:business-updated'));
    }

    router.push('/dashboard');
  };

  const handleFinalSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    clearAllLocalBusinessData();

    const cleanBizName = bizData.businessName.trim();
    if (!cleanBizName) {
      setErrorMsg('Please enter your business or company name.');
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const cleanPin = ownerPin.trim();

    setLoading(true);

    localStorage.setItem(`ams:pending_pin:${cleanEmail}`, cleanPin);
    localStorage.setItem(`ams:owner_pin:${cleanEmail}`, cleanPin);
    localStorage.setItem('ams:pending_signup_email', cleanEmail);
    localStorage.setItem(`ams:pending_biz_setup:${cleanEmail}`, JSON.stringify(bizData));

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPass,
        options: {
          data: {
            full_name: cleanName,
            owner_pin: cleanPin,
            business_name: cleanBizName,
            business_currency: bizData.currency,
            business_archetype: bizData.archetype,
            business_phone: bizData.phone.trim(),
            business_address: bizData.address.trim(),
            business_tax_id: bizData.taxId.trim(),
            fiscal_year_start: bizData.fiscalStart,
          },
          emailRedirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/login`
              : 'https://amssoftware.site/login',
        },
      });

      setLoading(false);

      const isAlreadyRegistered =
        (error && error.message.toLowerCase().includes('already')) ||
        (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

      if (isAlreadyRegistered) {
        setErrorMsg('This email address is already registered. Please log in below.');
        return;
      }

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.user) {
        localStorage.setItem(`ams:owner_pin:${data.user.id}`, cleanPin);
        localStorage.setItem(`ams:owner_pin:${cleanEmail}`, cleanPin);
        localStorage.removeItem('ams:web_walkthrough_completed_v1');
      }

      // If already authenticated or email confirmation is off, proceed directly
      if (data.session && data.user) {
        await checkBusinessAndNavigate(data.user.id, cleanName, bizData);
        return;
      }

      setStep('verify_email');
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err?.message || 'An unexpected error occurred during signup.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResendSuccessMsg(null);

    const cleanToken = otpCode.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanToken || cleanToken.length < 4) {
      setErrorMsg('Please enter the verification code sent to your email.');
      return;
    }

    setVerifyingOtp(true);
    const cleanEmail = email.trim().toLowerCase();

    let { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'signup',
    });

    if (error) {
      const fallback = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      });
      if (!fallback.error && fallback.data) {
        data = fallback.data;
        error = null;
      }
    }

    setVerifyingOtp(false);

    if (error || !data.user) {
      setErrorMsg(error?.message || 'Invalid or expired verification code.');
      return;
    }

    let setupToUse = bizData;
    try {
      const storedDraft = localStorage.getItem(`ams:pending_biz_setup:${cleanEmail}`);
      if (storedDraft) setupToUse = JSON.parse(storedDraft);
    } catch (_e) {}

    await checkBusinessAndNavigate(data.user.id, name || data.user.user_metadata?.full_name, setupToUse);
  };

  const handleCheckConfirmation = async () => {
    setVerifyingOtp(true);
    setErrorMsg(null);
    setResendSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    setVerifyingOtp(false);

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setErrorMsg('Email not confirmed yet. Click the link in your email or enter the code above.');
      } else {
        setErrorMsg(error.message);
      }
      return;
    }

    if (data.user) {
      let setupToUse = bizData;
      try {
        const storedDraft = localStorage.getItem(`ams:pending_biz_setup:${cleanEmail}`);
        if (storedDraft) setupToUse = JSON.parse(storedDraft);
      } catch (_e) {}

      await checkBusinessAndNavigate(data.user.id, name || data.user.user_metadata?.full_name, setupToUse);
    }
  };

  const handleResendEmail = async () => {
    setErrorMsg(null);
    setResendSuccessMsg(null);
    setResending(true);

    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/login`
            : 'https://amssoftware.site/login',
      },
    });

    setResending(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setResendSuccessMsg(`Fresh verification code sent to ${cleanEmail}.`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface2 px-4 py-8 sm:py-12">
      
      {/* ─────────────────────────────────────────────────────────────
          STEP 1: ACCOUNT CREDENTIALS (CLEAN & MINIMAL)
      ───────────────────────────────────────────────────────────── */}
      {step === 'account' && (
        <div className="w-full max-w-sm bg-white p-7 sm:p-8 rounded-2xl shadow-xs border border-border space-y-5 animate-in fade-in">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-textSecondary font-bold block mb-1">
              Step 1 of 2
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-textPrimary tracking-tight">Create your account</h1>
            <p className="text-xs text-textSecondary mt-0.5">Start your 30-day free trial.</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleStep1Next} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-medium"
                placeholder="Kwame Mensah"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-medium"
                placeholder="kwame@company.com"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-textSecondary">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-textSecondary hover:text-textPrimary"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-medium"
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1">
                Owner Security PIN (4–6 digits)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-mono font-bold tracking-widest text-center"
                placeholder="1234"
                required
              />
              <p className="text-[11px] text-textMuted mt-1">Required to authorize owner access and sensitive reports.</p>
            </div>

            <button
              type="submit"
              className="w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold shadow-xs hover:opacity-90 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <span>Continue</span>
              <Icon name="arrowRight" size={14} />
            </button>
          </form>

          <p className="text-center text-xs text-textSecondary pt-3 border-t border-border">
            Already have an account?{' '}
            <Link href="/login" className="text-textPrimary font-bold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 2: NAME YOUR BUSINESS (PURE MINIMALISM)
      ───────────────────────────────────────────────────────────── */}
      {step === 'business' && (
        <div className="w-full max-w-sm bg-white p-7 sm:p-8 rounded-2xl shadow-xs border border-border space-y-5 animate-in fade-in">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-textSecondary font-bold block mb-1">
              Step 2 of 2
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-textPrimary tracking-tight">Name your business</h1>
            <p className="text-xs text-textSecondary mt-0.5">
              Set up your workspace so AMS recognizes your company.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleFinalSignUp} className="space-y-4">
            {/* Business / Store Name */}
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Business / Store Name *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={bizData.businessName}
                onChange={(e) => setBizData({ ...bizData, businessName: e.target.value })}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-semibold"
                placeholder="e.g. Amanda's Enterprise"
              />
              <p className="text-[11px] text-textMuted mt-1">Appears on invoices, sales receipts, and balance sheets.</p>
            </div>

            {/* Clean Single Dropdown: Industry & Archetype */}
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Business Type / Industry *
              </label>
              <select
                value={bizData.archetype}
                onChange={(e) => setBizData({ ...bizData, archetype: e.target.value as BusinessArchetypeId })}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-medium"
              >
                {(Object.entries(ARCHETYPES) as [BusinessArchetypeId, typeof ARCHETYPES[BusinessArchetypeId]][]).map(([id, arch]) => (
                  <option key={id} value={id}>
                    {arch.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clean Single Dropdown: Operating Currency */}
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Operating Currency *
              </label>
              <select
                value={bizData.currency}
                onChange={(e) => setBizData({ ...bizData, currency: e.target.value })}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-textPrimary bg-white text-textPrimary font-medium"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Additional Details (Kept quiet & uncluttered) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowMoreDetails(!showMoreDetails)}
                className="text-xs text-textSecondary hover:text-textPrimary transition flex items-center gap-1 font-medium cursor-pointer"
              >
                <span>{showMoreDetails ? '− Hide optional details' : '+ Add phone, address & tax ID (optional)'}</span>
              </button>

              {showMoreDetails && (
                <div className="pt-3 space-y-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-medium text-textSecondary mb-1">
                      Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={bizData.phone}
                      onChange={(e) => setBizData({ ...bizData, phone: e.target.value })}
                      className="w-full border border-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-textPrimary bg-white text-textPrimary"
                      placeholder="+233 24 000 0000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-textSecondary mb-1">
                      Location / Address
                    </label>
                    <input
                      type="text"
                      value={bizData.address}
                      onChange={(e) => setBizData({ ...bizData, address: e.target.value })}
                      className="w-full border border-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-textPrimary bg-white text-textPrimary"
                      placeholder="e.g. Ring Road Central, Accra"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-textSecondary mb-1">
                        Tax ID / TIN
                      </label>
                      <input
                        type="text"
                        value={bizData.taxId}
                        onChange={(e) => setBizData({ ...bizData, taxId: e.target.value })}
                        className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-textPrimary bg-white text-textPrimary uppercase"
                        placeholder="P0012345678"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-textSecondary mb-1">
                        Fiscal Year Start
                      </label>
                      <select
                        value={bizData.fiscalStart}
                        onChange={(e) => setBizData({ ...bizData, fiscalStart: e.target.value })}
                        className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-textPrimary bg-white text-textPrimary"
                      >
                        {FISCAL_STARTS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setStep('account')}
                className="px-3.5 py-2.5 text-xs font-medium rounded-xl border border-border text-textSecondary hover:bg-surface2 transition cursor-pointer"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-textPrimary text-white rounded-xl py-3 text-sm font-bold shadow-xs hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Launching AMS…</span>
                  </>
                ) : (
                  <>
                    <span>Launch AMS</span>
                    <Icon name="arrowRight" size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 3: EMAIL VERIFICATION (CLEAN & MINIMAL)
      ───────────────────────────────────────────────────────────── */}
      {step === 'verify_email' && (
        <div className="w-full max-w-sm bg-white p-7 sm:p-8 rounded-2xl shadow-xs border border-border space-y-5 animate-in fade-in">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-textPrimary">Verify your email</h2>
            <p className="text-xs text-textSecondary leading-relaxed">
              We sent a verification code to <strong className="text-textPrimary">{email}</strong>
            </p>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
            Check your <strong>Spam / Junk</strong> folder if you do not see the email in your inbox within a minute.
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium rounded-lg">
              {errorMsg}
            </div>
          )}

          {resendSuccessMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium rounded-lg">
              {resendSuccessMsg}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <div>
              <input
                type="text"
                maxLength={16}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.trim())}
                className="w-full border border-border rounded-xl px-3 py-3 text-center text-xl font-bold tracking-widest focus:outline-none focus:border-textPrimary font-mono text-black"
                placeholder="Enter code"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={verifyingOtp || otpCode.trim().length === 0}
              className="w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold disabled:opacity-60 transition shadow-xs cursor-pointer"
            >
              {verifyingOtp ? 'Verifying…' : 'Verify & Launch AMS →'}
            </button>

            <button
              type="button"
              onClick={handleCheckConfirmation}
              disabled={verifyingOtp}
              className="w-full bg-surface2 border border-border text-textPrimary hover:bg-surface1 rounded-xl py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Icon name="check" size={13} /> I Clicked the Email Link
            </button>
          </form>

          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <button
              onClick={handleResendEmail}
              disabled={resending}
              className="text-textSecondary hover:text-textPrimary transition disabled:opacity-50 cursor-pointer"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
            <button
              onClick={() => {
                setStep('account');
                setErrorMsg(null);
              }}
              className="text-textSecondary hover:text-textPrimary transition cursor-pointer"
            >
              Edit details
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
