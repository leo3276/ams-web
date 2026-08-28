'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  getSchoolStaff,
  saveSchoolStaff,
  SchoolStaff,
} from '@/lib/schoolStore';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolTeachersPage() {
  const [currency, setCurrency] = useState('GHS');
  const [staffList, setStaffList] = useState<SchoolStaff[]>([]);
  const [loading, setLoading] = useState(false);

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<SchoolStaff['role']>('class_teacher');
  const [assignedClass, setAssignedClass] = useState('Basic 1 (Class 1)');
  const [phone, setPhone] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('2200');

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) setCurrency(biz.currency || 'GHS');
    setStaffList(getSchoolStaff());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  const totalMonthlyPayroll = useMemo(
    () => staffList.reduce((acc, s) => acc + (s.monthlySalary || 0), 0),
    [staffList]
  );

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setRole('class_teacher');
    setAssignedClass('Basic 1 (Class 1)');
    setPhone('');
    setMonthlySalary('2200');
    setShowAddModal(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    const staffData: SchoolStaff = {
      id: editingId || 'stf_' + Date.now(),
      name: name.trim(),
      role,
      assignedClass: role === 'class_teacher' ? assignedClass : undefined,
      phone: phone.trim(),
      monthlySalary: parseFloat(monthlySalary) || 0,
      createdAt: new Date().toISOString(),
    };

    let updated: SchoolStaff[];
    if (editingId) {
      updated = staffList.map((s) => (s.id === editingId ? staffData : s));
    } else {
      updated = [...staffList, staffData];
    }

    setStaffList(updated);
    saveSchoolStaff(updated);
    setShowAddModal(false);
  };

  const handleDisburseSalary = (id: string, staffName: string, salary: number) => {
    if (!confirm(`Confirm monthly salary disbursement of ${currency} ${salary.toLocaleString()} for ${staffName}?`)) return;
    const updated = staffList.map((s) =>
      s.id === id ? { ...s, lastPaidDate: new Date().toISOString().slice(0, 10) } : s
    );
    setStaffList(updated);
    saveSchoolStaff(updated);
    alert(`✓ Salary of ${currency} ${salary.toLocaleString()} disbursed to ${staffName} and recorded in school expenditure statement.`);
  };

  const handleDeleteStaff = (id: string) => {
    if (!confirm('Remove this staff member from payroll?')) return;
    const updated = staffList.filter((s) => s.id !== id);
    setStaffList(updated);
    saveSchoolStaff(updated);
  };

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🧑‍🏫</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Teachers &amp; Staff Payroll
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage Headmasters, Class Teachers, Drivers, and Cooks. Track monthly salary disbursements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/school/reports"
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-semibold transition"
          >
            📈 Financial Statement
          </Link>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs"
          >
            + Add Staff Member
          </button>
        </div>
      </div>

      {/* KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Monthly Payroll</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalMonthlyPayroll.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Monthly staff salary commitment</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total School Staff</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {staffList.length} Members
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {staffList.filter((s) => s.role === 'class_teacher' || s.role === 'subject_teacher').length} Teaching · {staffList.filter((s) => s.role !== 'class_teacher' && s.role !== 'subject_teacher').length} Support
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Salaries Disbursed This Month</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {staffList.filter((s) => s.lastPaidDate?.startsWith(new Date().toISOString().slice(0, 7))).length} / {staffList.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Paid for active pay cycle</p>
        </div>
      </div>

      {/* Staff Roster Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Staff Name</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Assigned Class</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Monthly Salary</th>
                <th className="py-3 px-4">Last Paid</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffList.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900">{s.name}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 capitalize">
                      {s.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{s.assignedClass || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{s.phone}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {currency} {s.monthlySalary.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {s.lastPaidDate ? (
                      <span className="text-emerald-700 font-semibold">✓ {s.lastPaidDate}</span>
                    ) : (
                      <span className="text-slate-400">Pending</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleDisburseSalary(s.id, s.name, s.monthlySalary)}
                        className="px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800 text-[11px] font-semibold transition"
                      >
                        Disburse Salary
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(s.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-600"
                        title="Remove Staff"
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
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add School Staff Member</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mrs. Grace Mensah"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                  >
                    <option value="headmaster">Headmaster / Principal</option>
                    <option value="class_teacher">Class Teacher</option>
                    <option value="subject_teacher">Subject Teacher</option>
                    <option value="bursar">Bursar / Cashier</option>
                    <option value="driver">Bus Driver</option>
                    <option value="cook">Canteen Cook</option>
                    <option value="cleaner">Sanitation / Cleaner</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="0244123456"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                  />
                </div>
              </div>

              {role === 'class_teacher' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Class Grade</label>
                  <select
                    value={assignedClass}
                    onChange={(e) => setAssignedClass(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                  >
                    {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Monthly Salary ({currency}) *</label>
                <input
                  type="number"
                  required
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  Save Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
