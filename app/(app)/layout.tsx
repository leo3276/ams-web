'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Bookkeeping', href: '/bookkeeping' },
  { label: 'Reports', href: '/reports' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface2">
        <p className="text-sm text-textSecondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface2">
      <aside className="w-56 border-r border-border p-4 flex flex-col">
        <p className="text-lg font-medium text-textPrimary mb-8 px-2">AMS</p>
        <nav className="flex-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm mb-1 ${
                pathname === item.href
                  ? 'bg-accentBg text-accentText font-medium'
                  : 'text-textPrimary hover:bg-surface1'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleSignOut}
          className="text-left px-3 py-2 rounded-lg text-sm text-danger hover:bg-dangerBg"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
