'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/lib/RoleContext';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('owner');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkBusinessAndNavigate = async (userId: string) => {
    localStorage.setItem('ams:web_primary_role_v1', selectedRole);
    localStorage.setItem('ams:web_user_role_v1', selectedRole);

    const { data: businesses } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (businesses && businesses.length > 0) {
      router.push('/dashboard');
    } else {
      router.push('/business-profile');
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedRole === 'owner' && !ownerPin.trim()) {
      setErrorMsg('Please enter your Master Owner Security PIN.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data.user) {
      if (selectedRole === 'owner') {
        const inputPin = ownerPin.trim();
        const metaPin = data.user.user_metadata?.owner_pin;
        const localPin = localStorage.getItem('ams:web_owner_pin_v1');
        const expectedPin = metaPin || localPin;

        if (expectedPin && inputPin !== expectedPin) {
          await supabase.auth.signOut();
          setErrorMsg('Access Denied: Incorrect Master Owner Security PIN. If you are an employee or CPA, please select your role above.');
          return;
        }

        if (inputPin) {
          localStorage.setItem('ams:web_owner_pin_v1', inputPin);
        }
      }

      await checkBusinessAndNavigate(data.user.id);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setErrorMsg(null);
    setOauthLoading(provider);

    localStorage.setItem('ams:web_primary_role_v1', selectedRole);
    localStorage.setItem('ams:web_user_role_v1', selectedRole);

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
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-border">
        <h1 className="text-2xl font-bold text-textPrimary mb-1">Welcome back</h1>
        <p className="text-xs text-textSecondary mb-5">Log in to manage your books, stock, and reports.</p>

        {/* Role Selector */}
        <label className="block text-xs font-bold text-textSecondary mb-1.5">Select your role</label>
        <div className="grid grid-cols-3 gap-1.5 mb-5">
          {[
            { key: 'owner', label: '👑 Owner', desc: 'Full access' },
            { key: 'employee', label: '🧑‍💼 Employee', desc: 'POS & stock' },
            { key: 'accountant', label: '💼 CPA', desc: 'Audit & tax' },
          ].map((item) => {
            const active = selectedRole === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedRole(item.key as UserRole)}
                className={`py-2 px-1.5 rounded-xl border text-center transition ${
                  active
                    ? 'bg-textPrimary text-white border-textPrimary shadow-sm'
                    : 'bg-surface2 text-textSecondary border-border hover:bg-gray-100'
                }`}
              >
                <p className="text-xs font-bold">{item.label}</p>
                <p className={`text-[10px] mt-0.5 ${active ? 'text-gray-300' : 'text-textMuted'}`}>{item.desc}</p>
              </button>
            );
          })}
        </div>

        {/* OAuth Buttons */}
        <div className="mb-5">
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

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-textMuted uppercase">or email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handlePasswordLogin}>
          <label className="block text-xs font-semibold text-textSecondary mb-1">Email</label>
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
            placeholder="Your password"
            required
          />

          {selectedRole === 'owner' && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-textSecondary mb-1">Owner Master PIN</label>
              <input
                type="password"
                maxLength={6}
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value)}
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm mb-1 focus:outline-none focus:border-textPrimary"
                placeholder="Enter 4-6 digit Owner PIN"
                required
              />
              <p className="text-[11px] text-textMuted">
                🔒 Security check: Required to authorize Owner master access.
              </p>
            </div>
          )}

          {errorMsg && <p className="text-xs text-danger mb-4">{errorMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-textPrimary text-white rounded-xl py-3 text-sm font-bold mb-4 disabled:opacity-60 transition-opacity"
          >
            {loading ? 'Logging in…' : `Log in as ${selectedRole === 'owner' ? 'Owner' : selectedRole === 'employee' ? 'Staff' : 'CPA'}`}
          </button>
        </form>

        <p className="text-center text-xs text-textSecondary mt-6 pt-4 border-t border-border">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-accentText font-semibold">
            Sign up (30-day trial)
          </Link>
        </p>
      </div>
    </div>
  );
}
