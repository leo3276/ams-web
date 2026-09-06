import { supabase } from './supabase';
import { InventoryItem, Invoice, CustomerSummary, Transaction } from './types';

// Storage Keys Base
const KEY_BUSINESS = 'ams:cache_business_v1';
const KEY_USER = 'ams:cache_user_v1';
const KEY_OFFLINE_TX_QUEUE = 'ams:offline_tx_queue_v1';

export interface CachedBusiness {
  id: string;
  name: string;
  currency: string;
  user_id?: string;
  business_type?: string;
  tax_id?: string;
  next_tax_filing_date?: string | null;
  tax_filing_frequency?: string;
  industry?: string;
  fiscal_year_start?: string;
}

export interface OfflinePendingTransaction {
  id: string;
  business_id: string;
  transaction_date: string;
  vendor: string;
  type: string;
  category: string;
  amount: number;
  payment_method: 'cash' | 'bank';
  depreciation_rate?: number | null;
  created_at: string;
}

// Helper to get active business id
function getActiveBusinessId(explicitId?: string): string {
  if (explicitId) return explicitId;
  const b = getCachedBusiness();
  return b?.id || 'default_biz';
}

// 1. Business & User Cache
const KEY_KNOWN_BUSINESSES = 'ams:known_businesses_list_v1';
const KEY_BUSINESS_PINS_MAP = 'ams:business_pins_map_v1';
const KEY_ACCOUNTANT_PINS_MAP = 'ams:accountant_pins_map_v1';

export function getBusinessSecurityPin(businessId: string): string {
  if (typeof window === 'undefined' || !businessId) return '1234';
  try {
    const raw = localStorage.getItem(KEY_BUSINESS_PINS_MAP);
    const map = raw ? JSON.parse(raw) : {};
    return map[businessId] || '1234';
  } catch (_e) {
    return '1234';
  }
}

export function setBusinessSecurityPin(businessId: string, pin: string) {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    const raw = localStorage.getItem(KEY_BUSINESS_PINS_MAP);
    const map = raw ? JSON.parse(raw) : {};
    map[businessId] = pin.trim();
    localStorage.setItem(KEY_BUSINESS_PINS_MAP, JSON.stringify(map));
  } catch (_e) {}
}

export function getAccountantSecurityPin(businessId: string): string | null {
  if (typeof window === 'undefined' || !businessId) return null;
  try {
    const raw = localStorage.getItem(KEY_ACCOUNTANT_PINS_MAP);
    const map = raw ? JSON.parse(raw) : {};
    return map[businessId] || null;
  } catch (_e) {
    return null;
  }
}

export function setAccountantSecurityPin(businessId: string, pin: string) {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    const raw = localStorage.getItem(KEY_ACCOUNTANT_PINS_MAP);
    const map = raw ? JSON.parse(raw) : {};
    map[businessId] = pin.trim();
    localStorage.setItem(KEY_ACCOUNTANT_PINS_MAP, JSON.stringify(map));
  } catch (_e) {}
}

import { verifySecurePin, hashPin } from './securityEngine';

/**
 * Validates a PIN for switching into a business with cryptographic hashing and brute-force lockout protection.
 * Returns: { valid: boolean; role?: 'owner' | 'accountant'; error?: string }
 */
export function verifyBusinessAccessPin(
  businessId: string,
  inputPin: string
): { valid: boolean; role?: 'owner' | 'accountant'; error?: string } {
  const cleanInput = inputPin.trim();
  const ownerStored = getBusinessSecurityPin(businessId);
  const accountantStored = getAccountantSecurityPin(businessId);

  // 1. Check Accountant PIN
  if (accountantStored) {
    const acctCheck = verifySecurePin(`acct_${businessId}`, cleanInput, accountantStored);
    if (acctCheck.success) {
      return { valid: true, role: 'accountant' };
    }
  }

  // 2. Check Owner Master PIN
  const ownerCheck = verifySecurePin(`owner_${businessId}`, cleanInput, ownerStored);
  if (ownerCheck.success) {
    return { valid: true, role: 'owner' };
  }

  return { valid: false, error: ownerCheck.error || 'Invalid Security PIN' };
}

