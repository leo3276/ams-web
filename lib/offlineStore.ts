import { supabase } from './supabase';
import { InventoryItem, Invoice, CustomerSummary, Transaction } from './types';

// Storage Keys
const KEY_BUSINESS = 'ams:cache_business_v1';
const KEY_USER = 'ams:cache_user_v1';
const KEY_INVENTORY = 'ams:cache_inventory_v1';
const KEY_TRANSACTIONS = 'ams:cache_transactions_v1';
const KEY_INVOICES = 'ams:cache_invoices_v1';
const KEY_CUSTOMERS = 'ams:cache_customers_v1';
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

// 2. Inventory Cache
export function getCachedInventory(): InventoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_INVENTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedInventory(items: InventoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_INVENTORY, JSON.stringify(items));
  } catch (_e) {}
}

// 3. Transactions Cache
export function getCachedTransactions(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedTransactions(txs: any[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(txs));
  } catch (_e) {}
}

// 4. Invoices Cache
export function getCachedInvoices(): Invoice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_INVOICES);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedInvoices(invs: Invoice[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_INVOICES, JSON.stringify(invs));
  } catch (_e) {}
}

// 5. Customers Cache
export function getCachedCustomers(): CustomerSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_CUSTOMERS);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedCustomers(customers: CustomerSummary[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(customers));
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

      // Also append to local cached transactions so UI updates immediately
      const cachedTxs = getCachedTransactions();
      setCachedTransactions([newTx, ...cachedTxs]);
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

// 7. Network Status Listener
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
