'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { InventoryItem } from '@/lib/types';
import { printInventoryValuationPDF } from '@/lib/pdfGenerator';

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
    barcode: '',
    quantity: 0,
    unit_cost: 0,
    unit_price: 0,
    _lastSavedQuantity: 0,
  };
}

import { getCachedBusiness, setCachedBusiness, getCachedInventory, setCachedInventory } from '@/lib/offlineStore';

export default function InventoryPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'in'>('all');

  // Barcode Scanner & POS Pop-Up Modal
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [scannedItem, setScannedItem] = useState<Row | null>(null);
  const [saleQty, setSaleQty] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [actionProcessing, setActionProcessing] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Store-wide Global Target Profit Margin
  const [globalMargin, setGlobalMargin] = useState<number>(25);
  const [applyingBulkMargin, setApplyingBulkMargin] = useState(false);
  const [bulkSuccessToast, setBulkSuccessToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ams_global_profit_margin');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) setGlobalMargin(parsed);
      }
    }
  }, []);

  const handleSetGlobalMargin = (val: number) => {
    setGlobalMargin(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ams_global_profit_margin', String(val));
    }
  };

  // Buffer for fast hardware USB/Bluetooth barcode scanner input
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const loadData = useCallback(async () => {
    // 1. Instantly load local cache
    const cachedBiz = getCachedBusiness();
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedInv = getCachedInventory();
    if (cachedInv.length > 0) {
      setRows([
        emptyRow(),
        ...cachedInv.map((item) => ({
          ...item,
          _localId: item.id,
          _lastSavedQuantity: Number(item.quantity || 0),
        })),
      ]);
    }
    setLoading(false);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      const b = businesses?.[0];
      if (!b) return;

      setBusinessId(b.id);
      setCurrency(b.currency || 'GHS');
      setCachedBusiness({ id: b.id, name: 'My Business', currency: b.currency || 'GHS' });

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('business_id', b.id)
        .order('name', { ascending: true });

      if (!error && data) {
        const loadedRows: Row[] = data.map((item) => ({
          id: item.id,
          name: item.name,
          barcode: item.barcode || '',
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          unit_price: Number(item.unit_price),
          _localId: item.id,
          _lastSavedQuantity: Number(item.quantity),
        }));

        setRows([emptyRow(), ...loadedRows]);
        setCachedInventory(data as any);
      }
    } catch (_e) {
      // offline mode operates on cache
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Global listener for USB/Bluetooth handheld barcode laser scanners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const potentialBarcode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        if (potentialBarcode.length >= 3) {
          handleBarcodeScan(potentialBarcode);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (timeDiff < 60 || !isInput) {
          barcodeBufferRef.current += e.key;
        } else {
          barcodeBufferRef.current = e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows]);

  const handleBarcodeScan = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    const matched = rows.find(
      (r) =>
        r.id &&
        ((r.barcode && r.barcode.toLowerCase() === cleanCode.toLowerCase()) ||
          r.name?.toLowerCase() === cleanCode.toLowerCase())
    );

    if (matched) {
      setScannedItem(matched);
      setSaleQty('1');
      setActionSuccessMsg(null);
    } else {
      alert(`No product found with barcode or SKU: "${cleanCode}". You can enter this barcode directly into any item row.`);
    }
  };

  const updateRow = (localId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));
  };

  const handleCostChange = (row: Row, newCost: number) => {
    const calculatedPrice = Number((newCost * (1 + globalMargin / 100)).toFixed(2));
    updateRow(row._localId, {
      unit_cost: newCost,
      unit_price: (!row.id || row.unit_price === 0) ? calculatedPrice : row.unit_price,
    });
  };

  const handleApplyGlobalMarginToAll = async () => {
    if (!businessId || realRows.length === 0) return;
    setApplyingBulkMargin(true);
    setBulkSuccessToast(null);

    try {
      let updatedCount = 0;
      const updatedRows = [...rows];

      for (let i = 0; i < updatedRows.length; i++) {
        const r = updatedRows[i];
        if (r.id) {
          const cost = Number(r.unit_cost || 0);
          if (cost > 0) {
            const newPrice = Number((cost * (1 + globalMargin / 100)).toFixed(2));
            await supabase
              .from('inventory_items')
              .update({ unit_price: newPrice })
              .eq('id', r.id);

            updatedRows[i] = { ...r, unit_price: newPrice };
            updatedCount++;
          }
        }
      }

      setRows(updatedRows);
      setBulkSuccessToast(`Updated selling prices for all ${updatedCount} products to +${globalMargin}% profit margin! ✓`);
    } catch (err: any) {
      alert('Error applying profit margin: ' + err.message);
    } finally {
      setApplyingBulkMargin(false);
    }
  };

  // Saves name/barcode/unit_cost/unit_price directly
  const saveDetails = async (row: Row) => {
    if (!businessId || !row.name || !row.name.trim()) return;

    if (row.id) {
      await supabase
        .from('inventory_items')
        .update({
          name: row.name.trim(),
          barcode: row.barcode?.trim() || null,
          unit_cost: row.unit_cost,
          unit_price: row.unit_price,
        })
        .eq('id', row.id);
    } else if ((row.quantity ?? 0) === 0) {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          business_id: businessId,
          name: row.name.trim(),
          barcode: row.barcode?.trim() || null,
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
            barcode: data.barcode || '',
            quantity: Number(data.quantity),
            unit_cost: Number(data.unit_cost),
            unit_price: Number(data.unit_price),
            _localId: data.id,
            _lastSavedQuantity: Number(data.quantity),
          };
          return [emptyRow(), savedRow, ...withoutThisRow.filter((r) => r.id)];
        });
      }
    }
  };

  const handleQuantityBlur = async (row: Row) => {
    const targetQty = Number(row.quantity ?? 0);
    const lastSaved = row._lastSavedQuantity;

    if (targetQty === lastSaved) return;

    if (targetQty > lastSaved) {
      const delta = targetQty - lastSaved;
      updateRow(row._localId, { _pendingPayment: true, _pendingDelta: delta });
    } else {
      if (!row.id) return;
      updateRow(row._localId, { _saving: true });
      const { error } = await supabase
        .from('inventory_items')
        .update({ quantity: targetQty })
        .eq('id', row.id);

      if (error) {
        setErrorMsg(error.message);
        updateRow(row._localId, { quantity: lastSaved, _saving: false });
      } else {
        updateRow(row._localId, { _lastSavedQuantity: targetQty, _saving: false });
      }
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
          barcode: row.barcode?.trim() || null,
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
        barcode: row.barcode || '',
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

  // Instant POS Sale from Barcode Pop-Up
  const handleExecuteQuickSale = async () => {
    if (!scannedItem || !businessId || !scannedItem.id) return;
    const qty = parseInt(saleQty, 10);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid sale quantity.');
      return;
    }

    const currentQty = Number(scannedItem.quantity || 0);
    if (qty > currentQty) {
      alert(`Cannot sell ${qty} units. Only ${currentQty} in stock.`);
      return;
    }

    setActionProcessing(true);
    const unitPrice = Number(scannedItem.unit_price || 0);
    const totalAmount = qty * unitPrice;
    const newQty = currentQty - qty;
    const today = new Date().toISOString().slice(0, 10);

    const { error: stockErr } = await supabase
      .from('inventory_items')
      .update({ quantity: newQty })
      .eq('id', scannedItem.id);

    if (stockErr) {
      alert('Could not update stock: ' + stockErr.message);
      setActionProcessing(false);
      return;
    }

    await supabase.from('transactions').insert({
      business_id: businessId,
      transaction_date: today,
      vendor: `Sale: ${qty}x ${scannedItem.name}`,
      type: 'revenue',
      category: 'Inventory Sales',
      amount: totalAmount,
      payment_method: paymentMethod,
    });

    updateRow(scannedItem._localId, { quantity: newQty, _lastSavedQuantity: newQty });
    setScannedItem({ ...scannedItem, quantity: newQty, _lastSavedQuantity: newQty });
    setActionSuccessMsg(`Sold ${qty}x ${scannedItem.name} for ${currency} ${totalAmount.toFixed(2)} ✓`);
    setActionProcessing(false);
  };

  // Instant Quick Restock from Barcode Pop-Up
  const handleExecuteQuickRestock = async () => {
    if (!scannedItem || !businessId || !scannedItem.id) return;
    const qty = parseInt(saleQty, 10);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid restock quantity.');
      return;
    }

    setActionProcessing(true);
    const currentQty = Number(scannedItem.quantity || 0);
    const unitCost = Number(scannedItem.unit_cost || 0);
    const totalCost = qty * unitCost;
    const newQty = currentQty + qty;
    const today = new Date().toISOString().slice(0, 10);

    const { error: stockErr } = await supabase
      .from('inventory_items')
      .update({ quantity: newQty })
      .eq('id', scannedItem.id);

    if (stockErr) {
      alert('Could not restock: ' + stockErr.message);
      setActionProcessing(false);
      return;
    }

    if (totalCost > 0) {
      await supabase.from('transactions').insert({
        business_id: businessId,
        transaction_date: today,
        vendor: `Restock: ${qty}x ${scannedItem.name}`,
        type: 'cost_of_goods',
        category: 'Inventory Restock',
        amount: totalCost,
        payment_method: paymentMethod,
      });
    }

    updateRow(scannedItem._localId, { quantity: newQty, _lastSavedQuantity: newQty });
    setScannedItem({ ...scannedItem, quantity: newQty, _lastSavedQuantity: newQty });
    setActionSuccessMsg(`Restocked +${qty} units. New stock: ${newQty} ✓`);
    setActionProcessing(false);
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
      const matchesSearch =
        (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
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

    let csvContent = 'Item Name,Barcode / SKU,Quantity,Unit Cost,Unit Price,Profit Per Unit,Margin %,Total Cost Value,Total Retail Value\n';
    realRows.forEach((r) => {
      const cost = r.unit_cost || 0;
      const price = r.unit_price || 0;
      const qty = r.quantity || 0;
      const profit = price - cost;
      const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : '0';
      const costVal = (qty * cost).toFixed(2);
      const retailVal = (qty * price).toFixed(2);

      csvContent += `"${(r.name || '').replace(/"/g, '""')}","${r.barcode || ''}",${qty},${cost.toFixed(2)},${price.toFixed(2)},${profit.toFixed(2)},${margin}%,${costVal},${retailVal}\n`;
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
          <h1 className="text-2xl font-medium text-textPrimary">Inventory &amp; Stock Valuation</h1>
          <p className="text-sm text-textSecondary">
            Manage product catalog, unit costs, pricing margins, barcode scanning, and live stock valuations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/migrate"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-surface2 border border-border text-textPrimary hover:bg-surface0 text-sm transition font-bold shadow-xs"
          >
            <span>⚡</span> Import Excel / CSV
          </Link>
          <Link
            href="/sales"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition font-bold shadow-xs"
          >
            <span>🛒</span> Record Sale
          </Link>
          <button
            onClick={() =>
              printInventoryValuationPDF(
                realRows.map((r) => ({
                  name: r.name || 'Unnamed Product',
                  barcode: r.barcode || '',
                  quantity: r.quantity || 0,
                  unit_cost: r.unit_cost || 0,
                  unit_price: r.unit_price || 0,
                })),
                { name: 'My Business', currency }
              )
            }
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-textPrimary text-white hover:opacity-90 transition text-sm font-bold shadow-xs"
          >
            📄 Export Stylish PDF
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface2 text-sm text-textPrimary hover:bg-surface1 transition font-medium"
          >
            📥 CSV
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      {bulkSuccessToast && (
        <div className="p-3.5 rounded-xl text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-between mb-6">
          <span>{bulkSuccessToast}</span>
          <button onClick={() => setBulkSuccessToast(null)} className="text-emerald-700 font-bold hover:text-emerald-950">✕</button>
        </div>
      )}

      {/* ======================================================== */}
      {/* STORE-WIDE TARGET PROFIT MARGIN ENGINE                   */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/50 border border-emerald-200 rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg font-black shrink-0 shadow-xs">
            %
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-emerald-950">Store-Wide Target Profit Margin</h3>
              <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full">
                Auto-Pricing Active
              </span>
            </div>
            <p className="text-xs text-emerald-800/90 mt-0.5">
              Automatically sets selling prices for all goods from unit cost, and lets you re-price your entire inventory in 1 click.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Quick Presets */}
          <div className="flex items-center gap-1 bg-white/90 border border-emerald-300/80 p-1 rounded-lg">
            {[15, 20, 25, 30, 40, 50].map((pct) => (
              <button
                key={pct}
                onClick={() => handleSetGlobalMargin(pct)}
                className={`px-2 py-1 text-xs font-bold rounded-md transition ${
                  globalMargin === pct
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                +{pct}%
              </button>
            ))}
          </div>

          {/* Custom Margin Input */}
          <div className="flex items-center gap-1 bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-emerald-900 font-medium">Custom:</span>
            <input
              type="number"
              value={globalMargin}
              onChange={(e) => handleSetGlobalMargin(parseFloat(e.target.value) || 0)}
              className="w-12 text-center font-bold text-emerald-900 focus:outline-none"
            />
            <span className="text-emerald-900 font-bold">%</span>
          </div>

          {/* 1-Click Batch Update Button */}
          <button
            onClick={handleApplyGlobalMarginToAll}
            disabled={applyingBulkMargin || realRows.length === 0}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            title="Recalculate and update selling prices for all inventory items based on this profit margin"
          >
            <span>⚡</span>
            {applyingBulkMargin ? 'Updating All…' : `Apply +${globalMargin}% to All Goods`}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. STOCK & RETAIL VALUATION CARDS                        */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">
            Stock Valuation (Cost)
          </p>
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

      {/* ======================================================== */}
      {/* 2. SEARCH, FILTER & COMPACT BARCODE SCANNER TOOLBAR      */}
      {/* ======================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        {/* Stock Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
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

        {/* Search & Barcode Scanner */}
        <div className="flex items-center gap-2">
          {/* General Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search catalog..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-44 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-surface1 text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-accentText"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1.5 text-xs text-textMuted hover:text-textPrimary"
              >
                ✕
              </button>
            )}
          </div>

          {/* Compact Barcode / POS Quick Scan Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleBarcodeScan(barcodeQuery);
            }}
            className="flex items-center gap-1.5 bg-surface1 border border-border px-2 py-1 rounded-lg shadow-sm"
          >
            <span className="text-xs" title="USB / Bluetooth Barcode Laser Scanner Active">🔫</span>
            <input
              type="text"
              placeholder="Scan Barcode / SKU..."
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              className="w-40 bg-transparent text-xs text-textPrimary placeholder:text-textMuted focus:outline-none font-mono"
            />
            <button
              type="submit"
              className="px-2 py-0.5 bg-textPrimary text-surface0 rounded text-[11px] font-bold hover:opacity-90 transition"
            >
              Scan
            </button>
          </form>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. INVENTORY CATALOG TABLE                               */}
      {/* ======================================================== */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface0 shadow-sm">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface1 text-xs text-textSecondary uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Item Name</th>
              <th className="px-2 py-2 font-medium w-36">Barcode / SKU</th>
              <th className="px-2 py-2 font-medium text-right w-36">Quantity</th>
              <th className="px-2 py-2 font-medium text-right w-24">Unit Cost</th>
              <th className="px-2 py-2 font-medium text-right w-24">Unit Price</th>
              <th className="px-3 py-2 font-medium text-right w-28">Margin</th>
              <th className="px-3 py-2 font-medium text-right w-32">Total Cost</th>
              <th className="px-2 py-2 font-medium text-center w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-textMuted text-sm">
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
                const isLow = row.id && qty <= 5 && qty > 0;
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
                          placeholder={!row.id ? "Type new item name (e.g. Flour 25kg)" : "Item name"}
                          className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-sm font-medium text-textPrimary"
                        />
                      </div>
                    </td>

                    {/* Barcode / SKU */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.barcode ?? ''}
                        onChange={(e) => updateRow(row._localId, { barcode: e.target.value })}
                        onBlur={() => saveDetails(row)}
                        placeholder="Scan / SKU"
                        className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-xs font-mono text-textSecondary"
                      />
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
                          handleCostChange(row, parseFloat(e.target.value) || 0)
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
        💡 <span className="font-semibold text-textSecondary">Tip:</span> Increasing an item&apos;s quantity prompts for payment method (Cash/Bank) and automatically logs the expense in your ledger. Handheld USB/Bluetooth barcode laser scanners are active across the entire screen.
      </p>

      {/* ======================================================== */}
      {/* INTERACTIVE BARCODE POS POPUP MODAL                      */}
      {/* ======================================================== */}
      {scannedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface0 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-border space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accentText text-white text-[10px] font-black rounded uppercase">
                  BARCODE MATCHED
                </span>
                <span className="font-mono text-xs text-textSecondary">{scannedItem.barcode || 'NO-SKU'}</span>
              </div>
              <button
                onClick={() => setScannedItem(null)}
                className="text-textMuted hover:text-textPrimary text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Product Info */}
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-textPrimary">{scannedItem.name}</h2>
              <div className="flex items-center gap-3 text-xs text-textSecondary font-medium">
                <span>
                  In Stock:{' '}
                  <strong className={(scannedItem.quantity ?? 0) <= 5 ? 'text-danger' : 'text-success'}>
                    {scannedItem.quantity} units
                  </strong>
                </span>
                <span>·</span>
                <span>Selling Price: <strong className="text-textPrimary">{currency} {Number(scannedItem.unit_price || 0).toFixed(2)}</strong></span>
                <span>·</span>
                <span>Cost: {currency} {Number(scannedItem.unit_cost || 0).toFixed(2)}</span>
              </div>
            </div>

            {actionSuccessMsg && (
              <div className="p-3 bg-successBg border border-success/30 text-success rounded-lg text-xs font-bold text-center">
                {actionSuccessMsg}
              </div>
            )}

            {/* Quantity and Payment Selector */}
            <div className="grid grid-cols-2 gap-4 bg-surface1 p-4 rounded-xl border border-border">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-textSecondary mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  className="w-full px-3 py-2 bg-surface0 border border-border rounded-lg font-bold text-sm text-textPrimary focus:outline-none focus:border-accentText"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-textSecondary mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-surface0 border border-border rounded-lg font-medium text-xs text-textPrimary focus:outline-none"
                >
                  <option value="cash">Cash 💵</option>
                  <option value="bank">MoMo / Bank 📱</option>
                </select>
              </div>
            </div>

            {/* Total Sale Value */}
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-textSecondary uppercase">Transaction Total:</span>
              <span className="text-xl font-black text-textPrimary">
                {currency} {(parseInt(saleQty || '1', 10) * Number(scannedItem.unit_price || 0)).toFixed(2)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleExecuteQuickSale}
                disabled={actionProcessing || (scannedItem.quantity ?? 0) <= 0}
                className="py-3 px-4 bg-success hover:opacity-90 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-50"
              >
                {actionProcessing ? 'Processing…' : '🟢 Record Quick Sale'}
              </button>

              <button
                onClick={handleExecuteQuickRestock}
                disabled={actionProcessing}
                className="py-3 px-4 bg-accentText hover:opacity-90 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-50"
              >
                {actionProcessing ? 'Processing…' : '📦 Restock (+Stock)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
