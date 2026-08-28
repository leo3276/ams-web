'use client';

import { getCachedBusiness, getCachedInventory, setCachedInventory, addCachedSupplier, getCachedSuppliers, setCachedSuppliers, updateCachedSupplierBalance } from './offlineStore';
import { supabase } from './supabase';
import { InventoryItem } from './types';

export interface PurchaseOrderItem {
  productId?: string;
  productName: string;
  sku?: string;
  unit: string; // 'pieces' | 'cartons' | 'boxes' | 'kg' | 'packs'
  quantityOrdered: number;
  estimatedUnitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // e.g. 'PO-2026-001'
  businessId: string;
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierMoMo?: string;
  supplierBank?: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  status: 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';
  expectedDeliveryDate?: string;
  paymentTerms: string; // 'Cash on Delivery' | 'Net 7' | 'Net 15' | 'Net 30'
  deliveryAddress?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GRNItem {
  productId?: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityDamaged: number;
  unitCost: number;
  totalCost: number;
}

export interface GoodsReceivedNote {
  id: string;
  grnNumber: string; // e.g. 'GRN-2026-001'
  businessId: string;
  poId?: string;
  poNumber?: string;
  supplierId: string;
  supplierName: string;
  items: GRNItem[];
  totalValue: number;
  receivedBy: string;
  receivedDate: string;
  invoiceReference?: string;
  notes?: string;
  createdAt: string;
}

export interface SupplierPaymentVoucher {
  id: string;
  voucherNumber: string; // e.g. 'PV-2026-001'
  businessId: string;
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  amountPaid: number;
  withholdingTaxRate: number; // e.g. 0, 3 (goods), or 5 (services)
  withholdingTaxAmount: number;
  netAmountDisbursed: number;
  paymentMethod: 'momo' | 'bank' | 'cash';
  momoNumber?: string;
  momoAccountName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  paymentReference?: string; // e.g. MoMo Transaction ID or Cheque No.
  paidFromAccount: string; // 'Cash Till' | 'MTN MoMo Wallet' | 'Bank Account'
  remainingBalanceOwed: number;
  authorizedBy: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

// Storage Keys
function getKey(prefix: string, businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  return `ams:${prefix}_${bid}`;
}

function broadcastUpdate(eventName: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventName));
    window.dispatchEvent(new CustomEvent('ams:suppliers-data-updated'));
  }
}

// =========================================================================
// 1. PURCHASE ORDERS (STOCK REQUESTS)
// =========================================================================

export function getPurchaseOrders(businessId?: string): PurchaseOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('purchase_orders', businessId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

export function savePurchaseOrders(orders: PurchaseOrder[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('purchase_orders', businessId), JSON.stringify(orders));
    broadcastUpdate('ams:purchase-orders-updated');
  } catch (_e) {}
}

