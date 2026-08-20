'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function SignUpPage() {
  const router = useRouter();

  const [isElectron, setIsElectron] = useState(true);
  const [checkingEnv, setCheckingEnv] = useState(true);

  // Step: 'form' | 'verify_email'
  const [step, setStep] = useState<'form' | 'verify_email'>('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccessMsg, setResendSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const electronActive =
      typeof window !== 'undefined' &&
      (navigator.userAgent.includes('Electron') || !!(window as any).electronAPI);
    setIsElectron(electronActive);
    setCheckingEnv(false);
  }, []);

  const checkBusinessAndNavigate = async (userId: string) => {
    localStorage.setItem('ams:web_primary_role_v1', 'owner');
    localStorage.setItem('ams:web_user_role_v1', 'owner');

    const { data: businesses } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (businesses && businesses.length > 0) {
      router.push('/dashboard');
    } else {
      router.push('/business-profile');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
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
      setErrorMsg('Please enter a valid email address.');
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

    setLoading(true);

    // Save pending PIN tied strictly to this email
    localStorage.setItem(`ams:pending_pin:${cleanEmail}`, cleanPin);
    localStorage.setItem(`ams:owner_pin:${cleanEmail}`, cleanPin);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: {
          full_name: cleanName,
          owner_pin: cleanPin,
        },
        emailRedirectTo: 'https://ams-8nhc3v8sk-fms11.vercel.app/login',
      },
    });

    setLoading(false);

    // Check if user already exists in Supabase
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
    }

    // If email confirmation is disabled or session exists, navigate immediately
    if (data.session && data.user) {
      await checkBusinessAndNavigate(data.user.id);
      return;
    }

    // Otherwise transition to the Verify Email screen
    setStep('verify_email');
  };

  // Verify code entered by user
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

    // 1. Try verifying as signup OTP
    let { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'signup',
    });

    // 2. Fallback to email OTP if needed
    if (error) {
      const fallback = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      });
      data = fallback.data;
      error = fallback.error;
    }

    setVerifyingOtp(false);

    if (error || !data.user) {
      setErrorMsg(error?.message || 'Invalid or expired verification code. Please check your spam folder or click resend.');
      return;
    }

    const savedPin = ownerPin || localStorage.getItem(`ams:pending_pin:${cleanEmail}`);
    if (savedPin) {
      localStorage.setItem(`ams:owner_pin:${data.user.id}`, savedPin);
      localStorage.setItem(`ams:owner_pin:${cleanEmail}`, savedPin);
    }
    await checkBusinessAndNavigate(data.user.id);
  };

  // Check if user confirmed via email link
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
        setErrorMsg('Email is not confirmed yet. Please click the link inside your confirmation email first or enter the code above.');
      } else {
        setErrorMsg(error.message);
      }
      return;
    }

    if (data.user) {
      const savedPin = ownerPin || localStorage.getItem(`ams:pending_pin:${cleanEmail}`);
      if (savedPin) {
        localStorage.setItem(`ams:owner_pin:${data.user.id}`, savedPin);
        localStorage.setItem(`ams:owner_pin:${cleanEmail}`, savedPin);
      }
      await checkBusinessAndNavigate(data.user.id);
    }
  };

  // Resend confirmation email
  const handleResendEmail = async () => {
    setErrorMsg(null);
    setResendSuccessMsg(null);
    setResending(true);

    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: 'https://ams-8nhc3v8sk-fms11.vercel.app/login',
      },
    });

    setResending(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setResendSuccessMsg(`A fresh verification email and code has been sent to ${cleanEmail}. Check your spam folder if not in inbox.`);
    }
  };

  // On the website, restrict account creation and prompt login
  if (!isElectron && !checkingEnv) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface2 px-4 py-12">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-border text-center space-y-4 animate-in fade-in">
          <div className="w-12 h-12 bg-surface2 text-textPrimary rounded-2xl flex items-center justify-center text-2xl mx-auto border border-border">
            💻
          </div>
          <h1 className="text-xl font-bold text-textPrimary">AMS Desktop & Mobile</h1>
          <p className="text-xs text-textSecondary leading-relaxed">
            Account registration is available exclusively in the <strong>AMS Desktop App</strong> and <strong>Mobile App</strong>.
          </p>
          <div className="p-3 bg-surface2 rounded-xl border border-border text-[11px] text-textSecondary leading-relaxed text-left">
            🏢 If your organization has already been registered, log in below to access the Web Companion.
          </div>
          <Link
            href="/login"
            className="block w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold shadow-sm hover:bg-neutral-800 transition"
          >
            Log in to Web Companion →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface2 px-4 py-12">
      {step === 'form' ? (
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-border">
          <h1 className="text-2xl font-bold text-textPrimary mb-1">Create your account</h1>
          <p className="text-xs text-textSecondary mb-5">Takes about a minute. Start your 30-day free trial.</p>

          {errorMsg && <p className="text-xs text-danger mb-4 font-semibold">{errorMsg}</p>}

          <form onSubmit={handleSignUp}>
            <label className="block text-xs font-semibold text-textSecondary mb-1">Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm mb-4 focus:outline-none focus:border-textPrimary"
              placeholder="Kwame Asante"
              required
            />

            <label className="block text-xs font-semibold text-textSecondary mb-1">Work Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm mb-4 focus:outline-none focus:border-textPrimary"
              placeholder="name@business.com"
              required
            />

            <label className="block text-xs font-semibold text-textSecondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm mb-4 focus:outline-none focus:border-textPrimary"
              placeholder="At least 6 characters"
              required
              minLength={6}
            />

            <div className="mb-5">
              <label className="block text-xs font-semibold text-textSecondary mb-1">
                Owner Master Security PIN (4-6 digits)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm mb-1 focus:outline-none focus:border-textPrimary tracking-widest font-mono"
                placeholder="e.g. 1234"
                required
              />
              <p className="text-[11px] text-textMuted">
                🔒 Security check: Required whenever logging in with Owner privileges to prevent unauthorized staff access.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold mb-4 disabled:opacity-60 transition-opacity shadow-sm"
            >
              {loading ? 'Creating account…' : 'Continue (30-day trial)'}
            </button>
          </form>

          <p className="text-center text-xs text-textSecondary mt-6 pt-4 border-t border-border">
            Already have an account?{' '}
            <Link href="/login" className="text-accentText font-semibold">
              Log in
            </Link>
          </p>
        </div>
      ) : (
        /* STEP 2: CODE-FIRST VERIFICATION SCREEN WITH SPAM RECOMMENDATION */
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-border space-y-5 animate-in fade-in">
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 bg-surface2 text-textPrimary rounded-2xl flex items-center justify-center text-2xl mx-auto border border-border">
              ✉️
            </div>
            <h2 className="text-xl font-bold text-textPrimary">Verify your email</h2>
            <p className="text-xs text-textSecondary leading-relaxed">
              We sent a verification code to <br />
              <strong className="text-textPrimary">{email}</strong>
            </p>
          </div>

          {/* SPAM FOLDER RECOMMENDATION TIP */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
            <span className="text-sm shrink-0">💡</span>
            <span>
              <strong>Check your Spam / Junk folder</strong> if you don&apos;t see the email in your primary inbox within a minute.
            </span>
          </div>

          {errorMsg && <p className="text-xs text-danger font-semibold bg-rose-50 p-2.5 rounded-lg border border-rose-200">{errorMsg}</p>}
          {resendSuccessMsg && <p className="text-xs text-success font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">{resendSuccessMsg}</p>}

          {/* CODE INPUT FORM */}
          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1.5 text-center">
                Enter verification code:
              </label>
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
              className="w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold disabled:opacity-60 transition-opacity shadow-sm"
            >
              {verifyingOtp ? 'Verifying Code…' : 'Verify Code & Continue →'}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-3 text-[10px] text-textMuted uppercase font-bold tracking-wider">or if you clicked the link</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <button
              type="button"
              onClick={handleCheckConfirmation}
              disabled={verifyingOtp}
              className="w-full bg-surface2 border border-border text-textPrimary hover:bg-surface1 rounded-xl py-2.5 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>✅</span> I Clicked the Email Link &rarr;
            </button>
          </form>

          {/* RESEND & CHANGE EMAIL */}
          <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
            <button
              onClick={handleResendEmail}
              disabled={resending}
              className="text-accentText font-semibold hover:underline disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend Code'}
            </button>
            <button
              onClick={() => {
                setStep('form');
                setErrorMsg(null);
              }}
              className="text-textSecondary hover:text-textPrimary"
            >
              Change Email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
