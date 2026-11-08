'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { InventoryItem, Invoice, InvoiceStatus } from '@/lib/types';
import { printInvoicePDF } from '@/lib/pdfGenerator';
import { Icon } from '@/components/Icons';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedInvoices,
  setCachedInvoices,
  getCachedInventory,
  setCachedInventory,
  getCachedTransactions,
  setCachedTransactions,
  resolveActiveBusiness,
  generateUUID,
  isUUID,
} from '@/lib/offlineStore';
import { logAuditEvent } from '@/lib/auditLogger';
import { sendInvoiceEmailClient } from '@/lib/emailClient';

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

  const { archetype } = useArchetype();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  const handleEmailInvoice = async (inv: Invoice) => {
    let targetEmail = inv.customer_email;
    if (!targetEmail) {
      targetEmail = window.prompt(`Enter customer email to dispatch Invoice #${inv.invoice_number}:`);
      if (!targetEmail || !targetEmail.trim()) return;
    }

    setSendingEmailId(inv.id);
    const res = await sendInvoiceEmailClient({
      customerEmail: targetEmail.trim(),
      customerName: inv.customer_name || 'Customer',
      invoiceNumber: inv.invoice_number,
      totalAmount: inv.amount,
      currency: currency || 'GHS',
      dueDate: inv.due_date || undefined,
      businessName: businessName || 'AMS Software',
    });

    setSendingEmailId(null);
    if (res.success) {
      showNotify('success', `✓ Invoice #${inv.invoice_number} emailed successfully to ${targetEmail.trim()}!`);
    } else {
      showNotify('error', `Email notice: ${res.error || 'Failed to dispatch email'}`);
    }
  };

  // Create Form State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('sent');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    // 1. Immediately load local cached business and invoices
    const cachedBiz = getCachedBusiness();
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setBusinessName(cachedBiz.name);
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedInvs = getCachedInvoices(cachedBiz?.id);
    if (cachedInvs.length > 0) {
      setInvoices(cachedInvs);
      if (directInvoiceId) {
        const found = cachedInvs.find((i) => i.id === directInvoiceId || i.invoice_number === directInvoiceId);
        if (found) setPreviewInvoice(found);
      }
    }
    const cachedInv = getCachedInventory(cachedBiz?.id);
    if (cachedInv.length > 0) {
      setInventory(cachedInv);
    }
    setLoading(false);

    try {
      const b = await resolveActiveBusiness();
      if (!b) return;

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

      if (invRes.data && invRes.data.length > 0) {
        const remoteInvoices = invRes.data ?? [];
        const localInvoices = getCachedInvoices(b.id);
        const mergedMap = new Map();
        localInvoices.forEach((inv: any) => mergedMap.set(inv.id || inv.invoice_number, inv));
        remoteInvoices.forEach((inv: any) => mergedMap.set(inv.id || inv.invoice_number, inv));
        const mergedInvoices = Array.from(mergedMap.values());

        setInvoices(mergedInvoices);
        setCachedInvoices(mergedInvoices, b.id);
        if (directInvoiceId) {
          const found = mergedInvoices.find((i) => i.id === directInvoiceId || i.invoice_number === directInvoiceId);
          if (found) {
            setPreviewInvoice(found);
          }
        }
      } else if (cachedInvs.length > 0) {
        // If Supabase returned empty but local cache has imported invoices, re-push in background
        const chunk = cachedInvs.map((inv: any) => ({
          id: isUUID(inv.id) ? inv.id : generateUUID(),
          business_id: b.id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name || 'Customer',
          customer_email: inv.customer_email || null,
          amount: Number(inv.amount || 0),
          due_date: inv.due_date || new Date().toISOString().slice(0, 10),
          status: inv.status || 'sent',
          description: inv.description || null,
          paid_at: inv.paid_at || null,
        }));
        supabase.from('invoices').insert(chunk).then(() => {});
      }

      if (itemsRes.data && itemsRes.data.length > 0) {
        setInventory(itemsRes.data);
        setCachedInventory(itemsRes.data, b.id);
      }
    } catch (_err) {
      // offline fallback operates smoothly on cache
    }
  }, [directInvoiceId]);

  useEffect(() => {
    loadData();
    // Default due date to 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const iso = d.toISOString().slice(0, 10);
    setDueDate(iso);

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('ams:invoices-updated', handleUpdate);
    window.addEventListener('ams:inventory-updated', handleUpdate);
    window.addEventListener('ams:business-updated', handleUpdate);
    return () => {
      window.removeEventListener('ams:invoices-updated', handleUpdate);
      window.removeEventListener('ams:inventory-updated', handleUpdate);
      window.removeEventListener('ams:business-updated', handleUpdate);
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

  // Generate Next Invoice Number
  const nextInvoiceNumber = useMemo(() => {
    const count = invoices.length + 1;
    return `INV-${count.toString().padStart(4, '0')}`;
  }, [invoices.length]);

  // Save Single Invoice
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeBid = (businessId && isUUID(businessId)) ? businessId : (getCachedBusiness()?.id || null);
    if (!activeBid) {
      showNotify('error', 'Please ensure a business profile is active.');
      return;
    }

    const cleanCustomer = customerName.trim();
    if (!cleanCustomer) {
      showNotify('error', 'Please specify customer name.');
      return;
    }

    setSaving(true);
    try {
      const descriptionString = lineItems
        .map((i) => `${i.description} (x${i.quantity} @ ${currency} ${i.unitPrice})`)
        .join('; ') + (notes ? ` | Notes: ${notes}` : '');

      const invId = generateUUID();
      const cleanDueDate = dueDate || new Date().toISOString().slice(0, 10);
      let savedInv: any = null;

      if (isUUID(activeBid)) {
        try {
          const { data, error } = await supabase
            .from('invoices')
            .insert({
              id: invId,
              business_id: activeBid,
              invoice_number: nextInvoiceNumber,
              customer_name: cleanCustomer,
              customer_email: customerEmail.trim() || null,
              customer_phone: customerPhone.trim() || null,
              amount: totalAmount,
              description: descriptionString,
              due_date: cleanDueDate,
              status,
            })
            .select('*')
            .single();

          if (!error && data) {
            savedInv = data;
          }
        } catch (_e) {}
      }

      if (!savedInv) {
        savedInv = {
          id: invId,
          business_id: activeBid,
          invoice_number: nextInvoiceNumber,
          customer_name: cleanCustomer,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          amount: totalAmount,
          description: descriptionString,
          due_date: cleanDueDate,
          status,
          created_at: new Date().toISOString(),
        };
      }

      const updated = [savedInv, ...invoices];
      setInvoices(updated);
      setCachedInvoices(updated, activeBid);
      window.dispatchEvent(new Event('ams:invoices-updated'));
      setShowCreateModal(false);
      resetForm();
      showNotify('success', `✓ Invoice #${nextInvoiceNumber} created successfully!`);
    } catch (err: any) {
      showNotify('error', err.message || 'Failed to save bill.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setNotes('');
    setLineItems([
      { id: '1', description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  // Mark as Paid
  const handleMarkPaid = async (inv: Invoice, paymentMethod: 'cash' | 'bank') => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    const today = new Date().toISOString().slice(0, 10);
    const amt = Number(inv.amount || 0);
    const invTxId = generateUUID();

    try {
      if (activeBid && activeBid !== 'default_biz') {
        const { error } = await supabase.rpc('mark_invoice_paid', {
          p_invoice_id: inv.id,
          p_payment_method: paymentMethod,
        });

        if (error) {
          await supabase.from('invoices').update({ status: 'paid' }).eq('id', inv.id);
          await supabase.from('transactions').insert({
            id: invTxId,
            business_id: activeBid,
            transaction_date: today,
            vendor: `Invoice Payment: ${inv.customer_name} (${inv.invoice_number})`,
            type: 'revenue',
            category: 'Sales',
            amount: amt,
            payment_method: paymentMethod,
          });
        }
      }
    } catch (_err) {}

    // Record local transaction for Live Ledger, P&L Revenue, and Cash/Bank Inflow
    const invTx = {
      id: invTxId,
      business_id: activeBid,
      transaction_date: today,
      vendor: `Invoice Payment: ${inv.customer_name} (${inv.invoice_number})`,
      type: 'revenue' as const,
      category: 'Sales',
      amount: amt,
      payment_method: paymentMethod,
      created_at: new Date().toISOString(),
    };

    const existingTxs = getCachedTransactions(activeBid);
    setCachedTransactions([invTx, ...existingTxs], activeBid);

    const updatedInvs = invoices.map((i) => (i.id === inv.id ? { ...i, status: 'paid' as InvoiceStatus } : i));
    setInvoices(updatedInvs);
    setCachedInvoices(updatedInvs as any, activeBid);

    logAuditEvent({
      businessId: activeBid,
      actionType: 'UPDATE',
      entityType: 'invoice',
      entityId: inv.id,
      entityName: inv.invoice_number,
      description: `Marked Invoice ${inv.invoice_number} (${inv.customer_name}) as PAID for ${currency} ${amt.toFixed(2)} via ${paymentMethod === 'cash' ? 'Cash Till' : 'Bank / MoMo'}`,
      newValue: { status: 'paid', paymentMethod, amount: amt },
    });

    setPaymentModalInvoice(null);
    if (previewInvoice?.id === inv.id) {
      setPreviewInvoice((prev) => (prev ? { ...prev, status: 'paid' } : null));
    }

    window.dispatchEvent(new Event('ams:invoices-updated'));
    window.dispatchEvent(new Event('ams:transactions-updated'));
    window.dispatchEvent(new Event('ams:customers-updated'));
  };

  const executeDeleteInvoice = async (inv: Invoice) => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';

    try {
      await supabase.from('invoices').delete().eq('id', inv.id);
    } catch (_e) {}

    // Log to audit trail
    logAuditEvent({
      businessId: activeBid,
      actionType: 'DELETE',
      entityType: 'invoice',
      entityId: inv.id,
      entityName: inv.invoice_number,
      description: `Deleted invoice "${inv.invoice_number}" for ${inv.customer_name} (${currency} ${inv.amount})`,
      oldValue: inv,
    });

    try {
      const cached = getCachedInvoices(activeBid);
      const filtered = cached.filter((i: any) => i.id !== inv.id);
      setCachedInvoices(filtered, activeBid);
    } catch (_e) {}

    setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    if (previewInvoice?.id === inv.id) setPreviewInvoice(null);
  };

  const deleteInvoice = async (inv: Invoice) => {
    setInvoiceToDelete(inv);
  };

  const handleDeleteAllInvoices = async () => {
    const activeBid = businessId || getCachedBusiness()?.id || 'default_biz';
    if (invoices.length === 0) return;
    const confirmPrompt = prompt(
      `CAUTION: Are you sure you want to delete ALL ${invoices.length} invoices?\n\nThis will clear the active invoices list but the records will be permanently preserved in the Audit Trail.\n\nType "DELETE ALL" to confirm:`
    );
    if (confirmPrompt !== 'DELETE ALL') return;

    try {
      await supabase.from('invoices').delete().eq('business_id', activeBid);
    } catch (_e) {}

    // Preserve all deleted invoices in Audit Trail
    logAuditEvent({
      businessId: activeBid,
      actionType: 'DELETE',
      entityType: 'invoice',
      entityId: 'bulk_invoices_clear',
      entityName: 'All Invoices',
      description: `Bulk deleted all ${invoices.length} invoices from the billing system.`,
      metadata: { deletedCount: invoices.length, deletedInvoices: invoices },
    });

    setCachedInvoices([], activeBid);
    setInvoices([]);
    showNotify('success', `Successfully deleted all invoices. The records are preserved in the Audit Trail.`);
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

  if (loading) return <p className="text-sm text-textSecondary">Loading invoice records…</p>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-4 text-sm font-black opacity-60 hover:opacity-100"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-10 h-10 rounded-xl bg-accentBg border border-border flex items-center justify-center text-textPrimary shrink-0">
              <Icon name="receipt" size={20} />
            </span>
            <h1 className="text-2xl font-bold text-textPrimary tracking-tight">
              Invoices &amp; Billing
            </h1>
          </div>
          <p className="text-xs text-textSecondary">
            Issue branded invoices, track customer receivables, and send payment reminders.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {invoices.length > 0 && (
            <button
              onClick={handleDeleteAllInvoices}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-danger/30 text-danger bg-dangerBg/40 hover:bg-dangerBg text-xs font-extrabold transition shadow-sm"
              title="Delete all invoices (Audit Log preserved)"
            >
              <Icon name="trash" size={13} /> Delete All ({invoices.length})
            </button>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-textPrimary text-white hover:opacity-90 text-xs font-extrabold transition shadow-md"
          >
            <span>+ New Invoice</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Invoiced
          </p>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1.5">
            {currency} {totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{invoices.length} total invoices issued</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Paid
          </p>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1.5">
            {currency} {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {invoices.filter((i) => i.status === 'paid').length} settled invoices
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Outstanding Receivables
          </p>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1.5">
            {currency} {totalUnpaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {invoices.filter((i) => i.status !== 'paid').length} open debtor bills
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface1 p-4 rounded-2xl border border-border">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search customer or invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
          />
          <span className="absolute left-2.5 top-2.5 text-textMuted"><Icon name="search" size={14} /></span>
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

      {/* Invoice Table */}
      <div className="bg-surface1 rounded-2xl border border-border overflow-hidden shadow-xs">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-bold text-textPrimary mb-1">No Invoices Found</h3>
            <p className="text-xs text-textSecondary mb-4 max-w-sm mx-auto">
              Click New Invoice to create and send your first sales invoice.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface2 border-b border-border text-textSecondary uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer Name</th>
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
                  const cleanPhone = (inv.customer_phone || '').replace(/[^0-9]/g, '');
                  const msg = isPaid
                    ? `Hello ${inv.customer_name}, thank you for your payment of ${currency} ${Number(inv.amount || 0).toLocaleString()} for Invoice #${inv.invoice_number} from ${businessName}.`
                    : `Hello ${inv.customer_name}, this is a friendly payment reminder for Invoice #${inv.invoice_number} from ${businessName}. Amount: ${currency} ${Number(inv.amount || 0).toLocaleString()} (Due: ${inv.due_date || 'immediate'}).`;
                  const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

                  return (
                    <tr key={inv.id} className="hover:bg-surface2/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-textPrimary">
                        {inv.invoice_number}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-bold text-textPrimary">{inv.customer_name}</p>
                        {inv.customer_phone && (
                          <p className="text-[10px] text-textMuted font-mono">{inv.customer_phone}</p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-textSecondary max-w-xs truncate">
                        {inv.description || 'Sales Invoice'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-textSecondary">
                        {inv.due_date || '—'}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-textPrimary text-sm">
                        {currency} {Number(inv.amount || 0).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                            isPaid
                              ? 'bg-slate-100 text-slate-800 border border-slate-200'
                              : 'bg-slate-50 text-slate-600 border border-slate-200'
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
                              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 shadow-xs"
                            >
                              ✓ Record Payment
                            </button>
                          )}

                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/70 text-[11px] font-semibold transition flex items-center gap-1"
                            title={isPaid ? 'Send Receipt on WhatsApp' : 'Send Arrears Reminder on WhatsApp'}
                          >
                            <span className="hidden sm:inline">{isPaid ? 'Receipt' : 'Reminder'}</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => handleEmailInvoice(inv)}
                            disabled={sendingEmailId === inv.id}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/70 hover:bg-blue-100 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title={inv.customer_email ? `Email invoice to ${inv.customer_email}` : 'Dispatch Invoice via Email'}
                          >
                            <Icon name="mail" size={12} />
                            <span className="hidden sm:inline">{sendingEmailId === inv.id ? 'Sending…' : 'Email'}</span>
                          </button>

                          <button
                            onClick={() => setPreviewInvoice(inv)}
                            className="px-2 py-1 rounded-lg border border-border text-textSecondary hover:text-textPrimary hover:bg-surface2 text-[11px] font-semibold"
                            title="Preview PDF"
                          >
                            PDF
                          </button>

                          <button
                            onClick={() => deleteInvoice(inv)}
                            className="text-textMuted hover:text-danger text-xs p-1"
                            title="Delete invoice"
                          >
                            <Icon name="trash" size={13} />
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

      {/* CREATE INVOICE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface1 rounded-2xl max-w-2xl w-full p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Icon name="receipt" size={16} className="text-textSecondary" />
                <h3 className="text-base font-bold text-textPrimary">Create New Invoice</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kwame Mensah / Acme Ltd"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-medium focus:outline-none focus:border-accentText"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Customer Phone (WhatsApp)
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Customer Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary font-medium focus:outline-none focus:border-accentText"
                  />
                </div>

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
                    Invoice Line Items
                  </label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs font-semibold text-slate-800 hover:underline"
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
                        placeholder="Item / service description"
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
                          <Icon name="x" size={13} />
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
                  {saving ? 'Saving…' : 'Confirm and Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface1 rounded-2xl max-w-md w-full p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-textPrimary">Record Payment</h3>
              <button
                onClick={() => setPaymentModalInvoice(null)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <p className="text-xs text-slate-500">Customer: <strong className="text-slate-900">{paymentModalInvoice.customer_name}</strong></p>
              <p className="text-xs text-slate-500">Invoice Number: <strong className="text-slate-900 font-mono">{paymentModalInvoice.invoice_number}</strong></p>
              <p className="text-base font-bold text-slate-900 font-mono pt-1">
                Amount: {currency} {paymentModalInvoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>

            <p className="text-xs text-slate-500">
              Select payment method to mark this invoice as paid and record funds in your ledger:
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleMarkPaid(paymentModalInvoice, 'cash')}
                className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Icon name="cash" size={13} /> Paid in Cash
              </button>
              <button
                onClick={() => handleMarkPaid(paymentModalInvoice, 'bank')}
                className="py-3 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <Icon name="phone" size={13} /> Paid via MoMo / Bank
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE PREVIEW & PRINTABLE PDF */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface1 rounded-2xl max-w-2xl w-full p-6 border border-border shadow-2xl my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printInvoicePDF(previewInvoice, { name: businessName, currency })}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-textPrimary text-white hover:opacity-90 flex items-center gap-1 shadow-sm"
                >
                  Export PDF / Print
                </button>
              </div>
              <button
                onClick={() => setPreviewInvoice(null)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 bg-white text-gray-900 rounded-xl border border-gray-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900">{businessName}</h2>
                  <p className="text-xs text-gray-500 font-medium">Official Sales Invoice</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-gray-900 font-mono">{previewInvoice.invoice_number}</p>
                  <p className="text-[11px] text-gray-500">Date: {previewInvoice.created_at?.slice(0, 10)}</p>
                  <p className="text-[11px] text-gray-500 font-semibold">Due: {previewInvoice.due_date}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 mb-4 flex justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase text-gray-400">Billed To:</p>
                  <p className="text-sm font-bold text-gray-900">{previewInvoice.customer_name}</p>
                  {previewInvoice.customer_phone && (
                    <p className="text-xs text-gray-600 font-mono">Phone: {previewInvoice.customer_phone}</p>
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
                  {currency} {Number(previewInvoice.amount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Delete Confirmation Modal */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Icon name="trash" size={17} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Invoice</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Are you sure you want to delete invoice <span className="font-semibold text-gray-900">{invoiceToDelete.invoice_number}</span> for <span className="font-semibold text-gray-900">{invoiceToDelete.customer_name}</span> ({currency} {Number(invoiceToDelete.amount || 0).toLocaleString()})?
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setInvoiceToDelete(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = invoiceToDelete;
                  setInvoiceToDelete(null);
                  executeDeleteInvoice(target);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition"
              >
                Delete
              </button>
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
