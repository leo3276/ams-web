'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/lib/RoleContext';
import { getCachedBusiness, setCachedBusiness } from '@/lib/offlineStore';
import Link from 'next/link';

interface FAQItem {
  question: string;
  category: string;
  keywords: string[];
  answer: string;
  linkHref?: string;
  linkLabel?: string;
}

const WEB_KNOWLEDGE_BASE: FAQItem[] = [
  {
    question: 'How do I record a POS sale and print thermal receipts?',
    category: 'SALES & POS',
    keywords: ['sale', 'pos', 'barcode', 'thermal', 'receipt', 'checkout', 'cashier', 'whatsapp'],
    answer:
      'Navigate to "Record Sale (POS)". Connect a USB barcode scanner to scan SKUs automatically, choose Cash, MTN MoMo, Telecel, or Bank Transfer, and click "Complete Sale". You can print thermal 80mm receipts or share digital slips directly to WhatsApp.',
    linkHref: '/sales',
    linkLabel: 'Open POS Terminal',
  },
  {
    question: 'How do I pay supplier bills via MoMo (*170#)?',
    category: 'SUPPLIERS & USSD',
    keywords: ['supplier', 'vendor', 'pay bill', 'momo', '*170#', 'ussd', 'wht', 'voucher'],
    answer:
      'Go to "Suppliers & Debt" and click "Pay Bill". Select the debt settlement amount, deduct 3% or 5% Withholding Tax (WHT) if required, and complete the settlement. The system automatically creates a formal Payment Voucher (PV) and logs the entry.',
    linkHref: '/suppliers',
    linkLabel: 'View Suppliers & Payables',
  },
  {
    question: 'How do I issue formal tax invoices with payment terms (Net 15/30)?',
    category: 'INVOICES & RECEIVABLES',
    keywords: ['invoice', 'quotation', 'net 30', 'net 15', 'due date', 'pdf invoice'],
    answer:
      'Go to "Invoices & Receipts", click "New Invoice", choose your customer, add products and agreed payment terms. You can download official PDF invoices with your TIN number or share them via WhatsApp.',
    linkHref: '/invoices',
    linkLabel: 'Manage Invoices',
  },
  {
    question: 'How do I pay staff salaries and keep profits confidential?',
    category: 'STAFF & PAYROLL',
    keywords: ['salary', 'staff', 'employee', 'payroll', 'cashier', 'hide profit', 'permissions'],
    answer:
      'Go to "Team & Staff". Click "Pay Salary" on any staff member to disburse wages and log operating payroll expenses. Staff assigned to "Employee" or "Accountant" cannot see your private company net profits or owner drawings.',
    linkHref: '/team',
    linkLabel: 'Open Team & Staff',
  },
  {
    question: 'How do I export 7 GAAP Financial Statements (P&L, Balance Sheet, Cash Flow)?',
    category: 'FINANCIAL REPORTS',
    keywords: ['p&l', 'profit and loss', 'balance sheet', 'gaap', 'cash flow', 'trial balance', 'pdf'],
    answer:
      'Go to "Financial Reports". Browse tabs for Statement of Profit or Loss, Balance Sheet (Financial Position), Cash Flow, Trial Balance, Expense Breakdown, Inventory Margins, and Aged Debtors. Click "Export PDF Report" for signed printouts.',
    linkHref: '/reports',
    linkLabel: 'Open Financial Reports',
  },
  {
    question: 'How does GRA Tax preparation and monthly filing countdown work?',
    category: 'TAX & COMPLIANCE',
    keywords: ['tax', 'gra', 'vat', 'nhil', 'getfund', 'covid levy', 'filing', 'tin'],
    answer:
      'Open "Tax Preparation" to view automated calculations of 15% standard VAT, 2.5% NHIL, 2.5% GETFund, and 1% COVID Levy. A countdown banner tracks upcoming statutory deadlines to keep your store 100% penalty-free.',
    linkHref: '/tax',
    linkLabel: 'View Tax Preparation',
  },
  {
    question: 'How does the Security Audit Trail prevent internal shrinkage and fraud?',
    category: 'SECURITY & AUDIT',
    keywords: ['audit', 'security', 'void', 'delete', 'fraud', 'theft', 'tamper', 'log'],
    answer:
      'The "Audit Trail" provides an immutable chronological log recording every sale, voided receipt, stock modification, and role change with the actor’s email and timestamp.',
    linkHref: '/audit-logs',
    linkLabel: 'View Audit Trail',
  },
  {
    question: 'How does offline mode sync data when the internet drops?',
    category: 'OFFLINE ENGINE',
    keywords: ['offline', 'sync', 'internet', 'no connection', 'cache'],
    answer:
      'AMS is built offline-first. If internet drops, all sales and expense entries are safely stored in browser storage. When the network reconnects, background sync uploads all pending data automatically.',
    linkHref: '/dashboard',
    linkLabel: 'Back to Dashboard',
  },
];

