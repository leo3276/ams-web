'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryItem } from '@/lib/types';
import Link from 'next/link';

interface RecentSale {
  id: string;
  vendor: string;
  amount: number;
  payment_method: string;
  transaction_date: string;
  created_at: string;
}

import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedInventory,
  setCachedInventory,
  getCachedTransactions,
  setCachedTransactions,
  saveOfflineTransaction,
} from '@/lib/offlineStore';

export default function RecordSalePage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [saleType, setSaleType] = useState<'inventory' | 'custom'>('inventory');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedNotification, setScannedNotification] = useState<string | null>(null);

  // Buffer for hardware USB / Bluetooth handheld barcode laser scanners
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const loadData = useCallback(async () => {
    // 1. Instantly populate from local cache
    const cachedBiz = getCachedBusiness();
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedInv = getCachedInventory();
    if (cachedInv.length > 0) {
      setItems(cachedInv);
      if (!selectedItemId) setSelectedItemId(cachedInv[0].id);
    }
    const cachedTxs = getCachedTransactions().filter((t) => t.type === 'revenue');
    if (cachedTxs.length > 0) {
      setRecentSales(cachedTxs.slice(0, 10));
    }
    setLoading(false);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, currency')
        .eq('user_id', userId)
        .limit(1);

      const b = businesses?.[0];
      if (!b) return;

      setBusinessId(b.id);
      setCurrency(b.currency || 'GHS');
      setCachedBusiness({ id: b.id, name: 'My Business', currency: b.currency || 'GHS' });

      // Load inventory items from cloud
      const { data: invData } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('business_id', b.id)
        .order('name', { ascending: true });

      if (invData) {
        const parsed = invData.map((row) => ({
          id: row.id,
          business_id: row.business_id,
          name: row.name,
          barcode: row.barcode || '',
          quantity: Number(row.quantity || 0),
          unit_cost: Number(row.cost_price ?? row.unit_cost ?? 0),
          unit_price: Number(row.selling_price ?? row.unit_price ?? 0),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
        setItems(parsed);
        setCachedInventory(parsed);
        if (parsed.length > 0 && !selectedItemId) {
          setSelectedItemId(parsed[0].id);
        }
      }

      // Load recent sales from cloud
      const { data: txData } = await supabase
        .from('transactions')
        .select('id, vendor, amount, payment_method, transaction_date, created_at')
        .eq('business_id', b.id)
        .eq('type', 'revenue')
        .order('created_at', { ascending: false })
        .limit(10);

      if (txData) {
        setRecentSales(txData as RecentSale[]);
        setCachedTransactions(txData);
      }
    } catch (_e) {
      // offline mode operates on cache
    }
  }, [selectedItemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Barcode Matching
  const matchAndSelectBarcode = (code: string) => {
    const clean = code.trim().toLowerCase();
    if (!clean) return;

    const matched = items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === clean) ||
        i.name.toLowerCase().includes(clean)
    );

    if (matched) {
      setSaleType('inventory');
      setSelectedItemId(matched.id);
      setScannedNotification(`🎯 Scanned: ${matched.name} (${currency} ${matched.unit_price.toFixed(2)}) — ${matched.quantity} in stock`);
      setErrorMsg(null);
      setBarcodeInput('');
    } else {
      setErrorMsg(`No product found with barcode or SKU: "${code}".`);
    }
  };

  // Global listener for USB / Bluetooth handheld barcode laser scanners
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
          matchAndSelectBarcode(potentialBarcode);
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
  }, [items, currency]);

  const selectedItem = items.find((i) => i.id === selectedItemId);
  const parsedQty = parseInt(quantity, 10) || 1;
  const inventoryTotalAmount = selectedItem ? parsedQty * selectedItem.unit_price : 0;
  const totalAmount = saleType === 'inventory' ? inventoryTotalAmount : parseFloat(customAmount) || 0;

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setScannedNotification(null);

    const today = new Date().toISOString().slice(0, 10);

    if (saleType === 'inventory') {
      if (!selectedItem) {
        setErrorMsg('Please select a product from your inventory.');
        return;
      }

      if (parsedQty <= 0) {
        setErrorMsg('Quantity must be at least 1.');
        return;
      }

      if (parsedQty > selectedItem.quantity) {
        setErrorMsg(`Insufficient stock. Only ${selectedItem.quantity} units of ${selectedItem.name} available.`);
        return;
      }

      setSubmitting(true);

      const vendorDesc = `Sale: ${selectedItem.name} (x${parsedQty})`;
      const newQty = Math.max(0, selectedItem.quantity - parsedQty);

      // Local stock update immediately
      const updatedItems = items.map((i) => (i.id === selectedItem.id ? { ...i, quantity: newQty } : i));
      setItems(updatedItems);
      setCachedInventory(updatedItems);

      try {
        const { error: txError } = await supabase.from('transactions').insert({
          business_id: businessId,
          transaction_date: today,
          vendor: vendorDesc,
          type: 'revenue',
          category: 'Sales',
          amount: inventoryTotalAmount,
          payment_method: paymentMethod,
        });

        if (txError) throw txError;

        try {
          await supabase.from('inventory_sales').insert({
            inventory_item_id: selectedItem.id,
            quantity_sold: parsedQty,
            sale_amount: inventoryTotalAmount,
            sale_date: today,
          });
        } catch (_e) {}

        await supabase
          .from('inventory_items')
          .update({ quantity: newQty })
          .eq('id', selectedItem.id);

        setSubmitting(false);
        setSuccessMsg(`Sale Recorded ✓ Sold ${parsedQty}x ${selectedItem.name} for ${currency} ${inventoryTotalAmount.toFixed(2)} (${paymentMethod === 'cash' ? 'Cash' : 'MoMo/Bank'}).`);
        setQuantity('1');
        loadData();
      } catch (_err: any) {
        // Offline fallback
        saveOfflineTransaction({
          business_id: businessId,
          transaction_date: today,
          vendor: vendorDesc,
          type: 'revenue',
          category: 'Sales',
          amount: inventoryTotalAmount,
          payment_method: paymentMethod,
        });

        setSubmitting(false);
        setSuccessMsg(`⚡ Sale Recorded Locally (Offline Mode) ✓ Sold ${parsedQty}x ${selectedItem.name} for ${currency} ${inventoryTotalAmount.toFixed(2)}. Stored on PC and will sync automatically when WiFi connects.`);
        setQuantity('1');
      }
    } else {
      // Custom / Service Sale
      const cleanDesc = customDescription.trim() || 'General Customer Sale';
      const cleanAmt = parseFloat(customAmount);

      if (isNaN(cleanAmt) || cleanAmt <= 0) {
        setErrorMsg('Please enter a valid sale amount.');
        return;
      }

      setSubmitting(true);

      try {
        const { error: txError } = await supabase.from('transactions').insert({
          business_id: businessId,
          transaction_date: today,
          vendor: cleanDesc,
          type: 'revenue',
          category: 'Sales',
          amount: cleanAmt,
          payment_method: paymentMethod,
        });

        if (txError) throw txError;

        setSubmitting(false);
        setSuccessMsg(`Sale Recorded ✓ Logged ${currency} ${cleanAmt.toFixed(2)} for "${cleanDesc}".`);
        setCustomDescription('');
        setCustomAmount('');
        loadData();
      } catch (_err) {
        // Offline fallback
        saveOfflineTransaction({
          business_id: businessId,
          transaction_date: today,
          vendor: cleanDesc,
          type: 'revenue',
          category: 'Sales',
          amount: cleanAmt,
          payment_method: paymentMethod,
        });

        setSubmitting(false);
        setSuccessMsg(`⚡ Sale Recorded Locally (Offline Mode) ✓ Logged ${currency} ${cleanAmt.toFixed(2)} for "${cleanDesc}". Stored on PC & will sync when online.`);
        setCustomDescription('');
        setCustomAmount('');
      }
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-textSecondary text-sm">
        Loading sales register…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-textPrimary">🛒 Record a Sale (POS Register)</h1>
            <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <span>🔫</span> Barcode Scanner Ready
            </span>
          </div>
          <p className="text-sm text-textSecondary mt-0.5">
            Use handheld USB/Bluetooth barcode guns, scan SKU, or select items to auto-decrement stock and log revenue.
          </p>
        </div>
        <Link
          href="/inventory"
          className="text-xs font-semibold px-4 py-2 rounded-xl border border-border bg-white hover:bg-gray-50 transition self-start sm:self-auto shadow-xs"
        >
          📦 View Inventory Catalog
        </Link>
      </div>

      {/* Scanned Feedback Notification */}
      {scannedNotification && (
        <div className="p-3.5 rounded-xl text-xs font-bold bg-teal-50 text-teal-900 border border-teal-300 flex items-center justify-between shadow-xs animate-fade-in">
          <span>{scannedNotification}</span>
          <button onClick={() => setScannedNotification(null)} className="text-teal-700 hover:text-teal-950">✕</button>
        </div>
      )}

      {/* Success / Error Alerts */}
      {successMsg && (
        <div className="p-4 rounded-xl text-sm font-semibold bg-green-50 text-green-800 border border-green-200 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-600 font-bold hover:text-green-900">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl text-sm font-semibold bg-red-50 text-red-800 border border-red-200 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 font-bold hover:text-red-900">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SALE ENTRY FORM */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-border shadow-xs">
          
          {/* BARCODE / SKU QUICK SCAN BAR */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              matchAndSelectBarcode(barcodeInput);
            }}
            className="mb-5 bg-gradient-to-r from-gray-50 to-emerald-50/40 p-3 rounded-xl border border-border flex items-center gap-2"
          >
            <span className="text-base" title="Laser Barcode Scanner Active">🔫</span>
            <input
              type="text"
              placeholder="Scan or type barcode / SKU (e.g. 0123456789)..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="flex-1 bg-white border border-border rounded-lg px-3 py-1.5 text-xs text-textPrimary placeholder:text-textMuted font-mono focus:outline-none focus:border-textPrimary"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-textPrimary text-white rounded-lg text-xs font-bold hover:opacity-90 transition shrink-0"
            >
              Scan ↵
            </button>
          </form>

          {/* Mode Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setSaleType('inventory')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                saleType === 'inventory' ? 'bg-white text-textPrimary shadow-xs' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <span>📦</span> Inventory Product
            </button>
            <button
              type="button"
              onClick={() => setSaleType('custom')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                saleType === 'custom' ? 'bg-white text-textPrimary shadow-xs' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <span>⚡</span> Custom / Service Sale
            </button>
          </div>

          <form onSubmit={handleRecordSale} className="space-y-4">
            
            {saleType === 'inventory' ? (
              <>
                {/* Product Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-textSecondary mb-1.5">
                    Select Product ({items.length} in Catalog)
                  </label>
                  {items.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      No products in inventory yet. <Link href="/inventory" className="font-bold underline">Add products in Inventory</Link> first.
                    </div>
                  ) : (
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm font-medium text-textPrimary focus:outline-none focus:border-textPrimary bg-white"
                    >
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} {item.barcode ? `[${item.barcode}]` : ''} — {currency} {item.unit_price.toFixed(2)} ({item.quantity} in stock)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedItem && (
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-border flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-textPrimary flex items-center gap-2">
                        <span>{selectedItem.name}</span>
                        {selectedItem.barcode && (
                          <span className="font-mono text-[10px] bg-white border border-border px-1.5 py-0.5 rounded text-textSecondary">
                            {selectedItem.barcode}
                          </span>
                        )}
                      </p>
                      <p className="text-textSecondary mt-0.5">
                        Unit Selling Price: <span className="font-semibold text-emerald-700">{currency} {selectedItem.unit_price.toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                        selectedItem.quantity > 5 ? 'bg-green-100 text-green-800' : selectedItem.quantity > 0 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedItem.quantity} In Stock
                      </span>
                    </div>
                  </div>
                )}

                {/* Quantity Input */}
                <div>
                  <label className="block text-xs font-bold text-textSecondary mb-1.5">Quantity Sold</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity(String(Math.max(1, parsedQty - 1)))}
                      className="w-10 h-10 rounded-xl border border-border bg-gray-50 text-base font-bold hover:bg-gray-100 flex items-center justify-center"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="flex-1 border border-border rounded-xl px-3.5 py-2 text-sm text-center font-bold text-textPrimary focus:outline-none focus:border-textPrimary"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(String(parsedQty + 1))}
                      className="w-10 h-10 rounded-xl border border-border bg-gray-50 text-base font-bold hover:bg-gray-100 flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Custom / Service Sale Form */}
                <div>
                  <label className="block text-xs font-bold text-textSecondary mb-1.5">Sale Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Delivery Service, Hair Cut, Bulk Consultation"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm font-medium text-textPrimary focus:outline-none focus:border-textPrimary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-textSecondary mb-1.5">Total Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 150.00"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm font-bold text-emerald-700 focus:outline-none focus:border-textPrimary text-lg"
                  />
                </div>
              </>
            )}

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-bold text-textSecondary mb-1.5">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    paymentMethod === 'cash' ? 'border-textPrimary bg-gray-50 ring-1 ring-textPrimary' : 'border-border hover:bg-gray-50/50'
                  }`}
                >
                  <span className="text-xl">💵</span>
                  <div>
                    <div className="font-bold text-xs text-textPrimary">Cash Payment</div>
                    <div className="text-[10.5px] text-textSecondary">Physical cash received</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    paymentMethod === 'bank' ? 'border-textPrimary bg-gray-50 ring-1 ring-textPrimary' : 'border-border hover:bg-gray-50/50'
                  }`}
                >
                  <span className="text-xl">📱</span>
                  <div>
                    <div className="font-bold text-xs text-textPrimary">MoMo / Bank</div>
                    <div className="text-[10.5px] text-textSecondary">MTN MoMo, Telecel, Card</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Total Summary & Submit */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-textSecondary">Total Sale Inflow:</span>
                <span className="text-2xl font-black text-emerald-700">
                  {currency} {totalAmount.toFixed(2)}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || (saleType === 'inventory' && (!selectedItem || selectedItem.quantity <= 0))}
                className="w-full py-3.5 bg-textPrimary text-white rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs"
              >
                <span>{submitting ? 'Recording Sale…' : `Confirm Sale (${currency} ${totalAmount.toFixed(2)})`}</span>
                <span>→</span>
              </button>
            </div>

          </form>

        </div>

        {/* RECENT SALES STREAM */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
            <h3 className="text-sm font-bold text-textPrimary mb-3 flex items-center justify-between">
              <span>📋 Recent Sales Stream</span>
              <span className="text-xs font-normal text-textSecondary">Real-time inflows</span>
            </h3>

            {recentSales.length === 0 ? (
              <p className="text-xs text-textMuted py-4 text-center">No sales recorded yet today.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-textPrimary">{sale.vendor}</p>
                      <p className="text-[11px] text-textSecondary mt-0.5">
                        {sale.transaction_date} · <span className="capitalize">{sale.payment_method === 'bank' ? 'MoMo/Bank' : 'Cash'}</span>
                      </p>
                    </div>
                    <span className="font-bold text-emerald-700 text-sm">
                      +{currency} {Number(sale.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
