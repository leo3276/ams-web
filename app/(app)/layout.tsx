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
  { label: 'Team & Staff', href: '/team', icon: '🧑‍🤝‍🧑', roles: ['owner'] },
  { label: 'Reports', href: '/reports', icon: '📈', roles: ['owner', 'accountant'] },
  { label: 'Accountant', href: '/accountant', icon: '💼', roles: ['owner', 'accountant'] },
  { label: 'Tax Prep', href: '/tax', icon: '🏛️', roles: ['owner', 'accountant'] },
  { label: 'Pricing & Plans', href: '/pricing', icon: '✨', roles: ['owner'] },
];

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
      {/* Desktop Sidebar */}
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

        <nav className="flex-1 space-y-1 overflow-y-auto">
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
          className="text-left px-3 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-dangerBg mt-2"
        >
          Sign out
        </button>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-border bg-white shadow-xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 -ml-1 text-textPrimary rounded-lg hover:bg-gray-100 transition"
            aria-label="Open Navigation Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <p className="text-base font-extrabold text-textPrimary">AMS</p>
            <span
              className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                role === 'owner'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : role === 'accountant'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              }`}
            >
              {role === 'owner' ? '👑 OWNER' : role === 'accountant' ? '💼 CPA' : '🧑‍💼 STAFF'}
            </span>
          </div>
        </div>

        <button onClick={handleSignOut} className="text-xs font-bold text-danger hover:underline">
          Sign out
        </button>
      </header>

      {/* Mobile Slide-Out Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 p-4">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div>
                <p className="text-lg font-extrabold text-textPrimary">AMS Workstation</p>
                <p className="text-[11px] text-textSecondary">Accounting Made Simple</p>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-textSecondary hover:text-textPrimary rounded-lg hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {/* Role Switcher inside mobile drawer */}
            {canSwitchRoles && (
              <div className="mb-3 bg-gray-50 p-2 rounded-xl border border-border">
                <div className="text-[9px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">
                  Preview Role Mode
                </div>
                <div className="flex gap-1">
                  {(['owner', 'employee', 'accountant'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition ${
                        role === r ? 'bg-textPrimary text-white shadow-xs' : 'text-textSecondary hover:bg-gray-200'
                      }`}
                    >
                      {r === 'owner' ? '👑 Owner' : r === 'employee' ? '🧑‍💼 Staff' : '💼 CPA'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All Nav Links */}
            <nav className="flex-1 overflow-y-auto space-y-1 pr-1">
              {visibleNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                      isActive
                        ? 'bg-accentBg text-accentText'
                        : 'text-textPrimary hover:bg-surface1'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-border mt-2">
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-danger hover:bg-dangerBg transition"
              >
                🚪 Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-auto">{children}</main>

      {/* Mobile Horizontally Scrollable Bottom Navigation Bar (ALL icons & labels accessible) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-white/95 backdrop-blur-md px-2 py-1.5 shadow-xl z-30">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center min-w-[62px] px-2 py-1.5 rounded-xl text-center shrink-0 transition-all ${
                  isActive
                    ? 'bg-accentBg text-accentText font-extrabold shadow-xs'
                    : 'text-textSecondary hover:bg-surface1 font-medium'
                }`}
              >
                <span className="text-base leading-none mb-0.5">{item.icon}</span>
                <span className="text-[10px] tracking-tight whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}

          {/* Menu Drawer Shortcut Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center min-w-[56px] px-2 py-1.5 rounded-xl text-center shrink-0 text-textSecondary hover:bg-surface1 font-medium"
          >
            <span className="text-base leading-none mb-0.5">☰</span>
            <span className="text-[10px] tracking-tight whitespace-nowrap">More</span>
          </button>
        </div>
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
