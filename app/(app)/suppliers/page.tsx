'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Supplier, DebtType } from '@/lib/types';
import { useUserRole } from '@/lib/RoleContext';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedSuppliers,
  setCachedSuppliers,
  addCachedSupplier,
  updateCachedSupplier,
  deleteCachedSupplier,
  updateCachedSupplierBalance,
  isOnline,
} from '@/lib/offlineStore';
import { printSupplierDebtBookPDF, BusinessInfo } from '@/lib/pdfGenerator';

const DEBT_TYPE_LABELS: Record<DebtType, { label: string; icon: string; desc: string }> = {
  inventory: {
    label: 'Inventory / Stock on Credit',
    icon: '📦',
    desc: 'Increases Inventory Asset & Accounts Payable (No Cash change)',
  },
  cash_loan: {
    label: 'Cash Loan / Borrowing',
    icon: '💵',
    desc: 'Increases Cash in Hand & Loan Liability',
  },
  fixed_asset: {
    label: 'Equipment / Asset Financing',
    icon: '🚜',
    desc: 'Increases Fixed Assets & Long-Term Liability',
  },
  service_expense: {
    label: 'Service / Operating Expense on Credit',
    icon: '💡',
    desc: 'Accrued Operating Expense (Rent, Utilities, Logistics)',
  },
};

