'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Supplier, SupplierTransaction } from '@/lib/types';
import {
  getCachedBusiness,
  getCachedSuppliers,
  setCachedSuppliers,
  addCachedSupplier,
  updateCachedSupplierBalance,
  isOnline,
} from '@/lib/offlineStore';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'owing' | 'settled'>('all');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCategory, setFormCategory] = useState('Inventory Goods');
  const [formStartingDebt, setFormStartingDebt] = useState('0');
  const [formTerms, setFormTerms] = useState('Net 30');
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Bill / Payment form
  const [txAmount, setTxAmount] = useState('');
  const [txRef, setTxRef] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    // 1. Load from instant local cache
    const cachedB = getCachedBusiness();
    if (cachedB) {
      setBusinessId(cachedB.id);
      setCurrency(cachedB.currency || 'GHS');
    }
    const cachedSups = getCachedSuppliers();
    if (cachedSups && cachedSups.length > 0) {
      setSuppliers(cachedSups);
      setLoading(false);
    }

    // 2. Fetch from Supabase if online
    if (isOnline()) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          const { data: bData } = await supabase
            .from('businesses')
            .select('id, currency')
            .eq('user_id', userId)
            .limit(1)
            .single();

          if (bData) {
            setBusinessId(bData.id);
            setCurrency(bData.currency || 'GHS');

            const { data: supsData, error: supErr } = await supabase
              .from('suppliers')
              .select('*')
              .eq('business_id', bData.id)
              .order('name', { ascending: true });

            if (!supErr && supsData) {
              setSuppliers(supsData);
              setCachedSuppliers(supsData);
            }
          }
        }
      } catch (_e) {}
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculations (Short-term liabilities)
  const totalPayables = suppliers.reduce((sum, s) => sum + Number(s.balance_owed || 0), 0);
  const totalSuppliersCount = suppliers.length;
  const owingSuppliersCount = suppliers.filter((s) => Number(s.balance_owed || 0) > 0).length;
  const settledSuppliersCount = suppliers.filter((s) => Number(s.balance_owed || 0) === 0).length;

  const todayStr = new Date().toISOString().split('T')[0];
  const overduePayables = suppliers
    .filter((s) => Number(s.balance_owed || 0) > 0 && s.due_date && s.due_date < todayStr)
    .reduce((sum, s) => sum + Number(s.balance_owed || 0), 0);

  // Filtered List
  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search)) ||
      (s.category && s.category.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterTab === 'owing') return Number(s.balance_owed || 0) > 0;
    if (filterTab === 'settled') return Number(s.balance_owed || 0) === 0;
    return true;
  });

  // Handle Add Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showNotify('error', 'Supplier name is required.');
      return;
    }

    const newSup: Supplier = {
      id: crypto.randomUUID(),
      business_id: businessId || 'offline-business-id',
      name: formName.trim(),
      phone: formPhone.trim() || null,
      email: formEmail.trim() || null,
      category: formCategory.trim() || 'General Supplier',
      balance_owed: Math.max(0, parseFloat(formStartingDebt) || 0),
      payment_terms: formTerms || 'Net 30',
      due_date: formDueDate || null,
      notes: formNotes.trim() || null,
      created_at: new Date().toISOString(),
    };

    // Save locally immediately
    const updated = addCachedSupplier(newSup);
    setSuppliers(updated);
    setShowAddModal(false);
    showNotify('success', `Supplier "${newSup.name}" saved successfully!`);

    // Sync to Supabase if connected
    if (isOnline() && businessId) {
      try {
        await supabase.from('suppliers').insert({
          id: newSup.id,
          business_id: businessId,
          name: newSup.name,
          phone: newSup.phone,
          email: newSup.email,
          category: newSup.category,
          balance_owed: newSup.balance_owed,
          payment_terms: newSup.payment_terms,
          due_date: newSup.due_date,
          notes: newSup.notes,
        });
      } catch (_e) {}
    }

    // Reset Form
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormCategory('Inventory Goods');
    setFormStartingDebt('0');
    setFormTerms('Net 30');
    setFormDueDate('');
    setFormNotes('');
  };

  // Handle Record Bill (Increases short-term liability)
  const handleRecordBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !txAmount || parseFloat(txAmount) <= 0) {
      showNotify('error', 'Please enter a valid bill amount.');
      return;
    }

    const amt = parseFloat(txAmount);
    const updated = updateCachedSupplierBalance(selectedSupplier.id, amt);
    setSuppliers(updated);
    setShowBillModal(false);
    showNotify('success', `Added GHS ${amt.toLocaleString()} bill for ${selectedSupplier.name}.`);

    if (isOnline() && businessId) {
      try {
        const newBal = (selectedSupplier.balance_owed || 0) + amt;
        await supabase.from('suppliers').update({ balance_owed: newBal }).eq('id', selectedSupplier.id);
        await supabase.from('supplier_transactions').insert({
          business_id: businessId,
          supplier_id: selectedSupplier.id,
          type: 'bill',
          amount: amt,
          reference: txRef || null,
          notes: txNotes || null,
          transaction_date: txDate,
        });
      } catch (_e) {}
    }

    setTxAmount('');
    setTxRef('');
    setTxNotes('');
  };

  // Handle Record Payment (Decreases short-term liability)
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !txAmount || parseFloat(txAmount) <= 0) {
      showNotify('error', 'Please enter a valid payment amount.');
      return;
    }

    const amt = parseFloat(txAmount);
    const updated = updateCachedSupplierBalance(selectedSupplier.id, -amt);
    setSuppliers(updated);
    setShowPayModal(false);
    showNotify('success', `Recorded GHS ${amt.toLocaleString()} debt settlement for ${selectedSupplier.name}.`);

    if (isOnline() && businessId) {
      try {
        const newBal = Math.max(0, (selectedSupplier.balance_owed || 0) - amt);
        await supabase.from('suppliers').update({ balance_owed: newBal }).eq('id', selectedSupplier.id);
        await supabase.from('supplier_transactions').insert({
          business_id: businessId,
          supplier_id: selectedSupplier.id,
          type: 'payment',
          amount: amt,
          reference: txRef || null,
          notes: txNotes || null,
          transaction_date: txDate,
        });
        // Also log as an operating cashbook expense payment
        await supabase.from('transactions').insert({
          business_id: businessId,
          transaction_date: txDate,
          vendor: `Supplier Payment: ${selectedSupplier.name}`,
          type: 'operating_expense',
          category: 'Supplier Payables',
          amount: amt,
          payment_method: 'cash',
        });
      } catch (_e) {}
    }

    setTxAmount('');
    setTxRef('');
    setTxNotes('');
  };

  // Export Creditor Debt Book to CSV / Excel
  const exportDebtBookCSV = () => {
    if (suppliers.length === 0) {
      showNotify('error', 'No supplier records to export.');
      return;
    }

    let csv = 'Supplier Name,Category,Phone,Email,Payment Terms,Due Date,Outstanding Debt Owed (Short-Term Liability),Status,Notes\n';
    suppliers.forEach((s) => {
      const status = Number(s.balance_owed || 0) > 0 ? 'Owing' : 'Settled';
      csv += `"${s.name}","${s.category || ''}","${s.phone || ''}","${s.email || ''}","${s.payment_terms || ''}","${s.due_date || ''}",${s.balance_owed || 0},"${status}","${(s.notes || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AMS_Creditors_Accounts_Payable_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotify('success', 'Accounts Payable Debt Book exported successfully!');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-3 transition-all transform animate-bounce ${
            notification.type === 'success'
              ? 'bg-emerald-500 text-black shadow-emerald-500/30'
              : 'bg-red-500 text-white shadow-red-500/30'
          }`}
        >
          <span>{notification.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              🏭 Creditor Debt Book
            </h1>
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 uppercase tracking-wider">
              Short-Term Liabilities
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track suppliers, purchase bills on credit, payment due dates, and accounts payable obligations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportDebtBookCSV}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition flex items-center gap-2"
          >
            <span>📥 Export AP Ledger</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-black bg-brandCyan hover:bg-brandCyanGlow shadow-lg shadow-brandCyan/20 transition flex items-center gap-2"
          >
            <span>+ Add Supplier</span>
          </button>
        </div>
      </div>

      {/* Short-Term Liability Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-red-500/30 bg-red-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
              Total Accounts Payable
            </span>
            <span className="text-xl">⚠️</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400 font-mono mt-2">
            {currency} {totalPayables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Treated as Short-Term Liability on Balance Sheet
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Suppliers Owing Debt
            </span>
            <span className="text-xl">🏢</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono mt-2">
            {owingSuppliersCount} <span className="text-xs font-normal text-slate-500">/ {totalSuppliersCount} Total</span>
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {settledSuppliersCount} suppliers fully settled
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Overdue Payables
            </span>
            <span className="text-xl">⏳</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 font-mono mt-2">
            {currency} {overduePayables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Bills past agreed payment terms
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Working Capital Protection
            </span>
            <span className="text-xl">🛡️</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-2">
            {totalPayables === 0 ? '100%' : `${Math.round((settledSuppliersCount / (totalSuppliersCount || 1)) * 100)}%`}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Supplier settlement health ratio
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 w-full sm:w-auto">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'all'
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({totalSuppliersCount})
          </button>
          <button
            onClick={() => setFilterTab('owing')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              filterTab === 'owing'
                ? 'bg-red-500/20 text-red-600 dark:text-red-400 shadow-sm'
                : 'text-slate-500 hover:text-red-500'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Owing ({owingSuppliersCount})
          </button>
          <button
            onClick={() => setFilterTab('settled')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              filterTab === 'settled'
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 hover:text-emerald-500'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Settled ({settledSuppliersCount})
          </button>
        </div>

        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search supplier, phone, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brandCyan"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
        </div>
      </div>

      {/* Supplier Directory List */}
      {loading ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-200 dark:border-white/10">
          <p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Loading suppliers & debt registry...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-200 dark:border-white/10">
          <span className="text-4xl">🏭</span>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mt-3">No Suppliers Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {search
              ? 'No suppliers match your search filter.'
              : 'Add your vendors and suppliers to track invoices, credit purchases, and short-term debt.'}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-5 px-5 py-2.5 rounded-xl text-xs font-bold text-black bg-brandCyan hover:bg-brandCyanGlow transition shadow-lg shadow-brandCyan/20"
          >
            + Add First Supplier
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSuppliers.map((s) => {
            const isOwing = Number(s.balance_owed || 0) > 0;
            const isOverdue = isOwing && s.due_date && s.due_date < todayStr;

            return (
              <div
                key={s.id}
                className={`glass-panel p-6 rounded-3xl border transition flex flex-col justify-between shadow-lg ${
                  isOverdue
                    ? 'border-red-500/50 bg-red-500/5'
                    : isOwing
                    ? 'border-amber-500/30'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{s.name}</h3>
                      <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400">
                        {s.category || 'General Supplier'}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        isOverdue
                          ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                          : isOwing
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {isOverdue ? 'Overdue' : isOwing ? 'Owing Debt' : 'Settled'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-200/60 dark:border-white/5 mb-4">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">
                      Outstanding Payable (Liability)
                    </span>
                    <p
                      className={`text-xl font-black font-mono ${
                        isOwing ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {currency}{' '}
                      {Number(s.balance_owed || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 mb-4 font-mono">
                    {s.phone && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans">Phone / MoMo:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{s.phone}</span>
                      </div>
                    )}
                    {s.payment_terms && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans">Terms:</span>
                        <span>{s.payment_terms}</span>
                      </div>
                    )}
                    {s.due_date && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans">Due Date:</span>
                        <span className={isOverdue ? 'text-red-500 font-bold' : ''}>{s.due_date}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSelectedSupplier(s);
                        setShowBillModal(true);
                      }}
                      className="py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition text-center"
                    >
                      + Credit Bill
                    </button>

                    <button
                      onClick={() => {
                        setSelectedSupplier(s);
                        setShowPayModal(true);
                      }}
                      className="py-2 px-3 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 transition text-center"
                    >
                      💸 Settle Debt
                    </button>
                  </div>

                  {s.phone && (
                    <a
                      href={`https://wa.me/${s.phone.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(
                        s.name
                      )},%20regarding%20our%20account%20balance%20of%20GHS%20${Number(s.balance_owed || 0).toLocaleString()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-500 transition flex items-center justify-center gap-1.5"
                    >
                      <span>💬 WhatsApp Supplier</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT SUPPLIER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-white/10 max-w-lg w-full bg-white dark:bg-obsidian shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Add New Supplier / Creditor</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Supplier / Vendor Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Multi-Pro Distribution Ghana Ltd"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                  >
                    <option value="Inventory Goods">Inventory Goods / Stock</option>
                    <option value="Packaging & Materials">Packaging & Materials</option>
                    <option value="Logistics & Freight">Logistics & Freight</option>
                    <option value="Utilities & Rent">Utilities & Rent</option>
                    <option value="Professional Services">Professional Services</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Starting Debt Owed ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formStartingDebt}
                    onChange={(e) => setFormStartingDebt(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Terms</label>
                  <select
                    value={formTerms}
                    onChange={(e) => setFormTerms(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                  >
                    <option value="Net 7">Net 7 Days</option>
                    <option value="Net 14">Net 14 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="Net 60">Net 60 Days</option>
                    <option value="COD">Cash on Delivery (COD)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Due Date</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="supplier@company.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Notes / Location / Terms</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Warehouse near Tema Harbour, deliver every Thursday"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-extrabold text-black bg-brandCyan hover:bg-brandCyanGlow transition shadow-lg shadow-brandCyan/20"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD CREDIT BILL */}
      {showBillModal && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-white/10 max-w-md w-full bg-white dark:bg-obsidian shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Record Credit Purchase / Bill</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Increases Short-Term Liability for {selectedSupplier.name}</p>
              </div>
              <button
                onClick={() => setShowBillModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordBill} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bill Amount ({currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono text-base font-black focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Invoice / Waybill Reference #</label>
                <input
                  type="text"
                  placeholder="e.g. INV-9842"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Transaction Date</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Particulars / Line Items</label>
                <input
                  type="text"
                  placeholder="e.g. 50 cartons cooking oil on credit"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-extrabold text-black bg-brandCyan hover:bg-brandCyanGlow transition shadow-lg shadow-brandCyan/20"
                >
                  Add Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SETTLE DEBT / RECORD PAYMENT */}
      {showPayModal && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-white/10 max-w-md w-full bg-white dark:bg-obsidian shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Record Debt Settlement Payment</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Current debt owed: <strong className="text-red-500 font-mono">{currency} {Number(selectedSupplier.balance_owed || 0).toLocaleString()}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Amount ({currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  max={selectedSupplier.balance_owed || 99999999}
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono text-base font-black focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Receipt / MoMo / Cheque Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. MoMo Ref: 20260821098"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brandCyan"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-extrabold text-black bg-emerald-500 hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20"
                >
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
