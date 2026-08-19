'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RoleProvider, useUserRole, UserRole } from '@/lib/RoleContext';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊', roles: ['owner', 'employee', 'accountant'] },
  { label: 'Invoices', href: '/invoices', icon: '🧾', roles: ['owner', 'employee', 'accountant'] },
  { label: 'Bookkeeping', href: '/bookkeeping', icon: '📋', roles: ['owner', 'employee', 'accountant'] },
  { label: 'Inventory', href: '/inventory', icon: '📦', roles: ['owner', 'employee', 'accountant'] },
  { label: 'Customers', href: '/customers', icon: '👥', roles: ['owner', 'employee', 'accountant'] },
  { label: 'Team & Staff', href: '/team', icon: '👥', roles: ['owner'] },
  { label: 'Reports', href: '/reports', icon: '📈', roles: ['owner', 'accountant'] },
  { label: 'Accountant', href: '/accountant', icon: '💼', roles: ['owner', 'accountant'] },
  { label: 'Tax Prep', href: '/tax', icon: '🏛️', roles: ['owner', 'accountant'] },
  { label: 'Pricing & Plans', href: '/pricing', icon: '✨', roles: ['owner'] },
];

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { role, primaryRole, setRole, canSwitchRoles } = useUserRole();

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

  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface2">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 border-r border-border p-4 flex-col shrink-0 bg-white">
        <div className="flex items-center justify-between mb-4 px-2">
          <p className="text-lg font-bold text-textPrimary">AMS</p>
          <span
            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
              role === 'owner'
                ? 'bg-green-50 text-green-700 border-green-200'
                : role === 'accountant'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-purple-50 text-purple-700 border-purple-200'
            }`}
          >
            {role === 'owner' ? '👑 OWNER' : role === 'accountant' ? '💼 CPA' : '🧑‍💼 EMPLOYEE'}
          </span>
        </div>

        {/* Role Toggle — STRICTLY AVAILABLE ONLY TO OWNER FOR PREVIEW */}
        {canSwitchRoles ? (
          <div className="mb-4 bg-gray-50 p-1.5 rounded-lg border border-border">
            <div className="text-[9px] font-bold text-textSecondary px-1 mb-1 uppercase tracking-wider">
              Preview Role (Owner)
            </div>
            <div className="flex gap-1">
              {(['owner', 'employee', 'accountant'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 text-[10px] font-bold py-1 rounded transition ${
                    role === r ? 'bg-textPrimary text-white shadow-xs' : 'text-textSecondary hover:bg-gray-200'
                  }`}
                >
                  {r === 'owner' ? 'Owner' : r === 'employee' ? 'Staff' : 'CPA'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4 px-2 py-1.5 bg-gray-50 rounded-lg border border-border">
            <p className="text-[10px] font-bold text-textPrimary">🔒 Role Locked</p>
            <p className="text-[9px] text-textSecondary">Managed by business owner</p>
          </div>
        )}

        <nav className="flex-1 space-y-1">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-xs font-semibold ${
                pathname === item.href
                  ? 'bg-accentBg text-accentText'
                  : 'text-textPrimary hover:bg-surface1'
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={handleSignOut}
          className="text-left px-3 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-dangerBg"
        >
          Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-white">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold text-textPrimary">AMS</p>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
            {role.toUpperCase()}
          </span>
        </div>
        <button onClick={handleSignOut} className="text-xs font-semibold text-danger">
          Sign out
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-auto">{children}</main>

      {/* Mobile bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-border bg-white px-1 py-1.5 shadow-lg z-50">
        {visibleNavItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center p-2 rounded-xl text-lg transition ${
                isActive
                  ? 'bg-accentBg text-accentText scale-110 shadow-sm'
                  : 'text-textSecondary hover:bg-surface1'
              }`}
            >
              <span>{item.icon}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </RoleProvider>
  );
}
