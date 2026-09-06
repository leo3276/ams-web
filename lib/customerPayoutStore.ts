'use client';

import {
  getCachedBusiness,
  getCachedInventory,
  setCachedInventory,
  getCachedTransactions,
  setCachedTransactions,
} from './offlineStore';
import { supabase } from './supabase';
import { InventoryItem } from './types';

export interface CustomerRefundItem {
  productId?: string;
  productName: string;
  quantityReturned: number;
  unitPrice: number;
  refundAmount: number;
  condition: 'resellable' | 'damaged' | 'expired';
}

export interface CustomerRefund {
  id: string;
  refundNumber: string; // e.g. 'REF-2026-001'
  businessId: string;
  salesReceiptReference?: string;
  customerName: string;
  customerPhone?: string;
  items: CustomerRefundItem[];
  totalRefundAmount: number;
  payoutMethod: 'cash' | 'momo' | 'store_credit';
  momoNumber?: string;
  momoTransactionId?: string;
  authorizedBy: string;
  refundDate: string;
  reason: string;
  createdAt: string;
}

export interface CustomerBuyBackItem {
  id: string;
  voucherNumber: string; // e.g. 'BUY-2026-001'
  businessId: string;
  customerName: string;
  customerPhone: string;
  customerGhanaCardNumber?: string;
  itemName: string;
  category: string;
  serialNumberOrIMEI?: string;
  condition: 'Brand New' | 'Like New (Grade A)' | 'Good (Grade B)' | 'Fair' | 'Scrap / Parts';
  quantityPurchased: number;
  unitPurchasePrice: number; // Cost paid to customer
  suggestedResalePrice: number;
  totalPayoutAmount: number;
  payoutMethod: 'cash' | 'momo';
  momoNumber?: string;
  momoTransactionId?: string;
  inspectedBy: string;
  purchaseDate: string;
  notes?: string;
  createdAt: string;
}

function getKey(prefix: string, businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  return `ams:${prefix}_${bid}`;
}

function broadcastUpdate(eventName: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventName));
    window.dispatchEvent(new CustomEvent('ams:customer-payouts-updated'));
  }
}

// =========================================================================
// 1. CUSTOMER REFUNDS & RETURNS
// =========================================================================

