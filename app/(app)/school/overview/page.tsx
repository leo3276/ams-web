'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getSchoolStudents,
  getTermFeeBills,
  getFeePayments,
  getSchoolStaff,
  SchoolStudent,
  TermFeeBill,
  FeePayment,
} from '@/lib/schoolStore';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolOverviewPage() {
  const { schoolSettings } = useArchetype();
  const [businessName, setBusinessName] = useState('School Operating System');
  const [currency, setCurrency] = useState('GHS');

  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [bills, setBills] = useState<TermFeeBill[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) {
      setBusinessName(biz.name);
      setCurrency(biz.currency || 'GHS');
    }
    setStudents(getSchoolStudents());
    setBills(getTermFeeBills());
    setPayments(getFeePayments());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  // Aggregated Financial Metrics
  const totalBilled = useMemo(() => bills.reduce((acc, b) => acc + b.totalAmount, 0), [bills]);
  const totalCollected = useMemo(() => payments.reduce((acc, p) => acc + p.amountPaid, 0), [payments]);
  const totalArrears = Math.max(0, totalBilled - totalCollected);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 100;
  const owingPupilsCount = useMemo(() => bills.filter((b) => b.balanceDue > 0).length, [bills]);

  // Class by class collection radar
  const classBreakdown = useMemo(() => {
    return GHANAIAN_GRADE_LEVELS.slice(0, 14).map((grade) => {
      const classStudents = students.filter((s) => s.classGrade === grade);
      const classBills = bills.filter((b) => b.classGrade === grade);
      const classPayments = payments.filter((p) => p.classGrade === grade);

      const billed = classBills.reduce((acc, b) => acc + b.totalAmount, 0);
      const collected = classPayments.reduce((acc, p) => acc + p.amountPaid, 0);
      const arrears = Math.max(0, billed - collected);

      return {
        grade,
        pupilCount: classStudents.length,
        billed,
        collected,
        arrears,
        rate: billed > 0 ? Math.round((collected / billed) * 100) : 100,
      };
    }).filter((c) => c.pupilCount > 0 || c.billed > 0);
  }, [students, bills, payments]);

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🎓</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{businessName}</h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">
                  {schoolSettings.schoolType || 'Basic & Preparatory School'}
                </span>
                <span>•</span>
                <span className="font-mono">
                  {schoolSettings.academicYear || '2025/2026'} ({schoolSettings.currentTerm || 'Term 1'})
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/school/billing"
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-semibold transition"
          >
            ⚡ 1-Click Billing
          </Link>
          <Link
            href="/school/payments"
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs"
          >
            + Fee Collection Desk
          </Link>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Term Fees Collected</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalCollected.toLocaleString()}
          </p>
          <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
            {collectionRate}% collection rate
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Outstanding Arrears</p>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono">
            {currency} {totalArrears.toLocaleString()}
          </p>
          <p className="text-[11px] text-red-600 font-medium mt-0.5">
            {owingPupilsCount} unpaid student bills
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Enrolled Pupils</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {students.length} Pupils
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Across {classBreakdown.length} active classes</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Term Billed</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalBilled.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{bills.length} total bills issued</p>
        </div>
      </div>

      {/* Quick Access School Navigation Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label: 'Directory', href: '/school/students', icon: '🧑‍🎓' },
          { label: 'Fee Rates', href: '/school/fee-structure', icon: '📋' },
          { label: 'Term Billing', href: '/school/billing', icon: '🧾' },
          { label: 'Fee Desk', href: '/school/payments', icon: '💵' },
          { label: 'Arrears', href: '/school/arrears', icon: '⚠️' },
          { label: 'Payroll', href: '/school/teachers', icon: '🧑‍🏫' },
          { label: 'Financials', href: '/school/reports', icon: '📈' },
        ].map((btn) => (
          <Link
            key={btn.href}
            href={btn.href}
            className="p-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition text-center shadow-xs group"
          >
            <span className="text-xl block mb-1">{btn.icon}</span>
            <p className="text-xs font-semibold text-slate-800 group-hover:underline">{btn.label}</p>
          </Link>
        ))}
      </div>

      {/* Class Collection Radar Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Class-by-Class Collection Radar</h2>
            <p className="text-xs text-slate-500">Real-time breakdown of fees billed, collected, and arrears per grade.</p>
          </div>
          <Link
            href="/school/arrears"
            className="text-xs font-semibold text-slate-700 hover:underline flex items-center gap-1"
          >
            <span>View Arrears Chaser Radar →</span>
          </Link>
        </div>

        {classBreakdown.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-slate-500 mb-3">No active student class rosters or bills found.</p>
            <Link
              href="/school/students"
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              + Enroll Students in Directory
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Class Grade</th>
                  <th className="py-3 px-4">Pupils</th>
                  <th className="py-3 px-4">Total Billed</th>
                  <th className="py-3 px-4">Collected</th>
                  <th className="py-3 px-4">Arrears Due</th>
                  <th className="py-3 px-4">Rate %</th>
                  <th className="py-3 px-4 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classBreakdown.map((row) => (
                  <tr key={row.grade} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{row.grade}</td>
                    <td className="py-3 px-4 text-slate-600">{row.pupilCount} Pupils</td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {currency} {row.billed.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-emerald-700">
                      {currency} {row.collected.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-red-600">
                      {row.arrears > 0 ? `${currency} ${row.arrears.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        row.rate >= 90 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {row.rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {row.arrears > 0 ? (
                        <Link
                          href={`/school/arrears?grade=${encodeURIComponent(row.grade)}`}
                          className="px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-[11px] font-semibold transition inline-block"
                        >
                          Chase Arrears
                        </Link>
                      ) : (
                        <Link
                          href="/school/billing"
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition inline-block"
                        >
                          Bill Class
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
