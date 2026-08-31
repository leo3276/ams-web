'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CustomerSummary, Invoice } from '@/lib/types';
import { printCustomerStatementPDF } from '@/lib/pdfGenerator';
import { useArchetype, StudentRosterEntry } from '@/lib/ArchetypeContext';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedCustomers,
  setCachedCustomers,
  getCachedInvoices,
  setCachedInvoices,
} from '@/lib/offlineStore';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function CustomersPage() {
  const {
    archetype,
    isEducation,
    students,
    addStudent,
    updateStudent,
    removeStudent,
    getWhatsAppArrearsReminder,
    getWhatsAppPaymentReceipt,
    schoolSettings,
  } = useArchetype();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected Customer Modal (Standard Mode)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'debt' | 'paid'>('all');

  // Education Mode Specific States
  const [selectedClassTab, setSelectedClassTab] = useState<string>('All');
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  // Student Form State
  const [stdName, setStdName] = useState('');
  const [stdClass, setStdClass] = useState('Basic 1 (Class 1)');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [address, setAddress] = useState('');

  const loadData = useCallback(async () => {
    // 1. Instantly load from local cache
    const cachedBiz = getCachedBusiness();
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setBusinessName(cachedBiz.name);
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedCust = getCachedCustomers();
    if (cachedCust.length > 0) {
      setCustomers(cachedCust);
    }
    const cachedInvs = getCachedInvoices();
    if (cachedInvs.length > 0) {
      setAllInvoices(cachedInvs);
    }
    setLoading(false);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name, currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      const business = businesses?.[0];
      if (!business) return;

      setBusinessId(business.id);
      setBusinessName(business.name);
      setCurrency(business.currency || 'GHS');
      setCachedBusiness({ id: business.id, name: business.name, currency: business.currency || 'GHS' });

      const [summaryRes, invoicesRes] = await Promise.all([
        supabase.rpc('get_customer_summary', { p_business_id: business.id }),
        supabase.from('invoices').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
      ]);

      if (summaryRes.data) {
        setCustomers(summaryRes.data);
        setCachedCustomers(summaryRes.data);
      }

      if (invoicesRes.data) {
        setAllInvoices(invoicesRes.data);
        setCachedInvoices(invoicesRes.data as any);
      }
    } catch (_e) {
      // offline fallback
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('ams:customers-updated', handleUpdate);
    window.addEventListener('ams:invoices-updated', handleUpdate);
    return () => {
      window.removeEventListener('ams:customers-updated', handleUpdate);
      window.removeEventListener('ams:invoices-updated', handleUpdate);
    };
  }, [loadData]);

  // Merge student roster with live invoice financial numbers
  const studentRecords = useMemo(() => {
    return students.map((std) => {
      // Find invoices matching student name
      const stdInvoices = allInvoices.filter(
        (inv) => inv.customer_name?.trim().toLowerCase() === std.name?.trim().toLowerCase()
      );
      const totalBilled = stdInvoices.reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);
      const totalPaid = stdInvoices
        .filter((inv) => inv.status === 'paid')
        .reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);
      const outstanding = Math.max(0, totalBilled - totalPaid);

      return {
        ...std,
        totalBilled,
        totalPaid,
        outstanding,
        invoiceCount: stdInvoices.length,
        isCleared: totalBilled > 0 && outstanding === 0,
        isOwing: outstanding > 0,
      };
    });
  }, [students, allInvoices]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return studentRecords.filter((s) => {
      // Search term
      const matchesSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.guardianName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.guardianPhone && s.guardianPhone.includes(searchTerm)) ||
        (s.admissionNumber && s.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Class tab filter
      if (selectedClassTab === 'All') return true;
      if (selectedClassTab === 'Owing') return s.isOwing;
      if (selectedClassTab === 'Cleared') return s.isCleared;
      return s.classGrade === selectedClassTab;
    });
  }, [studentRecords, searchTerm, selectedClassTab]);

  // Metrics for Education
  const totalStudentsCount = students.length;
  const owingStudentsCount = studentRecords.filter((s) => s.isOwing).length;
  const totalArrearsAmount = studentRecords.reduce((acc, s) => acc + s.outstanding, 0);
  const totalCollectedFees = studentRecords.reduce((acc, s) => acc + s.totalPaid, 0);

  // Standard Customer Filters
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.customer_email && c.customer_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.customer_phone && c.customer_phone.includes(searchTerm));

      if (!matchesSearch) return false;
      if (filterTab === 'debt') return c.total_outstanding > 0;
      if (filterTab === 'paid') return c.total_outstanding === 0 && c.total_invoiced > 0;
      return true;
    });
  }, [customers, searchTerm, filterTab]);

  // Open Add Student Modal
  const handleOpenAddStudent = () => {
    setEditingStudentId(null);
    setStdName('');
    setStdClass('Basic 1 (Class 1)');
    setGuardianName('');
    setGuardianPhone('');
    setGuardianEmail('');
    setAdmissionNo('');
    setGender('Male');
    setAddress('');
    setShowStudentModal(true);
  };

  // Open Edit Student Modal
  const handleOpenEditStudent = (s: StudentRosterEntry) => {
    setEditingStudentId(s.id);
    setStdName(s.name);
    setStdClass(s.classGrade);
    setGuardianName(s.guardianName);
    setGuardianPhone(s.guardianPhone);
    setGuardianEmail(s.guardianEmail || '');
    setAdmissionNo(s.admissionNumber || '');
    setGender(s.gender || 'Male');
    setAddress(s.residentialAddress || '');
    setShowStudentModal(true);
  };

  // Save Student
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = stdName.trim();
    const cleanGuardian = guardianName.trim();
    if (!cleanName || !cleanGuardian) {
      alert('Please provide student name and parent/guardian name.');
      return;
    }

    if (editingStudentId) {
      updateStudent(editingStudentId, {
        name: cleanName,
        classGrade: stdClass,
        guardianName: cleanGuardian,
        guardianPhone: guardianPhone.trim(),
        guardianEmail: guardianEmail.trim(),
        admissionNumber: admissionNo.trim(),
        gender,
        residentialAddress: address.trim(),
      });
    } else {
      addStudent({
        name: cleanName,
        classGrade: stdClass,
        guardianName: cleanGuardian,
        guardianPhone: guardianPhone.trim(),
        guardianEmail: guardianEmail.trim(),
        admissionNumber: admissionNo.trim(),
        gender,
        residentialAddress: address.trim(),
      });
    }

    setShowStudentModal(false);
  };

  if (loading) {
    return <p className="text-sm text-textSecondary">Loading {archetype.vocabulary.customersTitle}…</p>;
  }

  /* ======================================================== */
  /* VIEW A: EDUCATION & SCHOOLS SPECIFIC ROSTER              */
  /* ======================================================== */
  if (isEducation) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🎓</span>
              <h1 className="text-2xl font-bold text-textPrimary tracking-tight">
                Student Directory &amp; Class Rosters
              </h1>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                {schoolSettings.academicYear} · {schoolSettings.currentTerm}
              </span>
            </div>
            <p className="text-xs text-textSecondary">
              Manage enrolled pupils, parent WhatsApp contacts, and monitor term fee arrears class by class.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/invoices"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface2 border border-border text-textPrimary hover:bg-surface0 text-xs font-bold transition shadow-xs"
            >
              <span>⚡ Issue Term Bills</span>
            </Link>
            <button
              onClick={handleOpenAddStudent}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-textPrimary text-white hover:opacity-90 text-xs font-extrabold transition shadow-md"
            >
              <span>+ Enroll Student</span>
            </button>
          </div>
        </div>

        {/* 4 School KPI Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">Total Enrolled</p>
            <p className="text-2xl font-black text-textPrimary font-mono mt-1">{totalStudentsCount}</p>
            <p className="text-[11px] text-textMuted mt-0.5">Active pupils across classes</p>
          </div>

          <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Fees Collected</p>
            <p className="text-2xl font-black text-purple-700 dark:text-purple-300 font-mono mt-1">
              {currency} {totalCollectedFees.toLocaleString()}
            </p>
            <p className="text-[11px] text-textMuted mt-0.5">Total cash &amp; MoMo inflows</p>
          </div>

          <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-danger uppercase tracking-wider">Unpaid Arrears</p>
            <p className="text-2xl font-black text-danger font-mono mt-1">
              {currency} {totalArrearsAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-danger font-semibold mt-0.5">{owingStudentsCount} students with arrears</p>
          </div>

          <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Collection Rate</p>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
              {totalCollectedFees + totalArrearsAmount > 0
                ? Math.round((totalCollectedFees / (totalCollectedFees + totalArrearsAmount)) * 100)
                : 100}%
            </p>
            <p className="text-[11px] text-textMuted mt-0.5">Term collection efficiency</p>
          </div>
        </div>

        {/* Filter and Class Tabs */}
        <div className="bg-surface1 p-4 rounded-2xl border border-border space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by student name, parent name, phone, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-textMuted">🔍</span>
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedClassTab('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  selectedClassTab === 'All'
                    ? 'bg-textPrimary text-white shadow-xs'
                    : 'bg-surface2 text-textSecondary hover:bg-surface0'
                }`}
              >
                All ({students.length})
              </button>
              <button
                onClick={() => setSelectedClassTab('Owing')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  selectedClassTab === 'Owing'
                    ? 'bg-danger text-white shadow-xs'
                    : 'bg-surface2 text-danger hover:bg-danger/10'
                }`}
              >
                ⚠️ Owing Arrears ({owingStudentsCount})
              </button>
              <button
                onClick={() => setSelectedClassTab('Cleared')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  selectedClassTab === 'Cleared'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-surface2 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                ✓ Cleared ({studentRecords.filter((s) => s.isCleared).length})
              </button>
            </div>
          </div>

          {/* Class Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-border scrollbar-thin">
            <span className="text-[11px] font-bold text-textMuted shrink-0 mr-1">Classes:</span>
            {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((grade) => {
              const count = studentRecords.filter((s) => s.classGrade === grade).length;
              if (count === 0 && selectedClassTab !== grade) return null;
              return (
                <button
                  key={grade}
                  onClick={() => setSelectedClassTab(grade)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                    selectedClassTab === grade
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-surface2 text-textSecondary hover:bg-surface0 border border-border'
                  }`}
                >
                  {grade} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Student Roster Table */}
        <div className="bg-surface1 rounded-2xl border border-border overflow-hidden shadow-xs">
          {filteredStudents.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-4xl mb-2 inline-block">🧑‍🎓</span>
              <h3 className="text-base font-bold text-textPrimary mb-1">No Students Found</h3>
              <p className="text-xs text-textSecondary mb-4 max-w-sm mx-auto">
                {students.length === 0
                  ? 'Your student directory is currently empty. Click below to enroll your first student!'
                  : 'No students matched the active search or class filter.'}
              </p>
              <button
                onClick={handleOpenAddStudent}
                className="px-4 py-2 rounded-xl bg-textPrimary text-white text-xs font-bold shadow-sm"
              >
                + Enroll Student Now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface2 border-b border-border text-textSecondary uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">Student &amp; Class</th>
                    <th className="py-3 px-4">Parent / Guardian</th>
                    <th className="py-3 px-4">Total Billed</th>
                    <th className="py-3 px-4">Total Paid</th>
                    <th className="py-3 px-4">Term Balance</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredStudents.map((std) => {
                    const arrearsLink = getWhatsAppArrearsReminder({
                      studentName: std.name,
                      classGrade: std.classGrade,
                      guardianPhone: std.guardianPhone,
                      outstandingBalance: std.outstanding,
                      businessName,
                      currency,
                    });

                    return (
                      <tr key={std.id} className="hover:bg-surface2/50 transition">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-xs shrink-0">
                              {initials(std.name)}
                            </div>
                            <div>
                              <p className="font-bold text-textPrimary text-sm">{std.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  {std.classGrade}
                                </span>
                                {std.admissionNumber && (
                                  <span className="text-[10px] font-mono text-textMuted">
                                    #{std.admissionNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-textPrimary">{std.guardianName}</p>
                          {std.guardianPhone ? (
                            <a
                              href={`tel:${std.guardianPhone}`}
                              className="text-[11px] text-textSecondary hover:text-accentText flex items-center gap-1 mt-0.5 font-mono"
                            >
                              <span>📞</span> {std.guardianPhone}
                            </a>
                          ) : (
                            <span className="text-[10px] text-textMuted">No phone added</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-textSecondary">
                          {currency} {std.totalBilled.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-emerald-700 font-semibold">
                          {currency} {std.totalPaid.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          {std.outstanding > 0 ? (
                            <span className="px-2 py-1 rounded-lg text-xs font-bold bg-danger/10 text-danger border border-danger/20">
                              OWING {currency} {std.outstanding.toLocaleString()}
                            </span>
                          ) : std.totalBilled > 0 ? (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ✓ CLEARED
                            </span>
                          ) : (
                            <span className="text-[11px] text-textMuted">No term bill issued</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {std.outstanding > 0 && std.guardianPhone && (
                              <a
                                href={arrearsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-bold transition flex items-center gap-1 shadow-xs"
                                title="Send WhatsApp Arrears Reminder"
                              >
                                <span>💬</span>
                                <span className="hidden sm:inline">WhatsApp</span>
                              </a>
                            )}
                            <button
                              onClick={() => handleOpenEditStudent(std)}
                              className="p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface2 transition"
                              title="Edit Student Info"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Remove ${std.name} from the student roster?`)) {
                                  removeStudent(std.id);
                                }
                              }}
                              className="p-1.5 rounded-lg text-textMuted hover:text-danger hover:bg-danger/5 transition"
                              title="Remove Student"
                            >
                              🗑️
                            </button>
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

        {/* ENROLL / EDIT STUDENT MODAL */}
        {showStudentModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface1 rounded-2xl max-w-lg w-full p-6 border border-border shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧑‍🎓</span>
                  <h3 className="text-base font-bold text-textPrimary">
                    {editingStudentId ? 'Edit Student Details' : 'Enroll New Student'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowStudentModal(false)}
                  className="text-textSecondary hover:text-textPrimary font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveStudent} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Student Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kwame Mensah"
                      value={stdName}
                      onChange={(e) => setStdName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Class / Grade *
                    </label>
                    <select
                      value={stdClass}
                      onChange={(e) => setStdClass(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                    >
                      {GHANAIAN_GRADE_LEVELS.map((grade) => (
                        <option key={grade} value={grade}>{grade}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Parent / Guardian Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mr. John Mensah"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Parent WhatsApp Phone *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 0244123456"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Roll / Admission # (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SCH-0042"
                      value={admissionNo}
                      onChange={(e) => setAdmissionNo(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">
                      Parent Email (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="parent@gmail.com"
                      value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowStudentModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-textSecondary hover:bg-surface2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-extrabold rounded-xl bg-textPrimary text-white hover:opacity-90 shadow-sm"
                  >
                    {editingStudentId ? 'Save Changes' : 'Enroll Student'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  /* ======================================================== */
  /* VIEW B: STANDARD CUSTOMER DIRECTORY (ALL OTHER MODES)    */
  /* ======================================================== */
  return (
    <div className="max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-textPrimary">{archetype.vocabulary.customersTitle}</h1>
          <p className="text-sm text-textSecondary">
            Track receivables, purchase histories, and client debts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/invoices"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent text-white hover:opacity-90 text-sm font-bold shadow-xs"
          >
            <span>+ New {archetype.vocabulary.invoiceSingular}</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-surface1 p-4 rounded-xl border border-border">
          <p className="text-xs text-textSecondary">Total {archetype.vocabulary.customersTitle}</p>
          <p className="text-xl font-bold text-textPrimary mt-1">{customers.length}</p>
        </div>
        <div className="bg-surface1 p-4 rounded-xl border border-border">
          <p className="text-xs text-textSecondary">{archetype.vocabulary.arrearsTitle}</p>
          <p className="text-xl font-bold text-danger mt-1">
            {currency} {customers.reduce((acc, c) => acc + c.total_outstanding, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface1 p-4 rounded-xl border border-border">
          <p className="text-xs text-textSecondary">Total Invoiced</p>
          <p className="text-xl font-bold text-textPrimary mt-1">
            {currency} {customers.reduce((acc, c) => acc + c.total_invoiced, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <input
          type="text"
          placeholder={`Search ${archetype.vocabulary.customersTitle.toLowerCase()}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 text-xs rounded-lg border border-border bg-surface1 focus:outline-none focus:border-accentText"
        />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              filterTab === 'all' ? 'bg-textPrimary text-white' : 'bg-surface1 text-textSecondary border border-border'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterTab('debt')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              filterTab === 'debt' ? 'bg-danger text-white' : 'bg-surface1 text-danger border border-border'
            }`}
          >
            Owing
          </button>
          <button
            onClick={() => setFilterTab('paid')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              filterTab === 'paid' ? 'bg-emerald-600 text-white' : 'bg-surface1 text-emerald-700 border border-border'
            }`}
          >
            Cleared
          </button>
        </div>
      </div>

      {/* Customer List */}
      <div className="bg-surface1 rounded-xl border border-border overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <p className="p-8 text-center text-xs text-textMuted">No records found.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface2 border-b border-border text-textSecondary uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">{archetype.vocabulary.customerSingular}</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Invoiced</th>
                <th className="py-3 px-4">Outstanding</th>
                <th className="py-3 px-4 text-right">Statement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCustomers.map((c) => (
                <tr key={c.customer_name} className="hover:bg-surface2/50 transition">
                  <td className="py-3.5 px-4 font-bold text-textPrimary">{c.customer_name}</td>
                  <td className="py-3.5 px-4 text-textSecondary font-mono">{c.customer_phone || c.customer_email || '—'}</td>
                  <td className="py-3.5 px-4 font-mono">{currency} {c.total_invoiced.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-danger">
                    {c.total_outstanding > 0 ? `${currency} ${c.total_outstanding.toLocaleString()}` : '✓ Cleared'}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => printCustomerStatementPDF(c, allInvoices.filter((i) => i.customer_name === c.customer_name), { name: businessName, currency })}
                      className="px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-surface2 font-semibold text-textPrimary"
                    >
                      📄 PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