export function getCustomerRefunds(businessId?: string): CustomerRefund[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('customer_refunds', businessId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

export function saveCustomerRefunds(refunds: CustomerRefund[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('customer_refunds', businessId), JSON.stringify(refunds));
    broadcastUpdate('ams:refunds-updated');
  } catch (_e) {}
}

export function processCustomerRefund(
  data: Omit<CustomerRefund, 'id' | 'refundNumber' | 'createdAt'>,
  businessId?: string
): { success: boolean; refund?: CustomerRefund; error?: string } {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  if (!data.customerName || data.items.length === 0 || data.totalRefundAmount <= 0) {
    return { success: false, error: 'Please enter valid return items and customer details.' };
  }

  const current = getCustomerRefunds(bid);
  const nextNum = current.length + 1;
  const refundNumber = `REF-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

  const newRefund: CustomerRefund = {
    ...data,
    id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    refundNumber,
    createdAt: new Date().toISOString(),
  };

  // 1. Restock resellable items to inventory
  const inventory = getCachedInventory(bid);
  let updatedInventory = [...inventory];
  const restockedRowsToSync: any[] = [];

  data.items.forEach((item) => {
    if (item.condition === 'resellable' && item.quantityReturned > 0) {
      const existingIdx = updatedInventory.findIndex(
        (inv) => (item.productId && inv.id === item.productId) || inv.name.toLowerCase() === item.productName.toLowerCase()
      );
      if (existingIdx >= 0) {
        const newQty = Number(updatedInventory[existingIdx].quantity || 0) + item.quantityReturned;
        updatedInventory[existingIdx] = {
          ...updatedInventory[existingIdx],
          quantity: newQty,
        };
        restockedRowsToSync.push(updatedInventory[existingIdx]);
      }
    }
  });

  setCachedInventory(updatedInventory, bid);
  broadcastUpdate('ams:inventory-updated');

  // Sync restocked inventory to Supabase
  if (bid && bid !== 'default_biz' && restockedRowsToSync.length > 0) {
    const rowsToUpsert = restockedRowsToSync.map((inv) => ({
      id: inv.id,
      business_id: bid,
      name: inv.name,
      barcode: inv.barcode || '',
      quantity: Number(inv.quantity || 0),
      unit_cost: Number(inv.unit_cost || 0),
      unit_price: Number(inv.unit_price || 0),
    }));
    supabase.from('inventory_items').upsert(rowsToUpsert, { onConflict: 'id' }).then(() => {});
  }

  // 2. Record Customer Sales Return in Local & Cloud Transactions
  const paymentChannel = data.payoutMethod === 'momo' ? 'bank' : 'cash';
  const returnTx = {
    id: crypto.randomUUID(),
    business_id: bid,
    transaction_date: newRefund.refundDate,
    vendor: `Customer Refund: ${newRefund.customerName}`,
    type: 'return',
    category: `Customer Sales Return & Refund | ${newRefund.payoutMethod.toUpperCase()}`,
    amount: newRefund.totalRefundAmount,
    payment_method: paymentChannel,
    created_at: new Date().toISOString(),
  };

  try {
    const existingTxs = getCachedTransactions(bid);
    setCachedTransactions([returnTx, ...existingTxs.filter((t) => t.id !== returnTx.id)], bid);
    broadcastUpdate('ams:transactions-updated');

    if (bid && bid !== 'default_biz') {
      supabase.from('transactions').insert(returnTx).then(() => {});
    }
  } catch (_e) {}

  const updatedRefunds = [newRefund, ...current];
  saveCustomerRefunds(updatedRefunds, bid);
  return { success: true, refund: newRefund };
}

// =========================================================================
// 2. CUSTOMER TRADE-INS & STOCK BUY-BACKS
// =========================================================================

export function getCustomerBuyBacks(businessId?: string): CustomerBuyBackItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('customer_buybacks', businessId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

export function saveCustomerBuyBacks(buybacks: CustomerBuyBackItem[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('customer_buybacks', businessId), JSON.stringify(buybacks));
    broadcastUpdate('ams:buybacks-updated');
  } catch (_e) {}
}

export function recordCustomerStockBuyBack(
  data: Omit<CustomerBuyBackItem, 'id' | 'voucherNumber' | 'createdAt'>,
  businessId?: string
): { success: boolean; buyback?: CustomerBuyBackItem; error?: string } {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  if (!data.customerName || !data.itemName || data.totalPayoutAmount <= 0) {
    return { success: false, error: 'Please enter valid customer name, item name, and payout amount.' };
  }

  const current = getCustomerBuyBacks(bid);
  const nextNum = current.length + 1;
  const voucherNumber = `BUY-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

  const newBuyBack: CustomerBuyBackItem = {
    ...data,
    id: 'buy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    voucherNumber,
    createdAt: new Date().toISOString(),
  };

  // 1. Automatically intake bought item into inventory at cost price paid to customer!
  const inventory = getCachedInventory(bid);
  let updatedInventory = [...inventory];
  const serialSuffix = data.serialNumberOrIMEI ? ` (S/N: ${data.serialNumberOrIMEI})` : '';
  const fullItemName = `${data.itemName}${serialSuffix}`;

  const existingIdx = updatedInventory.findIndex((inv) => inv.name.toLowerCase() === fullItemName.toLowerCase());

  if (existingIdx >= 0) {
    const old = updatedInventory[existingIdx];
    const oldQty = Number(old.quantity || 0);
    const oldCost = Number(old.unit_cost || 0);
    const newQty = oldQty + data.quantityPurchased;
    const avgCost = newQty > 0 ? (oldQty * oldCost + data.quantityPurchased * data.unitPurchasePrice) / newQty : data.unitPurchasePrice;

    updatedInventory[existingIdx] = {
      ...old,
      quantity: newQty,
      unit_cost: Math.round(avgCost * 100) / 100,
      unit_price: data.suggestedResalePrice || old.unit_price,
    };
  } else {
    const newItem: InventoryItem = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: fullItemName,
      barcode: 'BUY-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      quantity: data.quantityPurchased,
      unit_cost: data.unitPurchasePrice,
      unit_price: data.suggestedResalePrice || Math.round(data.unitPurchasePrice * 1.35 * 100) / 100,
    };
    updatedInventory = [newItem, ...updatedInventory];
  }

  setCachedInventory(updatedInventory, bid);
  broadcastUpdate('ams:inventory-updated');

  // 2. Record Stock Purchase in Local & Cloud Ledger
  const paymentChannel = data.payoutMethod === 'momo' ? 'bank' : 'cash';
  const buyBackTx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    business_id: bid,
    transaction_date: newBuyBack.purchaseDate,
    vendor: `Customer Buy-Back: ${newBuyBack.customerName}`,
    type: 'cost_of_goods' as const,
    category: `Direct Stock Purchase from Customer | ${newBuyBack.itemName} | ${newBuyBack.payoutMethod.toUpperCase()}`,
    amount: newBuyBack.totalPayoutAmount,
    payment_method: paymentChannel,
    created_at: new Date().toISOString(),
  };

  try {
    const existingTxs = getCachedTransactions(bid);
    setCachedTransactions([buyBackTx, ...existingTxs], bid);
    broadcastUpdate('ams:transactions-updated');

    if (bid && bid !== 'default_biz') {
      supabase.from('transactions').insert(buyBackTx).then(() => {});
    }
  } catch (_e) {}

  const updatedBuyBacks = [newBuyBack, ...current];
  saveCustomerBuyBacks(updatedBuyBacks, bid);
  return { success: true, buyback: newBuyBack };
}

