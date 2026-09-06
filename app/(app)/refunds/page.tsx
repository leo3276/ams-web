'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useUserRole } from '@/lib/RoleContext';
import { getCachedBusiness, getCachedInventory, isOnline } from '@/lib/offlineStore';
import {
  getCustomerRefunds,
  processCustomerRefund,
  getCustomerBuyBacks,
  recordCustomerStockBuyBack,
  getWhatsAppRefundReceiptLink,
  getWhatsAppBuyBackVoucherLink,
  CustomerRefund,
  CustomerRefundItem,
  CustomerBuyBackItem,
} from '@/lib/customerPayoutStore';
import { InventoryItem } from '@/lib/types';
import { printRefundsAndBuyBacksPDF } from '@/lib/pdfGenerator';

export default function RefundsAndPayoutsPage() {
  const { role } = useUserRole();
  const [businessName, setBusinessName] = useState('My Business');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [activeTab, setActiveTab] = useState<'refunds' | 'buybacks'>('refunds');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [refunds, setRefunds] = useState<CustomerRefund[]>([]);
  const [buybacks, setBuybacks] = useState<CustomerBuyBackItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // Modals
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showBuyBackModal, setShowBuyBackModal] = useState(false);

  // Refund Form
  const [refCustomerName, setRefCustomerName] = useState('');
  const [refCustomerPhone, setRefCustomerPhone] = useState('');
  const [refSalesReceiptRef, setRefSalesReceiptRef] = useState('');
  const [refItems, setRefItems] = useState<CustomerRefundItem[]>([
    { productName: '', quantityReturned: 1, unitPrice: 0, refundAmount: 0, condition: 'resellable' },
  ]);
  const [refPayoutMethod, setRefPayoutMethod] = useState<'cash' | 'momo' | 'store_credit'>('cash');
  const [refMoMoNumber, setRefMoMoNumber] = useState('');
  const [refReason, setRefReason] = useState('Customer Changed Mind / Exchange');

  // Buy-Back Form
  const [bbCustomerName, setBbCustomerName] = useState('');
  const [bbCustomerPhone, setBbCustomerPhone] = useState('');
  const [bbCustomerGhanaCard, setBbCustomerGhanaCard] = useState('');
  const [bbItemName, setBbItemName] = useState('');
  const [bbCategory, setBbCategory] = useState('Electronics & Devices');
  const [bbSerial, setBbSerial] = useState('');
  const [bbCondition, setBbCondition] = useState<CustomerBuyBackItem['condition']>('Like New (Grade A)');
  const [bbQuantity, setBbQuantity] = useState('1');
  const [bbUnitCost, setBbUnitCost] = useState('');
  const [bbResalePrice, setBbResalePrice] = useState('');
  const [bbPayoutMethod, setBbPayoutMethod] = useState<'cash' | 'momo'>('cash');
  const [bbMoMoNumber, setBbMoMoNumber] = useState('');
  const [bbNotes, setBbNotes] = useState('');

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = useCallback(() => {
    const b = getCachedBusiness();
    const bid = b?.id || 'default_biz';
    if (b) {
      setBusinessId(b.id);
      setBusinessName(b.name);
      setCurrency(b.currency || 'GHS');
    }

    setRefunds(getCustomerRefunds(bid));
    setBuybacks(getCustomerBuyBacks(bid));
    setInventory(getCachedInventory(bid));
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:customer-payouts-updated', loadData);
    window.addEventListener('ams:refunds-updated', loadData);
    window.addEventListener('ams:buybacks-updated', loadData);
    window.addEventListener('ams:inventory-updated', loadData);

    return () => {
      window.removeEventListener('ams:customer-payouts-updated', loadData);
      window.removeEventListener('ams:refunds-updated', loadData);
      window.removeEventListener('ams:buybacks-updated', loadData);
      window.removeEventListener('ams:inventory-updated', loadData);
    };
  }, [loadData]);

  // =========================================================================
  // REFUND HANDLERS
  // =========================================================================
  const handleOpenRefundModal = () => {
    setRefCustomerName('');
    setRefCustomerPhone('');
    setRefSalesReceiptRef('');
    setRefItems([
      { productName: '', quantityReturned: 1, unitPrice: 0, refundAmount: 0, condition: 'resellable' },
    ]);
    setRefPayoutMethod('cash');
    setRefMoMoNumber('');
    setRefReason('Customer Changed Mind / Exchange');
    setShowRefundModal(true);
  };

  const handleAddRefundItem = () => {
    setRefItems((prev) => [
      ...prev,
      { productName: '', quantityReturned: 1, unitPrice: 0, refundAmount: 0, condition: 'resellable' },
    ]);
  };

  const handleRemoveRefundItem = (idx: number) => {
    setRefItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRefundItemChange = (idx: number, field: keyof CustomerRefundItem, value: any) => {
    setRefItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };

      if (field === 'productId') {
        const match = inventory.find((inv) => inv.id === value);
        if (match) {
          item.productName = match.name;
          item.unitPrice = match.unit_price;
        }
      }

      item.refundAmount = Math.round((item.quantityReturned * item.unitPrice) * 100) / 100;
      updated[idx] = item;
      return updated;
    });
  };

  const handleSaveRefund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCustomerName.trim()) {
      showNotify('error', 'Please enter the customer name.');
      return;
    }

    const validItems = refItems.filter((i) => i.productName.trim() && i.quantityReturned > 0);
    if (validItems.length === 0) {
      showNotify('error', 'Please add at least one returned product item.');
      return;
    }

    const totalRefund = validItems.reduce((acc, i) => acc + i.refundAmount, 0);

    const res = processCustomerRefund({
      businessId: businessId || 'default_biz',
      salesReceiptReference: refSalesReceiptRef.trim() || undefined,
      customerName: refCustomerName.trim(),
      customerPhone: refCustomerPhone.trim() || undefined,
      items: validItems,
      totalRefundAmount: totalRefund,
      payoutMethod: refPayoutMethod,
      momoNumber: refMoMoNumber.trim() || undefined,
      authorizedBy: 'Store Supervisor',
      refundDate: new Date().toISOString().slice(0, 10),
      reason: refReason,
    });

    if (res.success && res.refund) {
      loadData();
      setShowRefundModal(false);
      showNotify(
        'success',
        `✓ Refund ${res.refund.refundNumber} processed for ${currency} ${res.refund.totalRefundAmount.toLocaleString()}`
      );
    } else {
      showNotify('error', res.error || 'Failed to process refund.');
    }
  };

  // =========================================================================
  // BUY-BACK / TRADE-IN HANDLERS
  // =========================================================================
  const handleOpenBuyBackModal = () => {
    setBbCustomerName('');
    setBbCustomerPhone('');
    setBbCustomerGhanaCard('');
    setBbItemName('');
    setBbCategory('Electronics & Devices');
    setBbSerial('');
    setBbCondition('Like New (Grade A)');
    setBbQuantity('1');
    setBbUnitCost('');
    setBbResalePrice('');
    setBbPayoutMethod('cash');
    setBbMoMoNumber('');
    setBbNotes('');
    setShowBuyBackModal(true);
  };

  const handleSaveBuyBack = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(bbQuantity, 10) || 1;
    const unitCost = parseFloat(bbUnitCost) || 0;
    const resale = parseFloat(bbResalePrice) || Math.round(unitCost * 1.35 * 100) / 100;

    if (!bbCustomerName.trim() || !bbItemName.trim() || unitCost <= 0) {
      showNotify('error', 'Please enter valid customer name, item name, and purchase cost.');
      return;
    }

    const totalPayout = Math.round(qty * unitCost * 100) / 100;

    const res = recordCustomerStockBuyBack({
      businessId: businessId || 'default_biz',
      customerName: bbCustomerName.trim(),
      customerPhone: bbCustomerPhone.trim(),
      customerGhanaCardNumber: bbCustomerGhanaCard.trim() || undefined,
      itemName: bbItemName.trim(),
      category: bbCategory,
      serialNumberOrIMEI: bbSerial.trim() || undefined,
      condition: bbCondition,
      quantityPurchased: qty,
      unitPurchasePrice: unitCost,
      suggestedResalePrice: resale,
      totalPayoutAmount: totalPayout,
      payoutMethod: bbPayoutMethod,
      momoNumber: bbMoMoNumber.trim() || undefined,
      inspectedBy: 'Store Evaluator',
      purchaseDate: new Date().toISOString().slice(0, 10),
      notes: bbNotes.trim(),
    });

    if (res.success && res.buyback) {
      loadData();
      setShowBuyBackModal(false);
      showNotify(
        'success',
        `✓ Purchased "${res.buyback.itemName}" from ${res.buyback.customerName} for ${currency} ${res.buyback.totalPayoutAmount.toLocaleString()}! Stock updated.`
      );
    } else {
      showNotify('error', res.error || 'Failed to record customer stock buy-back.');
    }
  };

  // KPI Calculations
  const totalRefundsThisMonth = useMemo(() => {
    const curMonth = new Date().toISOString().slice(0, 7);
    return refunds
      .filter((r) => r.refundDate.startsWith(curMonth))
      .reduce((acc, r) => acc + r.totalRefundAmount, 0);
  }, [refunds]);

  const totalBuyBacksThisMonth = useMemo(() => {
    const curMonth = new Date().toISOString().slice(0, 7);
    return buybacks
      .filter((b) => b.purchaseDate.startsWith(curMonth))
      .reduce((acc, b) => acc + b.totalPayoutAmount, 0);
  }, [buybacks]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">💵</span>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Customer Payouts, Refunds &amp; Trade-In Desk
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Process customer returns, pay refunds via MoMo/Cash, and purchase stock/trade-ins from walk-in customers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              printRefundsAndBuyBacksPDF(
                refunds,
                buybacks,
                { name: businessName, currency, taxId: null }
              )
            }
            className="px-3.5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            <span>📄 Export Stylish PDF</span>
          </button>

          <button
            onClick={handleOpenRefundModal}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            <span>🔄 Process Return / Refund</span>
          </button>

          <button
            onClick={handleOpenBuyBackModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            <span>💵 Buy Stock from Customer</span>
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
          <p className="text-xs font-medium text-slate-500">Refunds Paid This Month</p>
          <p className="text-2xl font-bold text-amber-700 mt-1 font-mono">
            {currency} {totalRefundsThisMonth.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{refunds.length} return receipts</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Customer Trade-Ins / Buy-Backs</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalBuyBacksThisMonth.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{buybacks.length} items acquired</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Returned Items Restocked</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {refunds.reduce((acc, r) => acc + r.items.filter((i) => i.condition === 'resellable').length, 0)} Items
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Restocked to shelf</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Average Payout Speed</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            Instant
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">Cash Till / MoMo Push</p>
        </div>
      </div>

      {/* 3. TWO CORE TABS */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('refunds')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'refunds'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>🔄 Customer Returns &amp; Refunds</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
            {refunds.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('buybacks')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'buybacks'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>💵 Customer Stock Buy-Backs &amp; Trade-Ins</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
            {buybacks.length}
          </span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CUSTOMER REFUNDS & RETURNS                                      */}
      {/* ===================================================================== */}
      {activeTab === 'refunds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Customer Return Slips &amp; Refunds</h2>
              <p className="text-xs text-slate-500">Processed returns with auto-restocking and WhatsApp refund confirmation.</p>
            </div>
            <button
              onClick={handleOpenRefundModal}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs"
            >
              + Process Return / Refund
            </button>
          </div>

          {refunds.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <span className="text-3xl mb-2 inline-block">🔄</span>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Refunds Processed Yet</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                When a customer returns an item, process the return here to refund cash/MoMo and restock inventory.
              </p>
              <button
                onClick={handleOpenRefundModal}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                + Process First Refund
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Refund #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Items Returned</th>
                      <th className="py-3 px-4">Payment Channel</th>
                      <th className="py-3 px-4 text-right">Amount Refunded</th>
                      <th className="py-3 px-4 text-right">WhatsApp Slip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {refunds.map((r) => {
                      const waLink = getWhatsAppRefundReceiptLink(r, businessName, currency);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.refundNumber}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{r.refundDate}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{r.customerName}</td>
                          <td className="py-3 px-4 text-slate-700">
                            {r.items.map((i) => `${i.productName} (${i.quantityReturned})`).join(', ')}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                              {r.payoutMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                            {currency} {r.totalRefundAmount.toLocaleString()}
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
      {/* TAB 2: CUSTOMER STOCK BUY-BACKS & TRADE-INS                            */}
      {/* ===================================================================== */}
      {activeTab === 'buybacks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Stock Purchased from Customers (Buy-Backs &amp; Trade-Ins)</h2>
              <p className="text-xs text-slate-500">Buy inventory/trade-ins directly from walk-in customers with ID verification and instant stock intake.</p>
            </div>
            <button
              onClick={handleOpenBuyBackModal}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs"
            >
              + Buy Stock from Customer
            </button>
          </div>

          {buybacks.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <span className="text-3xl mb-2 inline-block">💵</span>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Customer Stock Purchased Yet</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                Buy trade-ins, phones, scrap, or bulk produce from customers, issue purchase vouchers, and add directly to your store inventory.
              </p>
              <button
                onClick={handleOpenBuyBackModal}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                + Record First Stock Purchase
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {buybacks.map((bb) => {
                const waLink = getWhatsAppBuyBackVoucherLink(bb, businessName, currency);
                return (
                  <div key={bb.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-900">{bb.voucherNumber}</span>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">{bb.itemName}</h3>
                        <p className="text-xs text-slate-500">Seller: {bb.customerName} · {bb.purchaseDate}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        {bb.condition}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Quantity Bought:</span>
                        <span className="font-mono font-bold text-slate-900">{bb.quantityPurchased} pcs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Cost Paid to Customer:</span>
                        <span className="font-mono font-bold text-red-600">{currency} {bb.totalPayoutAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Target Selling Price:</span>
                        <span className="font-mono font-bold text-emerald-700">{currency} {bb.suggestedResalePrice.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-[11px] text-slate-500">Channel: {bb.payoutMethod.toUpperCase()}</span>
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs hover:bg-emerald-100 transition inline-flex items-center gap-1"
                      >
                        <span>📱 WhatsApp Voucher</span>
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
      {/* 4. MODAL 1: PROCESS CUSTOMER REFUND                                   */}
      {/* ===================================================================== */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Process Customer Return &amp; Refund</h3>
                <p className="text-xs text-slate-500">Issues cash/MoMo refund and restocks eligible items to inventory.</p>
              </div>
              <button onClick={() => setShowRefundModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSaveRefund} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kwame Mensah"
                    value={refCustomerName}
                    onChange={(e) => setRefCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Customer Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={refCustomerPhone}
                    onChange={(e) => setRefCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Sales Receipt Ref (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. REC-2026-0042"
                    value={refSalesReceiptRef}
                    onChange={(e) => setRefSalesReceiptRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase">Returned Products</label>
                  <button
                    type="button"
                    onClick={handleAddRefundItem}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    + Add Another Item
                  </button>
                </div>

                <div className="space-y-2">
                  {refItems.map((item, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex-1 min-w-[180px]">
                        <select
                          required
                          value={item.productId || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleRefundItemChange(idx, 'productId', val);
                          }}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white font-medium text-xs text-slate-900"
                        >
                          <option value="">-- Select Registered Product --</option>
                          {inventory.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.name} ({currency} {Number(inv.unit_price || 0).toFixed(2)}) — In Stock: {inv.quantity}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantityReturned}
                          onChange={(e) => handleRefundItemChange(idx, 'quantityReturned', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white font-mono font-bold"
                        />
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="Unit Price"
                          value={item.unitPrice}
                          onChange={(e) => handleRefundItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white font-mono font-bold"
                        />
                      </div>

                      <div className="w-28">
                        <select
                          value={item.condition}
                          onChange={(e) => handleRefundItemChange(idx, 'condition', e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white font-medium"
                        >
                          <option value="resellable">✓ Resellable (Restock)</option>
                          <option value="damaged">⚠️ Damaged (Write-off)</option>
                          <option value="expired">⌛ Expired</option>
                        </select>
                      </div>

                      <div className="w-24 text-right font-mono font-bold text-amber-700">
                        {currency} {item.refundAmount.toLocaleString()}
                      </div>

                      {refItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRefundItem(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2 text-xs font-bold text-slate-900">
                  Total Refund Payout: {currency} {refItems.reduce((acc, i) => acc + i.refundAmount, 0).toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Refund Payout Channel *</label>
                  <select
                    value={refPayoutMethod}
                    onChange={(e) => setRefPayoutMethod(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                  >
                    <option value="cash">Store Cash Drawer</option>
                    <option value="momo">Customer Mobile Money (MTN / Telecel)</option>
                    <option value="store_credit">Store Credit Voucher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Return Reason</label>
                  <input
                    type="text"
                    value={refReason}
                    onChange={(e) => setRefReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Disburse Refund &amp; Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. MODAL 2: BUY STOCK FROM CUSTOMER (BUY-BACK / TRADE-IN)              */}
      {/* ===================================================================== */}
      {showBuyBackModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Buy Stock from Customer (Trade-In / Buy-Back)</h3>
                <p className="text-xs text-slate-500">Purchases stock from walk-in seller and adds to store inventory.</p>
              </div>
              <button onClick={() => setShowBuyBackModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSaveBuyBack} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Seller Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Samuel Ofori"
                    value={bbCustomerName}
                    onChange={(e) => setBbCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Seller Phone *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0244123456"
                    value={bbCustomerPhone}
                    onChange={(e) => setBbCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ghana Card / ID Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. GHA-918273645-8"
                  value={bbCustomerGhanaCard}
                  onChange={(e) => setBbCustomerGhanaCard(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Item / Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. iPhone 13 128GB Midnight / Generator Engine 5.5HP"
                  value={bbItemName}
                  onChange={(e) => setBbItemName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Condition</label>
                  <select
                    value={bbCondition}
                    onChange={(e) => setBbCondition(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                  >
                    <option value="Brand New">Brand New (Sealed)</option>
                    <option value="Like New (Grade A)">Like New (Grade A)</option>
                    <option value="Good (Grade B)">Good (Grade B)</option>
                    <option value="Fair">Fair (Working)</option>
                    <option value="Scrap / Parts">Scrap / For Parts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Serial / IMEI # (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 354891029384756"
                    value={bbSerial}
                    onChange={(e) => setBbSerial(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bbQuantity}
                    onChange={(e) => setBbQuantity(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Buying Cost ({currency}) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Paid"
                    value={bbUnitCost}
                    onChange={(e) => setBbUnitCost(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Resale ({currency})</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Selling Price"
                    value={bbResalePrice}
                    onChange={(e) => setBbResalePrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Payout Channel *</label>
                  <select
                    value={bbPayoutMethod}
                    onChange={(e) => setBbPayoutMethod(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium"
                  >
                    <option value="cash">Store Cash Drawer</option>
                    <option value="momo">Customer Mobile Money</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Total Payout Disbursed</label>
                  <div className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold text-red-600">
                    {currency} {((parseInt(bbQuantity, 10) || 1) * (parseFloat(bbUnitCost) || 0)).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBuyBackModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Disburse Payout &amp; Add to Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
