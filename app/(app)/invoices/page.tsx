'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryItem, Invoice, InvoiceStatus } from '@/lib/types';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  inventoryItemId?: string;
}

export default function InvoicesPage() {
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

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);

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
      setInvoices(invRes.data ?? []);
    }

    setInventory(itemsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // Default due date to 14 days from now
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setDueDate(d.toISOString().slice(0, 10));
  }, [loadData]);

  // Metrics
  const metrics = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueCount = 0;
    const today = new Date().toISOString().slice(0, 10);

    invoices.forEach((inv) => {
      const amt = Number(inv.amount || 0);
      totalInvoiced += amt;
      if (inv.status === 'paid') {
        totalPaid += amt;
      } else {
        totalOutstanding += amt;
        if (inv.due_date < today && inv.status !== 'cancelled') {
          overdueCount++;
        }
      }
    });

    return { totalInvoiced, totalPaid, totalOutstanding, overdueCount };
  }, [invoices]);

  // Filtered List
  const filteredInvoices = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (filterStatus === 'all') return true;
      if (filterStatus === 'paid') return inv.status === 'paid';
      if (filterStatus === 'draft') return inv.status === 'draft';
      if (filterStatus === 'overdue') return inv.status !== 'paid' && inv.due_date < today;
      if (filterStatus === 'unpaid') return inv.status !== 'paid' && inv.status !== 'draft';
      return true;
    });
  }, [invoices, filterStatus, searchTerm]);

  // Line Item Handlers
  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  const updateLineItem = (id: string, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSelectInventoryProduct = (lineId: string, itemId: string) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    updateLineItem(lineId, {
      description: item.name,
      unitPrice: Number(item.unit_price || 0),
      inventoryItemId: item.id,
    });
  };

  const calculatedTotal = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
  }, [lineItems]);

  // Save Invoice
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    if (!customerName.trim()) {
      alert('Please enter a customer name.');
      return;
    }
    if (calculatedTotal <= 0) {
      alert('Please add at least one line item with a price greater than 0.');
      return;
    }

    setSaving(true);

    // Get next invoice number with safe fallback
    let invoiceNum = '';
    const { data: nextNumber, error: numberError } = await supabase.rpc('get_next_invoice_number', {
      p_business_id: businessId,
    });

    if (!numberError && nextNumber) {
      invoiceNum = nextNumber;
    } else {
      const nextCount = invoices.length + 1;
      invoiceNum = `INV-${String(nextCount).padStart(4, '0')}`;
    }

    const description = lineItems
      .filter((l) => l.description.trim())
      .map((l) => `${l.quantity}x ${l.description} @ ${l.unitPrice}`)
      .join('; ');

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        business_id: businessId,
        invoice_number: invoiceNum,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || null,
        amount: calculatedTotal,
        description: description || notes.trim() || null,
        due_date: dueDate,
        status,
      })
      .select()
      .single();

    setSaving(false);

    if (error || !data) {
      alert(error?.message ?? 'Could not create invoice.');
      return;
    }

    setInvoices((prev) => [data, ...prev]);
    setShowCreateModal(false);
    resetForm();
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setNotes('');
    setLineItems([{ id: '1', description: '', quantity: 1, unitPrice: 0 }]);
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

  // WhatsApp Chasing
  const getWhatsAppLink = (inv: Invoice) => {
    const phone = inv.customer_phone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

    const message = `Hello ${inv.customer_name},\n\nThis is a friendly reminder regarding Invoice ${inv.invoice_number} for ${currency} ${inv.amount.toLocaleString()} from ${businessName}.\n\nDue Date: ${inv.due_date}\nStatus: Payment Pending\n\nPlease let us know once transferred. Thank you!`;

    const encoded = encodeURIComponent(message);
    return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  };

  if (loading) return <p className="text-sm text-textSecondary">Loading invoices…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-textPrimary">Invoices & Billing Hub</h1>
          <p className="text-sm text-textSecondary">
            Issue branded invoices, track payments, generate PDF receipts, and collect customer receivables.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 transition shadow-sm"
        >
          <span>+</span> Create New Invoice
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Invoiced</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{invoices.length} invoices total</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Collected Revenue</p>
          <p className="text-xl font-bold text-success">
            {currency} {metrics.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Paid into ledger</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Outstanding Receivables</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Uncollected debt</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Overdue Invoices</p>
          <p className={`text-xl font-bold ${metrics.overdueCount > 0 ? 'text-danger' : 'text-textPrimary'}`}>
            {metrics.overdueCount}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Needs payment chase</p>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['all', 'unpaid', 'overdue', 'paid', 'draft'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 text-xs rounded-full font-medium capitalize transition ${
                filterStatus === st
                  ? 'bg-accentText text-white'
                  : 'bg-surface1 text-textSecondary hover:bg-border'
              }`}
            >
              {st === 'unpaid' ? 'Sent / Unpaid' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search by customer or invoice #…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface2 focus:outline-none focus:border-accent"
          />
          <span className="absolute left-2.5 top-2 text-textMuted text-xs">🔍</span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1.5 text-textMuted hover:text-textPrimary text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="border border-border rounded-lg overflow-x-auto bg-surface2 shadow-sm">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="bg-surface1 text-left text-textSecondary border-b border-border">
              <th className="px-4 py-2.5 font-medium">Invoice #</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Due Date</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              <th className="px-4 py-2.5 font-medium text-center">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-textMuted text-sm">
                  {searchTerm ? `No invoices matching "${searchTerm}"` : 'No invoices in this view. Click "+ Create New Invoice" above to start!'}
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => {
                const today = new Date().toISOString().slice(0, 10);
                const isOverdue = inv.status !== 'paid' && inv.due_date < today;

                return (
                  <tr key={inv.id} className="border-t border-border hover:bg-surface1/40 transition">
                    <td className="px-4 py-3 font-semibold text-accentText">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-textPrimary">{inv.customer_name}</p>
                      {inv.customer_email && (
                        <p className="text-xs text-textMuted">{inv.customer_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-textSecondary">
                      {inv.due_date}
                      {isOverdue && <span className="ml-1 text-danger font-bold">(Overdue)</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-textPrimary">
                      {currency} {Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          inv.status === 'paid'
                            ? 'bg-successBg text-success'
                            : isOverdue
                            ? 'bg-dangerBg text-danger'
                            : inv.status === 'draft'
                            ? 'bg-surface1 text-textMuted'
                            : 'bg-accentBg text-accentText'
                        }`}
                      >
                        {isOverdue ? 'Overdue' : inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setPreviewInvoice(inv)}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-border bg-surface2 hover:bg-surface1 text-textPrimary"
                          title="Preview & Print"
                        >
                          👁️ View / Print
                        </button>

                        {inv.status !== 'paid' && (
                          <>
                            <a
                              href={getWhatsAppLink(inv)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-xs font-medium rounded bg-successBg text-success hover:opacity-80"
                              title="Chase via WhatsApp"
                            >
                              💬 Chase
                            </a>

                            <button
                              onClick={() => setPaymentModalInvoice(inv)}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-accentText text-white hover:opacity-90"
                            >
                              Mark Paid
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: CREATE INVOICE MODAL                            */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl border border-border max-w-2xl w-full p-6 my-8 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
              <div>
                <h2 className="text-lg font-bold text-textPrimary">Create New Invoice</h2>
                <p className="text-xs text-textSecondary">Issue an invoice to a customer with catalog line items</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-textMuted hover:text-textPrimary text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kwesi Mensah, Blue Ribbon Bakery"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface1 focus:bg-surface2 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Customer Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="customer@domain.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface1 focus:bg-surface2 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Customer Phone (WhatsApp Reminders)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface1 focus:bg-surface2 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface1 focus:bg-surface2 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Line Items Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-textPrimary uppercase tracking-wider">
                    Invoice Line Items ({lineItems.length})
                  </label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs font-bold text-accentText hover:underline"
                  >
                    + Add Custom Line
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {lineItems.map((line, idx) => (
                    <div key={line.id} className="flex items-center gap-2 bg-surface1 p-2 rounded-lg border border-border">
                      <div className="w-6 text-xs text-textMuted font-bold text-center">#{idx + 1}</div>

                      {/* Product select or custom name */}
                      <div className="flex-1">
                        {inventory.length > 0 && (
                          <select
                            onChange={(e) => handleSelectInventoryProduct(line.id, e.target.value)}
                            defaultValue=""
                            className="w-full text-xs text-textSecondary mb-1 px-1 py-0.5 rounded border border-border bg-surface2"
                          >
                            <option value="" disabled>-- Pick from Inventory Catalog (Optional) --</option>
                            {inventory.map((invItem) => (
                              <option key={invItem.id} value={invItem.id}>
                                {invItem.name} ({currency} {invItem.unit_price} · {invItem.quantity} in stock)
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          required
                          placeholder="Item description or service"
                          value={line.description}
                          onChange={(e) => updateLineItem(line.id, { description: e.target.value })}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-surface2"
                        />
                      </div>

                      {/* Quantity */}
                      <div className="w-16">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) => updateLineItem(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-surface2 text-right"
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Price"
                          value={line.unitPrice}
                          onChange={(e) => updateLineItem(line.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-surface2 text-right"
                        />
                      </div>

                      {/* Line Total */}
                      <div className="w-20 text-right text-xs font-bold text-textPrimary">
                        {currency} {((line.quantity || 0) * (line.unitPrice || 0)).toFixed(2)}
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeLineItem(line.id)}
                        className="text-textMuted hover:text-danger text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Status */}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-textSecondary">Save status:</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                    className="text-xs px-2 py-1 rounded border border-border bg-surface1"
                  >
                    <option value="sent">Sent / Issue Now</option>
                    <option value="draft">Save as Draft</option>
                  </select>
                </div>

                <div className="text-right">
                  <span className="text-xs text-textSecondary mr-2 font-medium">TOTAL AMOUNT:</span>
                  <span className="text-xl font-black text-textPrimary">
                    {currency} {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-surface1 text-textSecondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-accent text-white hover:opacity-90 shadow-sm"
                >
                  {saving ? 'Creating…' : 'Confirm and Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: INTERACTIVE INVOICE PREVIEW & PRINTABLE PDF     */}
      {/* ======================================================== */}
      {previewInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-2xl w-full p-8 shadow-2xl border border-border my-8">
            <div className="flex items-center justify-between pb-4 border-b border-border mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-accent text-white hover:opacity-90 flex items-center gap-1"
                >
                  🖨️ Print / Save as PDF
                </button>
                <a
                  href={getWhatsAppLink(previewInvoice)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-successBg text-success hover:opacity-90 flex items-center gap-1"
                >
                  💬 Send on WhatsApp
                </a>
              </div>
              <button
                onClick={() => setPreviewInvoice(null)}
                className="text-textMuted hover:text-textPrimary text-xl"
              >
                ✕
              </button>
            </div>

            {/* PRINTABLE INVOICE DOCUMENT BODY */}
            <div className="p-4 bg-white text-gray-900 rounded-lg">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-extrabold text-blue-900 tracking-tight">{businessName}</h1>
                  <p className="text-xs text-gray-500 mt-1">Official Sales Invoice</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-gray-800">{previewInvoice.invoice_number}</p>
                  <p className="text-xs text-gray-500">Date: {previewInvoice.created_at?.slice(0, 10)}</p>
                  <p className="text-xs text-gray-500 font-semibold">Due Date: {previewInvoice.due_date}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 flex justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-400">Billed To:</p>
                  <p className="text-base font-bold text-gray-800">{previewInvoice.customer_name}</p>
                  {previewInvoice.customer_email && (
                    <p className="text-xs text-gray-600">{previewInvoice.customer_email}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase text-gray-400">Payment Status:</p>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                      previewInvoice.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {previewInvoice.status}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b-2 border-gray-300 text-left text-xs uppercase text-gray-500">
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 font-medium text-gray-800">
                      {previewInvoice.description || 'General Goods / Services'}
                    </td>
                    <td className="py-3 text-right font-bold text-gray-900">
                      {currency} {Number(previewInvoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Summary Totals */}
              <div className="flex justify-end mb-8">
                <div className="w-64 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Subtotal:</span>
                    <span>{currency} {Number(previewInvoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Tax (0%):</span>
                    <span>{currency} 0.00</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-gray-900 pt-2 border-t border-gray-300">
                    <span>Total Due:</span>
                    <span>{currency} {Number(previewInvoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
                Thank you for your business! · Generated by AMS Accounting
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: MARK AS PAID MODAL                              */}
      {/* ======================================================== */}
      {paymentModalInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface2 rounded-xl max-w-md w-full p-6 border border-border shadow-xl">
            <h3 className="text-base font-bold text-textPrimary mb-1">
              Record Payment for {paymentModalInvoice.invoice_number}
            </h3>
            <p className="text-xs text-textSecondary mb-4">
              Customer: <span className="font-semibold text-textPrimary">{paymentModalInvoice.customer_name}</span> · Amount: <span className="font-bold text-success">{currency} {Number(paymentModalInvoice.amount).toLocaleString()}</span>
            </p>
            <p className="text-xs text-textMuted mb-4">
              Choose the payment channel. This will automatically record a matching <span className="font-semibold text-textPrimary">Revenue transaction</span> in your general ledger.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => handleMarkPaid(paymentModalInvoice, 'cash')}
                className="py-3 rounded-lg border border-border bg-surface1 hover:bg-accentBg text-center font-bold text-sm text-textPrimary transition"
              >
                💵 Received as Cash
              </button>
              <button
                onClick={() => handleMarkPaid(paymentModalInvoice, 'bank')}
                className="py-3 rounded-lg border border-border bg-surface1 hover:bg-accentBg text-center font-bold text-sm text-textPrimary transition"
              >
                🏦 Bank / MoMo Transfer
              </button>
            </div>

            <button
              onClick={() => setPaymentModalInvoice(null)}
              className="w-full py-2 text-xs font-medium text-textSecondary hover:text-textPrimary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