export default function SettingsPage() {
  const { role, isOwner } = useUserRole();
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [tin, setTin] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    const biz = getCachedBusiness();
    if (biz) {
      setBusinessName(biz.name || '');
      setCurrency(biz.currency || 'GHS');
    }
    if (typeof window !== 'undefined') {
      const savedTin = localStorage.getItem('ams:web_tin_v1');
      const savedAddr = localStorage.getItem('ams:web_address_v1');
      const savedPhone = localStorage.getItem('ams:web_phone_v1');
      if (savedTin) setTin(savedTin);
      if (savedAddr) setAddress(savedAddr);
      if (savedPhone) setPhone(savedPhone);
    }
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('ams:web_tin_v1', tin);
      localStorage.setItem('ams:web_address_v1', address);
      localStorage.setItem('ams:web_phone_v1', phone);
      const b = getCachedBusiness();
      if (b) {
        setCachedBusiness({ ...b, name: businessName, currency });
      }
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return WEB_KNOWLEDGE_BASE.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings &amp; Workstation Preferences</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage business profile, receipts header, and AI knowledge search</p>
        </div>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 uppercase">
          {role} Workspace
        </span>
      </div>

      {/* 🤖 MINIMALIST AI ASSISTANT SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🤖</span>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Help &amp; Knowledge Assistant</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-400">Search 18 Business Engines</span>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search anything (e.g. 'How to pay supplier?', 'Safe to Spend', 'VAT', 'POS')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition"
          />
          <span className="absolute left-3 top-3 text-xs text-slate-400">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        {!searchQuery.trim() && (
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
            {[
              'Pay supplier *170#',
              'Safe to Spend',
              'POS thermal sale',
              'Staff Salary',
              'Offline sync',
              'Export P&L PDF',
            ].map((chip, idx) => (
              <button
                key={idx}
                onClick={() => setSearchQuery(chip)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 shrink-0 transition"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Search Results */}
        {searchQuery.trim() && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            {searchResults.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">
                No matching answers found for "{searchQuery}". Try keywords like "POS", "invoice", "supplier", "salary", or "tax".
              </div>
            ) : (
              searchResults.map((faq, idx) => {
                const isExp = expandedId === idx || searchResults.length === 1;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition"
                  >
                    <button
                      onClick={() => setExpandedId(isExp ? null : idx)}
                      className="w-full text-left flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                          {faq.category}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">{faq.question}</h4>
                      </div>
                      <span className="text-xs text-slate-400">{isExp ? '▲' : '▼'}</span>
                    </button>

                    {isExp && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 space-y-2">
                        <p className="text-xs text-slate-600 leading-relaxed">{faq.answer}</p>
                        {faq.linkHref && (
                          <Link
                            href={faq.linkHref}
                            className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 hover:text-slate-600 transition"
                          >
                            <span>{faq.linkLabel || 'Go to Feature'}</span>
                            <span>→</span>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* BUSINESS PROFILE FORM */}
      <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Store Profile &amp; Receipt Header</h3>
            <p className="text-xs text-slate-500">Details printed on customer receipts, invoices, and payment vouchers</p>
          </div>
          {savedMsg && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              Saved successfully ✓
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Primary Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            >
              <option value="GHS">GHS - Ghana Cedi</option>
              <option value="USD">USD - US Dollar</option>
              <option value="NGN">NGN - Nigerian Naira</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tax Identification Number (TIN)</label>
            <input
              type="text"
              placeholder="e.g. C0001234567"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Store Phone Number</label>
            <input
              type="text"
              placeholder="e.g. +233 24 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">Store Physical Address / Location</label>
            <input
              type="text"
              placeholder="e.g. Shop 12, Oxford Street, Osu, Accra"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm transition"
          >
            Save Preferences
          </button>
        </div>
      </form>

    </div>
  );
}
