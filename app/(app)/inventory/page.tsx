'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryItem } from '@/lib/types';

interface Row extends Partial<InventoryItem> {
  _localId: string;
  _lastSavedQuantity: number; // baseline used to detect an increase (a restock) vs a correction
  _saving?: boolean;
  _pendingPayment?: boolean; // true while waiting for the person to pick Cash/Bank for a restock
  _pendingDelta?: number; // the quantity increase waiting on a payment method choice
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
      .from('inventory_items')
      .select('*')
      .eq('business_id', bId)
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

  // Saves name/unit_cost/unit_price directly — these never touch the ledger,
  // they're just catalog details.
  const saveDetails = async (row: Row) => {
    if (!businessId || !row.name || !row.name.trim()) return;

    if (row.id) {
      await supabase
        .from('inventory_items')
        .update({ name: row.name, unit_cost: row.unit_cost, unit_price: row.unit_price })
        .eq('id', row.id);
    } else if ((row.quantity ?? 0) === 0) {
      // Brand new item with no starting stock — safe to just create it directly,
      // no restock/payment step needed since nothing was actually purchased yet.
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          business_id: businessId,
          name: row.name,
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
    // If it's a new row with quantity > 0, don't create it here — the
    // quantity blur handler below creates it together with the restock,
    // once a payment method is chosen, so there's only ever one transaction.
  };

  const handleQuantityBlur = (row: Row) => {
    const newQty = Number(row.quantity ?? 0);
    const delta = newQty - row._lastSavedQuantity;

    if (delta > 0) {
      // A real increase — this is a restock, needs a payment method before it commits.
      updateRow(row._localId, { _pendingPayment: true, _pendingDelta: delta });
    } else if (delta < 0 && row.id) {
      // A decrease — treated as a manual correction, no ledger effect.
      supabase.from('inventory_items').update({ quantity: newQty }).eq('id', row.id);
      updateRow(row._localId, { _lastSavedQuantity: newQty });
    }
  };

  const confirmRestock = async (row: Row, paymentMethod: 'cash' | 'bank') => {
    if (!businessId || !row._pendingDelta) return;
    updateRow(row._localId, { _saving: true });

    let itemId = row.id;

    if (!itemId) {
      // Brand new item being created WITH an opening stock quantity — create
      // it first (at 0), then restock adds the real quantity as one transaction.
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          business_id: businessId,
          name: row.name,
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
      // Only add a fresh empty row if this WAS a brand-new item — an
      // existing item's restock just updates it in place, since there's
      // already an empty row sitting at the top from initial load.
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
      await supabase.from('inventory_items').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((r) => r._localId !== row._localId));
  };

  if (loading) return <p className="text-sm text-textSecondary">Loading…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div>
      <h1 className="text-2xl font-medium text-textPrimary mb-1">Inventory</h1>
      <p className="text-sm text-textSecondary mb-6">
        Add and manage your product catalog here. Increasing a quantity records a restock (asks
        Cash or Bank) decreasing it is treated as a correction and doesn&apos;t touch your ledger.
        The mobile app can also restock by scanning a purchase receipt.
      </p>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-surface1 text-left text-textSecondary">
              <th className="px-3 py-2 font-medium">Item name</th>
              <th className="px-3 py-2 font-medium">Quantity</th>
              <th className="px-3 py-2 font-medium">Unit cost</th>
              <th className="px-3 py-2 font-medium">Unit price</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._localId} className="border-t border-border">
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.name ?? ''}
                    onChange={(e) => updateRow(row._localId, { name: e.target.value })}
                    onBlur={() => saveDetails(row)}
                    placeholder="e.g. Basmati Rice 5kg"
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1">
                  {row._pendingPayment ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => confirmRestock(row, 'cash')}
                        disabled={row._saving}
                        className="px-2 py-1 text-xs rounded border border-border bg-surface2 hover:bg-accentBg"
                      >
                        Cash
                      </button>
                      <button
                        onClick={() => confirmRestock(row, 'bank')}
                        disabled={row._saving}
                        className="px-2 py-1 text-xs rounded border border-border bg-surface2 hover:bg-accentBg"
                      >
                        Bank
                      </button>
                      <button
                        onClick={() => cancelRestock(row)}
                        className="text-textMuted hover:text-danger text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="1"
                      value={row.quantity ?? 0}
                      onChange={(e) => updateRow(row._localId, { quantity: parseFloat(e.target.value) || 0 })}
                      onBlur={() => handleQuantityBlur(row)}
                      className="w-20 px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                    />
                  )}
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="0.01"
                    value={row.unit_cost ?? 0}
                    onChange={(e) => updateRow(row._localId, { unit_cost: parseFloat(e.target.value) || 0 })}
                    onBlur={() => saveDetails(row)}
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="0.01"
                    value={row.unit_price ?? 0}
                    onChange={(e) => updateRow(row._localId, { unit_price: parseFloat(e.target.value) || 0 })}
                    onBlur={() => saveDetails(row)}
                    className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg"
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  {row.id && (
                    <button
                      onClick={() => deleteRow(row)}
                      className="text-textMuted hover:text-danger text-xs"
                      title="Delete item"
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
