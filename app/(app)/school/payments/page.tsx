'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getTermFeeBills,
  getFeePayments,
  recordStudentFeePayment,
  TermFeeBill,
  FeePayment,
} from '@/lib/schoolStore';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolPaymentsPage() {
  const { getWhatsAppPaymentReceipt } = useArchetype();
  const [businessName, setBusinessName] = useState('Our School Academy');
  const [currency, setCurrency] = useState('GHS');

  const [bills, setBills] = useState<TermFeeBill[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('All');

  // Form State
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'momo' | 'bank'>('momo');
  const [receivedBy, setReceivedBy] = useState('School Bursar');
  const [notes, setNotes] = useState('');
  const [billSearchQuery, setBillSearchQuery] = useState('');

  // Selected Bill Details
  const activeBill = useMemo(
    () => bills.find((b) => b.id === selectedBillId),
    [bills, selectedBillId]
  );

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) {
      setBusinessName(biz.name);
      setCurrency(biz.currency || 'GHS');
    }
    const bls = getTermFeeBills();
    const pays = getFeePayments();
    setBills(bls);
    setPayments(pays);

    // Auto-select first unpaid bill or billId from url query
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qBillId = params.get('billId');
      if (qBillId && bls.some((b) => b.id === qBillId)) {
        setSelectedBillId(qBillId);
        const b = bls.find((item) => item.id === qBillId);
        if (b) setAmountPaid(String(b.balanceDue));
        setShowPayModal(true);
      } else {
        const firstUnpaid = bls.find((b) => b.balanceDue > 0);
        if (firstUnpaid) {
          setSelectedBillId(firstUnpaid.id);
          setAmountPaid(String(firstUnpaid.balanceDue));
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  // Handle Bill Dropdown Change
  const handleBillSelectChange = (billId: string) => {
    setSelectedBillId(billId);
    const b = bills.find((item) => item.id === billId);
    if (b) setAmountPaid(String(b.balanceDue));
  };

  const handleOpenPayForBill = (bill: TermFeeBill) => {
    setSelectedBillId(bill.id);
    setAmountPaid(String(bill.balanceDue));
    setShowPayModal(true);
  };

  // Submit Payment Intake
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const payAmt = parseFloat(amountPaid);
    if (!selectedBillId || isNaN(payAmt) || payAmt <= 0) {
      alert('Please select a bill and enter a valid payment amount.');
      return;
    }

    const res = recordStudentFeePayment({
      billId: selectedBillId,
      amountPaid: payAmt,
      paymentMethod,
      receivedBy: receivedBy.trim() || 'Bursar',
      notes: notes.trim(),
    });

    if (res.success && res.payment) {
      setShowPayModal(false);
      setAmountPaid('');
      setNotes('');
      loadData();
      alert(`✓ Payment of ${currency} ${payAmt.toLocaleString()} recorded successfully! Receipt #${res.payment.paymentReceiptNumber}`);
    } else {
      alert(res.error || 'Failed to record payment.');
    }
  };

  const totalCollectedToday = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return payments
      .filter((p) => p.transactionDate === todayStr)
      .reduce((acc, p) => acc + p.amountPaid, 0);
  }, [payments]);

  const filteredBillsForModal = useMemo(() => {
    if (!billSearchQuery.trim()) return bills;
    const q = billSearchQuery.toLowerCase();
    return bills.filter(
      (b) =>
        (b.studentName || '').toLowerCase().includes(q) ||
        (b.classGrade || '').toLowerCase().includes(q) ||
        (b.guardianName || '').toLowerCase().includes(q) ||
        (b.billNumber || '').toLowerCase().includes(q)
    );
  }, [bills, billSearchQuery]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const q = (searchTerm || '').toLowerCase();
      const matchSearch =
        (p.studentName || '').toLowerCase().includes(q) ||
        (p.classGrade || '').toLowerCase().includes(q) ||
        (p.paymentReceiptNumber || '').toLowerCase().includes(q) ||
        (p.receivedBy || '').toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (methodFilter !== 'All' && p.paymentMethod !== methodFilter) return false;
      return true;
    });
  }, [payments, searchTerm, methodFilter]);

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">💵</span>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Fee Collection Desk
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Record student fee payments (Cash, MoMo, Bank) and send instant official WhatsApp receipts.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/school/arrears"
            className="flex-1 sm:flex-none text-center px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-semibold transition"
          >
            ⚠️ Arrears Radar
          </Link>
          <button
            onClick={() => setShowPayModal(true)}
            className="flex-1 sm:flex-none text-center px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1.5"
          >
            <span>+ Record Fee Payment</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Collected Today</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalCollectedToday.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Daily cash/MoMo desk intake</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Term Collections</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {currency} {payments.reduce((acc, p) => acc + p.amountPaid, 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Across {payments.length} receipts issued</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Unpaid Bills Awaiting Settlement</p>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono">
            {bills.filter((b) => b.balanceDue > 0).length} Bills
          </p>
          <p className="text-[11px] text-red-600 font-medium mt-0.5">Available for payment matching</p>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search receipts by pupil name, receipt #, class..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 transition"
            />
            <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['All', 'momo', 'cash', 'bank'].map((m) => (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                className={`px-3 py-1 rounded-lg text-xs font-medium uppercase transition ${
                  methodFilter === m
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. RESPONSIVE DUAL VIEW: MOBILE CARDS & DESKTOP TABLE */}
      
      {/* Mobile Receipt Cards (< md screens) */}
      <div className="md:hidden space-y-3">
        {filteredPayments.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
            <p className="text-xs text-slate-500 mb-3">No payment receipts found matching your search.</p>
            <button
              onClick={() => setShowPayModal(true)}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              + Record Fee Payment
            </button>
          </div>
        ) : (
          filteredPayments.map((p) => {
            const bill = bills.find((b) => b.id === p.billId);
            const remainingBalance = bill ? bill.balanceDue : 0;
            const waReceiptLink = getWhatsAppPaymentReceipt({
              studentName: p.studentName,
              classGrade: p.classGrade,
              guardianPhone: p.guardianPhone,
              amountPaid: p.amountPaid,
              outstandingBalance: remainingBalance,
              businessName,
              currency,
            });

            return (
              <div
                key={p.id}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      #{p.paymentReceiptNumber}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{p.studentName}</h3>
                    <p className="text-xs text-slate-500">{p.classGrade} · {p.transactionDate}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-bold font-mono text-emerald-700">
                      {currency} {p.amountPaid.toLocaleString()}
                    </p>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200 mt-0.5">
                      {p.paymentMethod}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 text-[11px]">Received by: {p.receivedBy}</span>
                  {p.guardianPhone ? (
                    <a
                      href={waReceiptLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs hover:bg-emerald-100 transition inline-flex items-center gap-1"
                    >
                      <span>📱 WhatsApp Slip</span>
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-400">No Phone</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table (>= md screens) */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Payment Receipts Log</h2>
          <span className="text-xs text-slate-500">{filteredPayments.length} receipts displayed</span>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-3xl mb-2 inline-block">💵</span>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Fee Payments Found</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              Record fee payments when parents pay in Cash, Mobile Money, or Bank.
            </p>
            <button
              onClick={() => setShowPayModal(true)}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xs"
            >
              + Record Fee Payment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Pupil Name</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Amount Paid</th>
                  <th className="py-3 px-4">Received By</th>
                  <th className="py-3 px-4 text-right">Parent WhatsApp Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => {
                  const bill = bills.find((b) => b.id === p.billId);
                  const remainingBalance = bill ? bill.balanceDue : 0;
                  const waReceiptLink = getWhatsAppPaymentReceipt({
                    studentName: p.studentName,
                    classGrade: p.classGrade,
                    guardianPhone: p.guardianPhone,
                    amountPaid: p.amountPaid,
                    outstandingBalance: remainingBalance,
                    businessName,
                    currency,
                  });

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.paymentReceiptNumber}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{p.transactionDate}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{p.studentName}</td>
                      <td className="py-3 px-4 text-slate-600">{p.classGrade}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                        {currency} {p.amountPaid.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{p.receivedBy}</td>
                      <td className="py-3 px-4 text-right">
                        {p.guardianPhone ? (
                          <a
                            href={waReceiptLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-semibold transition inline-block"
                          >
                            📱 Send WhatsApp Slip
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400">No WhatsApp</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. RECORD PAYMENT INTAKE MODAL (Fully Mobile-Optimized) */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Fee Payment Intake Desk</h3>
                <p className="text-xs text-slate-500">Record fee receipt and update pupil ledger balance.</p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              
              {/* Student Bill Selection with Quick Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Select Pupil / Student Fee Bill *
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search pupil name to filter bill dropdown..."
                    value={billSearchQuery}
                    onChange={(e) => setBillSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"
                  />
                  <select
                    value={selectedBillId}
                    onChange={(e) => handleBillSelectChange(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-semibold truncate"
                  >
                    {filteredBillsForModal.length === 0 ? (
                      <option value="">No matching bills found</option>
                    ) : (
                      filteredBillsForModal.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.studentName} ({b.classGrade}) — Due: {currency} {b.balanceDue} (#{b.billNumber})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Active Bill Snapshot Card */}
              {activeBill && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Pupil &amp; Class:</span>
                    <span className="font-semibold text-slate-900">{activeBill.studentName} ({activeBill.classGrade})</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Parent / Guardian:</span>
                    <span className="font-medium text-slate-700">{activeBill.guardianName} ({activeBill.guardianPhone || 'No Phone'})</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Bill Total:</span>
                    <span className="font-mono font-semibold text-slate-900">{currency} {activeBill.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Already Paid:</span>
                    <span className="font-mono font-semibold text-emerald-700">{currency} {activeBill.amountPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold border-t border-slate-200 pt-1.5">
                    <span className="text-slate-900">Current Outstanding Balance:</span>
                    <span className="font-mono text-red-600 text-sm">{currency} {activeBill.balanceDue.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Quick Amount Presets */}
              {activeBill && activeBill.balanceDue > 0 && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Quick Pay Presets:</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAmountPaid(String(activeBill.balanceDue))}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold transition"
                    >
                      Pay Full ({currency} {activeBill.balanceDue})
                    </button>
                    {activeBill.balanceDue > 100 && (
                      <button
                        type="button"
                        onClick={() => setAmountPaid(String(Math.round(activeBill.balanceDue / 2)))}
                        className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium transition"
                      >
                        Pay 50% ({currency} {Math.round(activeBill.balanceDue / 2)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAmountPaid('100')}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium transition"
                    >
                      {currency} 100
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountPaid('200')}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium transition"
                    >
                      {currency} 200
                    </button>
                  </div>
                </div>
              )}

              {/* Payment Details: Amount and Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount Paying ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                  >
                    <option value="momo">MTN / Telecel MoMo</option>
                    <option value="cash">Cash (At Bursar Desk)</option>
                    <option value="bank">Bank Deposit / Transfer</option>
                  </select>
                </div>
              </div>

              {/* Received By & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Received By</label>
                  <input
                    type="text"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Transaction Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. MoMo ref ID or receipt remarks"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  ✓ Record Payment &amp; Issue Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
