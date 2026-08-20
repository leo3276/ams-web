'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CustomerSummary, Invoice } from '@/lib/types';
import { printCustomerStatementPDF } from '@/lib/pdfGenerator';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function CustomersPage() {
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected Customer Modal
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'debt' | 'paid'>('all');

  const loadCustomers = useCallback(async () => {
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

    const business = businesses?.[0];
    if (!business) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }

    setBusinessId(business.id);
    setBusinessName(business.name);
    setCurrency(business.currency || 'GHS');

    const [summaryRes, invoicesRes] = await Promise.all([
      supabase.rpc('get_customer_summary', { p_business_id: business.id }),
      supabase.from('invoices').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
    ]);

    if (summaryRes.error) {
      setErrorMsg(summaryRes.error.message);
    } else {
      setCustomers(summaryRes.data ?? []);
    }

    setAllInvoices(invoicesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Metrics
  const metrics = useMemo(() => {
    let totalCustomers = customers.length;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let owingCustomers = 0;

    customers.forEach((c) => {
      totalInvoiced += Number(c.total_invoiced || 0);
      totalPaid += Number(c.total_paid || 0);
      const out = Number(c.total_outstanding || 0);
      totalOutstanding += out;
      if (out > 0) owingCustomers++;
    });

    return { totalCustomers, totalInvoiced, totalPaid, totalOutstanding, owingCustomers };
  }, [customers]);

  // Filtered List
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch = c.customer_name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (filterTab === 'debt') return Number(c.total_outstanding) > 0;
      if (filterTab === 'paid') return Number(c.total_outstanding) === 0;
      return true;
    });
  }, [customers, searchTerm, filterTab]);

  // Customer Invoices for Modal
  const customerInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return allInvoices.filter(
      (inv) => inv.customer_name.trim().toLowerCase() === selectedCustomer.customer_name.trim().toLowerCase()
    );
  }, [allInvoices, selectedCustomer]);

  // WhatsApp Statement Generator
  const getWhatsAppStatementLink = (c: CustomerSummary) => {
    const phone = c.customer_phone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

    const message = `Hello ${c.customer_name},\n\nHere is your current Account Statement from ${businessName}:\n\n• Total Invoiced: ${currency} ${Number(c.total_invoiced).toLocaleString()}\n• Total Paid: ${currency} ${Number(c.total_paid).toLocaleString()}\n• Outstanding Balance: ${currency} ${Number(c.total_outstanding).toLocaleString()}\n\nThank you for your ongoing partnership!`;

    const encoded = encodeURIComponent(message);
    return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  };

  if (loading) return <p className="text-sm text-textSecondary">Loading customer records…</p>;
  if (errorMsg) return <p className="text-sm text-danger">{errorMsg}</p>;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-textPrimary">Customer Accounts & Receivables</h1>
          <p className="text-sm text-textSecondary">
            Track customer balances, payment history, and send instant account statements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/migrate"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-surface2 border border-border text-textPrimary hover:bg-surface0 text-sm transition font-bold shadow-xs"
          >
            <span>⚡</span> Import Debt Book (Excel / CSV)
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Customers</p>
          <p className="text-xl font-bold text-textPrimary">{metrics.totalCustomers}</p>
          <p className="text-xs text-textMuted mt-0.5">Active accounts</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Invoiced</p>
          <p className="text-xl font-bold text-textPrimary">
            {currency} {metrics.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Lifetime sales</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Collected Revenue</p>
          <p className="text-xl font-bold text-success">
            {currency} {metrics.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">Total collected</p>
        </div>

        <div className="bg-surface1 rounded-lg p-3.5 border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Outstanding Balance</p>
          <p className="text-xl font-bold text-danger">
            {currency} {metrics.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-textMuted mt-0.5">{metrics.owingCustomers} customer(s) owe money</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              filterTab === 'all' ? 'bg-accentText text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            All Customers ({customers.length})
          </button>
          <button
            onClick={() => setFilterTab('debt')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              filterTab === 'debt' ? 'bg-danger text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Owed Money ({metrics.owingCustomers})
          </button>
          <button
            onClick={() => setFilterTab('paid')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              filterTab === 'paid' ? 'bg-success text-white' : 'bg-surface1 text-textSecondary hover:bg-border'
            }`}
          >
            Paid Up
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search customer name…"
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

      {/* Customers List Cards */}
      {filteredCustomers.length === 0 ? (
        <div className="border border-border rounded-lg p-12 text-center bg-surface2 text-textMuted text-sm">
          {searchTerm ? `No customers found matching "${searchTerm}"` : 'No customer records yet. Create an invoice to get started!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCustomers.map((c) => {
            const hasDebt = Number(c.total_outstanding) > 0;
            return (
              <div
                key={c.customer_name}
                onClick={() => setSelectedCustomer(c)}
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface2 hover:border-accent/50 hover:shadow-sm cursor-pointer transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-accentText text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(c.customer_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-textPrimary truncate">{c.customer_name}</p>
                    <p className="text-xs text-textSecondary">
                      {c.invoice_count} invoice{c.invoice_count !== 1 ? 's' : ''}
                      {c.customer_email ? ` · ${c.customer_email}` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {hasDebt ? (
                    <div>
                      <p className="text-sm font-bold text-danger">
                        {currency} {Number(c.total_outstanding).toLocaleString()}
                      </p>
                      <p className="text-[10.5px] uppercase font-bold text-danger">Owed</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-success">
                        {currency} {Number(c.total_paid).toLocaleString()}
                      </p>
                      <p className="text-[10.5px] uppercase font-bold text-success">Paid Up ✓</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* CUSTOMER DETAIL MODAL                                    */}
      {/* ======================================================== */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface2 rounded-xl max-w-xl w-full p-6 border border-border shadow-xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accentText text-white flex items-center justify-center text-xs font-bold">
                  {initials(selectedCustomer.customer_name)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-textPrimary">{selectedCustomer.customer_name}</h2>
                  <p className="text-xs text-textMuted">{selectedCustomer.customer_email || 'No email registered'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-textMuted hover:text-textPrimary text-lg"
              >
                ✕
              </button>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-2 bg-surface1 p-3 rounded-lg border border-border mb-4 text-center">
              <div>
                <p className="text-[10.5px] font-semibold text-textMuted uppercase">Invoiced</p>
                <p className="text-sm font-bold text-textPrimary">
                  {currency} {Number(selectedCustomer.total_invoiced).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-semibold text-textMuted uppercase">Paid</p>
                <p className="text-sm font-bold text-success">
                  {currency} {Number(selectedCustomer.total_paid).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-semibold text-textMuted uppercase">Balance Owed</p>
                <p className="text-sm font-bold text-danger">
                  {currency} {Number(selectedCustomer.total_outstanding).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Invoices List */}
            <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
              Invoice History ({customerInvoices.length})
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {customerInvoices.length === 0 ? (
                <p className="text-xs text-textMuted italic">No invoice history found.</p>
              ) : (
                customerInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex justify-between items-center bg-surface1 p-2.5 rounded-lg border border-border text-xs"
                  >
                    <div>
                      <span className="font-bold text-accentText">{inv.invoice_number}</span>
                      <span className="text-textMuted ml-2">{inv.due_date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-textPrimary">
                        {currency} {Number(inv.amount).toLocaleString()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          inv.status === 'paid' ? 'bg-successBg text-success' : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <button
                onClick={() =>
                  printCustomerStatementPDF(
                    selectedCustomer,
                    customerInvoices,
                    { name: businessName, currency }
                  )
                }
                className="flex-1 py-2 text-xs font-bold rounded-lg bg-textPrimary text-white hover:opacity-90 text-center flex items-center justify-center gap-1.5 shadow-sm"
              >
                📄 Export Stylish PDF
              </button>
              <a
                href={getWhatsAppStatementLink(selectedCustomer)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 text-xs font-bold rounded-lg bg-successBg text-success hover:opacity-90 text-center flex items-center justify-center gap-1.5"
              >
                💬 WhatsApp
              </a>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-surface1 text-textSecondary"
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
