'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getFeeStructures,
  saveFeeStructures,
  FeeStructureItem,
} from '@/lib/schoolStore';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import { getCachedBusiness } from '@/lib/offlineStore';

export default function SchoolFeeStructurePage() {
  const { schoolSettings } = useArchetype();
  const [currency, setCurrency] = useState('GHS');
  const [fees, setFees] = useState<FeeStructureItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FeeStructureItem['category']>('tuition');
  const [applicableClass, setApplicableClass] = useState('All');
  const [amount, setAmount] = useState('600');
  const [isMandatory, setIsMandatory] = useState(true);
  const [term, setTerm] = useState('All Terms');

  const loadData = useCallback(() => {
    const biz = getCachedBusiness();
    if (biz) setCurrency(biz.currency || 'GHS');
    setFees(getFeeStructures());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('ams:school-data-updated', loadData);
    return () => window.removeEventListener('ams:school-data-updated', loadData);
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setCategory('tuition');
    setApplicableClass('All');
    setAmount('500');
    setIsMandatory(true);
    setTerm('All Terms');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: FeeStructureItem) => {
    setEditingId(item.id);
    setName(item.name);
    setCategory(item.category);
    setApplicableClass(item.applicableClass);
    setAmount(String(item.amount));
    setIsMandatory(item.isMandatory);
    setTerm(item.term);
    setShowAddModal(true);
  };

  const handleSaveFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) {
      alert('Please provide a fee name and amount.');
      return;
    }

    const currentFees = getFeeStructures();
    const feeData: FeeStructureItem = {
      id: editingId || 'fee_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      category,
      applicableClass,
      amount: parseFloat(amount) || 0,
      isMandatory,
      term,
    };

    let updated: FeeStructureItem[];
    if (editingId) {
      updated = currentFees.map((f) => (f.id === editingId ? feeData : f));
    } else {
      updated = [...currentFees, feeData];
    }

    setFees(updated);
    saveFeeStructures(updated);
    setShowAddModal(false);
    alert(`✓ Fee rate "${feeData.name}" saved successfully!`);
  };

  const handleDeleteFee = (id: string, feeName?: string) => {
    if (!confirm(`Delete "${feeName || 'this fee item'}" from the standard fee schedule?`)) return;
    const currentFees = getFeeStructures();
    const updated = currentFees.filter((f) => f.id !== id);
    setFees(updated);
    saveFeeStructures(updated);
    if (editingId === id) setShowAddModal(false);
  };

  const filteredFees = useMemo(() => {
    return fees.filter((f) => {
      const q = (searchTerm || '').toLowerCase();
      const matchSearch =
        (f.name || '').toLowerCase().includes(q) ||
        (f.category || '').toLowerCase().includes(q) ||
        (f.applicableClass || '').toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (selectedCategory !== 'All' && f.category !== selectedCategory) return false;
      if (selectedClass !== 'All' && f.applicableClass !== selectedClass && f.applicableClass !== 'All') return false;
      return true;
    });
  }, [fees, searchTerm, selectedCategory, selectedClass]);

  const totalMandatoryTermFee = useMemo(
    () => fees.filter((f) => f.isMandatory).reduce((acc, f) => acc + f.amount, 0),
    [fees]
  );

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">📋</span>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                School Fee Structure &amp; Rates
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure standard tuition, feeding, transport, exam, and PTA rates used across all classes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/school/billing"
            className="flex-1 sm:flex-none text-center px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-semibold transition"
          >
            ⚡ Generate Bills
          </Link>
          <button
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-none text-center px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs"
          >
            + Add Fee Rate
          </button>
        </div>
      </div>

      {/* 2. Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Mandatory Base Fee</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {currency} {totalMandatoryTermFee.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Per pupil term standard</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Configured Fee Schedule</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {fees.length} Fee Items
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{fees.filter((f) => !f.isMandatory).length} optional items</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Active Term Calendar</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-1 truncate">
            {schoolSettings.academicYear || '2025/2026'} · {schoolSettings.currentTerm || 'Term 1'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">GES academic term schedule</p>
        </div>
      </div>

      {/* 3. Filter & Search Suite */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search fee item name, category, or class..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 transition"
            />
            <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['All', 'tuition', 'feeding', 'transport', 'pta', 'exam', 'uniform', 'books'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. RESPONSIVE DUAL-VIEW: DESKTOP TABLE & MOBILE CARDS */}
      
      {/* Mobile Card Layout (< md screens) */}
      <div className="md:hidden space-y-3">
        {filteredFees.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
            <p className="text-xs text-slate-500 mb-3">No fee items matched your filter.</p>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              + Add Fee Rate Item
            </button>
          </div>
        ) : (
          filteredFees.map((f) => (
            <div
              key={f.id}
              onClick={() => handleOpenEdit(f)}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5 active:bg-slate-50 transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{f.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="px-2 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200 capitalize">
                      {f.category}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {f.applicableClass === 'All' ? 'All Classes' : f.applicableClass}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-base font-bold font-mono text-slate-900">
                    {currency} {f.amount.toLocaleString()}
                  </p>
                  {f.isMandatory ? (
                    <span className="text-[10px] font-semibold text-emerald-700">✓ Mandatory</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Optional</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="text-slate-500">{f.term}</span>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleOpenEdit(f)}
                    className="px-3 py-1 rounded-md bg-slate-100 text-slate-800 font-medium hover:bg-slate-200 text-xs"
                  >
                    Edit ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteFee(f.id, f.name)}
                    className="px-3 py-1 rounded-md bg-red-50 text-red-600 font-medium hover:bg-red-100 text-xs"
                  >
                    Delete 🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table Layout (>= md screens) */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredFees.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-3xl mb-2 inline-block">📋</span>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Fee Items Found</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              Configure fee rates for tuition, bus transport, canteen feeding, and exam levies.
            </p>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xs"
            >
              + Add Fee Rate Item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fee Item Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Applicable Class</th>
                  <th className="py-3 px-4">Term Schedule</th>
                  <th className="py-3 px-4">Rate Amount</th>
                  <th className="py-3 px-4">Mandatory?</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFees.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => handleOpenEdit(f)}
                    className="hover:bg-slate-50/70 transition cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 group-hover:underline">
                      {f.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200 capitalize">
                        {f.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{f.applicableClass}</td>
                    <td className="py-3 px-4 text-slate-600">{f.term}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {currency} {f.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      {f.isMandatory ? (
                        <span className="text-emerald-700 font-semibold">✓ Mandatory</span>
                      ) : (
                        <span className="text-slate-500">Optional</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(f)}
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium transition"
                          title="Edit Fee Rate"
                        >
                          Edit ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteFee(f.id, f.name)}
                          className="p-1 rounded text-slate-400 hover:text-red-600"
                          title="Delete Item"
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

      {/* 5. ADD / EDIT FEE MODAL (Fully Responsive) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingId ? 'Edit Fee Item Rate' : 'Add New Fee Rate Item'}
                </h3>
                <p className="text-xs text-slate-500">Configure standard rate schedule for student billing.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFee} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fee Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tuition Fee, Canteen Feeding, Bus Transport"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-900 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fee Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                  >
                    <option value="tuition">Tuition &amp; Academic</option>
                    <option value="feeding">Feeding / Canteen</option>
                    <option value="transport">Transport / Bus</option>
                    <option value="uniform">Uniform</option>
                    <option value="books">Books &amp; Stationery</option>
                    <option value="pta">PTA Development Levy</option>
                    <option value="exam">ICT &amp; Examination</option>
                    <option value="other">Other School Levy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount ({currency}) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Applicable Class Grade</label>
                  <select
                    value={applicableClass}
                    onChange={(e) => setApplicableClass(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                  >
                    <option value="All">All Classes</option>
                    {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Term Schedule</label>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                  >
                    <option value="All Terms">All Terms</option>
                    <option value="Term 1">Term 1 Only</option>
                    <option value="Term 2">Term 2 Only</option>
                    <option value="Term 3">Term 3 Only</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="mandCheck"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  className="w-4 h-4 rounded text-slate-900 cursor-pointer"
                />
                <label htmlFor="mandCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Mandatory item (included automatically on all student term bills for this class)
                </label>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteFee(editingId, name)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition"
                  >
                    🗑️ Delete Item
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                  >
                    {editingId ? '✓ Save Changes' : '+ Add Fee Item'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
