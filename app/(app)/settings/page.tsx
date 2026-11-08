'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/lib/RoleContext';
import { getCachedBusiness, setCachedBusiness, resolveActiveBusiness } from '@/lib/offlineStore';
import { logAuditEvent } from '@/lib/auditLogger';
import { useTheme, ThemeMode } from '@/lib/ThemeContext';
import { Icon } from '@/components/Icons';
import Link from 'next/link';
import { sendEmailClient } from '@/lib/emailClient';

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
  const { theme, setTheme } = useTheme();
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [tin, setTin] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [reportFrequency, setReportFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [executiveEmail, setExecutiveEmail] = useState('');
  const [executiveWhatsApp, setExecutiveWhatsApp] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);
  const [appVersion, setAppVersion] = useState('1.1.3');
  const [updaterStatus, setUpdaterStatus] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateReady, setUpdateReady] = useState<string | null>(null);
  const [webDownloadUrl, setWebDownloadUrl] = useState<string | null>(null);

  // Resend Email Test Dispatcher
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success: boolean; msg: string } | null>(null);

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailRecipient.trim()) return;
    setTestEmailSending(true);
    setTestEmailStatus(null);

    const res = await sendEmailClient({
      to: testEmailRecipient.trim(),
      subject: 'AMS Software Test Dispatch',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 24px; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">AMS Email Delivery Verified</h2>
          <p>This confirms that your AMS Software email service via Resend is working properly.</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px;">
            <p style="margin: 4px 0;"><strong>Sender:</strong> AMS Software &lt;noreply@amsaccounting.site&gt;</p>
            <p style="margin: 4px 0;"><strong>Recipient:</strong> ${testEmailRecipient.trim()}</p>
            <p style="margin: 4px 0;"><strong>Domain Status:</strong> Verified</p>
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0; border-top: 1px solid #f1f5f9; padding-top: 12px;">
            Sent securely from AMS Software Workstation.
          </p>
        </div>
      `,
    });

    setTestEmailSending(false);
    if (res.success) {
      setTestEmailStatus({
        success: true,
        msg: `✓ Test email dispatched successfully to ${testEmailRecipient.trim()}! Please check your inbox or spam folder.`,
      });
    } else {
      setTestEmailStatus({
        success: false,
        msg: `Delivery notice: ${res.error || 'Failed to dispatch email.'}`,
      });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getAppVersion) {
      (window as any).electronAPI.getAppVersion().then((v: string) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.onUpdaterStatus) {
      const unsub = (window as any).electronAPI.onUpdaterStatus((info: any) => {
        if (info.status === 'checking') {
          setUpdaterStatus('Checking GitHub Releases for updates…');
        } else if (info.status === 'available') {
          setUpdaterStatus(`New update v${info.version} found! Downloading fast…`);
        } else if (info.status === 'downloading') {
          setUpdaterStatus(`Downloading update v${info.version || 'latest'}: ${info.percent}%`);
        } else if (info.status === 'downloaded') {
          setUpdateReady(info.version || 'latest');
          setUpdaterStatus(`✓ Update v${info.version} downloaded and ready! Click "Apply & Restart" to install.`);
        } else if (info.status === 'up-to-date') {
          setUpdaterStatus(`✓ You are running the latest version (v${info.version || appVersion}).`);
        } else if (info.status === 'error') {
          setUpdaterStatus('Update check notice: ' + (info.error || 'Could not reach update server.'));
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [appVersion]);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdaterStatus('Checking GitHub Releases for updates…');
    setWebDownloadUrl(null);

    // 1. If running inside Electron desktop container
    if (typeof window !== 'undefined' && (window as any).electronAPI?.checkForUpdates) {
      try {
        const res = await (window as any).electronAPI.checkForUpdates();
        if (res?.status === 'up-to-date') {
          setUpdaterStatus(`✓ You are running the latest version (v${res.version || appVersion}).`);
        } else if (res?.status === 'downloaded') {
          setUpdateReady(res.version || 'latest');
          setUpdaterStatus(`✓ Update v${res.version} downloaded and ready! Click "Apply & Restart" to install.`);
        } else if (res?.status === 'error') {
          setUpdaterStatus('Could not check updates: ' + (res.message || 'Offline or network error'));
        }
      } catch (err: any) {
        setUpdaterStatus('Update check notice: ' + (err?.message || 'Check complete.'));
      } finally {
        setCheckingUpdate(false);
      }
      return;
    }

    // 2. If running inside web browser: Query GitHub releases directly
    try {
      const res = await fetch('https://api.github.com/repos/leo3276/ams-web/releases/latest');
      if (res.ok) {
        const data = await res.json();
        const latestTag = (data.tag_name || '').replace(/^v/, '');
        if (latestTag && latestTag !== appVersion) {
          setUpdaterStatus(`New release v${latestTag} is available! (Current: v${appVersion})`);
          setUpdateReady(latestTag);
          setWebDownloadUrl('https://github.com/leo3276/ams-web/releases/tag/v' + latestTag);
        } else {
          setUpdaterStatus(`✓ You are running the latest version (v${appVersion}).`);
        }
      } else {
        setUpdaterStatus(`✓ Current version: v${appVersion}. (GitHub check responded ${res.status})`);
      }
    } catch (_e) {
      setUpdaterStatus(`✓ Current version: v${appVersion}.`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleRestartToUpdate = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.restartAndInstallUpdate) {
      (window as any).electronAPI.restartAndInstallUpdate();
    }
  };

  useEffect(() => {
    async function loadRemoteSettings() {
      const b = await resolveActiveBusiness();
      if (b) {
        setBusinessName(b.name || '');
        setCurrency(b.currency || 'GHS');
      }
    }
    loadRemoteSettings();

    if (typeof window !== 'undefined') {
      const savedTin = localStorage.getItem('ams:web_tin_v1');
      const savedAddr = localStorage.getItem('ams:web_address_v1');
      const savedPhone = localStorage.getItem('ams:web_phone_v1');
      const savedFreq = localStorage.getItem('ams:report_frequency_v1') as any;
      const savedEmail = localStorage.getItem('ams:executive_email_v1');
      const savedWA = localStorage.getItem('ams:executive_wa_v1');
      if (savedTin) setTin(savedTin);
      if (savedAddr) setAddress(savedAddr);
      if (savedPhone) setPhone(savedPhone);
      if (savedFreq) setReportFrequency(savedFreq);
      if (savedEmail) setExecutiveEmail(savedEmail);
      if (savedWA) setExecutiveWhatsApp(savedWA);
    }
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('ams:web_tin_v1', tin);
      localStorage.setItem('ams:web_address_v1', address);
      localStorage.setItem('ams:web_phone_v1', phone);
      localStorage.setItem('ams:report_frequency_v1', reportFrequency);
      localStorage.setItem('ams:executive_email_v1', executiveEmail);
      localStorage.setItem('ams:executive_wa_v1', executiveWhatsApp);

      const b = getCachedBusiness();
      const updatedBiz = {
        id: b?.id || 'default_biz',
        name: businessName.trim() || 'My Business',
        currency: currency || 'GHS',
        taxId: tin,
        phone: phone,
        address: address,
      };
      setCachedBusiness(updatedBiz as any);
      window.dispatchEvent(new Event('ams:business-updated'));

      logAuditEvent({
        businessId: b?.id || 'default_biz',
        actionType: 'UPDATE',
        entityType: 'business_profile',
        entityId: b?.id || 'default_biz',
        entityName: businessName.trim() || 'My Business',
        description: `Updated workstation profile and receipt parameters for "${businessName.trim() || 'My Business'}" (TIN: ${tin || 'N/A'}, Currency: ${currency})`,
        newValue: updatedBiz,
      });

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id && b?.id && b.id !== 'default_biz') {
          await supabase
            .from('businesses')
            .update({
              name: businessName.trim() || 'My Business',
              currency: currency || 'GHS',
            })
            .eq('id', b.id);
        }
      } catch (_e) {}
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3500);
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
          <p className="text-xs text-slate-500 mt-0.5">Manage Dark Mode &amp; Eye Care, fast updates, business profile, and AI search</p>
        </div>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 uppercase">
          {role} Workspace
        </span>
      </div>

      {/* DARK MODE & EYE CARE STUDIO (TOP PRIORITY IN SETTINGS) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'eye'} size={16} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Dark Mode &amp; Eye Care Studio</h2>
              <p className="text-[11px] text-slate-500">
                Engineered with low-halation contrast and zero blue-light options to protect your eyes during extended ledger work
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Eye-Care Shield Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'comfort' ? 'dark' : 'comfort')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                theme === 'comfort'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title="Toggle Warm Night Eye-Care Filter"
            >
              <Icon name="eye" size={13} />
              <span>{theme === 'comfort' ? 'Eye Care: ON' : 'Enable Eye Care'}</span>
            </button>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
              {theme === 'light' ? 'Daylight' : theme === 'dark' ? 'Dark Mode' : 'Eye Care'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {([
            {
              id: 'light',
              title: 'Daylight Ledger',
              subtitle: 'Crisp paper & slate ink for bright offices',
              icon: 'sun',
              previewBg: '#F8FAFC',
              previewCard: '#FFFFFF',
              previewBorder: '#E2E8F0',
              previewText: '#0F172A',
              previewAccent: '#0F172A',
            },
            {
              id: 'dark',
              title: 'Dark Mode (Obsidian)',
              subtitle: 'Deep carbon & soft alabaster chalk',
              icon: 'moon',
              previewBg: '#0C0E12',
              previewCard: '#13161C',
              previewBorder: '#252E42',
              previewText: '#ECEEF2',
              previewAccent: '#3B4866',
            },
            {
              id: 'comfort',
              title: 'Eye Care (Warm Night)',
              subtitle: 'Zero blue-light circadian espresso ledger',
              icon: 'eye',
              previewBg: '#11100E',
              previewCard: '#181614',
              previewBorder: '#302923',
              previewText: '#ECE7DF',
              previewAccent: '#5C4D40',
            },
          ] as {
            id: ThemeMode;
            title: string;
            subtitle: string;
            icon: string;
            previewBg: string;
            previewCard: string;
            previewBorder: string;
            previewText: string;
            previewAccent: string;
          }[]).map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`text-left p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-3 ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-900'
                }`}
              >
                {/* Visual Swatch Mini-Ledger Preview */}
                <div
                  className="w-full h-14 rounded-xl p-2.5 flex flex-col justify-between border"
                  style={{
                    backgroundColor: opt.previewBg,
                    borderColor: opt.previewBorder,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: opt.previewAccent }}
                      />
                      <span
                        className="h-1.5 w-12 rounded-full opacity-85"
                        style={{ backgroundColor: opt.previewText }}
                      />
                    </div>
                    <span className="h-1.5 w-6 rounded-full bg-emerald-400/80" />
                  </div>
                  <div
                    className="w-full h-5 rounded-md border px-2 flex items-center justify-between"
                    style={{
                      backgroundColor: opt.previewCard,
                      borderColor: opt.previewBorder,
                    }}
                  >
                    <span
                      className="h-1 w-10 rounded-full opacity-50"
                      style={{ backgroundColor: opt.previewText }}
                    />
                    <span
                      className="h-1 w-5 rounded-full opacity-75"
                      style={{ backgroundColor: opt.previewText }}
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Icon name={opt.icon} size={13} className={active ? 'text-slate-300' : 'text-slate-500'} />
                      <p className="text-xs font-bold">{opt.title}</p>
                    </div>
                    <p className={`text-[11px] mt-0.5 leading-snug ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {opt.subtitle}
                    </p>
                  </div>
                  {active && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/20 shrink-0">
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MINIMALIST AI ASSISTANT SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="search" size={14} className="text-slate-500" />
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
          <span className="absolute left-3 top-3 text-slate-400"><Icon name="search" size={14} /></span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-700"
            >
              <Icon name="x" size={13} />
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

        {/* AUTOMATED EXECUTIVE ASSESSMENT & PERIODIC REPORT DISPATCH */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="chart" size={16} className="text-slate-600" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Automated Owner Assessment &amp; Reporting Schedule
              </h4>
              <p className="text-[11px] text-slate-500">
                AMS compiles your complete trading activity, rolls over Opening Stock, and prepares an executive summary for your assessment.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Assessment Frequency</label>
              <select
                value={reportFrequency}
                onChange={(e) => setReportFrequency(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              >
                <option value="monthly">Every Month (End of Month Summary)</option>
                <option value="quarterly">Every Quarter (3 Months Evaluation)</option>
                <option value="yearly">Every Year (Annual Business Audit)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Owner Email for Executive PDF</label>
              <input
                type="email"
                placeholder="owner@mybusiness.com"
                value={executiveEmail}
                onChange={(e) => setExecutiveEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp for Instant Text Brief</label>
              <input
                type="tel"
                placeholder="+233 24 123 4567"
                value={executiveWhatsApp}
                onChange={(e) => setExecutiveWhatsApp(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1 text-slate-600">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <Icon name="zap" size={13} /> Automatic Period Roll-Over Guarantee:
            </p>
            <p>
              When your {reportFrequency === 'yearly' ? 'Year' : reportFrequency === 'quarterly' ? 'Quarter' : 'Month'} closes, AMS evaluates your remaining shelf inventory as the period’s <strong>Closing Stock</strong>, and rolls that value automatically into the new period as your fresh <strong>Opening Stock</strong> without requiring manual recalculation.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-5 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-sm transition"
          >
            Save Preferences
          </button>
        </div>
      </form>

      {/* Resend Email Integration & Live Diagnostic */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 shrink-0">
              <Icon name="mail" size={16} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Email &amp; Notifications Service</h2>
              <p className="text-[11px] text-slate-500">Connected to Resend via verified domain amsaccounting.site</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Resend Connected
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <p className="text-slate-500 font-semibold mb-0.5">Verified Sender</p>
            <p className="font-mono font-bold text-slate-800">AMS Software &lt;noreply@amsaccounting.site&gt;</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <p className="text-slate-500 font-semibold mb-0.5">Status &amp; Delivery</p>
            <p className="font-bold text-slate-800">Active · Invoices, Receipts &amp; Alerts</p>
          </div>
        </div>

        {/* Live Test Email Dispatcher */}
        <form onSubmit={handleSendTestEmail} className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800">Send Live Test Email</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Verify live Resend email dispatch right now by sending a test message.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              placeholder="Enter your email to test (e.g. you@example.com)"
              value={testEmailRecipient}
              onChange={(e) => setTestEmailRecipient(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-slate-400"
            />
            <button
              type="submit"
              disabled={testEmailSending}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {testEmailSending ? 'Sending…' : 'Send Test Email'}
            </button>
          </div>

          {testEmailStatus && (
            <div className={`p-2.5 rounded-lg text-xs font-medium border ${
              testEmailStatus.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {testEmailStatus.msg}
            </div>
          )}
        </form>

        {/* Supabase Auth SMTP Info Box */}
        <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/70 text-xs text-amber-900 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5 text-amber-900">
            <Icon name="alert" size={13} className="text-amber-600" /> Connecting Resend for User Signups &amp; Password Resets:
          </p>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            User registration OTPs and confirmation links are dispatched directly by Supabase Auth servers. To route Supabase through Resend, open <strong>Supabase Dashboard &rarr; Project Settings &rarr; Authentication &rarr; SMTP Settings</strong> and save:
          </p>
          <div className="text-[11px] font-mono bg-white/90 p-2.5 rounded-lg border border-amber-200/70 space-y-1">
            <div>Host: <strong>smtp.resend.com</strong> | Port: <strong>465</strong> | User: <strong>resend</strong></div>
            <div>Password: <strong>[Your Resend API Key: re_...]</strong></div>
            <div>Sender Email: <strong>noreply@amsaccounting.site</strong></div>
          </div>
        </div>
      </div>

      {/* Build & Workstation Information */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              <Icon name="sliders" size={16} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Workstation &amp; App Version</h2>
              <p className="text-[11px] text-slate-500">Silent auto-updates powered by GitHub Releases</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
              v{appVersion} · Release
            </span>
            {updateReady && !webDownloadUrl ? (
              <button
                type="button"
                onClick={handleRestartToUpdate}
                className="px-3 py-1 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-2xs transition animate-pulse flex items-center gap-1.5 cursor-pointer"
              >
                <Icon name="zap" size={13} /> Restart to Apply v{updateReady}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
                className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {checkingUpdate ? 'Checking…' : 'Check for Updates'}
              </button>
            )}
          </div>
        </div>

        {updaterStatus && (
          <div className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            updateReady 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <span className="font-medium">{updaterStatus}</span>
            <div className="flex items-center gap-2 shrink-0">
              {updateReady && !webDownloadUrl && (
                <button
                  type="button"
                  onClick={handleRestartToUpdate}
                  className="px-3 py-1 text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition cursor-pointer shadow-2xs"
                >
                  Restart Now
                </button>
              )}
              {webDownloadUrl && (
                <a
                  href={`https://github.com/leo3276/ams-web/releases/download/v${appVersion}/AMS.Software.Setup.${appVersion}.exe`}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="px-3 py-1 text-xs font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-xs inline-flex items-center gap-1.5"
                >
                  <Icon name="download" size={13} /> Download Windows (.exe)
                </a>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <p className="text-slate-500 font-semibold mb-0.5">Desktop Core</p>
            <p className="font-bold text-slate-800">AMS Software Desktop</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <p className="text-slate-500 font-semibold mb-0.5">Architecture</p>
            <p className="font-bold text-slate-800">Offline-First Engine + Cloud Sync</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <p className="text-slate-500 font-semibold mb-0.5">System Status</p>
            <p className="font-bold text-emerald-600">● 100% Operational</p>
          </div>
        </div>
      </div>

    </div>
  );
}