export function getKnownBusinesses(): CachedBusiness[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_KNOWN_BUSINESSES);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function registerKnownBusiness(b: CachedBusiness) {
  if (typeof window === 'undefined' || !b?.id) return;
  try {
    const existing = getKnownBusinesses();
    const filtered = existing.filter((item) => item.id !== b.id);
    const updated = [b, ...filtered];
    localStorage.setItem(KEY_KNOWN_BUSINESSES, JSON.stringify(updated));
  } catch (_e) {}
}

export function getCachedBusiness(): CachedBusiness | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY_BUSINESS);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

export function setCachedBusiness(b: CachedBusiness) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_BUSINESS, JSON.stringify(b));
    registerKnownBusiness(b);
  } catch (_e) {}
}

export function getCachedUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw)?.id : null;
  } catch (_e) {
    return null;
  }
}

export function setCachedUser(user: { id: string; email?: string }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_USER, JSON.stringify(user));
  } catch (_e) {}
}

/**
 * Resolves the active business reliably across desktop reloads, logins, and multi-tenant workspaces.
 * Prioritizes the active cached business ID, updates it with live DB state, and falls back to newest business.
 */
export async function resolveActiveBusiness(userId?: string): Promise<CachedBusiness | null> {
  const cachedBiz = getCachedBusiness();

  let activeUserId = userId || getCachedUserId();
  if (!activeUserId) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData?.user?.id || null;
      if (activeUserId) setCachedUser({ id: activeUserId, email: userData?.user?.email });
    } catch (_e) {}
  }

  // 1. If we have an active cached business with a valid ID, verify and sync with Supabase
  if (cachedBiz?.id && cachedBiz.id !== 'default_biz') {
    try {
      const { data: specificBiz, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', cachedBiz.id)
        .limit(1);

      if (!error && specificBiz && specificBiz.length > 0) {
        const found = specificBiz[0];
        const active: CachedBusiness = {
          id: found.id,
          name: found.name || cachedBiz.name || 'My Enterprise',
          currency: found.currency || cachedBiz.currency || 'GHS',
          user_id: found.user_id || activeUserId || undefined,
          business_type: found.business_type || cachedBiz.business_type || 'retail_wholesale',
          tax_id: found.tax_id || cachedBiz.tax_id || '',
          next_tax_filing_date: found.next_tax_filing_date || cachedBiz.next_tax_filing_date || null,
          tax_filing_frequency: found.tax_filing_frequency || cachedBiz.tax_filing_frequency || 'quarterly',
          industry: found.industry || cachedBiz.industry || 'Commercial Enterprise',
          fiscal_year_start: found.fiscal_year_start || cachedBiz.fiscal_year_start || 'January',
        };
        setCachedBusiness(active);
        return active;
      }
    } catch (_e) {}
  }

  // 2. Fallback: Find businesses for activeUserId in Supabase (newest first)
  if (activeUserId) {
    try {
      const { data: businesses, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', activeUserId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && businesses && businesses.length > 0) {
        const match = businesses.find((b) => b.id === cachedBiz?.id) || businesses[0];
        const active: CachedBusiness = {
          id: match.id,
          name: match.name || 'My Enterprise',
          currency: match.currency || 'GHS',
          user_id: match.user_id || activeUserId,
          business_type: match.business_type || 'retail_wholesale',
          tax_id: match.tax_id || '',
          next_tax_filing_date: match.next_tax_filing_date || null,
          tax_filing_frequency: match.tax_filing_frequency || 'quarterly',
          industry: match.industry || 'Commercial Enterprise',
          fiscal_year_start: match.fiscal_year_start || 'January',
        };
        setCachedBusiness(active);
        return active;
      }

      // 3. User has zero business rows in Supabase -> Auto-provision one
      const defaultName = 'My Enterprise';
      const { data: newBiz } = await supabase
        .from('businesses')
        .insert({
          user_id: activeUserId,
          name: defaultName,
          currency: 'GHS',
          business_type: 'retail_wholesale',
          industry: 'Commercial Retail & Wholesale',
          fiscal_year_start: 'January',
        })
        .select()
        .single();

      if (newBiz) {
        const active: CachedBusiness = {
          id: newBiz.id,
          name: newBiz.name,
          currency: newBiz.currency || 'GHS',
          user_id: activeUserId,
          business_type: newBiz.business_type || 'retail_wholesale',
          tax_id: newBiz.tax_id || '',
          next_tax_filing_date: newBiz.next_tax_filing_date || null,
          tax_filing_frequency: newBiz.tax_filing_frequency || 'quarterly',
          industry: newBiz.industry || 'Commercial Retail & Wholesale',
          fiscal_year_start: newBiz.fiscal_year_start || 'January',
        };
        setCachedBusiness(active);
        return active;
      }
    } catch (_e) {}
  }

  // 4. Return existing cachedBiz if present
  if (cachedBiz && cachedBiz.id && cachedBiz.id !== 'default_biz') {
    return cachedBiz;
  }

  return null;
}

