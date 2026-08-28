'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Supplier, DebtType, InventoryItem } from '@/lib/types';
import { useUserRole } from '@/lib/RoleContext';
import {
  getCachedBusiness,
  getCachedSuppliers,
  setCachedSuppliers,
  addCachedSupplier,
  updateCachedSupplier,
  deleteCachedSupplier,
  updateCachedSupplierBalance,
  getCachedInventory,
  isOnline,
} from '@/lib/offlineStore';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  getGoodsReceivedNotes,
  recordGoodsReceived,
  getSupplierPaymentVouchers,
  recordSupplierPayout,
  getWhatsAppPurchaseOrderLink,
  getWhatsAppSupplierRemittanceLink,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceivedNote,
  SupplierPaymentVoucher,
} from '@/lib/supplierPipelineStore';
import { printSupplierDebtBookPDF } from '@/lib/pdfGenerator';
import { logAuditEvent } from '@/lib/auditLogger';

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

export default function SuppliersPage() {
  const { role } = useUserRole();
  const [businessName, setBusinessName] = useState('My Business');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [activeTab, setActiveTab] = useState<'directory' | 'orders' | 'dock' | 'payouts'>('directory');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Core Data Lists
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [grnList, setGrnList] = useState<GoodsReceivedNote[]>([]);
  const [vouchers, setVouchers] = useState<SupplierPaymentVoucher[]>([]);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [filterDebtTab, setFilterDebtTab] = useState<'all' | 'owing' | 'settled'>('all');

  // =========================================================================
  // MODAL STATES
  // =========================================================================
  // 1. Supplier Add / Edit Modal
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showEditSupplierModal, setShowEditSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCategory, setFormCategory] = useState('General Goods');
  const [formDebtType, setFormDebtType] = useState<DebtType>('inventory');
  const [formStartingDebt, setFormStartingDebt] = useState('0');
  const [formTerms, setFormTerms] = useState('Net 30');
  const [formMoMoNumber, setFormMoMoNumber] = useState('');
  const [formBankDetails, setFormBankDetails] = useState('');

  // 2. Create Stock Request (PO) Modal
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([
    { productName: '', unit: 'pieces', quantityOrdered: 10, estimatedUnitCost: 0, totalCost: 0 },
  ]);
  const [poDeliveryDate, setPoDeliveryDate] = useState('');
  const [poTerms, setPoTerms] = useState('Cash on Delivery');
  const [poNotes, setPoNotes] = useState('');

  // 3. Receive at Dock (GRN) Modal
  const [showGRNModal, setShowGRNModal] = useState(false);
  const [selectedPOForGRN, setSelectedPOForGRN] = useState<PurchaseOrder | null>(null);
  const [grnSupplierId, setGrnSupplierId] = useState('');
  const [grnItems, setGrnItems] = useState<{ productId?: string; productName: string; quantityOrdered: number; quantityReceived: number; quantityDamaged: number; unitCost: number }[]>([]);
  const [grnReceivedBy, setGrnReceivedBy] = useState('Store Manager');
  const [grnInvoiceRef, setGrnInvoiceRef] = useState('');

  // 4. Supplier Payout Desk Modal
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutSupplierId, setPayoutSupplierId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'momo' | 'bank' | 'cash'>('momo');
  const [payoutMoMoNumber, setPayoutMoMoNumber] = useState('');
  const [payoutBankName, setPayoutBankName] = useState('');
  const [payoutBankAccountNo, setPayoutBankAccountNo] = useState('');
  const [payoutRef, setPayoutRef] = useState('');
  const [payoutWhtRate, setPayoutWhtRate] = useState<number>(0);
  const [payoutPaidFrom, setPayoutPaidFrom] = useState('Store Cash Till');
  const [payoutNotes, setPayoutNotes] = useState('');

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadAllData = useCallback(() => {
    const b = getCachedBusiness();
    const bid = b?.id || 'default_biz';
    if (b) {
      setBusinessId(b.id);
      setBusinessName(b.name);
      setCurrency(b.currency || 'GHS');
    }

    setSuppliers(getCachedSuppliers(bid));
    setInventory(getCachedInventory(bid));
    setPurchaseOrders(getPurchaseOrders(bid));
    setGrnList(getGoodsReceivedNotes(bid));
    setVouchers(getSupplierPaymentVouchers(bid));
  }, []);

  useEffect(() => {
    loadAllData();
    window.addEventListener('ams:suppliers-data-updated', loadAllData);
    window.addEventListener('ams:purchase-orders-updated', loadAllData);
    window.addEventListener('ams:grn-updated', loadAllData);
    window.addEventListener('ams:supplier-vouchers-updated', loadAllData);
    window.addEventListener('ams:inventory-updated', loadAllData);

    return () => {
      window.removeEventListener('ams:suppliers-data-updated', loadAllData);
      window.removeEventListener('ams:purchase-orders-updated', loadAllData);
      window.removeEventListener('ams:grn-updated', loadAllData);
      window.removeEventListener('ams:supplier-vouchers-updated', loadAllData);
      window.removeEventListener('ams:inventory-updated', loadAllData);
    };
  }, [loadAllData]);

  // =========================================================================
  // SUPPLIER CRUD HANDLERS
  // =========================================================================
  const handleOpenAddSupplier = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormCategory('General Goods');
    setFormDebtType('inventory');
    setFormStartingDebt('0');
    setFormTerms('Net 30');
    setFormMoMoNumber('');
    setFormBankDetails('');
    setShowAddSupplierModal(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showNotify('error', 'Supplier name is required.');
      return;
    }

    const bid = businessId || 'default_biz';
    const startingDebt = parseFloat(formStartingDebt) || 0;

    const newSup: Supplier = {
      id: 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      business_id: bid,
      name: formName.trim(),
      phone: formPhone.trim() || null,
      category: formCategory.trim() || 'General Goods',
      debt_type: formDebtType,
      payment_terms: formTerms.trim() || 'Net 30',
      balance_owed: startingDebt,
      created_at: new Date().toISOString(),
    };

    addCachedSupplier(newSup, bid);
    loadAllData();
    setShowAddSupplierModal(false);
    showNotify('success', `✓ Added supplier "${newSup.name}"`);
  };

  const handleOpenEditSupplier = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFormName(sup.name);
    setFormPhone(sup.phone || '');
    setFormCategory(sup.category || 'General Goods');
    setFormDebtType(sup.debt_type || 'inventory');
    setFormTerms(sup.payment_terms || 'Net 30');
    setShowEditSupplierModal(true);
  };

  const handleUpdateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !formName.trim()) return;

    const bid = businessId || 'default_biz';
    const updated = updateCachedSupplier(
      {
        ...editingSupplier,
        name: formName.trim(),
        phone: formPhone.trim() || null,
        category: formCategory.trim() || 'General Goods',
        debt_type: formDebtType,
        payment_terms: formTerms.trim() || 'Net 30',
      },
      bid
    );

    setSuppliers(updated);
    setShowEditSupplierModal(false);
    showNotify('success', `✓ Updated supplier "${formName}"`);
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    if (!confirm(`Delete supplier "${name}" from your records?`)) return;
    const bid = businessId || 'default_biz';
    const updated = deleteCachedSupplier(id, bid);
    setSuppliers(updated);
    showNotify('success', `✓ Deleted supplier "${name}"`);
  };

  // =========================================================================
  // PURCHASE ORDER (STOCK REQUEST) HANDLERS
  // =========================================================================
  const handleOpenCreatePO = (preselectedSupplierId?: string) => {
    setPoSupplierId(preselectedSupplierId || (suppliers[0]?.id || ''));
    setPoItems([
      { productName: '', unit: 'pieces', quantityOrdered: 10, estimatedUnitCost: 0, totalCost: 0 },
    ]);
    setPoDeliveryDate(new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10)); // +3 days
    setPoTerms('Cash on Delivery');
    setPoNotes('');
    setShowCreatePOModal(true);
  };

  const handleAddPOItem = () => {
    setPoItems((prev) => [
      ...prev,
      { productName: '', unit: 'pieces', quantityOrdered: 10, estimatedUnitCost: 0, totalCost: 0 },
    ]);
  };

  const handleRemovePOItem = (idx: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePOItemChange = (idx: number, field: keyof PurchaseOrderItem, value: any) => {
    setPoItems((prev) => {
      const updated = [...prev];
      const current = { ...updated[idx], [field]: value };
      
      // Auto populate if picked from inventory dropdown
      if (field === 'productId') {
        const match = inventory.find((inv) => inv.id === value);
        if (match) {
          current.productName = match.name;
          current.estimatedUnitCost = match.unit_cost;
          current.sku = match.barcode || undefined;
        }
      }

      current.totalCost = Math.round((current.quantityOrdered * current.estimatedUnitCost) * 100) / 100;
      updated[idx] = current;
      return updated;
    });
  };

  const handlePopulateLowStockItems = () => {
    const lowStock = inventory.filter((inv) => inv.quantity <= 5);
    if (lowStock.length === 0) {
      alert('No low-stock items detected in inventory!');
      return;
    }

    const items: PurchaseOrderItem[] = lowStock.map((inv) => ({
      productId: inv.id,
      productName: inv.name,
      sku: inv.barcode || undefined,
      unit: 'pieces',
      quantityOrdered: 15,
      estimatedUnitCost: inv.unit_cost,
      totalCost: Math.round(15 * inv.unit_cost * 100) / 100,
    }));

    setPoItems(items);
    showNotify('success', `✓ Added ${items.length} low-stock items into Purchase Order`);
  };

  const handleSavePO = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === poSupplierId);
    if (!sup) {
      alert('Please select a supplier.');
      return;
    }

    const validItems = poItems.filter((i) => i.productName.trim() && i.quantityOrdered > 0);
    if (validItems.length === 0) {
      alert('Please add at least one valid stock item with quantity.');
      return;
    }

    const totalAmount = validItems.reduce((acc, i) => acc + i.totalCost, 0);

    const po = createPurchaseOrder({
      businessId: businessId || 'default_biz',
      supplierId: sup.id,
      supplierName: sup.name,
      supplierPhone: sup.phone || undefined,
      items: validItems,
      totalAmount,
      status: 'sent',
      expectedDeliveryDate: poDeliveryDate,
      paymentTerms: poTerms,
      notes: poNotes.trim(),
    });

    loadAllData();
    setShowCreatePOModal(false);
    showNotify('success', `✓ Created Purchase Order ${po.poNumber}`);
  };

  // =========================================================================
  // GOODS RECEIVED NOTE (GRN) DOCK HANDLERS
  // =========================================================================
  const handleOpenGRNDock = (po?: PurchaseOrder) => {
    if (po) {
      setSelectedPOForGRN(po);
      setGrnSupplierId(po.supplierId);
      setGrnItems(
        po.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantityOrdered: i.quantityOrdered,
          quantityReceived: i.quantityOrdered,
          quantityDamaged: 0,
          unitCost: i.estimatedUnitCost,
        }))
      );
    } else {
      setSelectedPOForGRN(null);
      setGrnSupplierId(suppliers[0]?.id || '');
      setGrnItems([
        { productName: '', quantityOrdered: 10, quantityReceived: 10, quantityDamaged: 0, unitCost: 0 },
      ]);
    }
    setGrnReceivedBy('Store Manager');
    setGrnInvoiceRef('');
    setShowGRNModal(true);
  };

  const handleAcceptGRNShipment = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === grnSupplierId);
    if (!sup) {
      alert('Please select a supplier for this delivery.');
      return;
    }

    const validItems = grnItems.filter((i) => i.productName.trim() && i.quantityReceived > 0);
    if (validItems.length === 0) {
      alert('Please enter received items.');
      return;
    }

    const totalValue = validItems.reduce(
      (acc, i) => acc + Math.max(0, i.quantityReceived - i.quantityDamaged) * i.unitCost,
      0
    );

    const grn = recordGoodsReceived({
      businessId: businessId || 'default_biz',
      poId: selectedPOForGRN?.id,
      poNumber: selectedPOForGRN?.poNumber,
      supplierId: sup.id,
      supplierName: sup.name,
      items: validItems.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantityOrdered: i.quantityOrdered,
        quantityReceived: i.quantityReceived,
        quantityDamaged: i.quantityDamaged,
        unitCost: i.unitCost,
        totalCost: Math.round(Math.max(0, i.quantityReceived - i.quantityDamaged) * i.unitCost * 100) / 100,
      })),
      totalValue,
      receivedBy: grnReceivedBy.trim() || 'Storekeeper',
      receivedDate: new Date().toISOString().slice(0, 10),
      invoiceReference: grnInvoiceRef.trim(),
    });

    loadAllData();
    setShowGRNModal(false);
    showNotify('success', `✓ Accepted shipment ${grn.grnNumber}! Inventory and Supplier Debt updated automatically.`);
  };

  // =========================================================================
  // DIRECT SUPPLIER PAYOUT DESK HANDLERS
  // =========================================================================
  const handleOpenPayoutModal = (sup?: Supplier) => {
    const targetSup = sup || suppliers[0];
    if (!targetSup) {
      alert('No suppliers registered yet.');
      return;
    }
    setPayoutSupplierId(targetSup.id);
    setPayoutAmount(String(targetSup.balance_owed > 0 ? targetSup.balance_owed : ''));
    setPayoutMethod('momo');
    setPayoutMoMoNumber(targetSup.phone || '');
    setPayoutBankName('');
    setPayoutBankAccountNo('');
    setPayoutRef('');
    setPayoutWhtRate(0);
    setPayoutPaidFrom('Store MTN MoMo Wallet');
    setPayoutNotes('');
    setShowPayoutModal(true);
  };

  const activePayoutSupplier = useMemo(
    () => suppliers.find((s) => s.id === payoutSupplierId),
    [suppliers, payoutSupplierId]
  );

  const calculatedWhtAmount = useMemo(() => {
    const amt = parseFloat(payoutAmount) || 0;
    return Math.round(((amt * payoutWhtRate) / 100) * 100) / 100;
  }, [payoutAmount, payoutWhtRate]);

  const calculatedNetDisbursed = useMemo(() => {
    const amt = parseFloat(payoutAmount) || 0;
    return Math.round((amt - calculatedWhtAmount) * 100) / 100;
  }, [payoutAmount, calculatedWhtAmount]);

  const handleExecuteSupplierPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const settleAmt = parseFloat(payoutAmount);
    if (!payoutSupplierId || isNaN(settleAmt) || settleAmt <= 0) {
      alert('Please enter a valid payout amount.');
      return;
    }

    const sup = activePayoutSupplier;
    if (!sup) return;

    const res = recordSupplierPayout({
      supplierId: sup.id,
      supplierName: sup.name,
      supplierPhone: sup.phone || undefined,
      amountToSettle: settleAmt,
      withholdingTaxRate: payoutWhtRate,
      paymentMethod: payoutMethod,
      momoNumber: payoutMoMoNumber.trim(),
      bankName: payoutBankName.trim(),
      bankAccountNumber: payoutBankAccountNo.trim(),
      paymentReference: payoutRef.trim(),
      paidFromAccount: payoutPaidFrom,
      authorizedBy: 'Store Owner',
      notes: payoutNotes.trim(),
    });

    if (res.success && res.voucher) {
      // Record in immutable audit trail
      logAuditEvent({
        actionType: 'DISBURSE_PAYOUT',
        entityType: 'supplier_payout',
        entityId: res.voucher.id,
        entityName: sup.name,
        description: `Disbursed ${currency} ${res.voucher.netAmountDisbursed.toLocaleString()} to ${sup.name} via ${payoutMethod.toUpperCase()} (Voucher #${res.voucher.voucherNumber})`,
        newValue: res.voucher,
      });

      loadAllData();
      setShowPayoutModal(false);
      showNotify(
        'success',
        `✓ Disbursed ${currency} ${res.voucher.netAmountDisbursed.toLocaleString()} to ${sup.name}! Voucher #${res.voucher.voucherNumber}`
      );
    } else {
      alert(res.error || 'Failed to record payout.');
    }
  };

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const q = (search || '').toLowerCase();
      const matchSearch =
        s.name.toLowerCase().includes(q) ||
        (s.phone || '').includes(search) ||
        (s.category || '').toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (filterDebtTab === 'owing' && Number(s.balance_owed || 0) <= 0) return false;
      if (filterDebtTab === 'settled' && Number(s.balance_owed || 0) > 0) return false;
      return true;
    });
  }, [suppliers, search, filterDebtTab]);

  const totalAccountsPayable = useMemo(
    () => suppliers.reduce((acc, s) => acc + Number(s.balance_owed || 0), 0),
    [suppliers]
  );

  const totalPayoutsThisMonth = useMemo(() => {
    const curMonth = new Date().toISOString().slice(0, 7);
    return vouchers
      .filter((v) => v.paymentDate.startsWith(curMonth))
      .reduce((acc, v) => acc + v.netAmountDisbursed, 0);
  }, [vouchers]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🏭</span>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Supplier Hub, Stock Requests &amp; Payout Desk
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage suppliers, dispatch purchase orders, receive dock inventory, and disburse MoMo/Bank payments.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenCreatePO()}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            <span>📋 Request Stock (PO)</span>
          </button>

          <button
            onClick={() => handleOpenPayoutModal()}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            <span>💸 Pay Supplier Bill</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs ${
            notification.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* 2. KPI METRICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Accounts Payable (Debt)</p>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono">
            {currency} {totalAccountsPayable.toLocaleString()}
          </p>
          <p className="text-[11px] text-red-600 mt-0.5 font-medium">
            {suppliers.filter((s) => Number(s.balance_owed || 0) > 0).length} suppliers owed
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Stock Requisitions (PO)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {purchaseOrders.length} Orders
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {purchaseOrders.filter((po) => po.status === 'sent').length} pending delivery
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Disbursed This Month</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {currency} {totalPayoutsThisMonth.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Across {vouchers.length} payment vouchers</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Active Supply Partners</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {suppliers.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Registered vendors</p>
        </div>
      </div>

      {/* 3. FOUR CORE MODULE TABS */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('directory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'directory'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>👥 Supplier Directory &amp; Debt Book</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
            {suppliers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>📋 Stock Requests &amp; POs</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
            {purchaseOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('dock')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'dock'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>🚚 Receiving Dock (GRN)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
            {grnList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'payouts'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>💸 Direct Payout Desk &amp; Vouchers</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
            {vouchers.length}
          </span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: SUPPLIER DIRECTORY & DEBT BOOK                                  */}
      {/* ===================================================================== */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search suppliers by name, phone, or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                {(['all', 'owing', 'settled'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterDebtTab(tab)}
                    className={`px-3 py-1 rounded-md capitalize font-medium transition ${
                      filterDebtTab === tab ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <button
                onClick={handleOpenAddSupplier}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xs hover:bg-slate-800 transition"
              >
                + Add Supplier
              </button>
            </div>
          </div>

          {filteredSuppliers.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <span className="text-3xl mb-2 inline-block">🏭</span>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Suppliers Found</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                Register your distributors, wholesalers, and credit suppliers to manage stock requests and pay bills.
              </p>
              <button
                onClick={handleOpenAddSupplier}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                + Register First Supplier
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Supplier Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Phone / Contact</th>
                      <th className="py-3 px-4">Payment Terms</th>
                      <th className="py-3 px-4 text-right">Balance Owed ({currency})</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSuppliers.map((s) => {
                      const balance = Number(s.balance_owed || 0);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-bold text-slate-900">{s.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                              {s.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">{s.phone || '—'}</td>
                          <td className="py-3 px-4 text-slate-600">{s.payment_terms || 'Net 30'}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {balance > 0 ? (
                              <span className="text-red-600">{currency} {balance.toLocaleString()}</span>
                            ) : (
                              <span className="text-emerald-700">Cleared ✓</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {balance > 0 && (
                                <button
                                  onClick={() => handleOpenPayoutModal(s)}
                                  className="px-2.5 py-1 rounded-md bg-slate-900 text-white font-semibold text-[11px] hover:bg-slate-800 transition"
                                >
                                  💸 Pay
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenCreatePO(s.id)}
                                className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-medium text-[11px] hover:bg-slate-200 transition"
                              >
                                📋 Request PO
                              </button>
                              <button
                                onClick={() => handleOpenEditSupplier(s)}
                                className="p-1 rounded text-slate-400 hover:text-slate-900"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteSupplier(s.id, s.name)}
                                className="p-1 rounded text-slate-400 hover:text-red-600"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: STOCK REQUESTS & PURCHASE ORDERS (PO)                           */}
      {/* ===================================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Purchase Orders &amp; Stock Requisitions</h2>
              <p className="text-xs text-slate-500">Official supplier orders sent with WhatsApp and PDF slips.</p>
            </div>
            <button
              onClick={() => handleOpenCreatePO()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs"
            >
              + Create Stock Request (PO)
            </button>
          </div>

          {purchaseOrders.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <span className="text-3xl mb-2 inline-block">📋</span>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Purchase Orders Created Yet</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                Create stock requests to order goods from suppliers with 1-click WhatsApp dispatch.
              </p>
              <button
                onClick={() => handleOpenCreatePO()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                + Create Stock Request
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {purchaseOrders.map((po) => {
                const waLink = getWhatsAppPurchaseOrderLink(po, businessName, currency);
                return (
                  <div
                    key={po.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-900">{po.poNumber}</span>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">{po.supplierName}</h3>
                        <p className="text-xs text-slate-500">{po.items.length} items ordered · {po.createdAt.slice(0, 10)}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          po.status === 'received'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {po.status}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Value:</span>
                        <span className="font-mono font-bold text-slate-900">{currency} {po.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Expected Delivery:</span>
                        <span className="text-slate-700">{po.expectedDeliveryDate || 'Immediate'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Terms:</span>
                        <span className="text-slate-700">{po.paymentTerms}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      {po.status !== 'received' ? (
                        <button
                          onClick={() => handleOpenGRNDock(po)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition"
                        >
                          🚚 Receive at Dock
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">✓ Received at Dock</span>
                      )}

                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs hover:bg-emerald-100 transition inline-flex items-center gap-1"
                      >
                        <span>📱 WhatsApp PO</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: RECEIVING DOCK (GRN - GOODS RECEIVED NOTES)                     */}
      {/* ===================================================================== */}
      {activeTab === 'dock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Goods Receiving Dock (GRN)</h2>
              <p className="text-xs text-slate-500">Inspect arriving deliveries, auto-update inventory stock, and log Accounts Payable.</p>
            </div>
            <button
              onClick={() => handleOpenGRNDock()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs"
            >
              + Receive Delivery Shipment
            </button>
          </div>

          {grnList.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <span className="text-3xl mb-2 inline-block">🚚</span>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Deliveries Received Yet</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                When suppliers deliver goods to your dock, receive them here to automatically increase your inventory.
              </p>
              <button
                onClick={() => handleOpenGRNDock()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                + Receive Delivery
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">GRN #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Items Received</th>
                      <th className="py-3 px-4">Received By</th>
                      <th className="py-3 px-4 text-right">Total Shipment Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grnList.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{g.grnNumber}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{g.receivedDate}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{g.supplierName}</td>
                        <td className="py-3 px-4 text-slate-700">
                          {g.items.map((i) => `${i.productName} (${i.quantityReceived})`).join(', ')}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{g.receivedBy}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          {currency} {g.totalValue.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: DIRECT SUPPLIER PAYOUT DESK & VOUCHERS                          */}
      {/* ===================================================================== */}
      {activeTab === 'payouts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Direct Supplier Payout Desk</h2>
              <p className="text-xs text-slate-500">Disburse MoMo / Bank supplier settlements, generate payment vouchers, and send WhatsApp remittance slips.</p>
            </div>
            <button
              onClick={() => handleOpenPayoutModal()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs flex items-center gap-1.5"
            >
              <span>💸 Execute Supplier Payout</span>
            </button>
          </div>

          {vouchers.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <span className="text-3xl mb-2 inline-block">💸</span>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Supplier Payouts Executed Yet</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                Pay supplier credit bills directly via Mobile Money or Bank and generate official payment vouchers.
              </p>
              <button
                onClick={() => handleOpenPayoutModal()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                + Execute First Payout
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Voucher #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Gross Settled</th>
                      <th className="py-3 px-4">WHT (Tax)</th>
                      <th className="py-3 px-4">Net Disbursed</th>
                      <th className="py-3 px-4 text-right">WhatsApp Remittance Slip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vouchers.map((v) => {
                      const waLink = getWhatsAppSupplierRemittanceLink(v, businessName, currency);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{v.voucherNumber}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{v.paymentDate}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{v.supplierName}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                              {v.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-800">{currency} {v.amountPaid.toLocaleString()}</td>
                          <td className="py-3 px-4 font-mono text-amber-700">
                            {v.withholdingTaxAmount > 0 ? `-${currency} ${v.withholdingTaxAmount.toLocaleString()} (${v.withholdingTaxRate}%)` : '0%'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                            {currency} {v.netAmountDisbursed.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px] hover:bg-emerald-100 transition inline-block"
                            >
                              📱 Send WhatsApp Slip
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. MODAL 1: ADD / REGISTER SUPPLIER                                   */}
      {/* ===================================================================== */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Register Supply Partner</h3>
              <button onClick={() => setShowAddSupplierModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supplier / Wholesaler Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FanMilk Ghana Ltd / Nestlé Distributor"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone / WhatsApp Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Supply Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Beverages, Provisions, Toiletries"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={formTerms}
                    onChange={(e) => setFormTerms(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  >
                    <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                    <option value="Net 7">Net 7 Days</option>
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Initial Balance Owed ({currency})</label>
                  <input
                    type="number"
                    value={formStartingDebt}
                    onChange={(e) => setFormStartingDebt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. MODAL 2: CREATE PURCHASE ORDER (STOCK REQUEST)                     */}
      {/* ===================================================================== */}
      {showCreatePOModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Request Stock from Supplier (Purchase Order)</h3>
                <p className="text-xs text-slate-500">Auto-fills low-stock items and sends directly to supplier WhatsApp.</p>
              </div>
              <button onClick={() => setShowCreatePOModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSavePO} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Select Supplier *</label>
                  <select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-bold"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.payment_terms || 'Net 30'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={poDeliveryDate}
                    onChange={(e) => setPoDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Fast low-stock auto-populate */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-700 font-medium">Have low-stock products in store?</span>
                <button
                  type="button"
                  onClick={handlePopulateLowStockItems}
                  className="px-3 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs hover:bg-amber-200 transition"
                >
                  ⚡ Auto-Add Low-Stock Items
                </button>
              </div>

              {/* Order Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase">Items to Order</label>
                  <button
                    type="button"
                    onClick={handleAddPOItem}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    + Add Another Item
                  </button>
                </div>

                <div className="space-y-2">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex-1 min-w-[140px]">
                        <input
                          type="text"
                          required
                          placeholder="Product Name"
                          value={item.productName}
                          onChange={(e) => handlePOItemChange(idx, 'productName', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white font-medium"
                        />
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantityOrdered}
                          onChange={(e) => handlePOItemChange(idx, 'quantityOrdered', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white font-mono font-bold"
                        />
                      </div>

                      <div className="w-24">
                        <select
                          value={item.unit}
                          onChange={(e) => handlePOItemChange(idx, 'unit', e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white"
                        >
                          <option value="pieces">Pieces</option>
                          <option value="cartons">Cartons</option>
                          <option value="boxes">Boxes</option>
                          <option value="packs">Packs</option>
                          <option value="kg">Kg</option>
                        </select>
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="Est. Cost"
                          value={item.estimatedUnitCost}
                          onChange={(e) => handlePOItemChange(idx, 'estimatedUnitCost', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white font-mono font-bold"
                        />
                      </div>

                      <div className="w-24 text-right font-mono font-bold text-slate-900">
                        {currency} {item.totalCost.toLocaleString()}
                      </div>

                      {poItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePOItem(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2 text-xs font-bold text-slate-900">
                  Total Value: {currency} {poItems.reduce((acc, i) => acc + i.totalCost, 0).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreatePOModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Dispatch Stock Request (PO)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. MODAL 3: RECEIVE SHIPMENT AT DOCK (GRN)                             */}
      {/* ===================================================================== */}
      {showGRNModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Receive Stock at Dock (Goods Received Note)</h3>
                <p className="text-xs text-slate-500">Inspect arriving deliveries and auto-increment store inventory.</p>
              </div>
              <button onClick={() => setShowGRNModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleAcceptGRNShipment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Delivering *</label>
                  <select
                    value={grnSupplierId}
                    onChange={(e) => setGrnSupplierId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-bold"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Delivery Invoice Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-8924 / Waybill 104"
                    value={grnInvoiceRef}
                    onChange={(e) => setGrnInvoiceRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              {/* Items Received Table */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 uppercase">Received Goods Inspection</label>
                <div className="space-y-2">
                  {grnItems.map((item, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex-1 min-w-[140px]">
                        <input
                          type="text"
                          required
                          placeholder="Product Name"
                          value={item.productName}
                          onChange={(e) => {
                            const updated = [...grnItems];
                            updated[idx].productName = e.target.value;
                            setGrnItems(updated);
                          }}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white font-medium"
                        />
                      </div>

                      <div className="w-20">
                        <label className="block text-[10px] text-slate-500">Delivered</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={item.quantityReceived}
                          onChange={(e) => {
                            const updated = [...grnItems];
                            updated[idx].quantityReceived = parseFloat(e.target.value) || 0;
                            setGrnItems(updated);
                          }}
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white font-mono font-bold"
                        />
                      </div>

                      <div className="w-20">
                        <label className="block text-[10px] text-red-500">Damaged</label>
                        <input
                          type="number"
                          min="0"
                          value={item.quantityDamaged}
                          onChange={(e) => {
                            const updated = [...grnItems];
                            updated[idx].quantityDamaged = parseFloat(e.target.value) || 0;
                            setGrnItems(updated);
                          }}
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white font-mono text-red-600 font-bold"
                        />
                      </div>

                      <div className="w-24">
                        <label className="block text-[10px] text-slate-500">Unit Buying Cost</label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={item.unitCost}
                          onChange={(e) => {
                            const updated = [...grnItems];
                            updated[idx].unitCost = parseFloat(e.target.value) || 0;
                            setGrnItems(updated);
                          }}
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white font-mono font-bold"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGRNModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Accept Shipment &amp; Restock Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8. MODAL 4: DIRECT SUPPLIER PAYOUT DESK                                */}
      {/* ===================================================================== */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Direct Supplier Payout Desk</h3>
                <p className="text-xs text-slate-500">Disburse payment to supplier MoMo or Bank account.</p>
              </div>
              <button onClick={() => setShowPayoutModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleExecuteSupplierPayout} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Supplier *</label>
                <select
                  value={payoutSupplierId}
                  onChange={(e) => {
                    setPayoutSupplierId(e.target.value);
                    const s = suppliers.find((item) => item.id === e.target.value);
                    if (s) {
                      setPayoutAmount(String(s.balance_owed > 0 ? s.balance_owed : ''));
                      setPayoutMoMoNumber(s.phone || '');
                    }
                  }}
                  className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 text-slate-900 font-bold"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — Current Debt: {currency} {Number(s.balance_owed || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {activePayoutSupplier && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                  <span className="text-slate-500">Outstanding Balance Owed:</span>
                  <span className="font-mono font-bold text-red-600 text-sm">
                    {currency} {Number(activePayoutSupplier.balance_owed || 0).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Gross Debt to Settle ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method *</label>
                  <select
                    value={payoutMethod}
                    onChange={(e) => setPayoutMethod(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                  >
                    <option value="momo">MTN / Telecel Mobile Money</option>
                    <option value="bank">Bank Transfer (GhIPSS / Instant Pay)</option>
                    <option value="cash">Store Cash Drawer</option>
                  </select>
                </div>
              </div>

              {payoutMethod === 'momo' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Supplier MoMo Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={payoutMoMoNumber}
                    onChange={(e) => setPayoutMoMoNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
              )}

              {payoutMethod === 'bank' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Bank Name (e.g. Ecobank / GCB)"
                    value={payoutBankName}
                    onChange={(e) => setPayoutBankName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  />
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={payoutBankAccountNo}
                    onChange={(e) => setPayoutBankAccountNo(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
              )}

              {/* Statutory WHT Section */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Statutory Withholding Tax (WHT)</span>
                  <select
                    value={payoutWhtRate}
                    onChange={(e) => setPayoutWhtRate(parseFloat(e.target.value))}
                    className="px-2 py-1 rounded border border-slate-200 bg-white font-medium text-xs"
                  >
                    <option value="0">0% (Exempt / Standard)</option>
                    <option value="3">3% WHT (Standard Goods)</option>
                    <option value="5">5% WHT (Services &amp; Logistics)</option>
                  </select>
                </div>

                {payoutWhtRate > 0 && (
                  <div className="text-xs space-y-1 pt-1 border-t border-slate-200 text-slate-600">
                    <div className="flex justify-between">
                      <span>WHT Deducted ({payoutWhtRate}%):</span>
                      <span className="font-mono text-amber-700 font-bold">-{currency} {calculatedWhtAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>Net Cash Disbursed to Supplier:</span>
                      <span className="font-mono text-emerald-700">{currency} {calculatedNetDisbursed.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Transaction Ref / Cheque No. (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. MoMo Trans ID / Cheque #00492"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Disburse {currency} {calculatedNetDisbursed.toLocaleString()}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
