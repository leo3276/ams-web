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
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // New account, no business yet — same flow as the mobile app.
    router.push('/business-profile');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface2 px-4">
      <form onSubmit={handleSignUp} className="w-full max-w-sm">
        <h1 className="text-2xl font-medium text-textPrimary mb-1">Create your account</h1>
        <p className="text-sm text-textSecondary mb-6">Takes about a minute.</p>

        <label className="block text-sm text-textSecondary mb-1">Full name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accentText"
          placeholder="Kwame Asante"
          required
        />

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
          placeholder="At least 8 characters"
          required
        />

        {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-textPrimary text-white rounded-lg py-2.5 text-sm font-medium mb-4 disabled:opacity-60"
        >
          {loading ? 'Creating account…' : 'Continue'}
        </button>

        <p className="text-center text-sm text-textSecondary">
          Already have an account?{' '}
          <Link href="/login" className="text-accentText">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