export function createPurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt' | 'updatedAt'>, businessId?: string): PurchaseOrder {
  const current = getPurchaseOrders(businessId);
  const nextNum = current.length + 1;
  const poNumber = `PO-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

  const newPO: PurchaseOrder = {
    ...data,
    id: 'po_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    poNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updated = [newPO, ...current];
  savePurchaseOrders(updated, businessId);
  return newPO;
}

export function updatePurchaseOrderStatus(poId: string, status: PurchaseOrder['status'], businessId?: string) {
  const current = getPurchaseOrders(businessId);
  const updated = current.map((po) => (po.id === poId ? { ...po, status, updatedAt: new Date().toISOString() } : po));
  savePurchaseOrders(updated, businessId);
}

export function deletePurchaseOrder(poId: string, businessId?: string) {
  const current = getPurchaseOrders(businessId);
  const updated = current.filter((po) => po.id !== poId);
  savePurchaseOrders(updated, businessId);
}

// =========================================================================
// 2. GOODS RECEIVED NOTES (GRN) & AUTOMATIC INVENTORY RESTOCKING
// =========================================================================

export function getGoodsReceivedNotes(businessId?: string): GoodsReceivedNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('grn_records', businessId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

export function saveGoodsReceivedNotes(notes: GoodsReceivedNote[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('grn_records', businessId), JSON.stringify(notes));
    broadcastUpdate('ams:grn-updated');
  } catch (_e) {}
}

export function recordGoodsReceived(
  data: Omit<GoodsReceivedNote, 'id' | 'grnNumber' | 'createdAt'>,
  options?: { autoUpdateStock?: boolean; createSupplierDebt?: boolean },
  businessId?: string
): GoodsReceivedNote {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  const current = getGoodsReceivedNotes(bid);
  const nextNum = current.length + 1;
  const grnNumber = `GRN-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

  const newGRN: GoodsReceivedNote = {
    ...data,
    id: 'grn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    grnNumber,
    createdAt: new Date().toISOString(),
  };

  // 1. Auto-update Inventory Stock Levels & Unit Costs
  if (options?.autoUpdateStock !== false) {
    const inventory = getCachedInventory(bid);
    let updatedInventory = [...inventory];

    data.items.forEach((item) => {
      const acceptedQty = Math.max(0, item.quantityReceived - item.quantityDamaged);
      if (acceptedQty <= 0) return;

      const existingIdx = updatedInventory.findIndex(
        (inv) => (item.productId && inv.id === item.productId) || inv.name.toLowerCase() === item.productName.toLowerCase()
      );

      if (existingIdx >= 0) {
        const old = updatedInventory[existingIdx];
        const oldQty = Number(old.quantity || 0);
        const oldCost = Number(old.unit_cost || 0);
        const newQty = oldQty + acceptedQty;
        // Moving weighted average cost calculation
        const avgCost = newQty > 0 ? (oldQty * oldCost + acceptedQty * item.unitCost) / newQty : item.unitCost;

        updatedInventory[existingIdx] = {
          ...old,
          quantity: newQty,
          unit_cost: Math.round(avgCost * 100) / 100,
        };
      } else {
        // Create new inventory item
        const newItem: InventoryItem = {
          id: item.productId || 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: item.productName,
          barcode: 'SKU-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
          quantity: acceptedQty,
          unit_cost: item.unitCost,
          unit_price: Math.round(item.unitCost * 1.3 * 100) / 100, // 30% margin default
        };
        updatedInventory = [newItem, ...updatedInventory];
      }
    });

    setCachedInventory(updatedInventory, bid);
    broadcastUpdate('ams:inventory-updated');
  }

  // 2. Mark Associated PO as Received if applicable
  if (data.poId) {
    updatePurchaseOrderStatus(data.poId, 'received', bid);
  }

  // 3. Add Accounts Payable Bill to Supplier Ledger
  if (options?.createSupplierDebt !== false && data.totalValue > 0) {
    updateCachedSupplierBalance(data.supplierId, data.totalValue, bid);
  }

  const updatedNotes = [newGRN, ...current];
  saveGoodsReceivedNotes(updatedNotes, bid);
  return newGRN;
}

// =========================================================================
// 3. DIRECT SUPPLIER PAYOUT DESK & PAYMENT VOUCHERS
// =========================================================================

