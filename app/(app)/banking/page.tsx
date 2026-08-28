'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  BankAccount,
  BankFeedTransaction,
  getCachedBankAccounts,
  setCachedBankAccounts,
  addCachedBankAccount,
  getCachedBankFeeds,
  setCachedBankFeeds,
  addImportedBankFeeds,
  matchBankFeedTransaction,
} from '@/lib/bankSyncStore';
import { getCachedBusiness, getCachedTransactions, getCachedInvoices } from '@/lib/offlineStore';
import { Transaction, Invoice } from '@/lib/types';
import { useUserRole } from '@/lib/RoleContext';

export default function BankingSyncPage() {
  const { role } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [businessId, setBusinessId] = useState('default_biz');
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [feeds, setFeeds] = useState<BankFeedTransaction[]>([]);
  const [ledgerTxs, setLedgerTxs] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // UI state
  const [filterStatus, setFilterStatus] = useState<'all' | 'unmatched' | 'matched'>('unmatched');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showDirectPayModal, setShowDirectPayModal] = useState(false);
  const [showSyncSuccessModal, setShowSyncSuccessModal] = useState(false);

  // New Account form state
  const [newAccName, setNewAccName] = useState('');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccBank, setNewAccBank] = useState('MTN Mobile Money');
  const [newAccType, setNewAccType] = useState<'bank' | 'momo'>('momo');
  const [newAccBalance, setNewAccBalance] = useState('');

  // 3rd-Party Outbound Payout form state
  const [payRecipientName, setPayRecipientName] = useState('');
  const [payRecipientNumber, setPayRecipientNumber] = useState('');
  const [payBankOrNetwork, setPayBankOrNetwork] = useState('MTN MoMo');
  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payMasterPin, setPayMasterPin] = useState('');
  const [payoutStatusMsg, setPayoutStatusMsg] = useState<string | null>(null);
  const [payoutErrorMsg, setPayoutErrorMsg] = useState<string | null>(null);

  // Load Data
  const loadData = () => {
    const b = getCachedBusiness();
    const bid = b?.id || 'default_biz';
    setBusinessId(bid);
    setBusinessName(b?.name || 'My Business');
    setCurrency(b?.currency || 'GHS');

    // Purge any old stale mock feeds or demo accounts stored in localStorage
    const rawAccs = getCachedBankAccounts(bid);
    const cleanAccs = rawAccs.filter((a) => !a.id.startsWith('bank_momo_') && !a.id.startsWith('bank_ecobank_'));
    if (cleanAccs.length !== rawAccs.length) {
      setCachedBankAccounts(cleanAccs, bid);
    }
    setAccounts(cleanAccs);

    const rawFeeds = getCachedBankFeeds(bid);
    const cleanFeeds = rawFeeds.filter((f) => !f.id.startsWith('bf_1_') && !f.id.startsWith('bf_2_') && !f.id.startsWith('bf_3_') && !f.id.startsWith('bf_4_'));
    if (cleanFeeds.length !== rawFeeds.length) {
      setCachedBankFeeds(cleanFeeds, bid);
    }
    setFeeds(cleanFeeds);

    const txs = getCachedTransactions(bid);
    setLedgerTxs(txs);

    const invs = getCachedInvoices(bid);
    setInvoices(invs);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered feeds
  const filteredFeeds = useMemo(() => {
    return feeds.filter((f) => {
      if (selectedAccountId !== 'all' && f.bank_account_id !== selectedAccountId) {
        return false;
      }
      if (filterStatus === 'unmatched' && f.status !== 'unmatched') return false;
      if (filterStatus === 'matched' && f.status !== 'matched') return false;
      return true;
    });
  }, [feeds, selectedAccountId, filterStatus]);

  // Aggregate Balances
  const totalBankBalance = useMemo(() => {
    return accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  }, [accounts]);

  const unmatchedCount = useMemo(() => {
    return feeds.filter((f) => f.status === 'unmatched').length;
  }, [feeds]);

  // Handler: Add Bank Account / MoMo Wallet
  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim() || !newAccNumber.trim()) return;

    addCachedBankAccount(
      {
        business_id: businessId,
        account_name: newAccName.trim(),
        account_number: newAccNumber.trim(),
        bank_name: newAccBank,
        account_type: newAccType,
        currency,
        current_balance: Number(newAccBalance) || 0,
        last_synced_at: new Date().toISOString(),
      },
      businessId
    );

    setShowAddAccountModal(false);
    setNewAccName('');
    setNewAccNumber('');
    setNewAccBalance('');
    loadData();
  };

  // Handler: Universal Statement Upload (CSV / MoMo Statement)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');

      const parsedItems: any[] = [];
      const nowStr = new Date().toISOString().slice(0, 10);

      // Simple CSV line parser
      lines.forEach((line, idx) => {
        if (idx === 0 && (line.toLowerCase().includes('date') || line.toLowerCase().includes('amount'))) return;
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 2 && cols[0]) {
          const date = cols[0].length >= 8 ? cols[0] : nowStr;
          const narrative = cols[1] || 'Bank Inflow/Debit';
          const amt = Number(cols[2] || cols[1]) || 0;
          if (amt !== 0) {
            parsedItems.push({
              bank_account_id: selectedAccountId === 'all' ? accounts[0]?.id : selectedAccountId,
              transaction_date: date,
              narrative,
              reference: cols[3] || `REF-${Date.now()}-${idx}`,
              amount: amt,
              type: amt > 0 ? ('credit' as const) : ('debit' as const),
              balance_after: totalBankBalance + amt,
              suggested_category: amt > 0 ? 'Sales Revenue' : 'General Operating Expense',
            });
          }
        }
      });

      if (parsedItems.length > 0) {
        addImportedBankFeeds(parsedItems, businessId);
        loadData();
        setShowSyncSuccessModal(true);
      }
    };
    reader.readAsText(file);
  };

  // 1-Click Match & Reconcile
  const handle1ClickMatch = (feedId: string, suggestedCategory: string, amount: number) => {
    matchBankFeedTransaction(feedId, businessId);
    loadData();
  };

  // Outbound Direct Payout Execution
  const handleExecutePayout = (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutErrorMsg(null);
    setPayoutStatusMsg(null);

    if (!payRecipientName.trim() || !payRecipientNumber.trim() || !payAmount) {
      setPayoutErrorMsg('Please fill in all recipient details and amount.');
      return;
    }

    const amt = Number(payAmount);
    if (amt <= 0) {
      setPayoutErrorMsg('Please enter a valid payout amount.');
      return;
    }

    // Security Check: Verify Owner PIN for Real Outflow
    const requiredPin = localStorage.getItem('ams:business_pins_map_v1');
    const pinMap = requiredPin ? JSON.parse(requiredPin) : {};
    const expectedPin = pinMap[businessId] || '1234';

    if (payMasterPin.trim() !== expectedPin) {
      setPayoutErrorMsg('⚠️ Unauthorized: Incorrect Owner Master PIN. Payout rejected.');
      return;
    }

    // Deduct from bank account balance and create feed debit entry
    const targetAcc = accounts[0];
    if (targetAcc) {
      const updatedAccs = accounts.map((a) =>
        a.id === targetAcc.id ? { ...a, current_balance: a.current_balance - amt } : a
      );
      setCachedBankAccounts(updatedAccs, businessId);
    }

    addImportedBankFeeds(
      [
        {
          bank_account_id: targetAcc?.id || 'bank_default',
          transaction_date: new Date().toISOString().slice(0, 10),
          narrative: `OUTBOUND PAYOUT: ${payRecipientName} (${payBankOrNetwork}) - ${payReference || 'Disbursement'}`,
          reference: `PAY-${Date.now().toString().slice(-6)}`,
          amount: -amt,
          type: 'debit',
          balance_after: totalBankBalance - amt,
          suggested_category: 'Vendor & Supplier Payout',
        },
      ],
      businessId
    );

    setPayoutStatusMsg(`✓ Success: ${currency} ${amt.toLocaleString()} disbursed to ${payRecipientName}! Reference ID: PAY-${Date.now().toString().slice(-6)}`);
    loadData();
    setTimeout(() => {
      setShowDirectPayModal(false);
      setPayRecipientName('');
      setPayRecipientNumber('');
      setPayAmount('');
      setPayMasterPin('');
      setPayoutStatusMsg(null);
    }, 2000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">📱</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Mobile Money (MoMo) Wallet &amp; Synchronization
              </h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{businessName}</span>
                <span>•</span>
                <span>Live MoMo Statements, Inflows &amp; Supplier Bill Payouts</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv,.txt,.ofx"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5"
          >
            <span>📥</span> Ingest MoMo Statement
          </button>
          <Link
            href="/suppliers"
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <span>🏭</span> Pay Supplier Bill
          </Link>
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <span>+</span> Link MoMo Wallet
          </button>
        </div>
      </div>

      {/* Linked Accounts Carousel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            onClick={() => setSelectedAccountId(selectedAccountId === acc.id ? 'all' : acc.id)}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              selectedAccountId === acc.id
                ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl">{acc.account_type === 'momo' ? '📱' : '🏦'}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                selectedAccountId === acc.id ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                ● Active Feed
              </span>
            </div>
            <p className={`text-xs font-bold truncate ${selectedAccountId === acc.id ? 'text-white' : 'text-slate-900'}`}>
              {acc.account_name}
            </p>
            <p className={`text-[11px] font-mono mt-0.5 ${selectedAccountId === acc.id ? 'text-slate-300' : 'text-slate-500'}`}>
              {acc.bank_name} · {acc.account_number}
            </p>
            <div className="mt-3 pt-2 border-t border-slate-100/20 flex items-center justify-between">
              <span className={`text-[10px] uppercase font-semibold ${selectedAccountId === acc.id ? 'text-slate-300' : 'text-slate-400'}`}>
                Balance
              </span>
              <span className={`text-sm font-bold font-mono ${selectedAccountId === acc.id ? 'text-emerald-400' : 'text-slate-900'}`}>
                {acc.currency} {Number(acc.current_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ))}

        <div className="p-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-bold text-slate-700">Total Liquid Holdings</p>
          <p className="text-xl font-extrabold font-mono text-slate-900 mt-1">
            {currency} {totalBankBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] font-semibold text-amber-700 mt-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            {unmatchedCount} Unreconciled Feed(s)
          </span>
        </div>
      </div>

      {/* Interactive 2-Way Reconciliation Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-4">
        
        {/* Matrix Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>⚡</span> Smart Feed Auto-Matcher &amp; Ledger Reconciliation
            </h2>
            <p className="text-xs text-slate-500">
              Live statement transactions compared side-by-side against internal sales &amp; expense ledgers.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterStatus('unmatched')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                filterStatus === 'unmatched' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Needs Review ({unmatchedCount})
            </button>
            <button
              onClick={() => setFilterStatus('matched')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                filterStatus === 'matched' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Matched ({feeds.length - unmatchedCount})
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                filterStatus === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              All Feeds ({feeds.length})
            </button>
          </div>
        </div>

        {/* Side-by-Side Feed Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Bank Statement Narrative &amp; Ref</th>
                <th className="py-3 px-4 text-right">Inflow / Outflow</th>
                <th className="py-3 px-4">AI Suggested Category</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Quick Reconciliation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredFeeds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    ✓ All transactions in this account are reconciled and matched to the general ledger!
                  </td>
                </tr>
              ) : (
                filteredFeeds.map((feed) => {
                  const isCredit = feed.type === 'credit';
                  return (
                    <tr key={feed.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {feed.transaction_date}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{feed.narrative}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">Ref: {feed.reference}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isCredit ? 'text-emerald-700' : 'text-rose-600'}>
                          {isCredit ? '+' : ''} {currency} {Math.abs(feed.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          {feed.suggested_category || 'General Ledger'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          feed.status === 'matched'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                          {feed.status === 'matched' ? '✓ Reconciled' : '⚠️ Pending Match'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {feed.status === 'matched' ? (
                          <span className="text-[11px] font-bold text-slate-400">Locked in Books</span>
                        ) : (
                          <button
                            onClick={() => handle1ClickMatch(feed.id, feed.suggested_category || 'Revenue', feed.amount)}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-2xs"
                          >
                            ✓ Match &amp; Post Ledger
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Connect Bank / MoMo Account */}
      {showAddAccountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🏦</span> Connect Bank or MoMo Wallet
              </h3>
              <button
                onClick={() => setShowAddAccountModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Shop MTN MoMo or Ecobank Current"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account / MoMo Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0244123456"
                    value={newAccNumber}
                    onChange={(e) => setNewAccNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Type</label>
                  <select
                    value={newAccType}
                    onChange={(e) => {
                      const val = e.target.value as 'bank' | 'momo';
                      setNewAccType(val);
                      setNewAccBank(val === 'momo' ? 'MTN Mobile Money' : 'Ecobank Ghana');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                  >
                    <option value="momo">Mobile Money (MoMo)</option>
                    <option value="bank">Commercial Bank Account</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bank / Network Provider</label>
                <select
                  value={newAccBank}
                  onChange={(e) => setNewAccBank(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                >
                  {newAccType === 'momo' ? (
                    <>
                      <option value="MTN Mobile Money">MTN Mobile Money (Ghana)</option>
                      <option value="Telecel Cash">Telecel Cash</option>
                      <option value="AT Money">AT Money</option>
                    </>
                  ) : (
                    <>
                      <option value="Ecobank Ghana">Ecobank Ghana</option>
                      <option value="GCB Bank">GCB Bank</option>
                      <option value="Stanbic Bank">Stanbic Bank</option>
                      <option value="CalBank">CalBank</option>
                      <option value="Zenith Bank">Zenith Bank</option>
                      <option value="Fidelity Bank">Fidelity Bank</option>
                      <option value="Absa Bank">Absa Bank</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Opening Current Balance ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
                >
                  ✓ Link Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Direct 3rd-Party Payout & Supplier Bill Payment */}
      {showDirectPayModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>💸</span> Issue Outgoing Payment to 3rd Party
                </h3>
                <p className="text-[11px] text-slate-500">
                  Direct transfer from your linked bank/MoMo account with Owner Master PIN authorization.
                </p>
              </div>
              <button
                onClick={() => setShowDirectPayModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecutePayout} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Beneficiary / Supplier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Accra Central Wholesale Ltd or John Doe"
                  value={payRecipientName}
                  onChange={(e) => setPayRecipientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Recipient Account / MoMo #</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0244123456 or 144100..."
                    value={payRecipientNumber}
                    onChange={(e) => setPayRecipientNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Destination Rail / Bank</label>
                  <select
                    value={payBankOrNetwork}
                    onChange={(e) => setPayBankOrNetwork(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                  >
                    <option value="MTN MoMo">MTN Mobile Money</option>
                    <option value="Telecel Cash">Telecel Cash</option>
                    <option value="GCB Bank Instant (GIP)">GCB Bank Instant (GIP)</option>
                    <option value="Ecobank Instant (GIP)">Ecobank Instant (GIP)</option>
                    <option value="Stanbic Instant (GIP)">Stanbic Instant (GIP)</option>
                    <option value="Other Commercial Bank">Other Commercial Bank (ACH/GIP)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 font-mono font-bold text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Reference / Memo</label>
                  <input
                    type="text"
                    placeholder="e.g. Stock Invoice #402"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              {/* SECURITY MAKER-CHECKER PIN */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5">
                <label className="block font-bold text-amber-900 text-xs flex items-center gap-1.5">
                  <span>🔒</span> Security Authorization: Owner Master PIN
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="Enter Owner PIN (e.g. 1234)"
                  value={payMasterPin}
                  onChange={(e) => setPayMasterPin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono font-bold tracking-widest text-center focus:outline-none focus:border-amber-600"
                />
                <p className="text-[10px] text-amber-800">
                  Required to authorize outbound debit and prevent unauthorized employee transfers.
                </p>
              </div>

              {payoutErrorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  {payoutErrorMsg}
                </div>
              )}

              {payoutStatusMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                  {payoutStatusMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDirectPayModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold shadow-sm"
                >
                  🚀 Authorize &amp; Disburse Funds
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
