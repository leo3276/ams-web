'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryItem } from '@/lib/types';

interface Row extends Partial<InventoryItem> {
  _localId: string;
  _lastSavedQuantity: number;
  _saving?: boolean;
  _pendingPayment?: boolean;
  _pendingDelta?: number;
}

function emptyRow(): Row {
  return {
    _localId: crypto.randomUUID(),
    name: '',
    quantity: 0,
    unit_cost: 0,
    unit_price: 0,
    _lastSavedQuantity: 0,
  };
}

export default function InventoryPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'in'>('all');

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
      .from('inventory_items')
      .select('*')
      .eq('business_id', b.id)
      .order('name', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    const loadedRows: Row[] = (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      unit_cost: Number(item.unit_cost),
      unit_price: Number(item.unit_price),
      _localId: item.id,
      _lastSavedQuantity: Number(item.quantity),
    }));

    setRows([emptyRow(), ...loadedRows]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRow = (localId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));
  };

  // Saves name/unit_cost/unit_price directly
  const saveDetails = async (row: Row) => {
    if (!businessId || !row.name || !row.name.trim()) return;

    if (row.id) {
      await supabase
        .from('inventory_items')
        .update({ name: row.name.trim(), unit_cost: row.unit_cost, unit_price: row.unit_price })
        .eq('id', row.id);
    } else if ((row.quantity ?? 0) === 0) {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          business_id: businessId,
          name: row.name.trim(),
          quantity: 0,
          unit_cost: row.unit_cost ?? 0,
          unit_price: row.unit_price ?? 0,
        })
        .select()
        .single();

      if (!error && data) {
        setRows((prev) => {
          const withoutThisRow = prev.filter((r) => r._localId !== row._localId);
          const savedRow: Row = {
            id: data.id,
            name: data.name,
            quantity: Number(data.quantity),
            unit_cost: Number(data.unit_cost),
            unit_price: Number(data.unit_price),
            _localId: data.id,
            _lastSavedQuantity: Number(data.quantity),
          };
          return [emptyRow(), savedRow, ...withoutThisRow];
        });
      }
    }
  };

  const handleQuantityBlur = (row: Row) => {
    const newQty = Number(row.quantity ?? 0);
    const delta = newQty - row._lastSavedQuantity;

    if (delta > 0) {
      updateRow(row._localId, { _pendingPayment: true, _pendingDelta: delta });
    } else if (delta < 0 && row.id) {
      supabase.from('inventory_items').update({ quantity: newQty }).eq('id', row.id);
      updateRow(row._localId, { _lastSavedQuantity: newQty });
    }
  };

  const confirmRestock = async (row: Row, paymentMethod: 'cash' | 'bank') => {
    if (!businessId || !row._pendingDelta) return;
    updateRow(row._localId, { _saving: true });

    let itemId = row.id;

    if (!itemId) {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          business_id: businessId,
          name: row.name?.trim() || 'New Item',
          quantity: 0,
          unit_cost: row.unit_cost ?? 0,
          unit_price: row.unit_price ?? 0,
        })
        .select('id')
        .single();

      if (error || !data) {
        setErrorMsg(error?.message ?? 'Could not create item.');
        updateRow(row._localId, { _saving: false, _pendingPayment: false });
        return;
      }
      itemId = data.id;
    }

    const { error: restockError } = await supabase.rpc('restock_inventory_item', {
      p_inventory_item_id: itemId,
      p_quantity_added: row._pendingDelta,
      p_payment_method: paymentMethod,
    });

    if (restockError) {
      setErrorMsg(restockError.message);
      updateRow(row._localId, { _saving: false, _pendingPayment: false });
      return;
    }

    const newQuantity = row._lastSavedQuantity + row._pendingDelta;
    const wasNewItem = !row.id;

    setRows((prev) => {
      const withoutThisRow = prev.filter((r) => r._localId !== row._localId);
      const savedRow: Row = {
        id: itemId,
        name: row.name,
        quantity: newQuantity,
        unit_cost: row.unit_cost,
        unit_price: row.unit_price,
        _localId: itemId!,
        _lastSavedQuantity: newQuantity,
      };
      return wasNewItem ? [emptyRow(), savedRow, ...withoutThisRow] : [savedRow, ...withoutThisRow];
    });
  };

  const cancelRestock = (row: Row) => {
    updateRow(row._localId, {
      _pendingPayment: false,
      _pendingDelta: undefined,
      quantity: row._lastSavedQuantity,
    });
  };

  const deleteRow = async (row: Row) => {
    if (row.id) {
      if (!confirm(`Delete "${row.name}" from your catalog?`)) return;
      await supabase.from('inventory_items').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((r) => r._localId !== row._localId));
  };

  // Valuation Metrics
  const realRows = useMemo(() => rows.filter((r) => r.id), [rows]);

  const metrics = useMemo(() => {
    let totalItems = realRows.length;
    let totalStockUnits = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;
    let lowStockItems = 0;
    let outOfStockItems = 0;

    realRows.forEach((r) => {
      const qty = r.quantity || 0;
      const cost = r.unit_cost || 0;
      const price = r.unit_price || 0;

      totalStockUnits += qty;
      totalCostVal += qty * cost;
      totalRetailVal += qty * price;

      if (qty === 0) outOfStockItems++;
      else if (qty <= 5) lowStockItems++;
    });

    const potentialProfit = totalRetailVal - totalCostVal;
    const avgMarginPct = totalRetailVal > 0 ? (potentialProfit / totalRetailVal) * 100 : 0;

    return {
      totalItems,
      totalStockUnits,
      totalCostVal,
      totalRetailVal,
      potentialProfit,
      avgMarginPct,
      lowStockItems,
      outOfStockItems,
    };
  }, [realRows]);

  // Filtered rows for table display
  const filteredRows = useMemo(() => {
    const createRow = rows.find((r) => !r.id);
    const existingRows = rows.filter((r) => r.id);

    const filtered = existingRows.filter((r) => {
      const matchesSearch = (r.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      const qty = r.quantity || 0;
      if (stockFilter === 'low') return qty > 0 && qty <= 5;
      if (stockFilter === 'out') return qty === 0;
      if (stockFilter === 'in') return qty > 5;
      return true;
    });

    return createRow && stockFilter === 'all' && !searchTerm ? [createRow, ...filtered] : filtered;
  }, [rows, searchTerm, stockFilter]);

  // CSV Export
  const exportCSV = () => {
    if (realRows.length === 0) {
      alert('No inventory items to export.');
      return;
    }

    let csvContent = 'Item Name,Quantity,Unit Cost,Unit Price,Profit Per Unit,Margin %,Total Cost Value,Total Retail Value\n';
    realRows.forEach((r) => {
      const cost = r.unit_cost || 0;
      const price = r.unit_price || 0;
      const qty = r.quantity || 0;
      const profit = price - cost;
      const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : '0';
      const costVal = (qty * cost).toFixed(2);
      const retailVal = (qty * price).toFixed(2);

      csvContent += `"${(r.name || '').replace(/"/g, '""')}",${qty},${cost.toFixed(2)},${price.toFixed(2)},${profit.toFixed(2)},${margin}%,${costVal},${retailVal}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <p className="text-sm text-textSecondary">Loading inventory catalog…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div className="max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-textPrimary">Inventory & Stock Valuation</h1>
          <p className="text-sm text-textSecondary">
            Manage product catalog, unit costs, pricing margins, and live stock valuations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface2 text-sm text-textPrimary hover:bg-surface1 transition font-medium"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      {/* 1. Valuation & Stock Health Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Stock Valuation (Cost)</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalCostVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{metrics.totalStockUnits.toLocaleString()} units in stock</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Retail Valuation</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{metrics.totalItems} products listed</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Potential Gross Profit</p>
          <p className="text-xl font-bold text-success">
            {currency} {metrics.potentialProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{metrics.avgMarginPct.toFixed(1)}% average margin</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Stock Health</p>
          <div className="flex items-center gap-2 mt-1">
            {metrics.lowStockItems > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-dangerBg text-danger">
                {metrics.lowStockItems} low stock
              </span>
            )}
            {metrics.outOfStockItems > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-surface2 text-textMuted border border-border">
                {metrics.outOfStockItems} out of stock
              </span>
            )}
            {metrics.lowStockItems === 0 && metrics.outOfStockItems === 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-successBg text-success">
                ✓ All Healthy
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search & Stock Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStockFilter('all')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              stockFilter === 'all' ? 'bg-accentText text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            All Items ({realRows.length})
          </button>
          <button
            onClick={() => setStockFilter('low')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              stockFilter === 'low' ? 'bg-danger text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Low Stock (≤5) {metrics.lowStockItems > 0 ? `(${metrics.lowStockItems})` : ''}
          </button>
          <button
            onClick={() => setStockFilter('out')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              stockFilter === 'out' ? 'bg-textPrimary text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Out of Stock (0)
          </button>
          <button
            onClick={() => setStockFilter('in')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              stockFilter === 'in' ? 'bg-success text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            In Stock (&gt;5)
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search products…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface2 focus:outline-none focus:border-accent"
          />
          <span className="absolute left-2.5 top-2 text-textMuted text-xs">🔍</span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1.5 text-textMuted hover:text-textPrimary text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="border border-border rounded-lg overflow-x-auto bg-surface2 shadow-sm">
        <table className="w-full text-sm min-w-[840px]">
          <thead>
            <tr className="bg-surface1 text-left text-textSecondary border-b border-border">
              <th className="px-3 py-2.5 font-medium">Product / Item Name</th>
              <th className="px-3 py-2.5 font-medium text-right w-36">Stock Qty</th>
              <th className="px-3 py-2.5 font-medium text-right w-32">Unit Cost ({currency})</th>
              <th className="px-3 py-2.5 font-medium text-right w-32">Selling Price ({currency})</th>
              <th className="px-3 py-2.5 font-medium text-right w-32">Profit / Margin</th>
              <th className="px-3 py-2.5 font-medium text-right w-32">Total Cost Val</th>
              <th className="px-3 py-2.5 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-textMuted text-sm">
                  {searchTerm ? `No products matching "${searchTerm}"` : 'No items in this filter.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const cost = Number(row.unit_cost || 0);
                const price = Number(row.unit_price || 0);
                const qty = Number(row.quantity || 0);
                const profitPerUnit = price - cost;
                const marginPct = price > 0 ? (profitPerUnit / price) * 100 : 0;
                const totalCost = qty * cost;
                const isLow = row.id && qty <= 5;
                const isOut = row.id && qty === 0;

                return (
                  <tr
                    key={row._localId}
                    className={`border-t border-border hover:bg-surface1/50 transition ${
                      !row.id ? 'bg-accentBg/30' : ''
                    }`}
                  >
                    {/* Item Name */}
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {!row.id && <span className="text-xs font-bold text-accentText shrink-0">+ Add:</span>}
                        <input
                          type="text"
                          value={row.name ?? ''}
                          onChange={(e) => updateRow(row._localId, { name: e.target.value })}
                          onBlur={() => saveDetails(row)}
                          placeholder={!row.id ? "Type new item name to add (e.g. Flour 25kg)" : "Item name"}
                          className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-sm font-medium text-textPrimary"
                        />
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="px-2 py-1.5 text-right">
                      {row._pendingPayment ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-textSecondary mr-1 font-medium">
                            +{row._pendingDelta} via:
                          </span>
                          <button
                            onClick={() => confirmRestock(row, 'cash')}
                            disabled={row._saving}
                            className="px-2 py-1 text-xs rounded font-semibold bg-accentText text-white hover:opacity-90"
                          >
                            Cash
                          </button>
                          <button
                            onClick={() => confirmRestock(row, 'bank')}
                            disabled={row._saving}
                            className="px-2 py-1 text-xs rounded font-semibold bg-accentText text-white hover:opacity-90"
                          >
                            Bank
                          </button>
                          <button
                            onClick={() => cancelRestock(row)}
                            className="text-textMuted hover:text-danger text-xs px-1"
                            title="Cancel restock"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {isOut ? (
                            <span className="text-[10px] uppercase font-bold text-textMuted bg-surface1 px-1.5 py-0.5 rounded">
                              Out
                            </span>
                          ) : isLow ? (
                            <span className="text-[10px] uppercase font-bold text-danger bg-dangerBg px-1.5 py-0.5 rounded">
                              Low
                            </span>
                          ) : null}
                          <input
                            type="number"
                            step="1"
                            value={row.quantity ?? 0}
                            onChange={(e) =>
                              updateRow(row._localId, { quantity: parseFloat(e.target.value) || 0 })
                            }
                            onBlur={() => handleQuantityBlur(row)}
                            className={`w-20 px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg font-bold ${
                              isLow ? 'text-danger' : 'text-textPrimary'
                            }`}
                          />
                        </div>
                      )}
                    </td>

                    {/* Unit Cost */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={row.unit_cost ?? 0}
                        onChange={(e) =>
                          updateRow(row._localId, { unit_cost: parseFloat(e.target.value) || 0 })
                        }
                        onBlur={() => saveDetails(row)}
                        className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg text-textPrimary"
                      />
                    </td>

                    {/* Unit Price */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={row.unit_price ?? 0}
                        onChange={(e) =>
                          updateRow(row._localId, { unit_price: parseFloat(e.target.value) || 0 })
                        }
                        onBlur={() => saveDetails(row)}
                        className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg font-semibold text-textPrimary"
                      />
                    </td>

                    {/* Margin Preview */}
                    <td className="px-3 py-1.5 text-right">
                      {row.id ? (
                        <div>
                          <p className={`text-xs font-semibold ${profitPerUnit >= 0 ? 'text-success' : 'text-danger'}`}>
                            +{currency} {profitPerUnit.toFixed(2)}
                          </p>
                          <p className="text-[10.5px] text-textMuted">{marginPct.toFixed(0)}% margin</p>
                        </div>
                      ) : (
                        <span className="text-textMuted text-xs">—</span>
                      )}
                    </td>

                    {/* Total Cost Value */}
                    <td className="px-3 py-1.5 text-right font-medium text-textPrimary text-xs">
                      {row.id ? `${currency} ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-1.5 text-center">
                      {row.id && (
                        <button
                          onClick={() => deleteRow(row)}
                          className="text-textMuted hover:text-danger text-xs p-1"
                          title="Delete item"
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
        💡 <span className="font-semibold text-textSecondary">Tip:</span> Increasing an item&apos;s quantity prompts for payment method (Cash/Bank) and automatically logs the expense in your ledger. Decreasing a quantity is treated as a manual stock correction.
      </p>
    </div>
  );
}
