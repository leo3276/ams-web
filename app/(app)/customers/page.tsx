'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CustomerSummary, Invoice } from '@/lib/types';
import { printCustomerStatementPDF, printCustomerDebtSchedulePDF } from '@/lib/pdfGenerator';
import { Icon } from '@/components/Icons';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getCachedBusiness,
  getCachedCustomers,
  setCachedCustomers,
  getCachedInvoices,
  setCachedInvoices,
  getCachedTransactions,
  setCachedTransactions,
  reconcileCustomerDebtors,
  resolveActiveBusiness,
  generateUUID,
  isUUID,
} from '@/lib/offlineStore';

export default function CustomersPage() {
  const { archetype } = useArchetype();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'debt' | 'paid'>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add Customer / Debtor Modal
  const [showAddDebtorModal, setShowAddDebtorModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustDebt, setNewCustDebt] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [savingDebtor, setSavingDebtor] = useState(false);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = useCallback(async () => {
    // 1. Instantly load & reconcile from local cache
    const cachedBiz = getCachedBusiness();
    const initialBid = cachedBiz?.id || 'default_biz';
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setBusinessName(cachedBiz.name);
      setCurrency(cachedBiz.currency || 'GHS');
    }
    const cachedCust = getCachedCustomers(initialBid);
    const cachedInvs = getCachedInvoices(initialBid);
    const cachedTxs = getCachedTransactions(initialBid);

    if (cachedInvs.length > 0) {
      setAllInvoices(cachedInvs);
    }

    const initialReconciled = reconcileCustomerDebtors(cachedInvs, cachedTxs, cachedCust);
    if (initialReconciled.customerSummaries.length > 0) {
      setCustomers(initialReconciled.customerSummaries);
    }
    setLoading(false);

    try {
      const business = await resolveActiveBusiness();
      if (!business) return;

      setBusinessId(business.id);
      setBusinessName(business.name);
      setCurrency(business.currency || 'GHS');

      const [summaryRes, invoicesRes, txsRes] = await Promise.all([
        supabase.rpc('get_customer_summary', { p_business_id: business.id }),
        supabase.from('invoices').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        supabase.from('transactions').select('*').eq('business_id', business.id).order('transaction_date', { ascending: false }),
      ]);

      const remoteInvs = invoicesRes.data ?? [];
      const localInvs = getCachedInvoices(business.id);
      const mergedMap = new Map();
      localInvs.forEach((i: any) => mergedMap.set(i.id || i.invoice_number, i));
      remoteInvs.forEach((i: any) => mergedMap.set(i.id || i.invoice_number, i));
      const mergedInvs: Invoice[] = Array.from(mergedMap.values());
      if (mergedInvs.length > 0) {
        setAllInvoices(mergedInvs);
        setCachedInvoices(mergedInvs as any, business.id);
      }

      const remoteTxs = txsRes.data ?? [];
      const localTxs = getCachedTransactions(business.id);
      const txMap = new Map();
      localTxs.forEach((t: any) => txMap.set(t.id, t));
      remoteTxs.forEach((t: any) => txMap.set(t.id, t));
      const mergedTxs = Array.from(txMap.values());
      if (mergedTxs.length > 0) {
        setCachedTransactions(mergedTxs, business.id);
      }

      // Combine RPC customer summary with local cached customers before reconciling
      const combinedSeedCustomers: CustomerSummary[] = [...getCachedCustomers(business.id)];
      if (summaryRes.data && Array.isArray(summaryRes.data)) {
        summaryRes.data.forEach((rc: any) => {
          const exists = combinedSeedCustomers.some(
            (c) => (c.customer_name || '').toLowerCase().trim() === (rc.customer_name || '').toLowerCase().trim()
          );
          if (!exists) combinedSeedCustomers.push(rc);
        });
      }

      const reconciled = reconcileCustomerDebtors(mergedInvs, mergedTxs, combinedSeedCustomers);
      setCustomers(reconciled.customerSummaries);
      setCachedCustomers(reconciled.customerSummaries, business.id);
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
    window.addEventListener('ams:transactions-updated', handleUpdate);
    return () => {
      window.removeEventListener('ams:customers-updated', handleUpdate);
      window.removeEventListener('ams:invoices-updated', handleUpdate);
      window.removeEventListener('ams:transactions-updated', handleUpdate);
    };
  }, [loadData]);

  const handleSaveDebtor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCustName.trim();
    if (!cleanName) {
      showNotify('error', 'Please enter a customer name.');
      return;
    }

    const activeBid = (businessId && isUUID(businessId)) ? businessId : (getCachedBusiness()?.id || 'default_biz');
    const debtAmt = Math.max(0, parseFloat(newCustDebt) || 0);
    const today = new Date().toISOString().slice(0, 10);
    setSavingDebtor(true);

    try {
      if (debtAmt > 0) {
        const invId = generateUUID();
        const invNumber = `INV-DBT-${Math.floor(1000 + Math.random() * 9000)}`;
        const newInv: Invoice = {
          id: invId,
          business_id: activeBid,
          invoice_number: invNumber,
          customer_name: cleanName,
          customer_email: newCustEmail.trim() || null,
          customer_phone: newCustPhone.trim() || null,
          amount: debtAmt,
          description: newCustNotes.trim() || 'Opening Customer Receivable / Debtor Balance',
          due_date: today,
          status: 'sent',
          created_at: new Date().toISOString(),
        };

        if (isUUID(activeBid)) {
          try {
            await supabase.from('invoices').insert({
              id: invId,
              business_id: activeBid,
              invoice_number: invNumber,
              customer_name: cleanName,
              customer_email: newInv.customer_email,
              customer_phone: newInv.customer_phone,
              amount: debtAmt,
              description: newInv.description,
              due_date: today,
              status: 'sent',
            });
          } catch (_e) {}
        }

        const updatedInvs = [newInv, ...getCachedInvoices(activeBid)];
        setCachedInvoices(updatedInvs, activeBid);
        setAllInvoices(updatedInvs);
      }

      const existingCusts = getCachedCustomers(activeBid);
      const custSummary: CustomerSummary = {
        customer_name: cleanName,
        customer_email: newCustEmail.trim() || null,
        customer_phone: newCustPhone.trim() || null,
        invoice_count: debtAmt > 0 ? 1 : 0,
        total_invoiced: debtAmt,
        total_paid: 0,
        total_outstanding: debtAmt,
        last_invoice_date: today,
      };
      setCachedCustomers([custSummary, ...existingCusts.filter((c) => c.customer_name.toLowerCase() !== cleanName.toLowerCase())], activeBid);

      window.dispatchEvent(new Event('ams:invoices-updated'));
      window.dispatchEvent(new Event('ams:customers-updated'));
      setShowAddDebtorModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
      setNewCustDebt('');
      setNewCustNotes('');
      loadData();
      showNotify(
        'success',
        debtAmt > 0
          ? `Recorded debtor "${cleanName}" (${currency} ${debtAmt.toLocaleString()}). Synced to Balance Sheet under Current Assets -> Debtors.`
          : `Added customer "${cleanName}" to directory.`
      );
    } finally {
      setSavingDebtor(false);
    }
  };

  // Customer Filters
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        (c.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.customer_email && c.customer_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.customer_phone && c.customer_phone.includes(searchTerm));

      if (!matchesSearch) return false;
      if (filterTab === 'debt') return c.total_outstanding > 0;
      if (filterTab === 'paid') return c.total_outstanding === 0 && c.total_invoiced > 0;
      return true;
    });
  }, [customers, searchTerm, filterTab]);

  // Totals
  const totalReceivables = useMemo(
    () => customers.reduce((acc, c) => acc + (Number(c.total_outstanding) || 0), 0),
    [customers]
  );
  const totalInvoiced = useMemo(
    () => customers.reduce((acc, c) => acc + (Number(c.total_invoiced) || 0), 0),
    [customers]
  );
  const debtorCount = useMemo(
    () => customers.filter((c) => (Number(c.total_outstanding) || 0) > 0).length,
    [customers]
  );

  if (loading) {
    return <p className="text-sm text-textSecondary">Loading customer directory…</p>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-textPrimary shrink-0"><Icon name="users" size={20} /></span>
            <h1 className="text-2xl font-bold text-textPrimary tracking-tight">
              Customer Directory &amp; Receivables
            </h1>
          </div>
          <p className="text-xs text-textSecondary">
            Manage customer profiles, track outstanding debtors, view billing history, and send WhatsApp reminders.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {customers.length > 0 && (
            <button
              onClick={() =>
                printCustomerDebtSchedulePDF(customers, {
                  name: businessName,
                  currency,
                  taxId: null,
                })
              }
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface2 border border-border text-textPrimary hover:bg-surface0 text-xs font-bold transition shadow-xs"
            >
              <Icon name="file" size={14} /> Debt Schedule PDF
            </button>
          )}

          <button
            onClick={() => setShowAddDebtorModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-textPrimary text-white hover:opacity-90 text-xs font-semibold transition shadow-xs"
          >
            <span>+ Add Customer / Debtor</span>
          </button>

          <Link
            href="/invoices"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-surface2 text-textPrimary hover:bg-surface1 text-xs font-semibold transition shadow-xs"
          >
            <span>+ New Invoice</span>
          </Link>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Customers
          </p>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1.5">
            {customers.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Active customer &amp; debtor accounts</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Debtors (Accounts Receivable)
          </p>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1.5">
            {currency} {totalReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {debtorCount} customer{debtorCount === 1 ? '' : 's'} with open balance (Current Asset)
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Invoiced
          </p>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1.5">
            {currency} {totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Lifetime gross sales billed</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search customers by name, phone, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:border-slate-400 text-slate-900"
          />
          <span className="absolute left-2.5 top-2.5 text-slate-400"><Icon name="search" size={14} /></span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({customers.length})
          </button>
          <button
            onClick={() => setFilterTab('debt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterTab === 'debt'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Debtors ({debtorCount})
          </button>
          <button
            onClick={() => setFilterTab('paid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterTab === 'paid'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cleared
          </button>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-bold text-slate-900 mb-1">No Customers or Debtors Found</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              Add a customer or debtor above, issue an invoice, or import your customer debt book via Data Migration.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Customer Name</th>
                  <th className="py-3.5 px-4">Contact Details</th>
                  <th className="py-3.5 px-4">Total Invoiced</th>
                  <th className="py-3.5 px-4">Outstanding Debt (Receivable)</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((c) => {
                  const hasDebt = (Number(c.total_outstanding) || 0) > 0;
                  const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
                  const debtMsg = `Hello ${c.customer_name}, this is a gentle payment reminder from ${businessName}. Your outstanding balance is ${currency} ${Number(c.total_outstanding || 0).toLocaleString()}. Please reach out to arrange settlement. Thank you!`;
                  const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(debtMsg)}`;

                  return (
                    <tr key={c.customer_name} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="hover:underline text-left text-slate-900 font-semibold"
                        >
                          {c.customer_name}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono">
                        {c.customer_phone || c.customer_email || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                        {currency} {Number(c.total_invoiced || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {hasDebt ? (
                          <span className="text-slate-900 font-bold">
                            {currency} {Number(c.total_outstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-medium bg-slate-100 px-2.5 py-0.5 rounded-md text-[11px]">
                            Cleared
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasDebt && cleanPhone && (
                            <a
                              href={whatsappLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200/70 text-[11px] font-semibold transition flex items-center gap-1"
                              title="Send WhatsApp Debt Reminder"
                            >
                              <span className="hidden sm:inline">WhatsApp</span>
                            </a>
                          )}
                          <button
                            onClick={() =>
                              printCustomerStatementPDF(
                                c,
                                allInvoices.filter((i) => i.customer_name === c.customer_name),
                                { name: businessName, currency }
                              )
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] font-semibold flex items-center gap-1"
                            title="Print Statement PDF"
                          >
                            <Icon name="file" size={12} /> Statement
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

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface1 rounded-2xl max-w-xl w-full p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-textPrimary">{selectedCustomer.customer_name}</h3>
                <p className="text-xs text-textSecondary font-mono">{selectedCustomer.customer_phone || selectedCustomer.customer_email || 'No contact provided'}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-textSecondary hover:text-textPrimary font-bold text-lg"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface2 p-3 rounded-xl border border-border">
                <p className="text-[11px] text-textSecondary">Total Invoiced</p>
                <p className="text-lg font-mono font-bold text-textPrimary">
                  {currency} {Number(selectedCustomer.total_invoiced || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-surface2 p-3 rounded-xl border border-border">
                <p className="text-[11px] text-textSecondary">Outstanding Balance</p>
                <p className={`text-lg font-mono font-bold ${selectedCustomer.total_outstanding > 0 ? 'text-danger' : 'text-emerald-700'}`}>
                  {currency} {Number(selectedCustomer.total_outstanding || 0).toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider mb-2">Invoice History</h4>
              {allInvoices.filter((i) => i.customer_name === selectedCustomer.customer_name).length === 0 ? (
                <p className="text-xs text-textMuted py-4 text-center">No invoices recorded for this customer.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {allInvoices
                    .filter((i) => i.customer_name === selectedCustomer.customer_name)
                    .map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface2 border border-border text-xs">
                        <div>
                          <p className="font-mono font-bold text-textPrimary">{inv.invoice_number}</p>
                          <p className="text-[10px] text-textMuted">Due: {inv.due_date || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-textPrimary">{currency} {Number(inv.amount || 0).toLocaleString()}</p>
                          <span className={`text-[10px] font-bold uppercase ${inv.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-textSecondary hover:bg-surface2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer / Debtor Modal */}
      {showAddDebtorModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface0 rounded-2xl max-w-md w-full p-6 border border-border shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-textPrimary">Add Customer / Record Debtor</h3>
                <p className="text-xs text-textSecondary">
                  Any outstanding balance entered here automatically appears on the Balance Sheet under Current Assets (Debtors).
                </p>
              </div>
              <button
                onClick={() => setShowAddDebtorModal(false)}
                className="text-textSecondary hover:text-textPrimary p-1"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveDebtor} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kwame Mensah / Enterprise Ltd"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary focus:outline-none focus:border-textPrimary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Phone (WhatsApp)</label>
                  <input
                    type="text"
                    placeholder="e.g. 0244123456"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary focus:outline-none focus:border-textPrimary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="client@email.com"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary focus:outline-none focus:border-textPrimary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">
                  Outstanding Debt Owed to You ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newCustDebt}
                  onChange={(e) => setNewCustDebt(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-border bg-surface2 text-textPrimary focus:outline-none focus:border-textPrimary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Credit purchase of 10 bags of rice"
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface2 text-textPrimary focus:outline-none focus:border-textPrimary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddDebtorModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-border text-textSecondary hover:bg-surface1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDebtor}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-textPrimary text-white hover:opacity-90 disabled:opacity-50"
                >
                  {savingDebtor ? 'Saving…' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
