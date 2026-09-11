'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CustomerSummary, Invoice } from '@/lib/types';
import { printCustomerStatementPDF, printCustomerDebtSchedulePDF } from '@/lib/pdfGenerator';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getCachedBusiness,
  getCachedCustomers,
  setCachedCustomers,
  getCachedInvoices,
  setCachedInvoices,
  resolveActiveBusiness,
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

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

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
      const business = await resolveActiveBusiness();
      if (!business) return;

      setBusinessId(business.id);
      setBusinessName(business.name);
      setCurrency(business.currency || 'GHS');

      const [summaryRes, invoicesRes] = await Promise.all([
        supabase.rpc('get_customer_summary', { p_business_id: business.id }),
        supabase.from('invoices').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
      ]);

      const remoteInvs = invoicesRes.data ?? [];
      const localInvs = getCachedInvoices(business.id);
      const mergedMap = new Map();
      localInvs.forEach((i: any) => mergedMap.set(i.id || i.invoice_number, i));
      remoteInvs.forEach((i: any) => mergedMap.set(i.id || i.invoice_number, i));
      const merged = Array.from(mergedMap.values());
      if (merged.length > 0) {
        setAllInvoices(merged);
        setCachedInvoices(merged as any, business.id);
      }

      if (summaryRes.data && summaryRes.data.length > 0) {
        setCustomers(summaryRes.data);
        setCachedCustomers(summaryRes.data, business.id);
      } else if (merged.length > 0) {
        // Synthesize customer summary from invoices so mobile invoices display immediately on Desktop
        const custMap = new Map<string, any>();
        merged.forEach((inv: any) => {
          const name = (inv.customer_name || 'Customer').trim();
          const amt = Number(inv.amount || 0);
          const isPaid = inv.status === 'paid';
          const isCancelled = inv.status === 'cancelled';
          if (isCancelled) return;

          const existing = custMap.get(name) || {
            customer_name: name,
            customer_email: inv.customer_email || null,
            customer_phone: inv.customer_phone || null,
            total_invoiced: 0,
            total_paid: 0,
            total_outstanding: 0,
            invoice_count: 0,
            last_invoice_date: inv.due_date || inv.created_at,
          };

          existing.invoice_count += 1;
          existing.total_invoiced += amt;
          if (isPaid) {
            existing.total_paid += amt;
          } else {
            existing.total_outstanding += amt;
          }
          if (inv.customer_email && !existing.customer_email) existing.customer_email = inv.customer_email;
          if (inv.customer_phone && !existing.customer_phone) existing.customer_phone = inv.customer_phone;
          custMap.set(name, existing);
        });
        const derived = Array.from(custMap.values());
        setCustomers(derived);
        setCachedCustomers(derived, business.id);
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
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👥</span>
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
              <span>📄 Debt Schedule PDF</span>
            </button>
          )}

          <Link
            href="/invoices"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-textPrimary text-white hover:opacity-90 text-xs font-extrabold transition shadow-md"
          >
            <span>+ New Invoice</span>
          </Link>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
          <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">
            Total Customers
          </p>
          <p className="text-2xl font-black text-textPrimary font-mono mt-1">
            {customers.length}
          </p>
          <p className="text-[11px] text-textMuted mt-0.5">Active customer accounts</p>
        </div>

        <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
          <p className="text-[11px] font-bold text-danger uppercase tracking-wider">
            Total Outstanding Receivables
          </p>
          <p className="text-2xl font-black text-danger font-mono mt-1">
            {currency} {totalReceivables.toLocaleString()}
          </p>
          <p className="text-[11px] text-danger font-semibold mt-0.5">
            {debtorCount} customer{debtorCount === 1 ? '' : 's'} owing payment
          </p>
        </div>

        <div className="bg-surface1 p-4 rounded-2xl border border-border shadow-xs">
          <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">
            Total Invoiced
          </p>
          <p className="text-2xl font-black text-textPrimary font-mono mt-1">
            {currency} {totalInvoiced.toLocaleString()}
          </p>
          <p className="text-[11px] text-textMuted mt-0.5">Lifetime gross sales invoiced</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface1 p-4 rounded-2xl border border-border">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search customers by name, phone, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-surface2 focus:outline-none focus:border-accentText text-textPrimary"
          />
          <span className="absolute left-2.5 top-2.5 text-xs text-textMuted">🔍</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'all'
                ? 'bg-textPrimary text-white shadow-xs'
                : 'bg-surface2 text-textSecondary hover:bg-surface0'
            }`}
          >
            All ({customers.length})
          </button>
          <button
            onClick={() => setFilterTab('debt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'debt'
                ? 'bg-danger text-white shadow-xs'
                : 'bg-surface2 text-danger hover:bg-surface0'
            }`}
          >
            Owing Debt ({debtorCount})
          </button>
          <button
            onClick={() => setFilterTab('paid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'paid'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-surface2 text-emerald-700 hover:bg-surface0'
            }`}
          >
            Cleared
          </button>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-surface1 rounded-2xl border border-border overflow-hidden shadow-xs">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-4xl mb-2 inline-block">👥</span>
            <h3 className="text-base font-bold text-textPrimary mb-1">No Customers Found</h3>
            <p className="text-xs text-textSecondary mb-4 max-w-sm mx-auto">
              Customers will automatically appear here when you issue sales invoices.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface2 border-b border-border text-textSecondary uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Contact Details</th>
                  <th className="py-3 px-4">Total Invoiced</th>
                  <th className="py-3 px-4">Outstanding Debt</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.map((c) => {
                  const hasDebt = (Number(c.total_outstanding) || 0) > 0;
                  const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
                  const debtMsg = `Hello ${c.customer_name}, this is a gentle payment reminder from ${businessName}. Your outstanding balance is ${currency} ${Number(c.total_outstanding || 0).toLocaleString()}. Please reach out to arrange settlement. Thank you!`;
                  const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(debtMsg)}`;

                  return (
                    <tr key={c.customer_name} className="hover:bg-surface2/50 transition">
                      <td className="py-3.5 px-4 font-bold text-textPrimary">
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="hover:underline text-left text-textPrimary font-bold"
                        >
                          {c.customer_name}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-textSecondary font-mono">
                        {c.customer_phone || c.customer_email || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-textPrimary">
                        {currency} {Number(c.total_invoiced || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        {hasDebt ? (
                          <span className="text-danger font-black">
                            {currency} {Number(c.total_outstanding || 0).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
                            ✓ Cleared
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
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-bold transition flex items-center gap-1 shadow-xs"
                              title="Send WhatsApp Debt Reminder"
                            >
                              <span>💬</span>
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
                            className="px-2 py-1 rounded-lg border border-border text-textSecondary hover:text-textPrimary hover:bg-surface2 text-[11px] font-semibold"
                            title="Print Statement PDF"
                          >
                            📄 Statement
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
                ✕
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
    </div>
  );
}
