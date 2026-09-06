'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Transaction, TransactionType, TRANSACTION_TYPE_OPTIONS } from '@/lib/types';
import { printBookkeepingLedgerPDF } from '@/lib/pdfGenerator';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedTransactions,
  setCachedTransactions,
  saveOfflineTransaction,
  resolveActiveBusiness,
} from '@/lib/offlineStore';
import { logAuditEvent } from '@/lib/auditLogger';

interface Row extends Partial<Transaction> {
  _localId: string;
  _saving?: boolean;
  _dirty?: boolean;
  _depreciationPercent?: string;
  _rawAmount?: string;
}

const CURRENT_ASSET_OPTIONS = [
  { label: 'Cash on Hand', value: 'Cash' },
  { label: 'Bank / MoMo', value: 'Bank' },
  { label: 'Debtors (Accounts Receivable)', value: 'Debtors' },
  { label: 'Prepaid Expenses', value: 'Prepaid Expenses' },
  { label: 'Other Current Assets', value: 'Other Current Assets' },
];

function emptyRow(): Row {
  return {
    _localId: crypto.randomUUID(),
    transaction_date: new Date().toISOString().slice(0, 10),
    vendor: '',
    type: 'operating_expense',
    category: '',
    amount: 0,
    _rawAmount: '',
    depreciation_rate: null,
    _depreciationPercent: '',
    payment_method: 'cash',
  };
}

