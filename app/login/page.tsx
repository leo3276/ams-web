'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/lib/RoleContext';

import { getCachedBusiness, setCachedBusiness, setCachedUser } from '@/lib/offlineStore';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('owner');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkBusinessAndNavigate = async (userId: string) => {
    localStorage.setItem('ams:web_primary_role_v1', selectedRole);
    localStorage.setItem('ams:web_user_role_v1', selectedRole);
    setCachedUser({ id: userId, email: email || undefined });

    try {
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name, currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (businesses && businesses.length > 0) {
        setCachedBusiness(businesses[0]);
        router.push('/dashboard');
        return;
      }
    } catch (_e) {}

    const cached = getCachedBusiness();
    if (cached) {
      router.push('/dashboard');
    } else {
      router.push('/dashboard');
    }
  };

  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(
      typeof window !== 'undefined' &&
      (navigator.userAgent.includes('Electron') || !!(window as any).electronAPI)
    );

    const checkActiveSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await checkBusinessAndNavigate(session.user.id);
          return;
        }
      } catch (_e) {
        // Offline fallback
        const cached = getCachedBusiness();
        if (cached) {
          router.push('/dashboard');
          return;
        }
      }
      setCheckingSession(false);
    };
    checkActiveSession();
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedRole === 'owner' && !ownerPin.trim()) {
      setErrorMsg('Please enter your Master Owner Security PIN.');
      return;
    }

    // Offline bypass if network is absent
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const emailPinKey = `ams:owner_pin:${email.trim().toLowerCase()}`;
      const cachedPin = localStorage.getItem(emailPinKey);
      if (selectedRole === 'owner' && cachedPin && ownerPin.trim() !== cachedPin) {
        setErrorMsg('Incorrect Master Owner Security PIN for offline access.');
        return;
      }
      localStorage.setItem('ams:web_primary_role_v1', selectedRole);
      localStorage.setItem('ams:web_user_role_v1', selectedRole);
      router.push('/dashboard');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      setLoading(false);
      if (error) {
        // If network failed, attempt offline cached auth
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          const emailPinKey = `ams:owner_pin:${email.trim().toLowerCase()}`;
          const cachedPin = localStorage.getItem(emailPinKey);
          if (selectedRole === 'owner' && cachedPin && ownerPin.trim() !== cachedPin) {
            setErrorMsg('Offline mode: Incorrect Master Owner Security PIN.');
            return;
          }
          localStorage.setItem('ams:web_primary_role_v1', selectedRole);
          localStorage.setItem('ams:web_user_role_v1', selectedRole);
          router.push('/dashboard');
          return;
        }

        setErrorMsg(error.message);
        return;
      }

      if (data.user) {
        if (selectedRole === 'owner') {
          const inputPin = ownerPin.trim();
          const metaPin = data.user.user_metadata?.owner_pin;
          const userPinKey = `ams:owner_pin:${data.user.id}`;
          const emailPinKey = `ams:owner_pin:${data.user.email?.toLowerCase()}`;
          const localPin = localStorage.getItem(userPinKey) || localStorage.getItem(emailPinKey);
          const expectedPin = metaPin || localPin;

          if (expectedPin && inputPin !== expectedPin) {
            await supabase.auth.signOut();
            setErrorMsg('Access Denied: Incorrect Master Owner Security PIN for this account. If you are an employee or CPA, please select your role above.');
            return;
          }

          if (inputPin) {
            localStorage.setItem(userPinKey, inputPin);
            localStorage.setItem(emailPinKey, inputPin);
          }
        }

        await checkBusinessAndNavigate(data.user.id);
      }
    } catch (_err) {
      setLoading(false);
      // Offline fallback
      localStorage.setItem('ams:web_primary_role_v1', selectedRole);
      localStorage.setItem('ams:web_user_role_v1', selectedRole);
      router.push('/dashboard');
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

        {isElectron ? (
          <p className="text-center text-xs text-textSecondary mt-6 pt-4 border-t border-border">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-accentText font-semibold">
              Sign up (30-day trial)
            </Link>
          </p>
        ) : (
          <p className="text-center text-xs text-textSecondary mt-6 pt-4 border-t border-border">
            New organization? Please create your account on the{' '}
            <span className="font-semibold text-textPrimary">AMS Desktop App</span> or{' '}
            <span className="font-semibold text-textPrimary">Mobile App</span>.
          </p>
        )}
      </div>
    </div>
  );
}
