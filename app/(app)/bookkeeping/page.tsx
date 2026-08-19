'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Transaction, TransactionType, TRANSACTION_TYPE_OPTIONS } from '@/lib/types';

interface Row extends Partial<Transaction> {
  _localId: string;
  _saving?: boolean;
  _dirty?: boolean;
  _depreciationPercent?: string;
}

function emptyRow(): Row {
  return {
    _localId: crypto.randomUUID(),
    transaction_date: new Date().toISOString().slice(0, 10),
    vendor: '',
    type: 'operating_expense',
    category: '',
    amount: 0,
    depreciation_rate: null,
    _depreciationPercent: '',
    payment_method: 'cash',
  };
}

export default function BookkeepingPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Type Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setErrorMsg('Not logged in.');
      setLoading(false);
      return;
    }

    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, currency')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const b = businesses?.[0];
    if (!b) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }
    setBusinessId(b.id);
    setCurrency(b.currency || 'GHS');

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('business_id', b.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    const loadedRows: Row[] = (data ?? []).map((t) => ({
      ...t,
      _localId: t.id,
      _depreciationPercent: t.depreciation_rate != null ? String(t.depreciation_rate * 100) : '',
    }));

    setRows([emptyRow(), ...loadedRows]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRow = (localId: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r._localId === localId ? { ...r, ...patch, _dirty: true } : r))
    );
  };

  const saveRow = async (row: Row) => {
    if (!businessId) return;
    if (!row.vendor || !row.amount || row.amount <= 0) {
      return;
    }

    let depreciationRate: number | null = null;
    if (row.type === 'fixed_asset' && row._depreciationPercent && row._depreciationPercent.trim()) {
      const parsed = parseFloat(row._depreciationPercent);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        depreciationRate = parsed / 100;
      }
    }

    updateRow(row._localId, { _saving: true });

    if (row.id) {
      const { error } = await supabase
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

      if (error) {
        setErrorMsg(error.message);
      }
      updateRow(row._localId, { _saving: false, _dirty: false });
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          business_id: businessId,
          transaction_date: row.transaction_date,
          vendor: row.vendor.trim(),
          type: row.type,
          category: row.category?.trim() || null,
          amount: row.amount,
          depreciation_rate: depreciationRate,
          payment_method: row.payment_method ?? 'cash',
        })
        .select()
        .single();

      if (error || !data) {
        setErrorMsg(error?.message ?? 'Could not save transaction.');
        updateRow(row._localId, { _saving: false });
        return;
      }

      setRows((prev) => {
        const withoutUnsaved = prev.filter((r) => r._localId !== row._localId);
        const savedRow: Row = {
          ...data,
          _localId: data.id,
          _depreciationPercent: data.depreciation_rate != null ? String(data.depreciation_rate * 100) : '',
        };
        return [emptyRow(), savedRow, ...withoutUnsaved];
      });
    }
  };

  const deleteRow = async (row: Row) => {
    if (row.id) {
      if (!confirm(`Delete transaction "${row.vendor}"?`)) return;
      await supabase.from('transactions').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((r) => r._localId !== row._localId));
  };

  // Real transactions list (excluding top empty template row)
  const realRows = useMemo(() => rows.filter((r) => r.id), [rows]);

  // Financial Inflow / Outflow Summary
  const metrics = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;

    realRows.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.type === 'revenue') {
        totalInflow += amt;
      } else {
        totalOutflow += amt;
      }
    });

    const netPeriod = totalInflow - totalOutflow;
    return { totalInflow, totalOutflow, netPeriod };
  }, [realRows]);

  // Filtered rows for table
  const filteredRows = useMemo(() => {
    const createRow = rows.find((r) => !r.id);
    const existing = rows.filter((r) => r.id);

    const filtered = existing.filter((r) => {
      const matchesSearch =
        (r.vendor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.category || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (paymentFilter !== 'all' && r.payment_method !== paymentFilter) return false;
      return true;
    });

    return createRow && typeFilter === 'all' && paymentFilter === 'all' && !searchTerm
      ? [createRow, ...filtered]
      : filtered;
  }, [rows, searchTerm, typeFilter, paymentFilter]);

  // CSV Ledger Export
  const exportLedgerCSV = () => {
    if (realRows.length === 0) {
      alert('No ledger transactions to export.');
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
        <div className="flex items-center gap-2">
          <button
            onClick={exportLedgerCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-surface2 text-sm text-textPrimary hover:bg-surface1 transition font-medium"
          >
            📥 Export Ledger (CSV)
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      {/* Ledger Valuation Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Revenue Inflows</p>
          <p className="text-xl font-bold text-success">
            +{currency} {metrics.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Customer sales &amp; deposits</p>
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
              <th className="px-3 py-2.5 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-textMuted text-sm">
                  {searchTerm ? `No transactions matching "${searchTerm}"` : 'No transactions in this view.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isFixedAsset = row.type === 'fixed_asset';
                const isRevenue = row.type === 'revenue';

                return (
                  <tr
                    key={row._localId}
                    className={`border-t border-border hover:bg-surface1/50 transition ${
                      !row.id ? 'bg-accentBg/30' : ''
                    }`}
                  >
                    {/* Date & Time */}
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={row.transaction_date ?? ''}
                        onChange={(e) => updateRow(row._localId, { transaction_date: e.target.value })}
                        onBlur={() => saveRow(row)}
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
                      <div className="flex items-center gap-1">
                        {!row.id && <span className="text-xs font-bold text-accentText shrink-0">+ Add:</span>}
                        <input
                          type="text"
                          value={row.vendor ?? ''}
                          onChange={(e) => updateRow(row._localId, { vendor: e.target.value })}
                          onBlur={() => saveRow(row)}
                          placeholder={!row.id ? "e.g. Fuel, Shoprite, Electricity, Client Payment" : "Vendor name"}
                          className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-xs font-medium text-textPrimary"
                        />
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-2 py-1.5">
                      <select
                        value={row.type ?? 'operating_expense'}
                        onChange={(e) => {
                          const newType = e.target.value as TransactionType;
                          updateRow(row._localId, {
                            type: newType,
                            category: row.category || newType,
                          });
                          saveRow({ ...row, type: newType, category: row.category || newType });
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
                      <input
                        type="text"
                        value={row.category ?? ''}
                        onChange={(e) => updateRow(row._localId, { category: e.target.value })}
                        onBlur={() => saveRow(row)}
                        placeholder="e.g. Fuel, Rent"
                        className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus:bg-accentBg text-textPrimary"
                      />
                    </td>

                    {/* Amount */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount ?? 0}
                        onChange={(e) => updateRow(row._localId, { amount: parseFloat(e.target.value) || 0 })}
                        onBlur={() => saveRow(row)}
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
                          saveRow({ ...row, payment_method: m });
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
                          onBlur={() => saveRow(row)}
                          className="w-full px-2 py-1.5 rounded text-right text-xs focus:outline-none focus:bg-accentBg"
                        />
                      ) : (
                        <span className="text-textMuted text-xs">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-1.5 text-center">
                      {row.id && (
                        <button
                          onClick={() => deleteRow(row)}
                          className="text-textMuted hover:text-danger text-xs p-1"
                          title="Delete entry"
                        >
                          🗑️
                        </button>
                      )}
                      {row._saving && <span className="text-[10px] text-textMuted">Saving…</span>}
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
    </div>
  );
}
