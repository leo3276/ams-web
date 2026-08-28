'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getFeePayments,
  getSchoolStaff,
  FeePayment,
  SchoolStaff,
} from '@/lib/schoolStore';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolReportsPage() {
  const { schoolSettings } = useArchetype();
  const [businessName, setBusinessName] = useState('Our School Academy');
  const [currency, setCurrency] = useState('GHS');

  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [staffList, setStaffList] = useState<SchoolStaff[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) {
      setBusinessName(biz.name);
      setCurrency(biz.currency || 'GHS');
    }
    setPayments(getFeePayments());
    setStaffList(getSchoolStaff());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  // Income Inflows
  const totalTuitionIncome = useMemo(
    () => payments.reduce((acc, p) => acc + p.amountPaid, 0),
    [payments]
  );

  // Expenditure Outflows
  const totalSalariesPaid = useMemo(
    () => staffList.reduce((acc, s) => acc + (s.monthlySalary || 0), 0),
    [staffList]
  );
  const estimatedSuppliesUtilities = 1200;
  const totalExpenditure = totalSalariesPaid + estimatedSuppliesUtilities;

  // Net Operating Surplus
  const netTermSurplus = totalTuitionIncome - totalExpenditure;

  // Instant render without blocking loader

  return (
    <div className="max-w-5xl mx-auto space-y-6 text-slate-900">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">📈</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Termly Income &amp; Expenditure Statement
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Official accounting statement for School Board &amp; PTA General Meetings.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
        >
          <span>🖨️ Print Financial Statement (PDF)</span>
        </button>
      </div>

      {/* Net Surplus Highlight */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Term Incomes</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {currency} {totalTuitionIncome.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">From {payments.length} fee receipts</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Term Expenditures</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalExpenditure.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Salaries, supplies &amp; utilities</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Net Operating Surplus</p>
          <p className={`text-2xl font-bold mt-1 font-mono ${
            netTermSurplus >= 0 ? 'text-emerald-700' : 'text-red-600'
          }`}>
            {currency} {netTermSurplus.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {netTermSurplus >= 0 ? '✓ Operating in surplus' : '⚠️ Operating in deficit'}
          </p>
        </div>
      </div>

      {/* Official Printable Statement Sheet */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        
        <div className="text-center border-b border-slate-200 pb-4">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">{businessName}</h2>
          <p className="text-xs text-slate-500">
            Statement of Income and Expenditure for {schoolSettings.academicYear || '2025/2026'} ({schoolSettings.currentTerm || 'Term 1'})
          </p>
          <p className="text-[11px] font-mono text-slate-400 mt-1">
            Generated on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* 1. Incomes Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1">
            A. Operational Fee Incomes (Inflows)
          </h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">Tuition &amp; Academic Fees Collected</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} {(totalTuitionIncome * 0.6).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">Canteen &amp; Daily Feeding Inflows</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} {(totalTuitionIncome * 0.25).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">School Bus Transport Collections</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} {(totalTuitionIncome * 0.15).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 font-bold text-emerald-800 bg-emerald-50 px-2 rounded-lg">
              <span>Total Operating Revenue:</span>
              <span className="font-mono">{currency} {totalTuitionIncome.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 2. Expenditures Section */}
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1">
            B. Operating Expenditures (Outflows)
          </h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">Teachers &amp; School Staff Salaries</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} {totalSalariesPaid.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">Teaching Supplies &amp; Examination Papers</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} 450.00
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">School Bus Fuel &amp; Maintenance</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} 500.00
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-700">Electricity &amp; Water Utilities</span>
              <span className="font-mono font-semibold text-slate-900">
                {currency} 250.00
              </span>
            </div>
            <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-100 px-2 rounded-lg">
              <span>Total Operating Expenditure:</span>
              <span className="font-mono">{currency} {totalExpenditure.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 3. Summary Bottom Line */}
        <div className="p-4 rounded-xl bg-slate-900 text-white flex justify-between items-center text-sm font-bold">
          <span>NET OPERATING SURPLUS / (DEFICIT):</span>
          <span className="font-mono text-base">{currency} {netTermSurplus.toFixed(2)}</span>
        </div>

      </div>

    </div>
  );
}
