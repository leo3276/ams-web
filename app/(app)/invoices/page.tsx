'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { InventoryItem, Invoice, InvoiceStatus } from '@/lib/types';
import { printInvoicePDF } from '@/lib/pdfGenerator';
import { useArchetype } from '@/lib/ArchetypeContext';
import { GHANAIAN_GRADE_LEVELS, DEFAULT_FEE_PRESETS, FeeItemPreset } from '@/lib/archetypes/config';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  inventoryItemId?: string;
}

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const directInvoiceId = searchParams?.get('id') || searchParams?.get('invoiceId');

  const {
    archetype,
    isEducation,
    students,
    schoolSettings,
    getWhatsAppPaymentReceipt,
    getWhatsAppArrearsReminder,
  } = useArchetype();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<string>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);

  // Create Form State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('sent');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: 'Tuition Fee - ' + schoolSettings.currentTerm, quantity: 1, unitPrice: 600 },
  ]);
  const [saving, setSaving] = useState(false);

  // Bulk Class Billing State
  const [bulkClass, setBulkClass] = useState<string>('Basic 1 (Class 1)');
  const [bulkDueDate, setBulkDueDate] = useState<string>('');
  const [bulkAcademicYear, setBulkAcademicYear] = useState<string>(schoolSettings.academicYear || '2025/2026');
  const [bulkTerm, setBulkTerm] = useState<string>(schoolSettings.currentTerm || 'Term 1');
  const [bulkFeeItems, setBulkFeeItems] = useState<LineItem[]>([
    { id: '1', description: 'Tuition Fee', quantity: 1, unitPrice: 600 },
    { id: '2', description: 'Canteen & Feeding', quantity: 1, unitPrice: 300 },
    { id: '3', description: 'PTA Development Levy', quantity: 1, unitPrice: 50 },
  ]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setErrorMsg('Not logged in.');
      setLoading(false);
      return;
    }

    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name, currency')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    const b = businesses?.[0];
    if (!b) {
      setErrorMsg('No business found for this account.');
      setLoading(false);
      return;
    }

    setBusinessId(b.id);
    setBusinessName(b.name);
    setCurrency(b.currency || 'GHS');

    const [invRes, itemsRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .eq('business_id', b.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('inventory_items')
        .select('*')
        .eq('business_id', b.id)
        .order('name', { ascending: true }),
    ]);

    if (invRes.error) {
      setErrorMsg(invRes.error.message);
    } else {
      const fetchedInvoices = invRes.data ?? [];
      setInvoices(fetchedInvoices);
      // If directInvoiceId passed in query string, auto open preview
      if (directInvoiceId) {
        const found = fetchedInvoices.find((i) => i.id === directInvoiceId || i.invoice_number === directInvoiceId);
        if (found) {
          setPreviewInvoice(found);
        }
      }
    }

    setInventory(itemsRes.data ?? []);
    setLoading(false);
  }, [directInvoiceId]);

  useEffect(() => {
    loadData();
    // Default due date to 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const iso = d.toISOString().slice(0, 10);
    setDueDate(iso);
    setBulkDueDate(iso);

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('ams:invoices-updated', handleUpdate);
    window.addEventListener('ams:inventory-updated', handleUpdate);
    return () => {
      window.removeEventListener('ams:invoices-updated', handleUpdate);
      window.removeEventListener('ams:inventory-updated', handleUpdate);
    };
  }, [loadData]);

  // Line items helpers
  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  const updateLineItem = (id: string, field: Partial<LineItem>) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...field } : item))
    );
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalAmount = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }, [lineItems]);

  const bulkTotalPerStudent = useMemo(() => {
    return bulkFeeItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }, [bulkFeeItems]);

  // Auto-pick student from roster
  const handleSelectStudentFromRoster = (studentId: string) => {
    const std = students.find((s) => s.id === studentId);
    if (!std) return;
    setCustomerName(std.name);
    setCustomerPhone(std.guardianPhone);
    setCustomerEmail(std.guardianEmail || '');
    setStudentClass(std.classGrade);
    setNotes(`Class: ${std.classGrade} · Parent: ${std.guardianName} · ${schoolSettings.currentTerm} (${schoolSettings.academicYear})`);
  };

  // Generate Next Invoice Number
  const nextInvoiceNumber = useMemo(() => {
    const count = invoices.length + 1;
    const prefix = isEducation ? 'FEE-' : 'INV-';
    return `${prefix}${count.toString().padStart(4, '0')}`;
  }, [invoices.length, isEducation]);

  // Save Single Invoice
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const cleanCustomer = customerName.trim();
    if (!cleanCustomer) {
      alert(isEducation ? 'Please specify the student name.' : 'Please specify customer name.');
      return;
    }

    setSaving(true);
    try {
      const descriptionString = lineItems
        .map((i) => `${i.description} (x${i.quantity} @ ${currency} ${i.unitPrice})`)
        .join('; ') + (notes ? ` | Notes: ${notes}` : '');

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          business_id: businessId,
          invoice_number: nextInvoiceNumber,
          customer_name: cleanCustomer,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          amount: totalAmount,
          description: descriptionString,
          due_date: dueDate,
          status,
        })
        .select('*')
        .single();

      if (error) throw error;

      setInvoices((prev) => [data, ...prev]);
      setShowCreateModal(false);
      resetForm();
    } catch (err: any) {
      alert(err.message || 'Failed to save bill.');
    } finally {
      setSaving(false);
    }
  };

  // Bulk Class Billing Handler
  const handleRunBulkClassBilling = async () => {
    if (!businessId) return;
    const classStudents = students.filter((s) => s.classGrade === bulkClass);
    if (classStudents.length === 0) {
      alert(`No students currently enrolled in ${bulkClass}. Enroll students first in the Students & Classes tab.`);
      return;
    }

    if (bulkTotalPerStudent <= 0) {
      alert('Total term fee per student must be greater than 0.');
      return;
    }

    if (!confirm(`Generate term fee bills of ${currency} ${bulkTotalPerStudent.toLocaleString()} for all ${classStudents.length} students in ${bulkClass}?`)) {
      return;
    }

    setBulkProcessing(true);
    try {
      const feeDescription = bulkFeeItems
        .map((i) => `${i.description} (${currency} ${i.unitPrice})`)
        .join(' + ') + ` | ${bulkTerm} (${bulkAcademicYear}) - ${bulkClass}`;

      const startIdx = invoices.length + 1;
      const rowsToInsert = classStudents.map((std, idx) => ({
        business_id: businessId,
        invoice_number: `FEE-${(startIdx + idx).toString().padStart(4, '0')}`,
        customer_name: std.name,
        customer_phone: std.guardianPhone || null,
        customer_email: std.guardianEmail || null,
        amount: bulkTotalPerStudent,
        description: `${feeDescription} · Guardian: ${std.guardianName}`,
        due_date: bulkDueDate,
        status: 'sent' as InvoiceStatus,
      }));

      const { data, error } = await supabase
        .from('invoices')
        .insert(rowsToInsert)
        .select('*');

      if (error) throw error;

      if (data) {
        setInvoices((prev) => [...data, ...prev]);
      }

      setShowBulkModal(false);
      alert(`✓ Successfully generated ${classStudents.length} term fee bills for ${bulkClass}!`);
    } catch (err: any) {
      alert(err.message || 'Failed to run bulk class billing.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setStudentClass('');
    setNotes('');
    setLineItems([
      { id: '1', description: 'Tuition Fee - ' + schoolSettings.currentTerm, quantity: 1, unitPrice: 600 },
    ]);
  };

  // Mark as Paid
  const handleMarkPaid = async (inv: Invoice, paymentMethod: 'cash' | 'bank') => {
    const { error } = await supabase.rpc('mark_invoice_paid', {
      p_invoice_id: inv.id,
      p_payment_method: paymentMethod,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setInvoices((prev) =>
      prev.map((i) => (i.id === inv.id ? { ...i, status: 'paid' } : i))
    );
    setPaymentModalInvoice(null);
    if (previewInvoice?.id === inv.id) {
      setPreviewInvoice((prev) => (prev ? { ...prev, status: 'paid' } : null));
    }
  };

  // Filter Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((i) => {
      const matchesSearch =
        i.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.description && i.description.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;
      if (filterStatus !== 'all' && i.status !== filterStatus) return false;
      return true;
    });
  }, [invoices, searchTerm, filterStatus]);

  // Aggregate Metrics
  const totalBilled = useMemo(() => invoices.reduce((acc, i) => acc + (Number(i.amount) || 0), 0), [invoices]);
  const totalPaid = useMemo(() => invoices.filter((i) => i.status === 'paid').reduce((acc, i) => acc + (Number(i.amount) || 0), 0), [invoices]);
  const totalUnpaid = Math.max(0, totalBilled - totalPaid);

  if (loading) return <p className="text-sm text-textSecondary">Loading fee records…</p>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{isEducation ? '🧾' : '📄'}</span>
            <h1 className="text-2xl font-bold text-textPrimary tracking-tight">
              {archetype.vocabulary.invoicesTitle}
            </h1>
            {isEducation && (
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                {schoolSettings.currentTerm}
              </span>
            )}
          </div>
          <p className="text-xs text-textSecondary">
            {isEducation
              ? 'Issue student term bills, generate bulk class fees, record payments, and dispatch WhatsApp receipts.'
              : 'Issue branded invoices, track customer receivables, and send payment reminders.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isEducation && (
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold transition shadow-md"
            >
              <span>⚡ 1-Click Class Billing</span>
            </button>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-textPrimary text-white hover:opacity-90 text-xs font-extrabold transition shadow-md"
          >
            <span>+ {isEducation ? 'Single Student Bill' : 'New Invoice'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
          <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">
            Total {isEducation ? 'Fees Billed' : 'Invoiced'}
          </p>
          <p className="text-2xl font-black text-textPrimary font-mono mt-1">
            {currency} {totalBilled.toLocaleString()}
          </p>
          <p className="text-[11px] text-textMuted mt-0.5">{invoices.length} total bills issued</p>
        </div>

        <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Total {isEducation ? 'Fees Collected' : 'Paid'}
          </p>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
            {currency} {totalPaid.toLocaleString()}
          </p>
          <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
            {invoices.filter((i) => i.status === 'paid').length} cleared bills
          </p>
        </div>

        <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
          <p className="text-[11px] font-bold text-danger uppercase tracking-wider">
            {isEducation ? 'Unpaid Parent Arrears' : 'Outstanding Receivables'}
          </p>
          <p className="text-2xl font-black text-danger font-mono mt-1">
            {currency} {totalUnpaid.toLocaleString()}
          </p>
          <p className="text-[11px] text-danger font-semibold mt-0.5">
            {invoices.filter((i) => i.status !== 'paid').length} pending payment
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface1 p-4 rounded-2xl border border-border">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder={isEducation ? 'Search student, bill number, or class...' : 'Search customer or invoice #...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
          />
          <span className="absolute left-2.5 top-2.5 text-xs text-textMuted">🔍</span>
        </div>

        <div className="flex items-center gap-1.5">
          {['all', 'sent', 'paid', 'overdue'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                filterStatus === st
                  ? 'bg-textPrimary text-white shadow-xs'
                  : 'bg-surface2 text-textSecondary hover:bg-surface0'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice / Fee Bill Table */}
      <div className="bg-surface1 rounded-2xl border border-border overflow-hidden shadow-xs">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-4xl mb-2 inline-block">{isEducation ? '🎓' : '🧾'}</span>
            <h3 className="text-base font-bold text-textPrimary mb-1">No Fee Bills Found</h3>
            <p className="text-xs text-textSecondary mb-4 max-w-sm mx-auto">
              {isEducation
                ? 'Issue your first student term bill or click 1-Click Class Billing to bill an entire class.'
                : 'Click New Invoice to create and send your first sales invoice.'}
            </p>
            {isEducation && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold shadow-sm"
              >
                ⚡ 1-Click Class Billing
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface2 border-b border-border text-textSecondary uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">{isEducation ? 'Student Name' : 'Customer'}</th>
                  <th className="py-3 px-4">Breakdown / Description</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.status === 'paid';
                  const std = students.find(
                    (s) => s.name?.trim().toLowerCase() === inv.customer_name?.trim().toLowerCase()
                  );
                  const classGrade = std?.classGrade || 'Class';

                  const whatsappLink = isPaid
                    ? getWhatsAppPaymentReceipt({
                        studentName: inv.customer_name,
                        classGrade,
                        guardianPhone: inv.customer_phone || std?.guardianPhone || '',
                        amountPaid: inv.amount,
                        outstandingBalance: 0,
                        businessName,
                        currency,
                      })
                    : getWhatsAppArrearsReminder({
                        studentName: inv.customer_name,
                        classGrade,
                        guardianPhone: inv.customer_phone || std?.guardianPhone || '',
                        outstandingBalance: inv.amount,
                        dueDate: inv.due_date,
                        businessName,
                        currency,
                      });

                  return (
                    <tr key={inv.id} className="hover:bg-surface2/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-textPrimary">
                        {inv.invoice_number}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-bold text-textPrimary">{inv.customer_name}</p>
                        {inv.customer_phone && (
                          <p className="text-[10px] text-textMuted font-mono">📱 {inv.customer_phone}</p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-textSecondary max-w-xs truncate">
                        {inv.description || 'Term Fee Statement'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-textSecondary">
                        {inv.due_date || '—'}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-textPrimary text-sm">
                        {currency} {inv.amount.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid && (
                            <button
                              onClick={() => setPaymentModalInvoice(inv)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 shadow-xs"
                            >
                              ✓ Record Payment
                            </button>
                          )}

                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-bold transition flex items-center gap-1 shadow-xs"
                            title={isPaid ? 'Send Receipt on WhatsApp' : 'Send Arrears Reminder on WhatsApp'}
                          >
                            <span>💬</span>
                            <span className="hidden sm:inline">{isPaid ? 'Receipt' : 'Reminder'}</span>
                          </a>

                          <button
                            onClick={() => setPreviewInvoice(inv)}
                            className="px-2 py-1 rounded-lg border border-border text-textSecondary hover:text-textPrimary hover:bg-surface2 text-[11px] font-semibold"
                            title="Preview PDF"
                          >
                            📄 PDF
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

      {/* ======================================================== */}
      {/* MODAL 1: 1-CLICK BULK CLASS BILLING                      */}
      {/* ======================================================== */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface1 rounded-2xl max-w-xl w-full p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <div>
                  <h3 className="text-base font-bold text-textPrimary">1-Click Bulk Class Billing</h3>
                  <p className="text-[11px] text-textSecondary">Generate individualized fee bills for an entire class simultaneously.</p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Select Target Class *
                  </label>
                  <select
                    value={bulkClass}
                    onChange={(e) => setBulkClass(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary font-bold"
                  >
                    {GHANAIAN_GRADE_LEVELS.map((grade) => {
                      const count = students.filter((s) => s.classGrade === grade).length;
                      return (
                        <option key={grade} value={grade}>
                          {grade} ({count} pupils enrolled)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={bulkDueDate}
                    onChange={(e) => setBulkDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-medium"
                  />
                </div>
              </div>

              {/* Fee Breakdown Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-textPrimary uppercase tracking-wider">
                    Term Fee Components Breakdown
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkFeeItems((prev) => [
                        ...prev,
                        { id: Date.now().toString(), description: 'Other Fee Item', quantity: 1, unitPrice: 50 },
                      ]);
                    }}
                    className="text-xs font-bold text-purple-600 hover:underline"
                  >
                    + Add Fee Component
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {bulkFeeItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2 bg-surface2 p-2 rounded-xl border border-border">
                      <span className="text-xs font-bold text-textMuted w-5 text-center">#{idx + 1}</span>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkFeeItems((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, description: val } : it))
                          );
                        }}
                        className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-border bg-surface1 text-textPrimary font-medium"
                        placeholder="e.g. Tuition Fee"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-textSecondary">{currency}</span>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setBulkFeeItems((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, unitPrice: val } : it))
                            );
                          }}
                          className="w-24 px-2.5 py-1 text-xs rounded-lg border border-border bg-surface1 text-textPrimary font-mono font-bold text-right"
                        />
                      </div>
                      {bulkFeeItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setBulkFeeItems((prev) => prev.filter((it) => it.id !== item.id))}
                          className="text-danger hover:opacity-80 p-1 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-purple-900">Total Fee Per Student</p>
                  <p className="text-[11px] text-purple-700">
                    {students.filter((s) => s.classGrade === bulkClass).length} students in {bulkClass}
                  </p>
                </div>
                <p className="text-xl font-black text-purple-900 font-mono">
                  {currency} {bulkTotalPerStudent.toLocaleString()}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-textSecondary hover:bg-surface2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkProcessing || students.filter((s) => s.classGrade === bulkClass).length === 0}
                  onClick={handleRunBulkClassBilling}
                  className="px-6 py-2.5 text-xs font-extrabold rounded-xl bg-purple-600 text-white hover:bg-purple-700 shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {bulkProcessing ? (
                    <span>Generating Bills…</span>
                  ) : (
                    <span>⚡ Confirm &amp; Generate Class Bills</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CREATE SINGLE STUDENT BILL / INVOICE            */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface1 rounded-2xl max-w-2xl w-full p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">{isEducation ? '🎓' : '🧾'}</span>
                <h3 className="text-base font-bold text-textPrimary">
                  {isEducation ? 'Issue Student Term Fee Bill' : 'Create New Invoice'}
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              {/* If Education Mode: Pick Student from Roster */}
              {isEducation && students.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Select Enrolled Pupil (Auto-Fills Parent Details)
                  </label>
                  <select
                    onChange={(e) => handleSelectStudentFromRoster(e.target.value)}
                    defaultValue=""
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-bold focus:outline-none focus:border-accentText"
                  >
                    <option value="" disabled>-- Pick from Student Directory --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.classGrade}) · Parent: {s.guardianName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    {isEducation ? 'Student Full Name *' : 'Customer Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isEducation ? 'e.g. Kwame Mensah' : 'e.g. Kojo Antwi'}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-medium focus:outline-none focus:border-accentText"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    {isEducation ? 'Parent WhatsApp Phone' : 'Customer Phone'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-medium focus:outline-none focus:border-accentText"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Payment Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-medium focus:outline-none focus:border-accentText"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Invoice #
                  </label>
                  <input
                    type="text"
                    disabled
                    value={nextInvoiceNumber}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface0 text-textMuted font-mono font-bold"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-textPrimary uppercase tracking-wider">
                    {isEducation ? 'Fee Component Items' : 'Invoice Line Items'}
                  </label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs font-bold text-purple-600 hover:underline"
                  >
                    + Add Line Item
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {lineItems.map((line, idx) => (
                    <div key={line.id} className="flex items-center gap-2 bg-surface2 p-2 rounded-xl border border-border">
                      <span className="text-xs font-bold text-textMuted w-5 text-center">#{idx + 1}</span>
                      <input
                        type="text"
                        required
                        value={line.description}
                        onChange={(e) => updateLineItem(line.id, { description: e.target.value })}
                        className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-border bg-surface1 text-textPrimary font-medium"
                        placeholder="Item / Fee description"
                      />
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => updateLineItem(line.id, { quantity: Number(e.target.value) || 1 })}
                        className="w-14 px-2 py-1 text-xs rounded-lg border border-border bg-surface1 text-textPrimary font-mono text-center"
                        title="Quantity"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-textSecondary">{currency}</span>
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => updateLineItem(line.id, { unitPrice: Number(e.target.value) || 0 })}
                          className="w-24 px-2.5 py-1 text-xs rounded-lg border border-border bg-surface1 text-textPrimary font-mono font-bold text-right"
                        />
                      </div>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(line.id)}
                          className="text-danger hover:opacity-80 p-1 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary */}
              <div className="bg-surface2 p-3.5 rounded-xl border border-border flex items-center justify-between">
                <span className="text-xs font-bold text-textSecondary">Total Amount</span>
                <span className="text-lg font-black text-textPrimary font-mono">
                  {currency} {totalAmount.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-textSecondary hover:bg-surface2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-xs font-extrabold rounded-xl bg-textPrimary text-white hover:opacity-90 shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Saving…' : (isEducation ? 'Issue Term Fee Bill' : 'Confirm and Issue Invoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: RECORD PAYMENT MODAL                            */}
      {/* ======================================================== */}
      {paymentModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface1 rounded-2xl max-w-md w-full p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-textPrimary">Record Fee Payment</h3>
              <button
                onClick={() => setPaymentModalInvoice(null)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-surface2 p-4 rounded-xl border border-border space-y-1">
              <p className="text-xs text-textSecondary">Student: <strong className="text-textPrimary">{paymentModalInvoice.customer_name}</strong></p>
              <p className="text-xs text-textSecondary">Bill Number: <strong className="text-textPrimary font-mono">{paymentModalInvoice.invoice_number}</strong></p>
              <p className="text-base font-black text-emerald-700 font-mono pt-1">
                Amount: {currency} {paymentModalInvoice.amount.toLocaleString()}
              </p>
            </div>

            <p className="text-xs text-textSecondary">
              Select payment method to mark this bill as cleared and deposit funds into your ledger:
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleMarkPaid(paymentModalInvoice, 'cash')}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>💵 Paid in Cash</span>
              </button>
              <button
                onClick={() => handleMarkPaid(paymentModalInvoice, 'bank')}
                className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>📱 Paid via MoMo / Bank</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: INTERACTIVE PREVIEW & PRINTABLE PDF             */}
      {/* ======================================================== */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface1 rounded-2xl max-w-2xl w-full p-6 border border-border shadow-2xl my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printInvoicePDF(previewInvoice, { name: businessName, currency })}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-textPrimary text-white hover:opacity-90 flex items-center gap-1 shadow-sm"
                >
                  📄 Export PDF / Print
                </button>
              </div>
              <button
                onClick={() => setPreviewInvoice(null)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 bg-white text-gray-900 rounded-xl border border-gray-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-purple-950">{businessName}</h2>
                  <p className="text-xs text-gray-500 font-medium">
                    {isEducation ? 'Official Term Fee Bill & Statement' : 'Official Sales Invoice'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-gray-900 font-mono">{previewInvoice.invoice_number}</p>
                  <p className="text-[11px] text-gray-500">Date: {previewInvoice.created_at?.slice(0, 10)}</p>
                  <p className="text-[11px] text-gray-500 font-semibold">Due: {previewInvoice.due_date}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 mb-4 flex justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase text-gray-400">
                    {isEducation ? 'Billed To (Pupil):' : 'Billed To:'}
                  </p>
                  <p className="text-sm font-bold text-gray-900">{previewInvoice.customer_name}</p>
                  {previewInvoice.customer_phone && (
                    <p className="text-xs text-gray-600 font-mono">Parent Phone: {previewInvoice.customer_phone}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-gray-400">Payment Status:</p>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                      previewInvoice.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {previewInvoice.status}
                  </span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 mb-4">
                <p className="text-xs font-bold text-gray-700 mb-1">Statement Details:</p>
                <p className="text-xs text-gray-600 leading-relaxed">{previewInvoice.description}</p>
              </div>

              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase">Total Balance Due</span>
                <span className="text-xl font-black text-gray-900 font-mono">
                  {currency} {previewInvoice.amount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-textSecondary">Loading invoice document...</div>}>
      <InvoicesPageContent />
    </Suspense>
  );
}
