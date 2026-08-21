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

// 2. Inventory Cache (Scoped by business)
export function getCachedInventory(businessId?: string): InventoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    const raw = localStorage.getItem(`ams:cache_inventory_${bid}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedInventory(items: InventoryItem[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    localStorage.setItem(`ams:cache_inventory_${bid}`, JSON.stringify(items));
  } catch (_e) {}
}

// 3. Transactions Cache (Scoped by business)
export function getCachedTransactions(businessId?: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    const raw = localStorage.getItem(`ams:cache_transactions_${bid}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedTransactions(txs: any[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    localStorage.setItem(`ams:cache_transactions_${bid}`, JSON.stringify(txs));
  } catch (_e) {}
}

// 4. Invoices Cache (Scoped by business)
export function getCachedInvoices(businessId?: string): Invoice[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    const raw = localStorage.getItem(`ams:cache_invoices_${bid}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedInvoices(invs: Invoice[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    localStorage.setItem(`ams:cache_invoices_${bid}`, JSON.stringify(invs));
  } catch (_e) {}
}

// 5. Customers Cache (Scoped by business)
export function getCachedCustomers(businessId?: string): CustomerSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    const raw = localStorage.getItem(`ams:cache_customers_${bid}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedCustomers(customers: CustomerSummary[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    localStorage.setItem(`ams:cache_customers_${bid}`, JSON.stringify(customers));
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

// 7. Suppliers & Creditor Debt Book Cache (Strictly scoped by businessId)
export function getCachedSuppliers(businessId?: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const bid = getActiveBusinessId(businessId);
    const raw = localStorage.getItem(`ams:cache_suppliers_${bid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: any) => !s.business_id || s.business_id === bid) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedSuppliers(items: any[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const bid = getActiveBusinessId(businessId);
    localStorage.setItem(`ams:cache_suppliers_${bid}`, JSON.stringify(items));
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
    localStorage.removeItem(KEY_BUSINESS);
    localStorage.removeItem(KEY_USER);
    localStorage.removeItem('ams:web_user_role_v1');
    localStorage.removeItem('ams:web_primary_role_v1');
  } catch (_e) {}
}

// 8. Network Status Listener
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
