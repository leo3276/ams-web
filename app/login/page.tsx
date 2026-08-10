'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    // Check whether this account already has a business set up — if so, skip
    // straight to Bookkeeping instead of showing the setup form again (which
    // would create a confusing second, disconnected business).
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', data.user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    setLoading(false);

    if (businesses && businesses.length > 0) {
      router.push('/bookkeeping');
    } else {
      router.push('/business-profile');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface2 px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm">
        <h1 className="text-2xl font-medium text-textPrimary mb-6">Log in</h1>

        <label className="block text-sm text-textSecondary mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accentText"
          placeholder="name@business.com"
          required
        />

        <label className="block text-sm text-textSecondary mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-6 focus:outline-none focus:border-accentText"
          placeholder="Your password"
          required
        />

        {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-textPrimary text-white rounded-lg py-2.5 text-sm font-medium mb-4 disabled:opacity-60"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>

        <p className="text-center text-sm text-textSecondary">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-accentText">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
