'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getSchoolStudents,
  getFeeStructures,
  getTermFeeBills,
  saveTermFeeBills,
  SchoolStudent,
  FeeStructureItem,
  TermFeeBill,
} from '@/lib/schoolStore';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolBillingPage() {
  const { schoolSettings } = useArchetype();
  const [currency, setCurrency] = useState('GHS');

  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>([]);
  const [bills, setBills] = useState<TermFeeBill[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('All');

  // Modals
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);

  // 1-Click Class Billing Form State
  const [bulkClass, setBulkClass] = useState('Basic 1 (Class 1)');
  const [bulkAcademicYear, setBulkAcademicYear] = useState('2025/2026');
  const [bulkTerm, setBulkTerm] = useState('Term 1');
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [bulkItems, setBulkItems] = useState<{ name: string; amount: number }[]>([]);

  // Single Pupil Bill Form State
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [singleItems, setSingleItems] = useState<{ name: string; amount: number }[]>([]);
  const [singleDueDate, setSingleDueDate] = useState('');

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) setCurrency(biz.currency || 'GHS');
    setStudents(getSchoolStudents());
    setFeeStructures(getFeeStructures());
    setBills(getTermFeeBills());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  // Sync bulk default items when modal opens or class changes
  useEffect(() => {
    if (showBulkModal) {
      const applicableFees = feeStructures.filter(
        (f) => f.applicableClass === 'All' || f.applicableClass === bulkClass
      );
      setBulkItems(
        applicableFees.map((f) => ({
          name: f.name,
          amount: f.amount,
        }))
      );
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      setBulkDueDate(in30Days);
    }
  }, [showBulkModal, bulkClass, feeStructures]);

  // Sync single pupil items when selected
  useEffect(() => {
    if (selectedStudentId) {
      const std = students.find((s) => s.id === selectedStudentId);
      if (std) {
        const applicableFees = feeStructures.filter(
          (f) => f.applicableClass === 'All' || f.applicableClass === std.classGrade
        );
        setSingleItems(applicableFees.map((f) => ({ name: f.name, amount: f.amount })));
        const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        setSingleDueDate(in30Days);
      }
    }
  }, [selectedStudentId, students, feeStructures]);

  const bulkTotalPerStudent = useMemo(
    () => bulkItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0),
    [bulkItems]
  );

  const singleTotal = useMemo(
    () => singleItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0),
    [singleItems]
  );

  // Filtered Bills List
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = (searchTerm || '').toLowerCase();
      const matchesSearch =
        (b.studentName || '').toLowerCase().includes(q) ||
        (b.billNumber || '').toLowerCase().includes(q) ||
        (b.guardianPhone || '').includes(searchTerm);

      if (!matchesSearch) return false;
      if (selectedClass !== 'All' && b.classGrade !== selectedClass) return false;
      return true;
    });
  }, [bills, searchTerm, selectedClass]);

  // Execute 1-Click Class Billing
  const handleExecuteBulkClassBilling = (e: React.FormEvent) => {
    e.preventDefault();
    const classPupils = students.filter((s) => s.classGrade === bulkClass);
    if (classPupils.length === 0) {
      alert(`No pupils are enrolled in ${bulkClass}. Please enroll pupils first in the directory.`);
      return;
    }

    const startIdx = bills.length + 1;
    const newBills: TermFeeBill[] = classPupils.map((std, idx) => ({
      id: 'bill_' + Date.now() + '_' + idx,
      billNumber: `FEE-2026-${(startIdx + idx).toString().padStart(4, '0')}`,
      studentId: std.id,
      studentName: std.fullName || (std as any).name || 'Pupil',
      classGrade: std.classGrade,
      guardianName: std.primaryGuardianName || (std as any).guardianName || 'Parent',
      guardianPhone: std.primaryPhone || (std as any).guardianPhone || '',
      academicYear: bulkAcademicYear,
      term: bulkTerm,
      items: [...bulkItems],
      totalAmount: bulkTotalPerStudent,
      amountPaid: 0,
      balanceDue: bulkTotalPerStudent,
      status: 'unpaid',
      dueDate: bulkDueDate,
      createdAt: new Date().toISOString(),
    }));

    const updated = [...newBills, ...bills];
    setBills(updated);
    saveTermFeeBills(updated);
    setShowBulkModal(false);
    alert(`✓ Successfully generated ${classPupils.length} term bills for ${bulkClass}!`);
  };

  // Issue Single Bill
  const handleSaveSingleBill = (e: React.FormEvent) => {
    e.preventDefault();
    const std = students.find((s) => s.id === selectedStudentId);
    if (!std) {
      alert('Please select a pupil from the directory.');
      return;
    }

    const nextNum = `FEE-2026-${(bills.length + 1).toString().padStart(4, '0')}`;
    const newBill: TermFeeBill = {
      id: 'bill_' + Date.now(),
      billNumber: nextNum,
      studentId: std.id,
      studentName: std.fullName || (std as any).name || 'Pupil',
      classGrade: std.classGrade,
      guardianName: std.primaryGuardianName || (std as any).guardianName || 'Parent',
      guardianPhone: std.primaryPhone || (std as any).guardianPhone || '',
      academicYear: schoolSettings.academicYear || '2025/2026',
      term: schoolSettings.currentTerm || 'Term 1',
      items: [...singleItems],
      totalAmount: singleTotal,
      amountPaid: 0,
      balanceDue: singleTotal,
      status: 'unpaid',
      dueDate: singleDueDate,
      createdAt: new Date().toISOString(),
    };

    const updated = [newBill, ...bills];
    setBills(updated);
    saveTermFeeBills(updated);
    setShowSingleModal(false);
    alert(`✓ Issued bill ${newBill.billNumber} for ${std.fullName} (${currency} ${singleTotal})!`);
  };

  const handleDeleteBill = (id: string) => {
    if (!confirm('Delete this term fee bill?')) return;
    const updated = bills.filter((b) => b.id !== id);
    setBills(updated);
    saveTermFeeBills(updated);
  };

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🧾</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Term Fee Billing Engine
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate term fee bills in 1 click for entire classes or issue custom bills for individual pupils.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (students.length > 0) setSelectedStudentId(students[0].id);
              setShowSingleModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-semibold transition"
          >
            + Single Pupil Bill
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            <span>⚡ 1-Click Class Billing</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search bill number, pupil name, WhatsApp phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 transition"
            />
            <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{filteredBills.length}</span> bills issued
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
            All Classes ({bills.length})
          </button>
          {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((grade) => {
            const count = bills.filter((b) => b.classGrade === grade).length;
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

      {/* Term Bills Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredBills.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-3xl mb-2 inline-block">🧾</span>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Term Bills Found</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              Run 1-Click Class Billing to generate term fee bills for an entire class at once.
            </p>
            <button
              onClick={() => setShowBulkModal(true)}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xs"
            >
              ⚡ 1-Click Class Billing
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">Pupil Name</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Parent / Contact</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.billNumber}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{b.studentName}</td>
                    <td className="py-3 px-4 text-slate-600">{b.classGrade}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <p>{b.guardianName}</p>
                      <p className="text-[10px] font-mono text-slate-500">{b.guardianPhone}</p>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {currency} {b.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-emerald-700">
                      {currency} {b.amountPaid.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-red-600">
                      {b.balanceDue > 0 ? `${currency} ${b.balanceDue.toLocaleString()}` : '0.00'}
                    </td>
                    <td className="py-3 px-4">
                      {b.status === 'cleared' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ Cleared
                        </span>
                      ) : b.status === 'part_paid' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Part Paid
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          Unpaid
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {b.balanceDue > 0 && (
                          <Link
                            href={`/school/payments?billId=${b.id}`}
                            className="px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800 text-[11px] font-semibold transition"
                          >
                            Collect Fee
                          </Link>
                        )}
                        <button
                          onClick={() => handleDeleteBill(b.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-600"
                          title="Delete Bill"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1-CLICK CLASS BILLING MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">⚡ 1-Click Class Billing Engine</h3>
                <p className="text-xs text-slate-500">Auto-generate term bills for every pupil enrolled in this class.</p>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleExecuteBulkClassBilling} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Target Class *</label>
                <select
                  value={bulkClass}
                  onChange={(e) => setBulkClass(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-semibold"
                >
                  {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((g) => {
                    const count = students.filter((s) => s.classGrade === g).length;
                    return (
                      <option key={g} value={g}>{g} ({count} Pupils Enrolled)</option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Academic Year</label>
                  <input
                    type="text"
                    value={bulkAcademicYear}
                    onChange={(e) => setBulkAcademicYear(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Term</label>
                  <select
                    value={bulkTerm}
                    onChange={(e) => setBulkTerm(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fee Payment Due Date</label>
                <input
                  type="date"
                  required
                  value={bulkDueDate}
                  onChange={(e) => setBulkDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Fee Items Included</span>
                  <span className="text-xs font-mono font-bold text-slate-900">Total: {currency} {bulkTotalPerStudent} / pupil</span>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {bulkItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{item.name}</span>
                      <span className="font-mono font-semibold text-slate-900">{currency} {item.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  Generate Bills for {students.filter((s) => s.classGrade === bulkClass).length} Pupils
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SINGLE PUPIL BILL MODAL */}
      {showSingleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Issue Single Pupil Bill</h3>
              <button onClick={() => setShowSingleModal(false)} className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSaveSingleBill} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Pupil *</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-semibold"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName || (s as any).name} ({s.classGrade}) · Parent: {s.primaryGuardianName || (s as any).guardianName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={singleDueDate}
                  onChange={(e) => setSingleDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-600">Calculated Bill Total:</span>
                <span className="font-mono font-bold text-slate-900">{currency} {singleTotal}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSingleModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  Issue Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
