'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    const cleanEmail = email.trim();
    const cleanPass = password.trim();
    const cleanPin = ownerPin.trim();

    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 6 || !/^\d+$/.test(cleanPin)) {
      setErrorMsg('Owner Master Security PIN must be 4 to 6 numeric digits (e.g. 1234).');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: {
          full_name: cleanName,
          owner_pin: cleanPin,
        },
      },
    });

    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    localStorage.setItem('ams:web_owner_pin_v1', cleanPin);

    if (data.user) {
      await checkBusinessAndNavigate(data.user.id);
    } else {
      router.push('/business-profile');
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setErrorMsg(null);
    setOauthLoading(provider);

    localStorage.setItem('ams:web_primary_role_v1', 'owner');
    localStorage.setItem('ams:web_user_role_v1', 'owner');

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setOauthLoading(null);
      setErrorMsg(`To enable ${provider === 'google' ? 'Google' : 'Apple'} Sign-In, please enable the ${provider} provider in your Supabase Dashboard under Authentication > Providers.`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface2 px-4 py-12">
      <form onSubmit={handleSignUp} className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-border">
        <h1 className="text-2xl font-bold text-textPrimary mb-1">Create your account</h1>
        <p className="text-xs text-textSecondary mb-6">Takes about a minute. Start your 30-day free trial.</p>

        {/* OAuth Buttons */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={oauthLoading !== null}
            className="w-full flex items-center justify-center gap-3 border border-border rounded-xl py-2.5 px-4 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-textMuted uppercase">or email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

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
        />

        <label className="block text-xs font-semibold text-textSecondary mb-1">Owner Master Security PIN (4-6 digits)</label>
        <input
          type="password"
          maxLength={6}
          value={ownerPin}
          onChange={(e) => setOwnerPin(e.target.value)}
          className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm mb-1 focus:outline-none focus:border-textPrimary"
          placeholder="e.g. 1234"
          required
        />
        <p className="text-[11px] text-textMuted mb-6">
          🛡️ Secret PIN required whenever logging in with Owner privileges to prevent unauthorized staff access.
        </p>

        {errorMsg && <p className="text-xs text-danger mb-4">{errorMsg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold mb-4 disabled:opacity-60 transition-opacity"
        >
          {loading ? 'Creating account…' : 'Continue (30-day trial)'}
        </button>

        <p className="text-center text-xs text-textSecondary">
          Already have an account?{' '}
          <Link href="/login" className="text-accentText font-semibold">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
