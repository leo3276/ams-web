'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCachedBusiness, setCachedBusiness, CachedBusiness, getKnownBusinesses, registerKnownBusiness, verifyBusinessAccessPin } from '@/lib/offlineStore';
import { useArchetype } from '@/lib/ArchetypeContext';
import { useUserRole } from '@/lib/RoleContext';
import { ARCHETYPES, BusinessArchetypeId } from '@/lib/archetypes/config';

interface MyBranchOrBusiness {
  id: string;
  name: string;
  business_type?: string;
  currency: string;
  industry?: string;
  branch_code?: string;
  is_main_branch?: boolean;
}

export default function AccessBranchOrBusinessPage() {
  const router = useRouter();
  const { setArchetypeId } = useArchetype();
  const { setRole, setLoginRole } = useUserRole();

  const [myBusinesses, setMyBusinesses] = useState<MyBranchOrBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBizId, setCurrentBizId] = useState<string | null>(null);

  // Modal State for Branch / Business Authentication
  const [selectedEntity, setSelectedEntity] = useState<MyBranchOrBusiness | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Manual Credentials Login for an External / New Branch
  const [showDirectLoginModal, setShowDirectLoginModal] = useState(false);
  const [loginEmailOrCode, setLoginEmailOrCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [directLoginError, setDirectLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const current = getCachedBusiness();
    if (current) setCurrentBizId(current.id);

    const loadUserOwnedBusinesses = async () => {
      setLoading(true);
      const known = getKnownBusinesses();
      const combinedMap = new Map<string, MyBranchOrBusiness>();

      // 1. Add current cached business
      if (current) {
        combinedMap.set(current.id, {
          id: current.id,
          name: current.name,
          business_type: (current as any).business_type || 'retail_wholesale',
          currency: current.currency || 'GHS',
          industry: (current as any).industry || 'Commercial Enterprise',
          branch_code: 'MAIN-01',
          is_main_branch: true,
        });
      }

      // 2. Add known businesses authenticated on this device
      known.forEach((k, idx) => {
        if (!combinedMap.has(k.id)) {
          combinedMap.set(k.id, {
            id: k.id,
            name: k.name,
            business_type: (k as any).business_type || 'retail_wholesale',
            currency: k.currency || 'GHS',
            industry: (k as any).industry || 'Registered Branch / Company',
            branch_code: `BR-0${idx + 1}`,
            is_main_branch: false,
          });
        }
      });

      // 3. Fetch from Supabase for current user
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: bizList } = await supabase
            .from('businesses')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true });

          if (bizList && bizList.length > 0) {
            bizList.forEach((b: any, index: number) => {
              combinedMap.set(b.id, {
                id: b.id,
                name: b.name,
                business_type: b.business_type || 'retail_wholesale',
                currency: b.currency || 'GHS',
                industry: b.industry || 'Commercial Enterprise',
                branch_code: `BR-0${index + 1}`,
                is_main_branch: index === 0,
              });
              registerKnownBusiness({ id: b.id, name: b.name, currency: b.currency || 'GHS' });
            });
          }
        }
      } catch (_e) {}

      setMyBusinesses(Array.from(combinedMap.values()));
      setLoading(false);
    };

    loadUserOwnedBusinesses();
  }, []);

  const handleOpenAuthModal = (entity: MyBranchOrBusiness) => {
    setSelectedEntity(entity);
    setAuthPin('');
    setAuthError(null);
    setShowAuthModal(true);
  };

  const handleConfirmSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity) return;

    // Verify PIN against Owner or Accountant PIN
    const authResult = verifyBusinessAccessPin(selectedEntity.id, authPin);
    if (!authResult.valid) {
      setAuthError('Incorrect security PIN. Please enter either the Owner PIN or your Accountant Access PIN.');
      return;
    }

    const updatedBiz: CachedBusiness = {
      id: selectedEntity.id,
      name: selectedEntity.name,
      currency: selectedEntity.currency,
    };

    setCachedBusiness(updatedBiz);
    setCurrentBizId(selectedEntity.id);

    // Apply role according to which PIN was used
    if (authResult.role === 'accountant') {
      setRole('accountant');
      setLoginRole('accountant');
    } else {
      setRole('owner');
      setLoginRole('owner');
    }

    if (selectedEntity.business_type && selectedEntity.business_type in ARCHETYPES) {
      await setArchetypeId(selectedEntity.business_type as BusinessArchetypeId);
    }

    setShowAuthModal(false);
    router.push('/accountant');
  };

  const handleDirectBranchLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirectLoginError(null);

    if (!loginEmailOrCode.trim() || !loginPassword.trim()) {
      setDirectLoginError('Please enter the branch email/code and password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // Attempt login to Supabase for the other business account
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmailOrCode.trim(),
        password: loginPassword.trim(),
      });

      if (error) {
        setDirectLoginError(error.message || 'Invalid branch credentials.');
        setIsLoggingIn(false);
        return;
      }

      if (data?.session) {
        // Fetch the business for this logged in account
        const { data: businesses } = await supabase
          .from('businesses')
          .select('*')
          .eq('user_id', data.user.id)
          .limit(1);

        const b = businesses?.[0];
        if (b) {
          const updatedBiz: CachedBusiness = {
            id: b.id,
            name: b.name,
            currency: b.currency || 'GHS',
          };
          setCachedBusiness(updatedBiz);
          if (b.business_type && b.business_type in ARCHETYPES) {
            await setArchetypeId(b.business_type as BusinessArchetypeId);
          }
        }
        setShowDirectLoginModal(false);
        router.push('/accountant');
      }
    } catch (err: any) {
      setDirectLoginError(err?.message || 'Failed to authenticate branch.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Modal 1: Switch Owned Branch with PIN */}
      {showAuthModal && selectedEntity && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center text-lg font-bold">
                🔐
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Authenticate Branch Access</h3>
                <p className="text-xs text-slate-500">Switching to: {selectedEntity.name}</p>
              </div>
            </div>

            <form onSubmit={handleConfirmSwitch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Enter Branch Security PIN
                </label>
                <input
                  type="password"
                  value={authPin}
                  onChange={(e) => setAuthPin(e.target.value)}
                  placeholder="Enter 4-digit PIN (Default: 1234)"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 tracking-widest text-center font-mono font-bold text-slate-900"
                  autoFocus
                  maxLength={6}
                />
                {authError && <p className="text-xs text-red-600 font-medium mt-1">{authError}</p>}
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter your assigned <strong>Accountant Access PIN</strong> or the business <strong>Owner Master PIN</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition shadow-sm"
                >
                  Access Branch ⚡
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Sign in to another Business / Branch Account */}
      {showDirectLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center text-lg font-bold">
                🏢
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Sign In to Another Business</h3>
                <p className="text-xs text-slate-500">Access separate business books under AMS</p>
              </div>
            </div>

            <form onSubmit={handleDirectBranchLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Account Email
                </label>
                <input
                  type="email"
                  value={loginEmailOrCode}
                  onChange={(e) => setLoginEmailOrCode(e.target.value)}
                  placeholder="manager@branch-store.com"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900"
                  required
                />
              </div>

              {directLoginError && <p className="text-xs text-red-600 font-medium">{directLoginError}</p>}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDirectLoginModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition shadow-sm disabled:opacity-50"
                >
                  {isLoggingIn ? 'Authenticating…' : 'Sign In & Access ⚡'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🏢</span>
            <span className="text-xs font-bold text-accentText uppercase tracking-wider">
              Branch &amp; Business Workspace Management
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Access Branch / Switch Business</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Switch between your verified branches or sign in to another registered business account to audit finances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/accountant"
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-bold transition"
          >
            ← Back to Audit Pack
          </Link>
          <button
            onClick={() => setShowDirectLoginModal(true)}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition shadow-xs flex items-center gap-1.5"
          >
            <span>+</span> Sign In to Another Business
          </button>
        </div>
      </div>

      {/* Branch List */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
          Your Registered Branches / Businesses
        </h2>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
            Loading your branches...
          </div>
        ) : myBusinesses.length === 0 ? (
          <div className="p-8 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
            <span className="text-3xl">🏪</span>
            <p className="text-sm font-bold text-slate-900">No additional branches found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              If you operate a secondary branch or manage another business under AMS, click the button below to sign in.
            </p>
            <button
              onClick={() => setShowDirectLoginModal(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
            >
              Sign In to Another Business Account
            </button>
          </div>
        ) : (
          myBusinesses.map((biz) => {
            const isCurrent = biz.id === currentBizId;
            const arch = ARCHETYPES[biz.business_type as BusinessArchetypeId] || ARCHETYPES.retail_wholesale;

            return (
              <div
                key={biz.id}
                className={`p-4 rounded-2xl border transition flex items-center justify-between gap-4 ${
                  isCurrent
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="text-2xl p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {arch.icon || '🏪'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold truncate">{biz.name}</h3>
                      {biz.branch_code && (
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isCurrent ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {biz.branch_code}
                        </span>
                      )}
                      {biz.is_main_branch && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                          Main Store
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${isCurrent ? 'text-slate-300' : 'text-slate-500'}`}>
                      {biz.industry || arch.label} • Currency: {biz.currency}
                    </p>
                  </div>
                </div>

                <div>
                  {isCurrent ? (
                    <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500 text-white shadow-xs">
                      ✓ Active Workspace
                    </span>
                  ) : (
                    <button
                      onClick={() => handleOpenAuthModal(biz)}
                      className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                    >
                      <span>🔒</span> Access Branch (PIN)
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