export function getSupplierPaymentVouchers(businessId?: string): SupplierPaymentVoucher[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('supplier_vouchers', businessId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

export function saveSupplierPaymentVouchers(vouchers: SupplierPaymentVoucher[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('supplier_vouchers', businessId), JSON.stringify(vouchers));
    broadcastUpdate('ams:supplier-vouchers-updated');
  } catch (_e) {}
}

export function recordSupplierPayout(
  data: {
    supplierId: string;
    supplierName: string;
    supplierPhone?: string;
    amountToSettle: number; // Gross amount settled against debt
    withholdingTaxRate?: number; // 0, 3, or 5
    paymentMethod: 'momo' | 'bank' | 'cash';
    momoNumber?: string;
    momoAccountName?: string;
    bankName?: string;
    bankAccountNumber?: string;
    paymentReference?: string;
    paidFromAccount?: string;
    authorizedBy?: string;
    notes?: string;
  },
  businessId?: string
): { success: boolean; voucher?: SupplierPaymentVoucher; error?: string } {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  if (!data.supplierName || data.amountToSettle <= 0) {
    return { success: false, error: 'Please specify a valid supplier and payout amount.' };
  }

  const whtRate = data.withholdingTaxRate || 0;
  const whtAmount = Math.round(((data.amountToSettle * whtRate) / 100) * 100) / 100;
  const netDisbursed = Math.round((data.amountToSettle - whtAmount) * 100) / 100;

  // 1. Update Supplier Debt Balance
  const suppliers = getCachedSuppliers(bid);
  const sup = suppliers.find((s) => s.id === data.supplierId || s.name.toLowerCase() === data.supplierName.toLowerCase());
  const previousDebt = sup ? Number(sup.balance_owed || 0) : data.amountToSettle;
  const newDebt = Math.max(0, previousDebt - data.amountToSettle);

  if (sup) {
    updateCachedSupplierBalance(sup.id, -data.amountToSettle, bid);
  }

  // 2. Generate Payment Voucher
  const vouchers = getSupplierPaymentVouchers(bid);
  const nextNum = vouchers.length + 1;
  const voucherNumber = `PV-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

  const newVoucher: SupplierPaymentVoucher = {
    id: 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    voucherNumber,
    businessId: bid,
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    supplierPhone: data.supplierPhone,
    amountPaid: data.amountToSettle,
    withholdingTaxRate: whtRate,
    withholdingTaxAmount: whtAmount,
    netAmountDisbursed: netDisbursed,
    paymentMethod: data.paymentMethod,
    momoNumber: data.momoNumber,
    momoAccountName: data.momoAccountName,
    bankName: data.bankName,
    bankAccountNumber: data.bankAccountNumber,
    paymentReference: data.paymentReference,
    paidFromAccount: data.paidFromAccount || (data.paymentMethod === 'momo' ? 'MTN MoMo Till' : data.paymentMethod === 'bank' ? 'Bank Account' : 'Cash Drawer'),
    remainingBalanceOwed: newDebt,
    authorizedBy: data.authorizedBy || 'Store Manager',
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: data.notes,
    createdAt: new Date().toISOString(),
  };

  const updatedVouchers = [newVoucher, ...vouchers];
  saveSupplierPaymentVouchers(updatedVouchers, bid);

  // 3. Record in Cloud Database Transaction Ledger
  try {
    supabase.from('transactions').insert({
      business_id: bid,
      transaction_date: newVoucher.paymentDate,
      vendor: `Supplier Settlement: ${newVoucher.supplierName}`,
      type: 'operating_expense',
      category: `Accounts Payable Settlement | ${newVoucher.paymentMethod.toUpperCase()} | Ref: ${newVoucher.paymentReference || newVoucher.voucherNumber}`,
      amount: newVoucher.netAmountDisbursed,
      payment_method: newVoucher.paymentMethod === 'bank' ? 'bank' : 'cash',
    }).then(() => {});
  } catch (_e) {}

  return { success: true, voucher: newVoucher };
}

// =========================================================================
// 4. WHATSAPP GENERATORS FOR PO & REMITTANCE ADVICE
// =========================================================================

export function getWhatsAppPurchaseOrderLink(po: PurchaseOrder, businessName: string, currency: string = 'GHS'): string {
  const cleanPhone = (po.supplierPhone || '').replace(/[^0-9]/g, '');
  const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

  let itemList = '';
  po.items.forEach((item, idx) => {
    itemList += `${idx + 1}. ${item.productName} - ${item.quantityOrdered} ${item.unit} @ ${currency} ${item.estimatedUnitCost.toLocaleString()} = ${currency} ${item.totalCost.toLocaleString()}\n`;
  });

  const message = `📋 *OFFICIAL PURCHASE ORDER* - ${businessName}
*PO Number:* ${po.poNumber}
*Date:* ${po.createdAt.slice(0, 10)}
*Supplier:* ${po.supplierName}

Dear Supplier,
Please supply the following stock items to our store:

${itemList}
💰 *Total Estimated Value:* ${currency} ${po.totalAmount.toLocaleString()}
📅 *Expected Delivery:* ${po.expectedDeliveryDate || 'Immediate'}
💳 *Payment Terms:* ${po.paymentTerms}
📍 *Delivery Address:* ${po.deliveryAddress || 'Store Receiving Dock'}

Thank you for your partnership.
*${businessName} Procurement Desk*`;

  const encoded = encodeURIComponent(message);
  return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function getWhatsAppSupplierRemittanceLink(voucher: SupplierPaymentVoucher, businessName: string, currency: string = 'GHS'): string {
  const cleanPhone = (voucher.supplierPhone || '').replace(/[^0-9]/g, '');
  const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

  const whtText = voucher.withholdingTaxAmount > 0
    ? `\n⚖️ *Withholding Tax (${voucher.withholdingTaxRate}%):* -${currency} ${voucher.withholdingTaxAmount.toLocaleString()}`
    : '';

  const refText = voucher.paymentReference ? `\n🔖 *Transaction Ref:* ${voucher.paymentReference}` : '';

  const debtStatus = voucher.remainingBalanceOwed > 0
    ? `Remaining Balance Owed: ${currency} ${voucher.remainingBalanceOwed.toLocaleString()}`
    : 'Account Status: FULLY SETTLED ✓';

  const message = `💸 *SUPPLIER PAYMENT ADVICE & VOUCHER* - ${businessName}
*Voucher Number:* ${voucher.voucherNumber}
*Date:* ${voucher.paymentDate}
*Supplier:* ${voucher.supplierName}

We have successfully disbursed payment for your supply account:

💰 *Gross Settled:* ${currency} ${voucher.amountPaid.toLocaleString()}${whtText}
💵 *Net Disbursed:* ${currency} ${voucher.netAmountDisbursed.toLocaleString()}
💳 *Payment Channel:* ${voucher.paymentMethod.toUpperCase()} (${voucher.paidFromAccount})${refText}
📊 *${debtStatus}*

Thank you for your continued business.
*${businessName} Accounts Office*`;

  const encoded = encodeURIComponent(message);
  return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