// 2. Inventory Cache (Scoped by business)
// 2. Inventory Cache (Strictly scoped by active business ID)
export function getCachedInventory(businessId?: string): InventoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return [];

    const raw = localStorage.getItem(`ams:cache_inventory_${bid}`);
    if (raw) {
      const parsed: InventoryItem[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function setCachedInventory(items: InventoryItem[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return;
    localStorage.setItem(`ams:cache_inventory_${bid}`, JSON.stringify(items));
  } catch (_e) {}
}

// 3. Transactions Cache (Strictly scoped by active business ID)
export function getCachedTransactions(businessId?: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return [];
    const raw = localStorage.getItem(`ams:cache_transactions_${bid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function setCachedTransactions(txs: any[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return;
    localStorage.setItem(`ams:cache_transactions_${bid}`, JSON.stringify(txs));
  } catch (_e) {}
}

// 4. Invoices Cache (Strictly scoped by active business ID)
export function getCachedInvoices(businessId?: string): Invoice[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return [];
    const raw = localStorage.getItem(`ams:cache_invoices_${bid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (bid === 'default_biz') {
      const defaultRaw = localStorage.getItem('ams:cache_invoices_default_biz');
      if (defaultRaw) {
        const parsed = JSON.parse(defaultRaw);
        return Array.isArray(parsed) ? parsed : [];
      }
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function setCachedInvoices(invs: Invoice[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return;
    localStorage.setItem(`ams:cache_invoices_${bid}`, JSON.stringify(invs));
    if (bid === 'default_biz') {
      localStorage.setItem('ams:cache_invoices_default_biz', JSON.stringify(invs));
    }
  } catch (_e) {}
}

// 5. Customers Cache (Strictly scoped by active business ID)
export function getCachedCustomers(businessId?: string): CustomerSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return [];
    const raw = localStorage.getItem(`ams:cache_customers_${bid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (bid === 'default_biz') {
      const defaultRaw = localStorage.getItem('ams:cache_customers_default_biz');
      if (defaultRaw) {
        const parsed = JSON.parse(defaultRaw);
        return Array.isArray(parsed) ? parsed : [];
      }
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function setCachedCustomers(customers: CustomerSummary[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return;
    localStorage.setItem(`ams:cache_customers_${bid}`, JSON.stringify(customers));
    if (bid === 'default_biz') {
      localStorage.setItem('ams:cache_customers_default_biz', JSON.stringify(customers));
    }
  } catch (_e) {}
}

// 6. Offline Transaction Queue & Auto-Sync
export function getOfflineTransactionQueue(): OfflinePendingTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_OFFLINE_TX_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function saveOfflineTransaction(
  tx: Omit<OfflinePendingTransaction, 'id' | 'created_at'>
): OfflinePendingTransaction {
  const newTx: OfflinePendingTransaction = {
    ...tx,
    id: `offline_tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const queue = getOfflineTransactionQueue();
      const updated = [newTx, ...queue];
      localStorage.setItem(KEY_OFFLINE_TX_QUEUE, JSON.stringify(updated));

      // Also append to local cached transactions for current business
      const cachedTxs = getCachedTransactions(tx.business_id);
      setCachedTransactions([newTx, ...cachedTxs], tx.business_id);
    } catch (_e) {}
  }

  return newTx;
}

export async function flushOfflineTransactionsToSupabase(businessId: string): Promise<{
  syncedCount: number;
  failedCount: number;
}> {
  if (typeof window === 'undefined') return { syncedCount: 0, failedCount: 0 };
  const queue = getOfflineTransactionQueue();
  if (queue.length === 0) return { syncedCount: 0, failedCount: 0 };

  let syncedCount = 0;
  const remaining: OfflinePendingTransaction[] = [];

  for (const item of queue) {
    try {
      const { error } = await supabase.from('transactions').insert({
        business_id: businessId || item.business_id,
        transaction_date: item.transaction_date,
        vendor: item.vendor,
        type: item.type,
        category: item.category || 'Sales',
        amount: item.amount,
        payment_method: item.payment_method || 'cash',
        depreciation_rate: item.depreciation_rate || null,
      });

      if (error) {
        remaining.push(item);
      } else {
        syncedCount++;
      }
    } catch (_err) {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(KEY_OFFLINE_TX_QUEUE, JSON.stringify(remaining));
  } catch (_e) {}

  return { syncedCount, failedCount: remaining.length };
}

// 7. Suppliers & Creditor Debt Book Cache (Strictly scoped by active business ID)
export function getCachedSuppliers(businessId?: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return [];
    const raw = localStorage.getItem(`ams:cache_suppliers_${bid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (bid === 'default_biz') {
      const defaultRaw = localStorage.getItem('ams:cache_suppliers_default_biz');
      if (defaultRaw) {
        const parsed = JSON.parse(defaultRaw);
        return Array.isArray(parsed) ? parsed : [];
      }
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function setCachedSuppliers(items: any[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    if (!bid) return;
    localStorage.setItem(`ams:cache_suppliers_${bid}`, JSON.stringify(items));
    if (bid === 'default_biz') {
      localStorage.setItem('ams:cache_suppliers_default_biz', JSON.stringify(items));
    }
  } catch (_e) {}
}

export function addCachedSupplier(s: any, businessId?: string) {
  const bid = getActiveBusinessId(businessId || s.business_id);
  const current = getCachedSuppliers(bid);
  const existingIdx = current.findIndex((item) => item.id === s.id || item.name.toLowerCase() === s.name.toLowerCase());
  let updated;
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...current[existingIdx], ...s, business_id: bid };
  } else {
    updated = [{ ...s, business_id: bid }, ...current];
  }
  setCachedSuppliers(updated, bid);
  return updated;
}

export function updateCachedSupplier(s: any, businessId?: string) {
  const bid = getActiveBusinessId(businessId || s.business_id);
  const current = getCachedSuppliers(bid);
  const updated = current.map((item) => (item.id === s.id ? { ...item, ...s, business_id: bid } : item));
  setCachedSuppliers(updated, bid);
  return updated;
}

export function deleteCachedSupplier(supplierId: string, businessId?: string) {
  const bid = getActiveBusinessId(businessId);
  const current = getCachedSuppliers(bid);
  const updated = current.filter((item) => item.id !== supplierId);
  setCachedSuppliers(updated, bid);
  return updated;
}

export function updateCachedSupplierBalance(supplierId: string, deltaAmount: number, businessId?: string) {
  const bid = getActiveBusinessId(businessId);
  const current = getCachedSuppliers(bid);
  const updated = current.map((s) => {
    if (s.id === supplierId) {
      return { ...s, balance_owed: Math.max(0, Number(s.balance_owed || 0) + deltaAmount), business_id: bid };
    }
    return s;
  });
  setCachedSuppliers(updated, bid);
  return updated;
}

// Clear all active cache on logout for multi-account safety
export function clearAllLocalBusinessData() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('ams:') || k.startsWith('ams_'))) {
        // Retain only walkthrough if needed, or clear all
        if (!k.includes('walkthrough')) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_e) {}
}

// 8. Network Status Listener & Auto-Reconnection Flusher
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    try {
      const activeBiz = getCachedBusiness();
      if (activeBiz?.id) {
        const res = await flushOfflineTransactionsToSupabase(activeBiz.id);
        if (res.syncedCount > 0) {
          window.dispatchEvent(new Event('ams:transactions-updated'));
        }
      }
    } catch (_e) {}
  });
}
