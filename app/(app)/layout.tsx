'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Invoices', href: '/invoices', icon: '🧾' },
  { label: 'Bookkeeping', href: '/bookkeeping', icon: '📋' },
  { label: 'Inventory', href: '/inventory', icon: '📦' },
  { label: 'Customers', href: '/customers', icon: '👥' },
  { label: 'Reports', href: '/reports', icon: '📈' },
  { label: 'Accountant', href: '/accountant', icon: '💼' },
  { label: 'Tax Prep', href: '/tax', icon: '🏛️' },
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
    <div className="min-h-screen flex flex-col md:flex-row bg-surface2">
      {/* Desktop sidebar — hidden on phones/tablets, shown from md breakpoint up */}
      <aside className="hidden md:flex w-56 border-r border-border p-4 flex-col shrink-0">
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

      {/* Mobile top bar — visible only below md breakpoint */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-lg font-medium text-textPrimary">AMS</p>
        <button onClick={handleSignOut} className="text-sm text-danger">
          Sign out
        </button>
      </header>

      {/* Main content — extra bottom padding on mobile so the fixed nav bar never covers content */}
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-auto">{children}</main>

      {/* Mobile bottom nav bar — visible only below md breakpoint, fixed to bottom like the app */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex border-t border-border bg-surface2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs ${
              pathname === item.href ? 'text-accentText font-medium' : 'text-textSecondary'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
