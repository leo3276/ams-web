export interface BankAccount {
  id: string;
  business_id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  account_type: 'bank' | 'momo';
  currency: string;
  current_balance: number;
  last_synced_at?: string;
  created_at: string;
}

export interface BankFeedTransaction {
  id: string;
  bank_account_id: string;
  business_id: string;
  transaction_date: string;
  value_date?: string;
  narrative: string;
  reference: string;
  amount: number; // positive = credit/deposit, negative = debit/withdrawal
  type: 'credit' | 'debit';
  balance_after?: number;
  status: 'unmatched' | 'matched' | 'excluded';
  matched_transaction_id?: string;
  matched_invoice_id?: string;
  suggested_category?: string;
}

// Storage Keys
const KEY_BANK_ACCOUNTS_PREFIX = 'ams:bank_accounts_';
const KEY_BANK_FEEDS_PREFIX = 'ams:bank_feeds_';

export function getCachedBankAccounts(businessId: string): BankAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${KEY_BANK_ACCOUNTS_PREFIX}${businessId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedBankAccounts(accounts: BankAccount[], businessId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${KEY_BANK_ACCOUNTS_PREFIX}${businessId}`, JSON.stringify(accounts));
  } catch (_e) {}
}

export function addCachedBankAccount(account: Omit<BankAccount, 'id' | 'created_at'>, businessId: string): BankAccount {
  const accounts = getCachedBankAccounts(businessId);
  const newAcc: BankAccount = {
    ...account,
    id: `acc_${Date.now()}`,
    created_at: new Date().toISOString(),
  };
  const updated = [newAcc, ...accounts];
  setCachedBankAccounts(updated, businessId);
  return newAcc;
}

export function getCachedBankFeeds(businessId: string): BankFeedTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${KEY_BANK_FEEDS_PREFIX}${businessId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function setCachedBankFeeds(feeds: BankFeedTransaction[], businessId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${KEY_BANK_FEEDS_PREFIX}${businessId}`, JSON.stringify(feeds));
  } catch (_e) {}
}

export function addImportedBankFeeds(newFeeds: Omit<BankFeedTransaction, 'id' | 'business_id' | 'status'>[], businessId: string) {
  const existing = getCachedBankFeeds(businessId);
  const existingRefs = new Set(existing.map((f) => f.reference));

  const itemsToAdd: BankFeedTransaction[] = [];
  newFeeds.forEach((item, idx) => {
    const refKey = item.reference || `REF-${Date.now()}-${idx}`;
    if (!existingRefs.has(refKey)) {
      itemsToAdd.push({
        ...item,
        id: `bf_${Date.now()}_${idx}`,
        business_id: businessId,
        reference: refKey,
        status: 'unmatched',
      });
      existingRefs.add(refKey);
    }
  });

  const updated = [...itemsToAdd, ...existing];
  setCachedBankFeeds(updated, businessId);
  return { addedCount: itemsToAdd.length, total: updated.length };
}

export function matchBankFeedTransaction(feedId: string, businessId: string, matchedTxId?: string, matchedInvoiceId?: string) {
  const feeds = getCachedBankFeeds(businessId);
  const updated = feeds.map((f) => {
    if (f.id === feedId) {
      return {
        ...f,
        status: 'matched' as const,
        matched_transaction_id: matchedTxId,
        matched_invoice_id: matchedInvoiceId,
      };
    }
    return f;
  });
  setCachedBankFeeds(updated, businessId);
  return updated;
}
