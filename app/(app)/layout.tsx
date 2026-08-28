'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RoleProvider, useUserRole, UserRole } from '@/lib/RoleContext';
import { ArchetypeProvider } from '@/lib/ArchetypeContext';
import { getCachedBusiness, getOfflineTransactionQueue, flushOfflineTransactionsToSupabase, clearAllLocalBusinessData } from '@/lib/offlineStore';
import WebWalkthroughModal, { WEB_WALKTHROUGH_STORAGE_KEY } from '@/components/WebWalkthroughModal';

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(() => {
    if (typeof window === 'undefined') return false;
    return false;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [businessName, setBusinessName] = useState('AMS Retail Workstation');
  const { role, setRole, canSwitchRoles } = useUserRole();

  useEffect(() => {
    const handleOnline = async () => {
      setOnlineStatus(true);
      const b = getCachedBusiness();
      if (b?.id) {
        await flushOfflineTransactionsToSupabase(b.id);
        setPendingSyncCount(getOfflineTransactionQueue().length);
      }
    };
    const handleOffline = () => {
      setOnlineStatus(false);
      setPendingSyncCount(getOfflineTransactionQueue().length);
    };

    setOnlineStatus(typeof navigator !== 'undefined' ? navigator.onLine : true);
    setPendingSyncCount(getOfflineTransactionQueue().length);

    const b = getCachedBusiness();
    if (b?.name) {
      setBusinessName(b.name);
    }

    if (typeof window !== 'undefined') {
      try {
        const completed = localStorage.getItem(WEB_WALKTHROUGH_STORAGE_KEY);
        if (!completed) {
          setShowWalkthrough(true);
        }
      } catch (_e) {}
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setCheckingAuth(false);
          return;
        }
      } catch (_e) {}

      const cachedBiz = getCachedBusiness();
      const cachedRole = localStorage.getItem('ams:web_primary_role_v1');
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || cachedBiz || cachedRole) {
        setCheckingAuth(false);
        return;
      }

      router.push('/login');
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_e) {}
    clearAllLocalBusinessData();
    router.push('/login');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Loading workspace…</p>
        </div>
      </div>
    );
  }

  // PURE COMMERCIAL & RETAIL NAVIGATION
  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: '📊', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Record Sale (POS)', href: '/sales', icon: '🛒', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Invoices & Receipts', href: '/invoices', icon: '🧾', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Customers & Debt', href: '/customers', icon: '👥', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Customer Returns & Payouts', href: '/refunds', icon: '💵', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Inventory & Stock', href: '/inventory', icon: '📦', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Daily Bookkeeping', href: '/bookkeeping', icon: '📋', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Mobile Money (MoMo) Sync', href: '/banking', icon: '📱', roles: ['owner', 'accountant'] },
    { label: 'Suppliers & Debt', href: '/suppliers', icon: '🏭', roles: ['owner', 'accountant'] },
    { label: 'Data Migration', href: '/migrate', icon: '⚡', roles: ['owner', 'accountant'] },
    { label: 'Team & Staff', href: '/team', icon: '🧑‍🤝‍🧑', roles: ['owner'] },
    { label: 'Financial Reports', href: '/reports', icon: '📈', roles: ['owner', 'accountant'] },
    { label: 'Audit Trail', href: '/audit-logs', icon: '🛡️', roles: ['owner', 'accountant'] },
    { label: 'Accountant Portal', href: '/accountant', icon: '💼', roles: ['owner', 'accountant'] },
    { label: 'Tax Preparation', href: '/tax', icon: '🏛️', roles: ['owner', 'accountant'] },
    { label: 'Settings & Profile', href: '/settings', icon: '⚙️', roles: ['owner', 'employee', 'accountant'] },
    { label: 'Pricing & Plans', href: '/pricing', icon: '✨', roles: ['owner'] },
  ];

  const visibleNavItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F9FAFB] text-slate-900">
      
      {/* Desktop Clean Minimalist Sidebar */}
      <aside className="hidden md:flex w-60 border-r border-slate-200 p-4 flex-col shrink-0 bg-white">
        
        {/* Brand Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
              AMS
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-900 truncate max-w-[110px]" title={businessName}>
              {businessName}
            </span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 uppercase">
            {role}
          </span>
        </div>

        {/* Store Mode Indicator (Clean & Static) */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 mb-3 w-full">
          <span className="text-sm">🛒</span>
          <span className="truncate text-xs font-medium text-slate-800 flex-1">Retail &amp; Wholesale Hub</span>
        </div>

        {/* Connectivity Status & Small Guide Button */}
        <div className="mb-3 px-1 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                onlineStatus ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span>{onlineStatus ? 'Live Online' : 'Offline'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Small Guide Pill (like mobile header) */}
            <button
              onClick={() => setShowWalkthrough(true)}
              className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition flex items-center gap-1"
              title="Open full 18-module app guide"
            >
              <span>✨</span>
              <span>Guide</span>
            </button>

            {pendingSyncCount > 0 && (
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {pendingSyncCount} pending
              </span>
            )}
          </div>
        </div>

        {/* Role Switcher */}
        {canSwitchRoles && (
          <div className="mb-3 p-1 rounded-xl bg-slate-50 border border-slate-200">
            <div className="grid grid-cols-3 gap-0.5">
              {(['owner', 'employee', 'accountant'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-1 text-[10px] font-medium rounded-lg capitalize transition ${
                    role === r
                      ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {r === 'employee' ? 'Staff' : r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto pr-1">
          {visibleNavItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition ${
                  active
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="text-sm shrink-0 opacity-80">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="pt-3 border-t border-slate-100 mt-auto flex flex-col gap-0.5">
          <Link
            href="/settings"
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition font-medium"
          >
            <span>⚙️</span>
            <span>Profile &amp; Settings</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition font-medium text-left"
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between p-3.5 bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
            AMS
          </div>
          <span className="text-sm font-bold text-slate-900 truncate max-w-[130px]">
            {businessName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWalkthrough(true)}
            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition flex items-center gap-1"
          >
            <span>✨</span>
            <span>Guide</span>
          </button>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 uppercase">
            {role}
          </span>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile Slide-Out Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-64 bg-white h-full p-4 flex flex-col justify-between shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900">Navigation Menu</span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 font-bold p-1">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-1">
              {visibleNavItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white font-bold'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
              <Link
                href="/business-profile"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-800"
              >
                ⚙️ Profile &amp; Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full text-center py-2 text-xs font-semibold rounded-xl text-red-600 bg-red-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-between">
        <div className="flex items-center justify-around w-full gap-1 overflow-x-auto">
          {visibleNavItems.slice(0, 4).map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center min-w-[56px] px-2 py-1 rounded-lg text-center shrink-0 transition ${
                  active
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-slate-500 hover:bg-slate-50 font-medium'
                }`}
              >
                <span className="text-sm leading-none mb-0.5">{item.icon}</span>
                <span className="text-[10px] whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center min-w-[56px] px-2 py-1 rounded-lg text-center shrink-0 text-slate-500 hover:bg-slate-50 font-medium"
          >
            <span className="text-sm leading-none mb-0.5">☰</span>
            <span className="text-[10px] whitespace-nowrap">More</span>
          </button>
        </div>
      </nav>

      {/* COMPULSORY & REPLAYABLE 18-MODULE INTERACTIVE APP GUIDE (WEB & DESKTOP) */}
      <WebWalkthroughModal
        isOpen={showWalkthrough}
        onClose={() => setShowWalkthrough(false)}
      />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <ArchetypeProvider>
        <AppLayoutInner>{children}</AppLayoutInner>
      </ArchetypeProvider>
    </RoleProvider>
  );
}