export default function BookkeepingPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [rows, setRows] = useState<Row[]>([]);
  const [newDraftRow, setNewDraftRow] = useState<Row>(emptyRow());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  // Non-blocking transaction deletion confirmation modal state
  const [transactionToDelete, setTransactionToDelete] = useState<Row | null>(null);

  const loadData = useCallback(async () => {
    // 1. Instantly load from local cache
    const cachedBiz = getCachedBusiness();
    const bid = cachedBiz?.id || 'default_biz';
    setBusinessId(bid);
    if (cachedBiz) {
      setBusinessName(cachedBiz.name || 'My Business');
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedTxs = getCachedTransactions(bid);
    if (cachedTxs.length > 0) {
      const loaded: Row[] = cachedTxs.map((t: any) => ({
        ...t,
        _localId: t.id,
        _rawAmount: t.amount != null ? String(t.amount) : '',
        _depreciationPercent: t.depreciation_rate != null ? String(t.depreciation_rate * 100) : '',
      }));
      setRows(loaded);
    }
    setLoading(false);

    try {
      const b = await resolveActiveBusiness();
      if (!b) return;

      setBusinessId(b.id);
      setBusinessName(b.name || 'My Business');
      setCurrency(b.currency || 'GHS');

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('business_id', b.id)
        .order('transaction_date', { ascending: false });

      if (error) {
        setErrorMsg(error.message);
      } else if (data && data.length > 0) {
        const txMap = new Map();
        cachedTxs.forEach((t: any) => txMap.set(t.id, t));
        data.forEach((t: any) => txMap.set(t.id, t));
        const allTxs = Array.from(txMap.values());

        const loadedRows: Row[] = allTxs.map((t: any) => ({
          ...t,
          _localId: t.id,
          _rawAmount: t.amount != null ? String(t.amount) : '',
          _depreciationPercent: t.depreciation_rate != null ? String(t.depreciation_rate * 100) : '',
        }));

        setRows(loadedRows);
        setCachedTransactions(allTxs, b.id);
      } else if (cachedTxs.length > 0) {
        // If Supabase returned empty but local cache has transactions, re-push in background
        const chunk = cachedTxs.map((t: any) => ({
          business_id: b.id,
          transaction_date: t.transaction_date,
          vendor: t.vendor,
          type: t.type,
          category: t.category,
          amount: t.amount,
          payment_method: t.payment_method || 'cash',
          depreciation_rate: t.depreciation_rate || null,
        }));
        supabase.from('transactions').insert(chunk).then(() => {});
      }
    } catch (_e) {
      // offline mode operates on cache
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('ams:transactions-updated', handleUpdate);
    return () => {
      window.removeEventListener('ams:transactions-updated', handleUpdate);
    };
  }, [loadData]);

  const updateRow = (localId: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r._localId === localId ? { ...r, ...patch, _dirty: true } : r))
    );
  };

  const updateDraftRow = (patch: Partial<Row>) => {
    setNewDraftRow((prev) => ({ ...prev, ...patch, _dirty: true }));
  };

  const saveExistingRow = async (row: Row) => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (!row.id || !row.vendor || !row.amount || row.amount <= 0) return;

    let depreciationRate: number | null = null;
    if (row.type === 'fixed_asset' && row._depreciationPercent && row._depreciationPercent.trim()) {
      const parsed = parseFloat(row._depreciationPercent);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        depreciationRate = parsed / 100;
      }
    }

    updateRow(row._localId, { _saving: true });
    try {
      await supabase
        .from('transactions')
        .update({
          transaction_date: row.transaction_date,
          vendor: row.vendor.trim(),
          type: row.type,
          category: row.category?.trim() || null,
          amount: row.amount,
          depreciation_rate: depreciationRate,
          payment_method: row.payment_method ?? 'cash',
        })
        .eq('id', row.id);
    } catch (_e) {}

    // Update local cache
    try {
      const cached = getCachedTransactions(activeBid);
      const idx = cached.findIndex((t: any) => t.id === row.id);
      if (idx >= 0) {
        cached[idx] = {
          ...cached[idx],
          transaction_date: row.transaction_date,
          vendor: row.vendor.trim(),
          type: row.type,
          category: row.category?.trim() || null,
          amount: row.amount,
          depreciation_rate: depreciationRate,
          payment_method: row.payment_method ?? 'cash',
        };
        setCachedTransactions(cached, activeBid);
      }
    } catch (_e) {}

    updateRow(row._localId, { _saving: false, _dirty: false });
    window.dispatchEvent(new Event('ams:transactions-updated'));
  };

  const saveNewDraft = async () => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (!newDraftRow.vendor || !newDraftRow.vendor.trim() || !newDraftRow.amount || newDraftRow.amount <= 0) {
      return; // Do not jump row until vendor and amount are both filled
    }

    let depreciationRate: number | null = null;
    if (newDraftRow.type === 'fixed_asset' && newDraftRow._depreciationPercent && newDraftRow._depreciationPercent.trim()) {
      const parsed = parseFloat(newDraftRow._depreciationPercent);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        depreciationRate = parsed / 100;
      }
    }

    setNewDraftRow((prev) => ({ ...prev, _saving: true }));

    let savedItem: any = null;
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          business_id: activeBid,
          transaction_date: newDraftRow.transaction_date,
          vendor: newDraftRow.vendor.trim(),
          type: newDraftRow.type,
          category: newDraftRow.category?.trim() || null,
          amount: newDraftRow.amount,
          depreciation_rate: depreciationRate,
          payment_method: newDraftRow.payment_method ?? 'cash',
        })
        .select()
        .single();

      if (!error && data) {
        savedItem = data;
        const currentCached = getCachedTransactions(activeBid);
        setCachedTransactions([savedItem, ...currentCached], activeBid);
      }
    } catch (_e) {}

    if (!savedItem) {
      savedItem = saveOfflineTransaction({
        business_id: activeBid,
        transaction_date: newDraftRow.transaction_date || new Date().toISOString().slice(0, 10),
        vendor: newDraftRow.vendor.trim(),
        type: newDraftRow.type || 'operating_expense',
        category: newDraftRow.category?.trim() || 'General',
        amount: newDraftRow.amount,
        depreciation_rate: depreciationRate,
        payment_method: newDraftRow.payment_method ?? 'cash',
      });
    }

    const savedRow: Row = {
      ...savedItem,
      _localId: savedItem.id,
      _depreciationPercent: savedItem.depreciation_rate != null ? String(savedItem.depreciation_rate * 100) : '',
    };

    // Log to immutable Audit Trail
    logAuditEvent({
      businessId: activeBid,
      actionType: 'CREATE',
      entityType: 'transaction',
      entityId: savedItem.id,
      entityName: savedItem.vendor,
      description: `Recorded ${savedItem.type} "${savedItem.vendor}" (${currency} ${Number(savedItem.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}) via ${savedItem.payment_method === 'bank' ? 'Bank / MoMo' : 'Cash'}`,
      newValue: savedItem,
    });

    setRows((prev) => [savedRow, ...prev]);
    setNewDraftRow(emptyRow()); // Clean top row for the next entry
    window.dispatchEvent(new Event('ams:transactions-updated'));
  };

  const executeDeleteRow = async (row: Row) => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (row.id) {
      try {
        await supabase.from('transactions').delete().eq('id', row.id);
      } catch (_e) {}

      // Log to audit trail
      logAuditEvent({
        businessId: activeBid,
        actionType: 'DELETE',
        entityType: 'transaction',
        entityId: row.id,
        entityName: row.vendor,
        description: `Deleted transaction "${row.vendor}" (${currency} ${row.amount})`,
        oldValue: row,
      });

      // Update local storage transaction cache
      try {
        const cached = getCachedTransactions(activeBid);
        const filtered = cached.filter((t: any) => t.id !== row.id);
        setCachedTransactions(filtered, activeBid);
      } catch (_e) {}
    }
    setRows((prev) => prev.filter((r) => r._localId !== row._localId && r.id !== row.id));
    window.dispatchEvent(new Event('ams:transactions-updated'));
  };

  const deleteRow = async (row: Row) => {
    if (row.id) {
      setTransactionToDelete(row);
    } else {
      setRows((prev) => prev.filter((r) => r._localId !== row._localId));
    }
  };

  const handleDeleteAll = async () => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (rows.length === 0) return;
    const confirmPrompt = prompt(
      `⚠️ CAUTION: Are you sure you want to delete ALL ${rows.length} transactions from the ledger?\n\nThis will clear the active ledger but the deletion will be permanently recorded in the Audit Trail.\n\nType "DELETE ALL" to confirm:`
    );
    if (confirmPrompt !== 'DELETE ALL') return;

    try {
      await supabase.from('transactions').delete().eq('business_id', activeBid);
    } catch (_e) {}

    // Preserve all deleted entries in the Audit Trail
    logAuditEvent({
      businessId: activeBid,
      actionType: 'DELETE',
      entityType: 'transaction',
      entityId: 'bulk_ledger_clear',
      entityName: 'All Transactions',
      description: `Bulk deleted all ${rows.length} transactions from the bookkeeping ledger.`,
      metadata: { deletedCount: rows.length, deletedTransactions: rows },
    });

    setCachedTransactions([], activeBid);
    setRows([]);
    window.dispatchEvent(new Event('ams:transactions-updated'));
    showNotify('success', `Successfully deleted all transactions. The deletion log is preserved in the Audit Trail.`);
  };

  // Real transactions list (excluding top empty template row)
  const realRows = useMemo(() => rows.filter((r) => r.id), [rows]);

  // Financial Inflow / Outflow Summary
  const metrics = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;

    realRows.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.type === 'revenue' || r.type === 'deposit') {
        totalInflow += amt;
      } else {
        totalOutflow += amt;
      }
    });

    const netPeriod = totalInflow - totalOutflow;
    return { totalInflow, totalOutflow, netPeriod };
  }, [realRows]);

  // Filtered rows for table display
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        (r.vendor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.category || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (paymentFilter !== 'all' && r.payment_method !== paymentFilter) return false;
      return true;
    });
  }, [rows, searchTerm, typeFilter, paymentFilter]);

  // CSV Ledger Export
  const exportLedgerCSV = () => {
    if (realRows.length === 0) {
      showNotify('error', 'No ledger transactions to export.');
      return;
    }

    let csv = 'Date,Vendor / Description,Accounting Type,Category,Amount,Payment Method,Depreciation Rate,Document URL\n';
    realRows.forEach((r) => {
      const depr = r.depreciation_rate != null ? `${(r.depreciation_rate * 100).toFixed(0)}%` : '—';
      csv += `"${r.transaction_date}","${(r.vendor || '').replace(/"/g, '""')}","${r.type}","${(r.category || '').replace(/"/g, '""')}",${Number(r.amount || 0).toFixed(2)},"${r.payment_method || 'cash'}","${depr}","${r.document_url || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `general_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <p className="text-sm text-textSecondary">Loading general ledger…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div className="max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-textPrimary">Bookkeeping &amp; General Ledger</h1>
          <p className="text-sm text-textSecondary">
            Review, edit, and record daily financial transactions. Changes save automatically.
          </p>
        </div>

      {notification && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs mb-4 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-4 font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}
        <div className="flex items-center gap-2">
          {realRows.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-danger/30 text-danger bg-dangerBg/40 hover:bg-dangerBg transition text-xs font-bold shadow-xs"
              title="Delete all transactions (Audit Log preserved)"
            >
              🗑️ Delete All ({realRows.length})
            </button>
          )}
          <button
            onClick={() =>
              printBookkeepingLedgerPDF(
                realRows.map((r) => ({
                  transaction_date: r.transaction_date || new Date().toISOString().slice(0, 10),
                  vendor: r.vendor || 'General Transaction',
                  type: r.type || 'operating_expense',
                  category: r.category || '',
                  amount: r.amount || 0,
                  payment_method: r.payment_method || 'cash',
                })),
                { name: businessName, currency }
              )
            }
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-textPrimary text-white hover:opacity-90 transition text-sm font-bold shadow-xs"
          >
            📄 Export Stylish PDF
          </button>
          <button
            onClick={exportLedgerCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-surface2 text-sm text-textPrimary hover:bg-surface1 transition font-medium"
          >
            📥 CSV
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      {/* Ledger Valuation Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Inflows &amp; Capital</p>
          <p className="text-xl font-bold text-success">
            +{currency} {metrics.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Sales revenue &amp; owner deposits</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Outflows &amp; Costs</p>
          <p className="text-xl font-bold text-danger">
            -{currency} {metrics.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">COGS, expenses &amp; asset purchases</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Net Cash Movement</p>
          <p className={`text-xl font-bold ${metrics.netPeriod >= 0 ? 'text-success' : 'text-danger'}`}>
            {currency} {metrics.netPeriod.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{realRows.length} total ledger entries</p>
        </div>
      </div>

      {/* Search & Category Filter Chips */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'all' ? 'bg-accentText text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            All Types ({realRows.length})
          </button>
          <button
            onClick={() => setTypeFilter('revenue')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'revenue' ? 'bg-success text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Revenue
          </button>
          <button
            onClick={() => setTypeFilter('deposit')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'deposit' ? 'bg-emerald-600 text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Deposits
          </button>
          <button
            onClick={() => setTypeFilter('cost_of_goods')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'cost_of_goods' ? 'bg-textPrimary text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Cost of Goods
          </button>
          <button
            onClick={() => setTypeFilter('operating_expense')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'operating_expense' ? 'bg-danger text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            OpEx / Expenses
          </button>
          <button
            onClick={() => setTypeFilter('current_asset')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'current_asset' ? 'bg-accentText text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Current Assets
          </button>
          <button
            onClick={() => setTypeFilter('fixed_asset')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              typeFilter === 'fixed_asset' ? 'bg-accentText text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Fixed Assets
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface2 text-textSecondary"
          >
            <option value="all">All Payment Channels</option>
            <option value="cash">Cash Only</option>
            <option value="bank">Bank / MoMo Only</option>
          </select>

          <div className="relative w-full sm:w-56">
            <input
              type="text"
              placeholder="Search vendor or category…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface2 focus:outline-none focus:border-accent"
            />
            <span className="absolute left-2.5 top-2 text-textMuted text-xs">🔍</span>
          </div>
        </div>
      </div>

      {/* Spreadsheet Fast-Entry Ledger Table */}
      <div className="border border-border rounded-lg overflow-x-auto bg-surface2 shadow-sm">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-surface1 text-left text-textSecondary border-b border-border">
              <th className="px-3 py-2.5 font-medium w-32">Date</th>
              <th className="px-3 py-2.5 font-medium">Vendor / Description</th>
              <th className="px-3 py-2.5 font-medium w-40">Accounting Type</th>
              <th className="px-3 py-2.5 font-medium w-36">Category</th>
              <th className="px-3 py-2.5 font-medium text-right w-28">Amount ({currency})</th>
              <th className="px-3 py-2.5 font-medium w-24">Method</th>
              <th className="px-3 py-2.5 font-medium text-right w-24">Depr. %</th>
              <th className="px-3 py-2.5 w-16 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. DEDICATED TOP ENTRY ROW - Stays fixed in place while typing */}
            <tr className="border-b-2 border-accent/40 bg-accentBg/25">
              {/* Date */}
              <td className="px-2 py-2">
                <input
                  type="date"
                  value={newDraftRow.transaction_date ?? ''}
                  onChange={(e) => updateDraftRow({ transaction_date: e.target.value })}
                  className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus:bg-surface1 font-medium text-textPrimary border border-border/70"
                />
              </td>

              {/* Vendor */}
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-accentText shrink-0">+ Add:</span>
                  <input
                    type="text"
                    value={newDraftRow.vendor ?? ''}
                    onChange={(e) => updateDraftRow({ vendor: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraft(); }}
                    placeholder="e.g. Fuel, Shoprite, Electricity, Client Payment"
                    className="w-full px-2.5 py-1.5 rounded focus:outline-none focus:bg-surface1 text-xs font-semibold text-textPrimary border border-accent/40 bg-surface1"
                  />
                </div>
              </td>

              {/* Type */}
              <td className="px-2 py-2">
                <select
                  value={newDraftRow.type ?? 'operating_expense'}
                  onChange={(e) => {
                    const newType = e.target.value as TransactionType;
                    const defaultCat = newType === 'current_asset' ? 'Cash' : '';
                    const defaultMethod = newType === 'current_asset' ? 'cash' : newDraftRow.payment_method;
                    updateDraftRow({ type: newType, category: defaultCat, payment_method: defaultMethod });
                  }}
                  className="w-full px-2 py-1.5 rounded text-xs border border-border bg-surface1 focus:outline-none font-medium text-textPrimary"
                >
                  {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>

              {/* Category */}
              <td className="px-2 py-2">
                {newDraftRow.type === 'current_asset' ? (
                  <select
                    value={newDraftRow.category || 'Cash'}
                    onChange={(e) => {
                      const selectedCat = e.target.value;
                      let updatedMethod = newDraftRow.payment_method;
                      if (selectedCat === 'Bank') updatedMethod = 'bank';
                      if (selectedCat === 'Cash') updatedMethod = 'cash';
                      updateDraftRow({ category: selectedCat, payment_method: updatedMethod });
                    }}
                    className="w-full px-2 py-1.5 rounded text-xs border border-border bg-surface1 focus:outline-none font-medium text-textPrimary"
                  >
                    {CURRENT_ASSET_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newDraftRow.category ?? ''}
                    onChange={(e) => updateDraftRow({ category: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraft(); }}
                    placeholder="e.g. Fuel, Rent, General"
                    className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus:bg-surface1 text-textPrimary border border-border/70"
                  />
                )}
              </td>

              {/* Amount */}
              <td className="px-2 py-2 text-right">
                <input
                  type="text"
                  inputMode="decimal"
                  value={newDraftRow._rawAmount ?? (newDraftRow.amount ? String(newDraftRow.amount) : '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    const parsed = parseFloat(val);
                    updateDraftRow({
                      _rawAmount: val,
                      amount: !isNaN(parsed) && parsed >= 0 ? parsed : 0,
                    });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraft(); }}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-surface1 text-xs font-bold text-textPrimary border border-accent/40 bg-surface1"
                />
              </td>

              {/* Method */}
              <td className="px-2 py-2">
                <select
                  value={newDraftRow.payment_method ?? 'cash'}
                  onChange={(e) => updateDraftRow({ payment_method: e.target.value as 'cash' | 'bank' })}
                  className="w-full px-2 py-1.5 rounded text-xs border border-border bg-surface1 focus:outline-none capitalize font-medium text-textPrimary"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank / MoMo</option>
                </select>
              </td>

              {/* Depreciation Rate */}
              <td className="px-2 py-2 text-right">
                {newDraftRow.type === 'fixed_asset' ? (
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="e.g. 20"
                    value={newDraftRow._depreciationPercent ?? ''}
                    onChange={(e) => updateDraftRow({ _depreciationPercent: e.target.value })}
                    className="w-full px-2 py-1.5 rounded text-right text-xs focus:outline-none focus:bg-surface1 border border-border/70"
                  />
                ) : (
                  <span className="text-textMuted text-xs">—</span>
                )}
              </td>

              {/* Save Button */}
              <td className="px-2 py-2 text-center">
                <button
                  onClick={saveNewDraft}
                  disabled={!newDraftRow.vendor || !newDraftRow.amount || newDraftRow.amount <= 0 || newDraftRow._saving}
                  className="px-2.5 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                >
                  {newDraftRow._saving ? '...' : '+ Save'}
                </button>
              </td>
            </tr>

            {/* 2. RECORDED LEDGER ROWS */}
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-textMuted text-sm">
                  {searchTerm ? `No transactions matching "${searchTerm}"` : 'No transactions recorded yet.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isFixedAsset = row.type === 'fixed_asset';
                const isRevenue = row.type === 'revenue';

                return (
                  <tr
                    key={row._localId}
                    className="border-t border-border hover:bg-surface1/50 transition"
                  >
                    {/* Date & Time */}
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={row.transaction_date ?? ''}
                        onChange={(e) => updateRow(row._localId, { transaction_date: e.target.value })}
                        onBlur={() => saveExistingRow(row)}
                        className="w-full px-2 py-1 rounded text-xs focus:outline-none focus:bg-accentBg font-medium text-textPrimary"
                      />
                      {row.created_at && (
                        <span className="block text-[10.5px] text-textMuted px-1 mt-0.5 font-mono">
                          🕒 {new Date(row.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </span>
                      )}
                    </td>

                    {/* Vendor */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.vendor ?? ''}
                        onChange={(e) => updateRow(row._localId, { vendor: e.target.value })}
                        onBlur={() => saveExistingRow(row)}
                        placeholder="Vendor name"
                        className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-xs font-medium text-textPrimary"
                      />
                    </td>

                    {/* Type */}
                    <td className="px-2 py-1.5">
                      <select
                        value={row.type ?? 'operating_expense'}
                        onChange={(e) => {
                          const newType = e.target.value as TransactionType;
                          const defaultCat = newType === 'current_asset' ? 'Cash' : (row.category || newType);
                          const defaultMethod = newType === 'current_asset' && defaultCat === 'Bank' ? 'bank' : (row.payment_method || 'cash');
                          updateRow(row._localId, {
                            type: newType,
                            category: defaultCat,
                            payment_method: defaultMethod,
                          });
                          saveExistingRow({ ...row, type: newType, category: defaultCat, payment_method: defaultMethod });
                        }}
                        className="w-full px-2 py-1.5 rounded text-xs border border-border bg-surface2 focus:outline-none font-medium text-textPrimary"
                      >
                        {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Category */}
                    <td className="px-2 py-1.5">
                      {row.type === 'current_asset' ? (
                        <select
                          value={row.category || 'Cash'}
                          onChange={(e) => {
                            const selectedCat = e.target.value;
                            let updatedMethod = row.payment_method;
                            if (selectedCat === 'Bank') updatedMethod = 'bank';
                            if (selectedCat === 'Cash') updatedMethod = 'cash';
                            updateRow(row._localId, { category: selectedCat, payment_method: updatedMethod });
                            saveExistingRow({ ...row, category: selectedCat, payment_method: updatedMethod });
                          }}
                          className="w-full px-2 py-1.5 rounded text-xs border border-border bg-surface2 focus:outline-none font-medium text-textPrimary"
                        >
                          {CURRENT_ASSET_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={row.category ?? ''}
                          onChange={(e) => updateRow(row._localId, { category: e.target.value })}
                          onBlur={() => saveExistingRow(row)}
                          placeholder="e.g. Fuel, Rent, General"
                          className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus:bg-accentBg text-textPrimary"
                        />
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row._rawAmount ?? (row.amount != null ? String(row.amount) : '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = parseFloat(val);
                          updateRow(row._localId, {
                            _rawAmount: val,
                            amount: !isNaN(parsed) && parsed >= 0 ? parsed : 0,
                          });
                        }}
                        onBlur={() => saveExistingRow(row)}
                        className={`w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg text-xs font-bold ${
                          isRevenue ? 'text-success' : 'text-textPrimary'
                        }`}
                      />
                    </td>

                    {/* Method */}
                    <td className="px-2 py-1.5">
                      <select
                        value={row.payment_method ?? 'cash'}
                        onChange={(e) => {
                          const m = e.target.value as 'cash' | 'bank';
                          updateRow(row._localId, { payment_method: m });
                          saveExistingRow({ ...row, payment_method: m });
                        }}
                        className="w-full px-2 py-1.5 rounded text-xs border border-border bg-surface2 focus:outline-none capitalize font-medium text-textPrimary"
                      >
                        <option value="cash">Cash</option>
                        <option value="bank">Bank / MoMo</option>
                      </select>
                    </td>

                    {/* Depreciation Rate */}
                    <td className="px-2 py-1.5 text-right">
                      {isFixedAsset ? (
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          placeholder="e.g. 20"
                          value={row._depreciationPercent ?? ''}
                          onChange={(e) => updateRow(row._localId, { _depreciationPercent: e.target.value })}
                          onBlur={() => saveExistingRow(row)}
                          className="w-full px-2 py-1.5 rounded text-right text-xs focus:outline-none focus:bg-accentBg"
                        />
                      ) : (
                        <span className="text-textMuted text-xs">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => deleteRow(row)}
                        className="text-textMuted hover:text-danger text-xs p-1"
                        title="Delete transaction"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-textMuted mt-4">
        💡 <span className="font-semibold text-textSecondary">Tip:</span> Fast keyboard entry: type in the top row and press Tab to move across columns. Transactions automatically commit to your database as soon as you finish editing a field.
      </p>

      {/* Transaction Delete Confirmation Modal */}
      {transactionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Transaction</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete the transaction for <span className="font-semibold text-slate-900 dark:text-white">{transactionToDelete.vendor || 'this entry'}</span> ({currency} {transactionToDelete.amount})?
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setTransactionToDelete(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = transactionToDelete;
                  setTransactionToDelete(null);
                  executeDeleteRow(target);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