// =========================================================================
// 3. WHATSAPP GENERATORS FOR REFUNDS & BUY-BACK RECEIPTS
// =========================================================================

export function getWhatsAppRefundReceiptLink(refund: CustomerRefund, businessName: string, currency: string = 'GHS'): string {
  const cleanPhone = (refund.customerPhone || '').replace(/[^0-9]/g, '');
  const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

  let itemList = '';
  refund.items.forEach((i, idx) => {
    itemList += `${idx + 1}. ${i.productName} (${i.quantityReturned} pcs) - ${currency} ${i.refundAmount.toLocaleString()}\n`;
  });

  const message = `🧾 *CUSTOMER REFUND SLIP* - ${businessName}
*Refund Number:* ${refund.refundNumber}
*Date:* ${refund.refundDate}
*Customer:* ${refund.customerName}

We have processed a return and refund for your account:

${itemList}
💰 *Total Refund Payout:* ${currency} ${refund.totalRefundAmount.toLocaleString()}
💳 *Payment Channel:* ${refund.payoutMethod.toUpperCase()}
📝 *Reason:* ${refund.reason}

Thank you for shopping with us.
*${businessName} Customer Service*`;

  const encoded = encodeURIComponent(message);
  return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function getWhatsAppBuyBackVoucherLink(buyback: CustomerBuyBackItem, businessName: string, currency: string = 'GHS'): string {
  const cleanPhone = (buyback.customerPhone || '').replace(/[^0-9]/g, '');
  const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

  const serialText = buyback.serialNumberOrIMEI ? `\n🔢 *Serial / IMEI:* ${buyback.serialNumberOrIMEI}` : '';

  const message = `💵 *CUSTOMER TRADE-IN & PURCHASE RECEIPT* - ${businessName}
*Voucher Number:* ${buyback.voucherNumber}
*Date:* ${buyback.purchaseDate}
*Seller:* ${buyback.customerName}

We have officially purchased the following stock from you:

📦 *Item:* ${buyback.itemName} (${buyback.quantityPurchased} pcs)
⭐ *Condition:* ${buyback.condition}${serialText}
💰 *Purchase Payout Disbursed:* ${currency} ${buyback.totalPayoutAmount.toLocaleString()}
💳 *Payout Channel:* ${buyback.payoutMethod.toUpperCase()}

Thank you for your transaction with us.
*${businessName} Intake Desk*`;

  const encoded = encodeURIComponent(message);
  return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
