'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Transaction, TransactionType, TRANSACTION_TYPE_OPTIONS } from '@/lib/types';

interface Row extends Partial<Transaction> {
  _localId: string; // stable key for unsaved rows before they get a real id
  _saving?: boolean;
  _dirty?: boolean;
  _depreciationPercent?: string; // kept as a display string while editing
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
  };
}

export default function BookkeepingPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const bId = businesses?.[0]?.id;
    if (!bId) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }
    setBusinessId(bId);

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('business_id', bId)
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
    // Always keep one empty row at the top ready for new entry.
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
      // Don't save incomplete rows — wait until vendor and a real amount are entered.
      return;
    }

    // Depreciation only applies to fixed assets, and only if a rate was actually typed in.
    let depreciationRate: number | null = null;
    if (row.type === 'fixed_asset' && row._depreciationPercent && row._depreciationPercent.trim()) {
      const pct = parseFloat(row._depreciationPercent);
      if (!isNaN(pct) && pct >= 0 && pct <= 100) {
        depreciationRate = pct / 100;
      }
    }

    setRows((prev) =>
      prev.map((r) => (r._localId === row._localId ? { ...r, _saving: true } : r))
    );

    const payload = {
      vendor: row.vendor,
      amount: row.amount,
      type: row.type,
      category: row.category || row.type,
      transaction_date: row.transaction_date,
      depreciation_rate: depreciationRate,
    };

    if (row.id) {
      // Existing row — update it.
      const { error } = await supabase.from('transactions').update(payload).eq('id', row.id);

      if (error) {
        setErrorMsg(error.message);
      }
      setRows((prev) =>
        prev.map((r) => (r._localId === row._localId ? { ...r, _saving: false, _dirty: false } : r))
      );
    } else {
      // New row — insert it, then turn this row into a saved row and add a fresh empty one on top.
      const { data, error } = await supabase
        .from('transactions')
        .insert({ business_id: businessId, ...payload })
        .select()
        .single();

      if (error) {
        setErrorMsg(error.message);
        setRows((prev) =>
          prev.map((r) => (r._localId === row._localId ? { ...r, _saving: false } : r))
        );
        return;
      }

      setRows((prev) => {
        const withoutThisRow = prev.filter((r) => r._localId !== row._localId);
        const savedRow: Row = {
          ...data,
          _localId: data.id,
          _depreciationPercent: data.depreciation_rate != null ? String(data.depreciation_rate * 100) : '',
        };
        return [emptyRow(), savedRow, ...withoutThisRow];
      });
    }
  };

  const deleteRow = async (row: Row) => {
    if (row.id) {
      await supabase.from('transactions').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((r) => r._localId !== row._localId));
  };

  if (loading) {
    return <p className="text-sm text-textSecondary">Loading…</p>;
  }

  if (errorMsg && !businessId) {
    return <p className="text-sm text-danger">{errorMsg}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-medium text-textPrimary mb-1">Bookkeeping</h1>
      <p className="text-sm text-textSecondary mb-6">
        Log the day&apos;s sales, expenses, and other activity. Rows save automatically once vendor
        and amount are filled in. For a Fixed asset, you can optionally set a depreciation % — leave
        it blank if it doesn&apos;t depreciate.
      </p>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-surface1 text-left text-textSecondary">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Vendor / Description</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Depr. %</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._localId} className="border-t border-border">
                <td className="px-1 py-1">
                  <input
                    type="date"
                    value={row.transaction_date ?? ''}
                    onChange={(e) => updateRow(row._localId, { transaction_date: e.target.value })}
                    onBlur={() => saveRow(row)}
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.vendor ?? ''}
                    onChange={(e) => updateRow(row._localId, { vendor: e.target.value })}
                    onBlur={() => saveRow(row)}
                    placeholder="e.g. Catering order"
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={row.type ?? 'operating_expense'}
                    onChange={(e) => {
                      const newType = e.target.value as TransactionType;
                      updateRow(row._localId, { type: newType });
                      saveRow({ ...row, type: newType });
                    }}
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg bg-transparent"
                  >
                    {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.category ?? ''}
                    onChange={(e) => updateRow(row._localId, { category: e.target.value })}
                    onBlur={() => saveRow(row)}
                    placeholder="Optional"
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1">
                  {row.type === 'fixed_asset' ? (
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={row._depreciationPercent ?? ''}
                      onChange={(e) => updateRow(row._localId, { _depreciationPercent: e.target.value })}
                      onBlur={() => saveRow(row)}
                      placeholder="—"
                      className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                    />
                  ) : (
                    <span className="text-textMuted px-2">—</span>
                  )}
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="0.01"
                    value={row.amount ?? ''}
                    onChange={(e) =>
                      updateRow(row._localId, { amount: parseFloat(e.target.value) || 0 })
                    }
                    onBlur={() => saveRow(row)}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  {row.id && (
                    <button
                      onClick={() => deleteRow(row)}
                      className="text-textMuted hover:text-danger text-xs"
                      title="Delete row"
                    >
                      ✕
                    </button>
                  )}
                  {row._saving && <span className="text-xs text-textMuted">Saving…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
