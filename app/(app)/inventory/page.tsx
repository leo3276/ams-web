'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { InventoryItem } from '@/lib/types';
import { useArchetype } from '@/lib/ArchetypeContext';
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

import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedInventory,
  setCachedInventory,
  getCachedTransactions,
  setCachedTransactions,
  resolveActiveBusiness,
} from '@/lib/offlineStore';
import { logAuditEvent } from '@/lib/auditLogger';

export default function InventoryPage() {
  const { archetype, isEducation } = useArchetype();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [rows, setRows] = useState<Row[]>([]);
  const [newDraftItem, setNewDraftItem] = useState<Row>(emptyRow());
  const [draftPaymentChannel, setDraftPaymentChannel] = useState<'cash' | 'bank'>('cash');
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
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Non-blocking item deletion confirmation modal state
  const [rowToDelete, setRowToDelete] = useState<Row | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');

  // Store-wide Global Target Profit Margin
  const [globalMargin, setGlobalMargin] = useState<number>(25);
  const [applyingBulkMargin, setApplyingBulkMargin] = useState(false);
  const [bulkSuccessToast, setBulkSuccessToast] = useState<string | null>(null);
  const [toastNotify, setToastNotify] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastNotify({ type, message });
    setTimeout(() => setToastNotify(null), 5000);
  };

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
    const bid = cachedBiz?.id || 'default_biz';
    setBusinessId(bid);
    if (cachedBiz) {
      setBusinessName(cachedBiz.name || 'My Business');
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedInv = getCachedInventory(bid);
    const initialRows: Row[] = cachedInv.map((item) => ({
      ...item,
      _localId: item.id,
      _lastSavedQuantity: Number(item.quantity || 0),
    }));
    setRows(initialRows);
    setLoading(false);

    try {
      const b = await resolveActiveBusiness();
      if (!b) return;

      setBusinessId(b.id);
      setBusinessName(b.name || 'My Business');
      setCurrency(b.currency || 'GHS');

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('business_id', b.id)
        .order('name', { ascending: true });

      const remoteInv = (!error && data) ? data : [];
      const localInv = getCachedInventory(b.id);
      const invMap = new Map<string, any>();
      localInv.forEach((i: any) => {
        if (i?.id) invMap.set(i.id, i);
      });
      remoteInv.forEach((i: any) => {
        if (i?.id) {
          const existing = invMap.get(i.id);
          invMap.set(i.id, {
            ...existing,
            ...i,
          });
        }
      });
      const allInv = Array.from(invMap.values());

      const loadedRows: Row[] = allInv.map((item: any) => ({
        id: item.id,
        name: item.name,
        barcode: item.barcode || '',
        quantity: Number(item.quantity || 0),
        unit_cost: Number(item.unit_cost ?? item.cost_price ?? 0),
        unit_price: Number(item.unit_price ?? item.selling_price ?? 0),
        _localId: item.id,
        _lastSavedQuantity: Number(item.quantity || 0),
      }));

      setRows(loadedRows);
      setCachedInventory(allInv as any, b.id);
    } catch (_e) {
      // offline mode operates on cache
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('ams:inventory-updated', handleUpdate);
    window.addEventListener('ams:business-updated', handleUpdate);
    return () => {
      window.removeEventListener('ams:inventory-updated', handleUpdate);
      window.removeEventListener('ams:business-updated', handleUpdate);
    };
  }, [loadData]);

  // Global listener for USB/Bluetooth handheld barcode laser scanners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
      if (isInput) return; // Never intercept normal user typing in inputs!

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
        if (timeDiff < 60) {
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
    }
  };

  const updateRow = (localId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));
  };

  const updateDraftItem = (patch: Partial<Row>) => {
    setNewDraftItem((prev) => ({ ...prev, ...patch }));
  };

  const handleDraftCostChange = (newCost: number) => {
    const calculatedPrice = Number((newCost * (1 + globalMargin / 100)).toFixed(2));
    setNewDraftItem((prev) => ({
      ...prev,
      unit_cost: newCost,
      unit_price: prev.unit_price === 0 ? calculatedPrice : prev.unit_price,
    }));
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
      showToast('success', `Updated selling prices for all ${updatedCount} products to +${globalMargin}% profit margin! ✓`);
    } catch (err: any) {
      showToast('error', 'Error applying profit margin: ' + err.message);
    } finally {
      setApplyingBulkMargin(false);
    }
  };

  // Saves existing item changes directly on blur
  const saveExistingItemDetails = async (row: Row) => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (!row.id || !row.name || !row.name.trim()) return;
    const targetQty = Number(row.quantity ?? 0);
    const itemCost = Number(row.unit_cost ?? 0);
    const itemPrice = Number(row.unit_price ?? 0);

    try {
      await supabase
        .from('inventory_items')
        .update({
          name: row.name.trim(),
          barcode: row.barcode?.trim() || null,
          quantity: targetQty,
          unit_cost: itemCost,
          unit_price: itemPrice,
        })
        .eq('id', row.id);
    } catch (_e) {}

    // Update local storage cache
    try {
      const cached = getCachedInventory(activeBid);
      const idx = cached.findIndex((i: any) => i.id === row.id);
      if (idx >= 0) {
        cached[idx] = {
          ...cached[idx],
          name: row.name.trim(),
          barcode: row.barcode?.trim() || null,
          quantity: targetQty,
          unit_cost: itemCost,
          unit_price: itemPrice,
        };
        setCachedInventory(cached, activeBid);
        setCachedInventory(cached, 'default_biz');
      }
    } catch (_e) {}

    updateRow(row._localId, {
      _lastSavedQuantity: targetQty,
      _saving: false,
    });
    window.dispatchEvent(new Event('ams:inventory-updated'));
  };

  // Saves top new item draft without prematurely jumping row
  const saveNewDraftItem = async () => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (!newDraftItem.name || !newDraftItem.name.trim()) {
      showToast('error', 'Please enter an item name before saving.');
      return;
    }

    let createdItem: any = null;
    const itemCost = Number(newDraftItem.unit_cost || 0);
    const itemPrice = Number(newDraftItem.unit_price || 0);
    const itemQty = Number(newDraftItem.quantity || 0);

    try {
      // Attempt primary insert
      const insertPayload: any = {
        business_id: activeBid,
        name: newDraftItem.name.trim(),
        barcode: newDraftItem.barcode?.trim() || null,
        quantity: itemQty,
        unit_cost: itemCost,
        unit_price: itemPrice,
        cost_price: itemCost,
        selling_price: itemPrice,
      };

      const { data, error } = await supabase
        .from('inventory_items')
        .insert(insertPayload)
        .select()
        .single();

      if (!error && data) {
        createdItem = {
          ...data,
          unit_cost: Number(data.unit_cost ?? data.cost_price ?? itemCost),
          unit_price: Number(data.unit_price ?? data.selling_price ?? itemPrice),
        };
      } else {
        // Retry with standard columns in case extra columns were rejected
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('inventory_items')
          .insert({
            business_id: activeBid,
            name: newDraftItem.name.trim(),
            barcode: newDraftItem.barcode?.trim() || null,
            quantity: itemQty,
            unit_cost: itemCost,
            unit_price: itemPrice,
          })
          .select()
          .single();

        if (!fallbackError && fallbackData) {
          createdItem = {
            ...fallbackData,
            unit_cost: Number(fallbackData.unit_cost ?? fallbackData.cost_price ?? itemCost),
            unit_price: Number(fallbackData.unit_price ?? fallbackData.selling_price ?? itemPrice),
          };
        }
      }
    } catch (_e) {}

    if (!createdItem) {
      const offlineId = crypto.randomUUID();
      createdItem = {
        id: offlineId,
        business_id: activeBid,
        name: newDraftItem.name.trim(),
        barcode: newDraftItem.barcode?.trim() || '',
        quantity: itemQty,
        unit_cost: itemCost,
        unit_price: itemPrice,
      };
    }

    try {
      const cached = getCachedInventory(activeBid);
      const filtered = cached.filter((i: any) => i.id !== createdItem.id);
      const updatedInv = [createdItem, ...filtered];
      setCachedInventory(updatedInv, activeBid);
      setCachedInventory(updatedInv, 'default_biz');
    } catch (_e) {}

    // Log to Audit Trail
    logAuditEvent({
      businessId: activeBid,
      actionType: 'CREATE',
      entityType: 'inventory_item',
      entityId: createdItem.id,
      entityName: createdItem.name,
      description: `Added new inventory product "${createdItem.name}" (${createdItem.quantity} units @ ${currency} ${createdItem.unit_price})`,
      newValue: createdItem,
    });

    // Record Cash/Bank Stock Purchase Transaction in Ledger
    const totalPurchaseCost = itemQty * itemCost;
    if (totalPurchaseCost > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const purchaseTx = {
        id: crypto.randomUUID(),
        business_id: activeBid,
        transaction_date: today,
        vendor: `Purchases: ${itemQty}x ${createdItem.name}`,
        type: 'cost_of_goods',
        category: `Cost of Goods: Purchases (${draftPaymentChannel === 'bank' ? 'Bank / MoMo' : 'Cash Drawer'})`,
        amount: totalPurchaseCost,
        payment_method: draftPaymentChannel,
        created_at: new Date().toISOString(),
      };

      try {
        const existingTxs = getCachedTransactions(activeBid);
        setCachedTransactions([purchaseTx, ...existingTxs], activeBid);
        window.dispatchEvent(new Event('ams:transactions-updated'));

        if (activeBid && activeBid !== 'default_biz') {
          supabase.from('transactions').insert(purchaseTx).then(() => {});
        }
      } catch (_e) {}
    }

    const savedRow: Row = {
      id: createdItem.id,
      name: createdItem.name,
      barcode: createdItem.barcode || '',
      quantity: Number(createdItem.quantity || 0),
      unit_cost: Number(createdItem.unit_cost || 0),
      unit_price: Number(createdItem.unit_price || 0),
      _localId: createdItem.id,
      _lastSavedQuantity: Number(createdItem.quantity || 0),
    };

    setRows((prev) => [savedRow, ...prev.filter((r) => r.id !== createdItem.id && r._localId !== createdItem.id)]);
    setNewDraftItem(emptyRow()); // Reset clean top row for next entry
    window.dispatchEvent(new Event('ams:inventory-updated'));
  };

  const handleQuantityBlur = async (row: Row) => {
    const targetQty = Number(row.quantity ?? 0);
    const lastSaved = Number(row._lastSavedQuantity ?? 0);
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';

    if (targetQty === lastSaved && row.id) return;

    updateRow(row._localId, { _saving: true, quantity: targetQty, _lastSavedQuantity: targetQty });

    // 1. Immediately update local storage cache so it NEVER reverts on UI reload
    try {
      const cached = getCachedInventory(activeBid);
      const idx = cached.findIndex((i: any) => i.id === row.id || i.id === row._localId);
      if (idx >= 0) {
        cached[idx] = {
          ...cached[idx],
          quantity: targetQty,
          unit_cost: Number(row.unit_cost || 0),
          unit_price: Number(row.unit_price || 0),
        };
        setCachedInventory(cached, activeBid);
        setCachedInventory(cached, 'default_biz');
      }
    } catch (_e) {}

    // 2. Persist to Supabase
    if (row.id) {
      try {
        await supabase
          .from('inventory_items')
          .update({
            quantity: targetQty,
            unit_cost: Number(row.unit_cost || 0),
            unit_price: Number(row.unit_price || 0),
          })
          .eq('id', row.id);
      } catch (_e) {}
    }

    // 3. If quantity increased, log stock added transaction in background
    const delta = targetQty - lastSaved;
    if (delta > 0) {
      const unitCost = Number(row.unit_cost || 0);
      const totalCost = delta * unitCost;
      if (totalCost > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const purchaseTx = {
          id: crypto.randomUUID(),
          business_id: activeBid,
          transaction_date: today,
          vendor: `Purchases: ${delta}x ${row.name || 'Restocked Item'}`,
          type: 'cost_of_goods',
          category: 'Cost of Goods: Stock Added',
          amount: totalCost,
          payment_method: 'cash',
          created_at: new Date().toISOString(),
        };
        try {
          const existingTxs = getCachedTransactions(activeBid);
          setCachedTransactions([purchaseTx, ...existingTxs], activeBid);
          window.dispatchEvent(new Event('ams:transactions-updated'));
          if (activeBid && activeBid !== 'default_biz') {
            supabase.from('transactions').insert(purchaseTx).then(() => {});
          }
        } catch (_e) {}
      }
    }

    updateRow(row._localId, {
      quantity: targetQty,
      _lastSavedQuantity: targetQty,
      _saving: false,
      _pendingPayment: false,
      _pendingDelta: undefined,
    });
    window.dispatchEvent(new Event('ams:inventory-updated'));
  };

  const confirmRestock = async (row: Row, paymentMethod: 'cash' | 'bank') => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (!row._pendingDelta || !row.id) return;
    updateRow(row._localId, { _saving: true });

    const delta = row._pendingDelta;
    const unitCost = Number(row.unit_cost || 0);
    const totalCost = delta * unitCost;
    const newQuantity = (Number(row._lastSavedQuantity) || 0) + delta;
    const today = new Date().toISOString().slice(0, 10);

    try {
      if (activeBid && activeBid !== 'default_biz') {
        const { error: restockError } = await supabase.rpc('restock_inventory_item', {
          p_inventory_item_id: row.id,
          p_quantity_added: delta,
          p_payment_method: paymentMethod,
        });

        if (restockError) {
          // Fallback direct update
          await supabase.from('inventory_items').update({ quantity: newQuantity }).eq('id', row.id);
          if (totalCost > 0) {
            await supabase.from('transactions').insert({
              business_id: activeBid,
              transaction_date: today,
              vendor: `Purchases: ${delta}x ${row.name}`,
              type: 'cost_of_goods',
              category: `Cost of Goods: Purchases (${paymentMethod === 'bank' ? 'Bank / MoMo' : 'Cash Drawer'})`,
              amount: totalCost,
              payment_method: paymentMethod,
            });
          }
        }
      }
    } catch (_err) {}

    // Record local transaction for Live Ledger & Cash/Bank deduction
    if (totalCost > 0) {
      const restockTx = {
        id: crypto.randomUUID(),
        business_id: activeBid,
        transaction_date: today,
        vendor: `Purchases: ${delta}x ${row.name}`,
        type: 'cost_of_goods',
        category: `Cost of Goods: Purchases (${paymentMethod === 'bank' ? 'Bank / MoMo' : 'Cash Drawer'})`,
        amount: totalCost,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      };

      try {
        const existingTxs = getCachedTransactions(activeBid);
        setCachedTransactions([restockTx, ...existingTxs], activeBid);
        window.dispatchEvent(new Event('ams:transactions-updated'));
      } catch (_e) {}
    }

    setRows((prev) => {
      const updated = prev.map((r) =>
        r._localId === row._localId
          ? { ...r, quantity: newQuantity, _lastSavedQuantity: newQuantity, _saving: false, _pendingPayment: false, _pendingDelta: undefined }
          : r
      );
      setCachedInventory(
        updated
          .filter((item) => Boolean(item.name))
          .map((item) => ({
            id: item.id || item._localId,
            business_id: activeBid,
            name: item.name || 'Unnamed Product',
            barcode: item.barcode || null,
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.unit_cost || 0),
            unit_price: Number(item.unit_price || 0),
          })),
        activeBid
      );
      return updated;
    });

    logAuditEvent({
      businessId: activeBid,
      actionType: 'STOCK_ADJUSTMENT',
      entityType: 'inventory_item',
      entityId: row.id,
      entityName: row.name,
      description: `Restocked +${delta} units of "${row.name}" for ${currency} ${totalCost.toFixed(2)} (${paymentMethod === 'bank' ? 'Bank / MoMo' : 'Cash Drawer'})`,
      newValue: { quantity: newQuantity },
    });

    window.dispatchEvent(new Event('ams:inventory-updated'));
  };

  const cancelRestock = (row: Row) => {
    updateRow(row._localId, {
      _pendingPayment: false,
      _pendingDelta: undefined,
      quantity: row._lastSavedQuantity,
    });
  };

  const executeDeleteRow = async (row: Row) => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (row.id) {
      try {
        await supabase.from('inventory_items').delete().eq('id', row.id);
      } catch (_e) {}

      // Log to audit trail
      logAuditEvent({
        businessId: activeBid,
        actionType: 'DELETE',
        entityType: 'inventory_item',
        entityId: row.id,
        entityName: row.name,
        description: `Deleted inventory item "${row.name}" (${row.quantity} units @ ${currency} ${row.unit_price})`,
        oldValue: row,
      });

      // Update local storage cache
      try {
        const cached = getCachedInventory(activeBid);
        const filtered = cached.filter((i: any) => i.id !== row.id);
        setCachedInventory(filtered, activeBid);
      } catch (_e) {}
    }
    setRows((prev) => prev.filter((r) => r._localId !== row._localId && r.id !== row.id));
    window.dispatchEvent(new Event('ams:inventory-updated'));
  };

  const deleteRow = async (row: Row) => {
    if (row.id) {
      setRowToDelete(row);
    } else {
      setRows((prev) => prev.filter((r) => r._localId !== row._localId));
    }
  };

  const executeDeleteAll = async () => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (rows.length === 0) return;

    try {
      await supabase.from('inventory_items').delete().eq('business_id', activeBid);
    } catch (_e) {}

    // Preserve all deleted entries in the Audit Trail
    logAuditEvent({
      businessId: activeBid,
      actionType: 'DELETE',
      entityType: 'inventory_item',
      entityId: 'bulk_inventory_clear',
      entityName: 'All Inventory Items',
      description: `Bulk deleted all ${rows.length} inventory products from catalog.`,
      metadata: { deletedCount: rows.length, deletedItems: rows },
    });

    setRows([]);
    setCachedInventory([], activeBid);
    window.dispatchEvent(new Event('ams:inventory-updated'));
    setShowDeleteAllModal(false);
    setDeleteAllConfirmText('');
  };

  const handleDeleteAll = async () => {
    if (rows.length === 0) return;
    setDeleteAllConfirmText('');
    setShowDeleteAllModal(true);
  };

  // Instant POS Sale from Barcode Pop-Up
  const handleExecuteQuickSale = async () => {
    if (!scannedItem || !businessId || !scannedItem.id) return;
    setActionErrorMsg(null);
    const qty = parseInt(saleQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setActionErrorMsg('Please enter a valid sale quantity.');
      return;
    }

    const currentQty = Number(scannedItem.quantity || 0);
    if (qty > currentQty) {
      setActionErrorMsg(`Cannot sell ${qty} units. Only ${currentQty} in stock.`);
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
      setActionErrorMsg('Could not update stock: ' + stockErr.message);
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
    setActionErrorMsg(null);
    const qty = parseInt(saleQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setActionErrorMsg('Please enter a valid restock quantity.');
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
      setActionErrorMsg('Could not restock: ' + stockErr.message);
      setActionProcessing(false);
      return;
    }

    if (totalCost > 0) {
      const restockTx = {
        id: crypto.randomUUID(),
        business_id: businessId,
        transaction_date: today,
        vendor: `Purchases: ${qty}x ${scannedItem.name}`,
        type: 'cost_of_goods',
        category: `Cost of Goods: Purchases (${paymentMethod === 'bank' ? 'Bank / MoMo' : 'Cash Drawer'})`,
        amount: totalCost,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      };

      try {
        const existingTxs = getCachedTransactions(businessId);
        setCachedTransactions([restockTx, ...existingTxs], businessId);
        window.dispatchEvent(new Event('ams:transactions-updated'));
        if (businessId && businessId !== 'default_biz') {
          supabase.from('transactions').insert(restockTx).then(() => {});
        }
      } catch (_e) {}
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
    return rows.filter((r) => {
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
  }, [rows, searchTerm, stockFilter]);

  // CSV Export
  const exportCSV = () => {
    if (realRows.length === 0) {
      showToast('error', 'No inventory items to export.');
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
          {realRows.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-danger/30 text-danger bg-dangerBg/40 hover:bg-dangerBg transition text-xs font-bold shadow-xs"
              title="Delete all items (Audit Log preserved)"
            >
              🗑️ Delete All ({realRows.length})
            </button>
          )}
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
                { name: businessName, currency }
              )
            }
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-textPrimary text-white hover:opacity-90 transition text-sm font-bold shadow-xs"
          >
            📄 Export Stylish PDF
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-surface2 text-sm text-textPrimary hover:bg-surface1 transition font-medium"
          >
            📥 CSV
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

      {toastNotify && (
        <div
          className={`p-3.5 rounded-xl text-sm font-semibold flex items-center justify-between mb-6 shadow-xs border ${
            toastNotify.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{toastNotify.message}</span>
          <button
            onClick={() => setToastNotify(null)}
            className="text-sm font-bold opacity-70 hover:opacity-100 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {bulkSuccessToast && !toastNotify && (
        <div className="p-3.5 rounded-xl text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-between mb-6">
          <span>{bulkSuccessToast}</span>
          <button onClick={() => setBulkSuccessToast(null)} className="text-emerald-700 font-bold hover:text-emerald-950">✕</button>
        </div>
      )}

      {/* ======================================================== */}
      {/* STORE-WIDE TARGET PROFIT MARGIN ENGINE                   */}
      {/* ======================================================== */}
      <div className="bg-surface1 rounded-xl p-4 border border-border mb-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-textPrimary">Store-wide Target Profit Margin</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-accentBg text-accentText">
                Automated Pricing
              </span>
            </div>
            <p className="text-xs text-textSecondary">
              When entering item cost, selling price auto-calculates to yield your target margin.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-surface2 px-2 py-1 rounded-lg border border-border">
              <span className="text-xs text-textSecondary font-medium">Margin:</span>
              <input
                type="number"
                min="0"
                max="1000"
                step="1"
                value={globalMargin}
                onChange={(e) => handleSetGlobalMargin(parseFloat(e.target.value) || 0)}
                className="w-14 px-1.5 py-0.5 text-xs text-right font-bold bg-surface1 text-textPrimary rounded border border-border focus:outline-none focus:border-accent"
              />
              <span className="text-xs font-bold text-textPrimary">%</span>
            </div>

            <button
              onClick={handleApplyGlobalMarginToAll}
              disabled={applyingBulkMargin || realRows.length === 0}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50 shadow-xs flex items-center gap-1.5"
            >
              <span>⚡</span> {applyingBulkMargin ? 'Recalculating Prices…' : `Apply +${globalMargin}% To All Items`}
            </button>
          </div>
        </div>
      </div>

      {/* Valuation Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Stock Asset Value</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalCostVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{metrics.totalStockUnits.toLocaleString()} units in stock</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Retail Value</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{realRows.length} catalog products</p>
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

      {/* Search & Barcode Scanner Toolbar */}
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
              <th className="px-2 py-2 font-medium text-center w-16">Action</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. DEDICATED TOP DRAFT ROW - Stays fixed in place while typing across columns */}
            <tr className="border-b-2 border-accent/40 bg-accentBg/25">
              {/* Name */}
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-accentText shrink-0">+ Add:</span>
                  <input
                    type="text"
                    value={newDraftItem.name ?? ''}
                    onChange={(e) => updateDraftItem({ name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraftItem(); }}
                    placeholder="Type new item name (e.g. Flour 25kg)"
                    className="w-full px-2.5 py-1.5 rounded focus:outline-none focus:bg-surface1 text-xs font-semibold text-textPrimary border border-accent/40 bg-surface1"
                  />
                </div>
              </td>

              {/* Barcode */}
              <td className="px-2 py-2">
                <input
                  type="text"
                  value={newDraftItem.barcode ?? ''}
                  onChange={(e) => updateDraftItem({ barcode: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraftItem(); }}
                  placeholder="Scan / SKU"
                  className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-surface1 text-xs font-mono text-textPrimary border border-border/70"
                />
              </td>

              {/* Quantity */}
              <td className="px-2 py-2 text-right">
                <input
                  type="number"
                  step="1"
                  value={newDraftItem.quantity || ''}
                  onChange={(e) => updateDraftItem({ quantity: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraftItem(); }}
                  placeholder="0"
                  className="w-20 px-2 py-1.5 rounded text-right focus:outline-none focus:bg-surface1 text-xs font-bold text-textPrimary border border-border/70"
                />
              </td>

              {/* Unit Cost */}
              <td className="px-2 py-2 text-right">
                <input
                  type="number"
                  step="0.01"
                  value={newDraftItem.unit_cost || ''}
                  onChange={(e) => handleDraftCostChange(parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraftItem(); }}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-surface1 text-xs font-medium text-textPrimary border border-border/70"
                />
              </td>

              {/* Unit Price */}
              <td className="px-2 py-2 text-right">
                <input
                  type="number"
                  step="0.01"
                  value={newDraftItem.unit_price || ''}
                  onChange={(e) => updateDraftItem({ unit_price: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNewDraftItem(); }}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-surface1 text-xs font-bold text-textPrimary border border-accent/40 bg-surface1"
                />
              </td>

              {/* Margin Preview */}
              <td className="px-3 py-2 text-right">
                {(() => {
                  const c = Number(newDraftItem.unit_cost || 0);
                  const p = Number(newDraftItem.unit_price || 0);
                  const profit = p - c;
                  const margin = p > 0 ? (profit / p) * 100 : 0;
                  return (
                    <div>
                      <p className={`text-xs font-semibold ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
                        +{currency} {profit.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-textMuted">{margin.toFixed(0)}% margin</p>
                    </div>
                  );
                })()}
              </td>

              {/* Total Cost Value & Funding Source */}
              <td className="px-3 py-2 text-right">
                <p className="font-medium text-textPrimary text-xs">
                  {currency} {(Number(newDraftItem.quantity || 0) * Number(newDraftItem.unit_cost || 0)).toFixed(2)}
                </p>
                {Number(newDraftItem.quantity || 0) > 0 && (
                  <select
                    value={draftPaymentChannel}
                    onChange={(e) => setDraftPaymentChannel(e.target.value as 'cash' | 'bank')}
                    className="mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border/80 bg-surface1 text-textSecondary focus:outline-none"
                    title="Source account to pay for this inventory purchase"
                  >
                    <option value="cash">Paid via Cash 💵</option>
                    <option value="bank">Paid via Bank/MoMo 📱</option>
                  </select>
                )}
              </td>

              {/* Save Button */}
              <td className="px-2 py-2 text-center">
                <button
                  onClick={saveNewDraftItem}
                  disabled={!newDraftItem.name || !newDraftItem.name.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                >
                  + Save
                </button>
              </td>
            </tr>

            {/* 2. CATALOG ITEMS */}
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-textMuted text-sm">
                  {searchTerm ? `No products matching "${searchTerm}"` : 'No items in catalog yet.'}
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

                return (
                  <tr
                    key={row._localId}
                    className="border-t border-border hover:bg-surface1/50 transition"
                  >
                    {/* Item Name */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.name ?? ''}
                        onChange={(e) => updateRow(row._localId, { name: e.target.value })}
                        onBlur={() => saveExistingItemDetails(row)}
                        placeholder="Item name"
                        className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-sm font-medium text-textPrimary"
                      />
                    </td>

                    {/* Barcode / SKU */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.barcode ?? ''}
                        onChange={(e) => updateRow(row._localId, { barcode: e.target.value })}
                        onBlur={() => saveExistingItemDetails(row)}
                        placeholder="Scan / SKU"
                        className="w-full px-2 py-1.5 rounded focus:outline-none focus:bg-accentBg text-xs font-mono text-textSecondary"
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="1"
                        value={row.quantity ?? 0}
                        onChange={(e) =>
                          updateRow(row._localId, { quantity: parseFloat(e.target.value) || 0 })
                        }
                        onBlur={() => handleQuantityBlur(row)}
                        className={`w-20 px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg font-bold text-textPrimary`}
                      />
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
                        onBlur={() => saveExistingItemDetails(row)}
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
                        onBlur={() => saveExistingItemDetails(row)}
                        className="w-full px-2 py-1.5 rounded text-right focus:outline-none focus:bg-accentBg font-semibold text-textPrimary"
                      />
                    </td>

                    {/* Margin Preview */}
                    <td className="px-3 py-1.5 text-right">
                      <div>
                        <p className={`text-xs font-semibold ${profitPerUnit >= 0 ? 'text-success' : 'text-danger'}`}>
                          +{currency} {profitPerUnit.toFixed(2)}
                        </p>
                        <p className="text-[10.5px] text-textMuted">{marginPct.toFixed(0)}% margin</p>
                      </div>
                    </td>

                    {/* Total Cost Value */}
                    <td className="px-3 py-1.5 text-right font-medium text-textPrimary text-xs">
                      {currency} {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => deleteRow(row)}
                        className="text-textMuted hover:text-danger text-xs p-1"
                        title="Delete item"
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

            {actionErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold text-center">
                {actionErrorMsg}
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

      {/* Item Delete Confirmation Modal */}
      {rowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Product</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete <span className="font-semibold text-slate-900 dark:text-white">{rowToDelete.name || 'this product'}</span> from your active catalog?
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRowToDelete(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = rowToDelete;
                  setRowToDelete(null);
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

      {/* Bulk Clear Inventory Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Clear Active Catalog</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Permanently records snapshot in Audit Trail</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Are you sure you want to delete ALL <span className="font-bold text-slate-900 dark:text-white">{rows.length}</span> products from inventory? Type <span className="font-mono font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-1 py-0.5 rounded">DELETE ALL</span> to confirm:
            </p>
            <input
              type="text"
              placeholder="DELETE ALL"
              value={deleteAllConfirmText}
              onChange={(e) => setDeleteAllConfirmText(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white mb-6"
            />
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAllModal(false);
                  setDeleteAllConfirmText('');
                }}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteAllConfirmText !== 'DELETE ALL'}
                onClick={executeDeleteAll}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-40 transition"
              >
                Confirm Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