function parseSuppliersFromTransactions(txs: any[]): Supplier[] {
  const map: Record<string, Supplier> = {};

  txs.forEach((t) => {
    let name = '';
    let isBill = false;
    let isPay = false;

    if (t.vendor && t.vendor.startsWith('Supplier: ')) {
      name = t.vendor.replace('Supplier: ', '').trim();
      isBill = true;
    } else if (t.vendor && (t.vendor.startsWith('Supplier Payment: ') || t.vendor.startsWith('Supplier Settlement: '))) {
      name = t.vendor.replace(/Supplier (Payment|Settlement): /, '').trim();
      isPay = true;
    } else if (t.category && t.category.startsWith('Accounts Payable')) {
      name = (t.vendor || 'General Supplier').replace('Supplier: ', '').trim();
      isBill = t.type === 'short_term_liability' || t.type === 'long_term_liability';
      isPay = t.type === 'operating_expense';
    }

    if (!name) return;

    if (!map[name]) {
      let category = 'Inventory Goods';
      let phone: string | null = null;
      let terms = 'Net 30';
      let debtType: DebtType = 'inventory';
      let dueDate: string | null = null;

      if (t.category && t.category.includes('|')) {
        const parts = t.category.split('|').map((s: string) => s.trim());
        if (parts[1] && !parts[1].includes(':')) category = parts[1];
        parts.forEach((p: string) => {
          if (p.startsWith('phone:')) phone = p.replace('phone:', '').trim() || null;
          if (p.startsWith('terms:')) terms = p.replace('terms:', '').trim() || 'Net 30';
          if (p.startsWith('debtType:')) debtType = (p.replace('debtType:', '').trim() as DebtType) || 'inventory';
          if (p.startsWith('due:') || p.startsWith('dueDate:')) dueDate = p.replace(/^(due|dueDate):/, '').trim() || null;
        });
      }

      if (!dueDate && t.transaction_date) {
        dueDate = t.transaction_date;
      }

      if (t.type === 'long_term_liability' && debtType === 'inventory') debtType = 'fixed_asset';

      map[name] = {
        id: 'sup_' + encodeURIComponent(name),
        business_id: t.business_id,
        name,
        category,
        debt_type: debtType,
        phone,
        payment_terms: terms,
        balance_owed: 0,
        due_date: dueDate,
        created_at: t.created_at || t.transaction_date,
      };
    }

    const amt = Number(t.amount || 0);
    if (isBill || t.type === 'short_term_liability' || t.type === 'long_term_liability') {
      map[name].balance_owed += amt;
    } else if (isPay || t.type === 'operating_expense') {
      map[name].balance_owed = Math.max(0, map[name].balance_owed - amt);
    }
  });

  return Object.values(map);
}

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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCategory, setFormCategory] = useState('Inventory Goods');
  const [formDebtType, setFormDebtType] = useState<DebtType>('inventory');
  const [formStartingDebt, setFormStartingDebt] = useState('0');
  const [formTerms, setFormTerms] = useState('Net 30');
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Bill / Payment form
  const [txAmount, setTxAmount] = useState('');
  const [txRef, setTxRef] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  const { role } = useUserRole();

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setSuppliers([]);
        setLoading(false);
        return;
      }

      const { data: bData } = await supabase
        .from('businesses')
        .select('id, name, currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!bData) {
        setSuppliers([]);
        setLoading(false);
        return;
      }

      setBusinessId(bData.id);
      setCurrency(bData.currency || 'GHS');
      setCachedBusiness({ id: bData.id, name: bData.name, currency: bData.currency || 'GHS' });

      // 1. Instant load from business-isolated local cache
      const cachedSups = getCachedSuppliers(bData.id);
      if (cachedSups && cachedSups.length > 0) {
        setSuppliers(cachedSups);
      }

      // 2. Fetch from Supabase ledger for THIS business
      const { data: txsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('business_id', bData.id)
        .order('transaction_date', { ascending: true });

      if (txsData && txsData.length > 0) {
        const parsedSups = parseSuppliersFromTransactions(txsData);
        if (parsedSups.length > 0) {
          const mergedMap: Record<string, Supplier> = {};
          cachedSups.forEach((s) => { mergedMap[s.name.toLowerCase()] = { ...s, business_id: bData.id }; });
          parsedSups.forEach((s) => {
            const key = s.name.toLowerCase();
            if (mergedMap[key]) {
              mergedMap[key].balance_owed = s.balance_owed;
              if (s.phone) mergedMap[key].phone = s.phone;
              if (s.debt_type) mergedMap[key].debt_type = s.debt_type;
              if (s.payment_terms) mergedMap[key].payment_terms = s.payment_terms;
              if (s.due_date) mergedMap[key].due_date = s.due_date;
              if (s.created_at && !mergedMap[key].created_at) mergedMap[key].created_at = s.created_at;
            } else {
              mergedMap[key] = { ...s, business_id: bData.id };
            }
          });
          const finalSups = Object.values(mergedMap);
          setSuppliers(finalSups);
          setCachedSuppliers(finalSups, bData.id);
        }
      } else {
        setSuppliers(cachedSups);
      }
    } catch (_e) {
      const b = getCachedBusiness();
      if (b) {
        setSuppliers(getCachedSuppliers(b.id));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculations
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
      (s.category && s.category.toLowerCase().includes(search.toLowerCase())) ||
      (s.debt_type && s.debt_type.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterTab === 'owing') return Number(s.balance_owed || 0) > 0;
    if (filterTab === 'settled') return Number(s.balance_owed || 0) === 0;
    return true;
  });

  // Open Edit Modal
  const openEditModal = (s: Supplier) => {
    setSelectedSupplier(s);
    setFormName(s.name);
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormCategory(s.category || 'Inventory Goods');
    setFormDebtType(s.debt_type || 'inventory');
    setFormStartingDebt(String(s.balance_owed || 0));
    setFormTerms(s.payment_terms || 'Net 30');
    setFormDueDate(s.due_date || '');
    setFormNotes(s.notes || '');
    setShowEditModal(true);
  };

  // Open Delete Modal
  const openDeleteModal = (s: Supplier) => {
    setSelectedSupplier(s);
    setShowDeleteModal(true);
  };

  // Handle Add Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showNotify('error', 'Supplier name is required.');
      return;
    }

    setSavingSupplier(true);

    let activeBusinessId = businessId;
    if (!activeBusinessId) {
      const cachedB = getCachedBusiness();
      if (cachedB?.id) {
        activeBusinessId = cachedB.id;
        setBusinessId(cachedB.id);
      }
    }

    const debtVal = Math.max(0, parseFloat(formStartingDebt) || 0);

    const newSup: Supplier = {
      id: 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      business_id: activeBusinessId || 'offline-business-id',
      name: formName.trim(),
      phone: formPhone.trim() || null,
      email: formEmail.trim() || null,
      category: formCategory.trim() || 'Inventory Goods',
      debt_type: formDebtType,
      balance_owed: debtVal,
      payment_terms: formTerms || 'Net 30',
      due_date: formDueDate || null,
      notes: formNotes.trim() || null,
      created_at: new Date().toISOString(),
    };

    const updated = addCachedSupplier(newSup);
    setSuppliers(updated);
    setShowAddModal(false);
    showNotify('success', `Creditor "${newSup.name}" added successfully!`);

    // Sync to Supabase
    if (isOnline() && activeBusinessId && debtVal > 0) {
      try {
        const txType = formDebtType === 'fixed_asset' ? 'long_term_liability' : 'short_term_liability';
        await supabase.from('transactions').insert({
          business_id: activeBusinessId,
          transaction_date: formDueDate || todayStr,
          vendor: `Supplier: ${newSup.name}`,
          type: txType,
          category: `Accounts Payable | ${newSup.category} | phone:${newSup.phone || ''} | terms:${newSup.payment_terms} | debtType:${newSup.debt_type} | due:${newSup.due_date || ''}`,
          amount: debtVal,
          payment_method: 'cash',
        });
      } catch (err) {
        console.warn('Supabase offline notice:', err);
      }
    }

    // Reset
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormCategory('Inventory Goods');
    setFormDebtType('inventory');
    setFormStartingDebt('0');
    setFormTerms('Net 30');
    setFormDueDate('');
    setFormNotes('');
    setSavingSupplier(false);
  };

  // Handle Edit Supplier
  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !formName.trim()) return;

    setSavingSupplier(true);
    const newDebt = Math.max(0, parseFloat(formStartingDebt) || 0);

    const updatedSup: Supplier = {
      ...selectedSupplier,
      name: formName.trim(),
      phone: formPhone.trim() || null,
      email: formEmail.trim() || null,
      category: formCategory.trim() || 'Inventory Goods',
      debt_type: formDebtType,
      balance_owed: newDebt,
      payment_terms: formTerms || 'Net 30',
      due_date: formDueDate || null,
      notes: formNotes.trim() || null,
    };

    const updated = updateCachedSupplier(updatedSup);
    setSuppliers(updated);
    setShowEditModal(false);
    showNotify('success', `Creditor "${updatedSup.name}" updated successfully!`);

    // Update in Supabase if online
    if (isOnline() && businessId) {
      try {
        // Clean previous transactions for this supplier to avoid duplicate entries
        await supabase
          .from('transactions')
          .delete()
          .eq('business_id', businessId)
          .ilike('vendor', `Supplier: ${selectedSupplier.name}`);

        if (newDebt > 0) {
          const txType = formDebtType === 'fixed_asset' ? 'long_term_liability' : 'short_term_liability';
          await supabase.from('transactions').insert({
            business_id: businessId,
            transaction_date: updatedSup.due_date || todayStr,
            vendor: `Supplier: ${updatedSup.name}`,
            type: txType,
            category: `Accounts Payable | ${updatedSup.category} | phone:${updatedSup.phone || ''} | terms:${updatedSup.payment_terms} | debtType:${updatedSup.debt_type} | due:${updatedSup.due_date || ''}`,
            amount: newDebt,
            payment_method: 'cash',
          });
        }
      } catch (_e) {}
    }

    setSavingSupplier(false);
  };

  // Handle Delete Supplier
  const handleDeleteSupplier = async () => {
    if (!selectedSupplier) return;

    const supplierToDelete = selectedSupplier;
    const updated = deleteCachedSupplier(supplierToDelete.id);
    setSuppliers(updated);
    setShowDeleteModal(false);
    showNotify('success', `Creditor "${supplierToDelete.name}" deleted.`);

    // Delete corresponding transactions from Supabase
    if (isOnline() && businessId) {
      try {
        await supabase
          .from('transactions')
          .delete()
          .eq('business_id', businessId)
          .like('vendor', `%${supplierToDelete.name}%`);
      } catch (_e) {}
    }

    setSelectedSupplier(null);
  };

  // Handle Record Bill
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
    showNotify('success', `Added ${currency} ${amt.toLocaleString()} bill for ${selectedSupplier.name}.`);

    if (isOnline() && businessId) {
      try {
        const txType = selectedSupplier.debt_type === 'fixed_asset' ? 'long_term_liability' : 'short_term_liability';
        await supabase.from('transactions').insert({
          business_id: businessId,
          transaction_date: txDate,
          vendor: `Supplier: ${selectedSupplier.name}`,
          type: txType,
          category: `Accounts Payable | ${selectedSupplier.category || 'Inventory'} | Ref:${txRef || 'Bill'} | debtType:${selectedSupplier.debt_type || 'inventory'}`,
          amount: amt,
          payment_method: 'cash',
        });
      } catch (_e) {}
    }

    setTxAmount('');
    setTxRef('');
    setTxNotes('');
  };

  // Handle Record Payment
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
    showNotify('success', `Settled ${currency} ${amt.toLocaleString()} for ${selectedSupplier.name}.`);

    if (isOnline() && businessId) {
      try {
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

  // Export Creditor Debt Book to PDF
  const handleExportStylishPDF = () => {
    if (suppliers.length === 0) {
      showNotify('error', 'No supplier records to export.');
      return;
    }
    const cachedB = getCachedBusiness();
    const bInfo: BusinessInfo = {
      name: cachedB?.name || 'My Business',
      currency: currency || 'GHS',
      taxId: null,
    };
    printSupplierDebtBookPDF(bInfo, suppliers);
  };

  // Export Creditor Debt Book to CSV
  const exportDebtBookCSV = () => {
    if (suppliers.length === 0) {
      showNotify('error', 'No supplier records to export.');
      return;
    }

    let csv = 'Supplier Name,Debt Type,Category,Phone,Email,Payment Terms,Due Date,Outstanding Debt Owed (Liability),Status,Notes\n';
    suppliers.forEach((s) => {
      const status = Number(s.balance_owed || 0) > 0 ? 'Owing' : 'Settled';
      const debtTypeLabel = s.debt_type ? DEBT_TYPE_LABELS[s.debt_type]?.label : 'Inventory Goods';
      csv += `"${s.name}","${debtTypeLabel}","${s.category || ''}","${s.phone || ''}","${s.email || ''}","${s.payment_terms || ''}","${s.due_date || ''}",${s.balance_owed || 0},"${status}","${(s.notes || '').replace(/"/g, '""')}"\n`;
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

  if (role === 'employee') {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-surface2 border border-border rounded-2xl text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 font-black text-2xl flex items-center justify-center mx-auto">
          🛡️
        </div>
        <h2 className="text-lg font-bold text-textPrimary">Confidential Business Liabilities</h2>
        <p className="text-xs text-textSecondary leading-relaxed">
          Creditor payables, supplier credit terms, and short-term debt records are confidential and accessible only to Business Owners and certified Accountants.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-xs font-bold shadow-xl flex items-center gap-2.5 transition-all ${
            notification.type === 'success' ? 'bg-textPrimary text-white' : 'bg-danger text-white'
          }`}
        >
          <span>{notification.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-textPrimary tracking-tight">
              Creditors &amp; Debt Book
            </h1>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-dangerBg text-danger border border-danger/20 uppercase tracking-wider">
              Liabilities Ledger
            </span>
          </div>
          <p className="text-xs text-textSecondary mt-0.5">
            Track suppliers, credit purchases, loans, payment terms, and accounts payable obligations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportStylishPDF}
            className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-accentText hover:opacity-90 transition flex items-center gap-1.5 shadow-sm"
          >
            <span>📄 Export Stylish PDF</span>
          </button>

          <button
            onClick={exportDebtBookCSV}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-textPrimary bg-surface2 border border-border hover:bg-surface1 transition flex items-center gap-1.5 shadow-sm"
          >
            <span>📥 Export AP Ledger</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-textPrimary hover:bg-black/90 transition flex items-center gap-1.5 shadow-sm"
          >
            <span>+ Add Creditor / Supplier</span>
          </button>
        </div>
      </div>

      {/* Short-Term Liability Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-danger/20 bg-dangerBg/50 relative">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-danger">
              Total Liabilities &amp; Payables
            </span>
            <span className="text-base">⚠️</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-danger font-mono mt-1.5">
            {currency} {totalPayables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-textMuted mt-0.5">
            Total Debt Owed on Balance Sheet
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface2">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-textMuted">
              Creditors Owing Debt
            </span>
            <span className="text-base">🏢</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-textPrimary font-mono mt-1.5">
            {owingSuppliersCount} <span className="text-xs font-normal text-textMuted">/ {totalSuppliersCount} Total</span>
          </p>
          <p className="text-[10px] text-textMuted mt-0.5">
            {settledSuppliersCount} suppliers settled
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface2">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-textMuted">
              Overdue Payables
            </span>
            <span className="text-base">⏳</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-danger font-mono mt-1.5">
            {currency} {overduePayables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-textMuted mt-0.5">
            Past agreed payment terms
          </p>
        </div>

        <div className="p-4 rounded-xl border border-success/20 bg-successBg">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-success">
              Settlement Health
            </span>
            <span className="text-base">✓</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-success font-mono mt-1.5">
            {totalPayables === 0 ? '100%' : `${Math.round((settledSuppliersCount / (totalSuppliersCount || 1)) * 100)}%`}
          </p>
          <p className="text-[10px] text-textMuted mt-0.5">
            Creditor settlement ratio
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface1 border border-border w-full sm:w-auto">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
              filterTab === 'all'
                ? 'bg-surface2 text-textPrimary shadow-sm'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            All ({totalSuppliersCount})
          </button>
          <button
            onClick={() => setFilterTab('owing')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
              filterTab === 'owing'
                ? 'bg-surface2 text-danger shadow-sm'
                : 'text-textSecondary hover:text-danger'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>
            Owing ({owingSuppliersCount})
          </button>
          <button
            onClick={() => setFilterTab('settled')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
              filterTab === 'settled'
                ? 'bg-surface2 text-success shadow-sm'
                : 'text-textSecondary hover:text-success'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            Settled ({settledSuppliersCount})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search creditor, phone, debt type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-surface2 border border-border text-textPrimary placeholder-textMuted focus:outline-none focus:border-accent"
          />
          <span className="absolute left-2.5 top-2 text-textMuted text-xs">🔍</span>
        </div>
      </div>

      {/* Supplier Directory List */}
      {loading ? (
        <div className="border border-border rounded-xl p-12 text-center bg-surface2">
          <p className="text-xs text-textMuted animate-pulse">Loading creditors &amp; debt registry...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="border border-border rounded-xl p-12 text-center bg-surface2">
          <span className="text-3xl">🏭</span>
          <h3 className="text-sm font-bold text-textPrimary mt-2">No Creditors Found</h3>
          <p className="text-xs text-textSecondary mt-1 max-w-md mx-auto">
            {search
              ? 'No creditors match your search filter.'
              : 'Add your suppliers, inventory vendors, and loan creditors to track payables and balance sheet liabilities.'}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 rounded-lg text-xs font-bold text-white bg-textPrimary hover:bg-black/90 transition shadow-sm"
          >
            + Add First Creditor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((s) => {
            const isOwing = Number(s.balance_owed || 0) > 0;
            const isOverdue = isOwing && s.due_date && s.due_date < todayStr;
            const debtMeta = s.debt_type ? DEBT_TYPE_LABELS[s.debt_type] : DEBT_TYPE_LABELS.inventory;

            return (
              <div
                key={s.id}
                className={`p-5 rounded-xl border bg-surface2 transition flex flex-col justify-between shadow-sm hover:border-accent/40 ${
                  isOverdue
                    ? 'border-danger/40 bg-dangerBg/30'
                    : isOwing
                    ? 'border-border'
                    : 'border-border'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-textPrimary truncate">{s.name}</h3>
                      </div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface1 text-textSecondary flex items-center gap-1">
                          <span>{debtMeta.icon}</span>
                          <span>{debtMeta.label}</span>
                        </span>
                        <span className="text-[10px] text-textMuted">· {s.category || 'General'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          isOverdue
                            ? 'bg-dangerBg text-danger border border-danger/20'
                            : isOwing
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-successBg text-success border border-success/20'
                        }`}
                      >
                        {isOverdue ? 'Overdue' : isOwing ? 'Owing Debt' : 'Settled ✓'}
                      </span>

                      {/* Edit & Delete Action Icons */}
                      <button
                        onClick={() => openEditModal(s)}
                        title="Edit Creditor"
                        className="p-1 text-textMuted hover:text-textPrimary transition"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => openDeleteModal(s)}
                        title="Delete Creditor"
                        className="p-1 text-textMuted hover:text-danger transition"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-surface1 border border-border mb-3">
                    <span className="text-[9.5px] text-textMuted font-bold uppercase tracking-wider block">
                      Outstanding Payable ({s.debt_type === 'fixed_asset' ? 'Long-Term Liability' : 'Short-Term Liability'})
                    </span>
                    <p
                      className={`text-lg font-bold font-mono mt-0.5 ${
                        isOwing ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {currency}{' '}
                      {Number(s.balance_owed || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="text-xs text-textSecondary space-y-1 mb-3">
                    {s.phone && (
                      <div className="flex items-center justify-between">
                        <span className="text-textMuted">Phone / MoMo:</span>
                        <span className="font-semibold text-textPrimary font-mono">{s.phone}</span>
                      </div>
                    )}
                    {s.payment_terms && (
                      <div className="flex items-center justify-between">
                        <span className="text-textMuted">Terms:</span>
                        <span>{s.payment_terms}</span>
                      </div>
                    )}
                    {s.due_date ? (
                      <div className="flex items-center justify-between">
                        <span className="text-textMuted">Due Date:</span>
                        <span className={isOverdue ? 'text-danger font-bold' : 'font-medium text-textPrimary'}>{s.due_date}</span>
                      </div>
                    ) : s.created_at ? (
                      <div className="flex items-center justify-between">
                        <span className="text-textMuted">Date:</span>
                        <span className="text-textSecondary">{s.created_at.slice(0, 10)}</span>
                      </div>
                    ) : null}
                    {s.notes && (
                      <p className="text-[11px] text-textMuted italic pt-1 border-t border-border/50 truncate">
                        &ldquo;{s.notes}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSelectedSupplier(s);
                        setShowBillModal(true);
                      }}
                      className="py-1.5 px-3 rounded-lg text-xs font-semibold text-textPrimary bg-surface1 hover:bg-border transition text-center"
                    >
                      + Credit Bill
                    </button>

                    <button
                      onClick={() => {
                        setSelectedSupplier(s);
                        setShowPayModal(true);
                      }}
                      className="py-1.5 px-3 rounded-lg text-xs font-semibold text-success bg-successBg hover:bg-green-100 transition text-center"
                    >
                      💸 Settle Debt
                    </button>
                  </div>

                  {s.phone && (
                    <a
                      href={`https://wa.me/${s.phone.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(
                        s.name
                      )},%20regarding%20our%20account%20balance%20of%20${currency}%20${Number(s.balance_owed || 0).toLocaleString()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-1.5 px-3 rounded-lg text-[11px] font-semibold text-textSecondary bg-surface1 hover:text-success transition flex items-center justify-center gap-1"
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

      {/* ======================================================== */}
      {/* MODAL 1: ADD NEW CREDITOR / SUPPLIER                     */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-lg w-full p-6 border border-border shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div>
                <h2 className="text-base font-bold text-textPrimary">Add New Creditor / Supplier</h2>
                <p className="text-xs text-textSecondary mt-0.5">Register vendor or loan debt for your Balance Sheet</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-textMuted hover:text-textPrimary text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-textPrimary mb-1">Creditor / Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fanmilk Ghana Ltd / Commercial Bank Loan"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              {/* Debt Type Selection */}
              <div>
                <label className="block font-semibold text-textPrimary mb-1">
                  Debt Classification &amp; Balance Sheet Impact *
                </label>
                <select
                  value={formDebtType}
                  onChange={(e) => setFormDebtType(e.target.value as DebtType)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs font-semibold focus:outline-none focus:border-accent"
                >
                  <option value="inventory">📦 Inventory Goods on Credit (Adds to Inventory Asset &amp; Accounts Payable)</option>
                  <option value="cash_loan">💵 Cash Loan / Borrowing (Adds to Cash in Hand &amp; Short-Term Liability)</option>
                  <option value="fixed_asset">🚜 Equipment / Machinery Financing (Adds to Fixed Assets &amp; Long-Term Liability)</option>
                  <option value="service_expense">💡 Service / OpEx on Credit (Accrued Utilities, Rent, Logistics)</option>
                </select>
                <p className="text-[10.5px] text-textMuted mt-1">
                  {DEBT_TYPE_LABELS[formDebtType]?.desc}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Phone / WhatsApp / MoMo</label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Dairy, Packaging, Machinery, Loan"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">
                    Starting Debt Owed ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formStartingDebt}
                    onChange={(e) => setFormStartingDebt(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs font-mono focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Payment Terms</label>
                  <select
                    value={formTerms}
                    onChange={(e) => setFormTerms(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
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
                  <label className="block font-semibold text-textPrimary mb-1">Payment Due Date</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="supplier@company.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Notes / Terms</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Warehouse location, delivery schedules, interest rates"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg font-semibold text-textSecondary hover:bg-surface1 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="px-5 py-2 rounded-lg font-bold text-white bg-textPrimary hover:bg-black/90 transition shadow-sm disabled:opacity-50"
                >
                  {savingSupplier ? 'Saving...' : 'Save Creditor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: EDIT CREDITOR / SUPPLIER                        */}
      {/* ======================================================== */}
      {showEditModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-lg w-full p-6 border border-border shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div>
                <h2 className="text-base font-bold text-textPrimary">Edit Creditor / Supplier</h2>
                <p className="text-xs text-textSecondary mt-0.5">Update details, debt classification, and balance</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-textMuted hover:text-textPrimary text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSupplier} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-textPrimary mb-1">Creditor / Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">
                  Debt Classification &amp; Balance Sheet Impact *
                </label>
                <select
                  value={formDebtType}
                  onChange={(e) => setFormDebtType(e.target.value as DebtType)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs font-semibold focus:outline-none focus:border-accent"
                >
                  <option value="inventory">📦 Inventory Goods on Credit (Adds to Inventory Asset &amp; Accounts Payable)</option>
                  <option value="cash_loan">💵 Cash Loan / Borrowing (Adds to Cash in Hand &amp; Short-Term Liability)</option>
                  <option value="fixed_asset">🚜 Equipment / Machinery Financing (Adds to Fixed Assets &amp; Long-Term Liability)</option>
                  <option value="service_expense">💡 Service / OpEx on Credit (Accrued Utilities, Rent, Logistics)</option>
                </select>
                <p className="text-[10.5px] text-textMuted mt-1">
                  {DEBT_TYPE_LABELS[formDebtType]?.desc}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Phone / WhatsApp / MoMo</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Category</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">
                    Current Debt Owed ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formStartingDebt}
                    onChange={(e) => setFormStartingDebt(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs font-mono focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Payment Terms</label>
                  <select
                    value={formTerms}
                    onChange={(e) => setFormTerms(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
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
                  <label className="block font-semibold text-textPrimary mb-1">Payment Due Date</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Email Address</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Notes / Terms</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3.5 py-2 rounded-lg font-semibold text-textSecondary hover:bg-surface1 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="px-5 py-2 rounded-lg font-bold text-white bg-textPrimary hover:bg-black/90 transition shadow-sm disabled:opacity-50"
                >
                  {savingSupplier ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: DELETE CONFIRMATION                             */}
      {/* ======================================================== */}
      {showDeleteModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-sm w-full p-6 border border-border shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-dangerBg text-danger font-bold text-xl flex items-center justify-center mx-auto">
              🗑️
            </div>
            <div>
              <h2 className="text-base font-bold text-textPrimary">Delete Creditor?</h2>
              <p className="text-xs text-textSecondary mt-1">
                Are you sure you want to delete <strong className="text-textPrimary">{selectedSupplier.name}</strong>? Outstanding debt of{' '}
                <strong className="text-danger font-mono">{currency} {Number(selectedSupplier.balance_owed || 0).toLocaleString()}</strong> will be removed from your liabilities.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="py-2 px-4 rounded-lg text-xs font-semibold text-textSecondary bg-surface1 hover:bg-border transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSupplier}
                className="py-2 px-4 rounded-lg text-xs font-bold text-white bg-danger hover:bg-red-700 transition shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: RECORD CREDIT BILL                              */}
      {/* ======================================================== */}
      {showBillModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-md w-full p-6 border border-border shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div>
                <h2 className="text-base font-bold text-textPrimary">Record Credit Purchase / Bill</h2>
                <p className="text-xs text-textSecondary mt-0.5">Increases liability for {selectedSupplier.name}</p>
              </div>
              <button
                onClick={() => setShowBillModal(false)}
                className="text-textMuted hover:text-textPrimary text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordBill} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-textPrimary mb-1">Bill Amount ({currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary font-mono text-sm font-bold focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Invoice / Waybill Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. INV-9842"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Transaction Date</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Particulars / Description</label>
                <input
                  type="text"
                  placeholder="e.g. 50 cartons frozen milk on credit"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
                  className="px-3.5 py-2 rounded-lg font-semibold text-textSecondary hover:bg-surface1 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold text-white bg-textPrimary hover:bg-black/90 transition shadow-sm"
                >
                  Add Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: SETTLE DEBT / RECORD PAYMENT                    */}
      {/* ======================================================== */}
      {showPayModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-md w-full p-6 border border-border shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div>
                <h2 className="text-base font-bold text-textPrimary">Record Debt Settlement</h2>
                <p className="text-xs text-textSecondary mt-0.5">
                  Current debt: <strong className="text-danger font-mono">{currency} {Number(selectedSupplier.balance_owed || 0).toLocaleString()}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-textMuted hover:text-textPrimary text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-textPrimary mb-1">Payment Amount ({currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  max={selectedSupplier.balance_owed || 99999999}
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary font-mono text-sm font-bold focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Receipt / MoMo / Cheque Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. MoMo Ref: 20260821098"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Payment Date</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface0 border border-border text-textPrimary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-3.5 py-2 rounded-lg font-semibold text-textSecondary hover:bg-surface1 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold text-white bg-success hover:bg-green-700 transition shadow-sm"
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
