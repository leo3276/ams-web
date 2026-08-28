'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getTermFeeBills,
  TermFeeBill,
} from '@/lib/schoolStore';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolArrearsPage() {
  const { getWhatsAppArrearsReminder } = useArchetype();
  const [businessName, setBusinessName] = useState('Our School Academy');
  const [currency, setCurrency] = useState('GHS');

  const [bills, setBills] = useState<TermFeeBill[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('All');

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) {
      setBusinessName(biz.name);
      setCurrency(biz.currency || 'GHS');
    }
    const bls = getTermFeeBills();
    setBills(bls);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qGrade = params.get('grade');
      if (qGrade) setSelectedClass(qGrade);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  // Outstanding unpaid bills
  const owingBills = useMemo(() => bills.filter((b) => b.balanceDue > 0), [bills]);
  const totalArrearsAmount = useMemo(
    () => owingBills.reduce((acc, b) => acc + b.balanceDue, 0),
    [owingBills]
  );

  // Class ranking by debt
  const classArrearsRanking = useMemo(() => {
    return GHANAIAN_GRADE_LEVELS.slice(0, 14).map((grade) => {
      const classBills = owingBills.filter((b) => b.classGrade === grade);
      const totalOwing = classBills.reduce((acc, b) => acc + b.balanceDue, 0);
      return {
        grade,
        count: classBills.length,
        totalOwing,
      };
    }).filter((c) => c.totalOwing > 0).sort((a, b) => b.totalOwing - a.totalOwing);
  }, [owingBills]);

  const filteredOwingBills = useMemo(() => {
    return owingBills.filter((b) => {
      const q = (searchTerm || '').toLowerCase();
      const matchesSearch =
        (b.studentName || '').toLowerCase().includes(q) ||
        (b.guardianName || '').toLowerCase().includes(q) ||
        (b.guardianPhone || '').includes(searchTerm);

      if (!matchesSearch) return false;
      if (selectedClass !== 'All' && b.classGrade !== selectedClass) return false;
      return true;
    });
  }, [owingBills, searchTerm, selectedClass]);

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">⚠️</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Fee Arrears Recovery Radar
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Class debt rankings and 1-click WhatsApp parent fee reminders with School MoMo payment info.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/school/payments"
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs"
          >
            + Fee Collection Desk
          </Link>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Unpaid Arrears</p>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono">
            {currency} {totalArrearsAmount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Across {owingBills.length} outstanding pupil bills</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Highest Owing Class</p>
          <p className="text-lg font-bold text-slate-900 mt-1 truncate">
            {classArrearsRanking[0]?.grade || 'None (All Cleared)'}
          </p>
          <p className="text-[11px] text-red-600 font-medium mt-0.5">
            {classArrearsRanking[0] ? `${currency} ${classArrearsRanking[0].totalOwing.toLocaleString()} debt` : '✓ 100% Cleared'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Arrears Recovery Rate</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {bills.length > 0 ? Math.round(((bills.length - owingBills.length) / bills.length) * 100) : 100}%
          </p>
          <p className="text-[11px] text-emerald-700 font-medium mt-0.5">Bills cleared in full</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search pupil owing, parent name, WhatsApp contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 transition"
            />
            <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="font-semibold text-red-600">{filteredOwingBills.length}</span> pupils owing fees
          </div>
        </div>

        {/* Grade Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-thin">
          <button
            onClick={() => setSelectedClass('All')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition ${
              selectedClass === 'All'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Classes ({owingBills.length})
          </button>
          {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((grade) => {
            const count = owingBills.filter((b) => b.classGrade === grade).length;
            return (
              <button
                key={grade}
                onClick={() => setSelectedClass(grade)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                  selectedClass === grade
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {grade} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Arrears List Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredOwingBills.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-3xl mb-2 inline-block">✓</span>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Zero Overdue Arrears</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              All enrolled pupils have cleared their term fees or no unpaid bills match your filter.
            </p>
            <Link
              href="/school/billing"
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xs inline-block"
            >
              Generate New Term Bills
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Pupil &amp; Bill #</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Parent / Guardian</th>
                  <th className="py-3 px-4">Bill Total</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Outstanding Arrears</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOwingBills.map((b) => {
                  const waReminderLink = getWhatsAppArrearsReminder({
                    studentName: b.studentName,
                    classGrade: b.classGrade,
                    guardianPhone: b.guardianPhone,
                    outstandingBalance: b.balanceDue,
                    businessName,
                    currency,
                  });

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{b.studentName}</p>
                        <span className="text-[10px] font-mono text-slate-500">#{b.billNumber}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{b.classGrade}</td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{b.guardianName}</p>
                        <p className="text-[10px] font-mono text-slate-500">{b.guardianPhone}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {currency} {b.totalAmount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-700">
                        {currency} {b.amountPaid.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-red-600">
                        {currency} {b.balanceDue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {b.guardianPhone && (
                            <a
                              href={waReminderLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-semibold transition"
                            >
                              📱 WhatsApp Chaser
                            </a>
                          )}
                          <Link
                            href={`/school/payments?billId=${b.id}`}
                            className="px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800 text-[11px] font-semibold transition"
                          >
                            Collect Fee
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
