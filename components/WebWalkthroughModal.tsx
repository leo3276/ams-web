'use client';

import React, { useState, useMemo, useEffect } from 'react';

export const WEB_WALKTHROUGH_STORAGE_KEY = 'ams:web_walkthrough_completed_v1';

export interface WalkthroughStep {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  color: string;
  description: string;
  bulletPoints: {
    emoji: string;
    title: string;
    detail: string;
  }[];
  tip: string;
}

export const ALL_WEB_APP_STEPS: WalkthroughStep[] = [
  {
    id: 'dashboard',
    category: 'CORE',
    title: '1. Executive Dashboard & Offline Sync',
    subtitle: 'Real-Time Financial Health & Instant Workstation Sync',
    icon: '📊',
    badge: 'MISSION CONTROL',
    color: '#047857',
    description:
      'Your desktop command center displaying monthly sales revenue, uncollected debtor balances, safe liquid cash, and real-time offline synchronization.',
    bulletPoints: [
      {
        emoji: '⚡',
        title: 'Offline-First Desktop Terminal',
        detail: 'Work continuously even during ISP fiber dropouts. Sales and transactions safely queue locally in browser storage.',
      },
      {
        emoji: '🔄',
        title: 'Background Cloud Sync',
        detail: 'When the internet reconnects, all pending entries sync automatically with the cloud database.',
      },
      {
        emoji: '🔔',
        title: 'Business Health Indicators',
        detail: 'Instant visibility on inventory health, monthly tax filing countdowns, and operational cash runway.',
      },
    ],
    tip: 'Monitor the green status badge in the top right to verify that your workstation is fully synchronized with mobile terminals.',
  },
  {
    id: 'pos_sales',
    category: 'SALES',
    title: '2. Record Sale (POS & Fast Checkout)',
    subtitle: 'High-Speed Cashier Terminal & Thermal Receipts',
    icon: '🛒',
    badge: 'CASHIER CHECKOUT',
    color: '#0284C7',
    description:
      'Fast cashier checkout designed for desktop barcode scanners, keyboard shortcuts, split payments, and instant digital receipts.',
    bulletPoints: [
      {
        emoji: '🧾',
        title: 'Instant Receipts & WhatsApp Dispatch',
        detail: 'Generate clean PDF sales slips or share receipts straight to customer WhatsApp in 1 click.',
      },
      {
        emoji: '💳',
        title: 'Multi-Channel Payments',
        detail: 'Accept Cash, MTN MoMo, Telecel Cash, Bank Transfers, or Split Payments with automatic change calculation.',
      },
      {
        emoji: '📦',
        title: 'Automated Catalog Restock Deductions',
        detail: 'Every checkout automatically subtracts items from your live inventory database across all terminals.',
      },
    ],
    tip: 'Connect a USB barcode scanner to instantly populate customer cart items without touching your mouse.',
  },
  {
    id: 'invoices',
    category: 'SALES',
    title: '3. Invoices & Quotations',
    subtitle: 'Official Commercial Billing & Credit Terms',
    icon: '🧾',
    badge: 'RECEIVABLES',
    color: '#D97706',
    description:
      'Issue professional corporate tax invoices with payment terms (Net 7, Net 15, Net 30), custom logos, and payment instructions.',
    bulletPoints: [
      {
        emoji: '📋',
        title: 'Draft to Tax Invoice Flow',
        detail: 'Draft quotes, obtain customer confirmation, and convert them to live active invoices with 1 click.',
      },
      {
        emoji: '📄',
        title: 'Printable PDF Invoices',
        detail: 'Export clean PDF invoices featuring your business name, TIN number, and bank/MoMo payment details.',
      },
      {
        emoji: '⏰',
        title: 'Overdue Aging Tracker',
        detail: 'Automatically flags invoices that pass their payment due dates to prevent bad debt buildup.',
      },
    ],
    tip: 'Filter invoices by "Unpaid" to review upcoming corporate receivables every Monday morning.',
  },
  {
    id: 'customers',
    category: 'SALES',
    title: '4. Customers & Debt Ledger',
    subtitle: 'Debtor Directory & WhatsApp Reminders',
    icon: '👥',
    badge: 'DEBTOR LEDGER',
    color: '#7C3AED',
    description:
      'Maintain an organized customer directory, track credit balances owed, and send automated WhatsApp debt reminders.',
    bulletPoints: [
      {
        emoji: '📊',
        title: 'Live Credit Balance Owed',
        detail: 'Instantly view total credit outstanding per customer and historical purchase logs.',
      },
      {
        emoji: '💵',
        title: 'Partial Installment Settlements',
        detail: 'Log partial debt payments; the system auto-calculates and displays remaining balances.',
      },
      {
        emoji: '📲',
        title: '1-Click WhatsApp Follow-ups',
        detail: 'Generate polite, formatted WhatsApp reminder messages with exact balance totals and payment links.',
      },
    ],
    tip: 'Click the WhatsApp icon on any overdue customer card to send an instant reminder slip.',
  },
  {
    id: 'refunds',
    category: 'SALES',
    title: '5. Customer Returns & Refund Payouts',
    subtitle: 'Condition Verification & Controlled Payouts',
    icon: '💵',
    badge: 'RETURNS & REFUNDS',
    color: '#DC2626',
    description:
      'Process customer returns with condition inspections (resellable vs damaged goods) and issue tracked refund payouts.',
    bulletPoints: [
      {
        emoji: '🔄',
        title: 'Restock Inspection Check',
        detail: 'Choose whether returned items return to active inventory or get logged as write-off waste.',
      },
      {
        emoji: '💵',
        title: 'Refund Method Tracking',
        detail: 'Issue refunds via Cash Drawer or Mobile Money with mandatory reason logging.',
      },
      {
        emoji: '🛡️',
        title: 'Full Audit Trail Accountability',
        detail: 'Every refund is logged with the cashier name and timestamp to prevent internal staff fraud.',
      },
    ],
    tip: 'Require cashiers to record the return reason and inspect item condition before approving cash payouts.',
  },
  {
    id: 'inventory',
    category: 'INVENTORY',
    title: '6. Inventory & Stock Management',
    subtitle: 'Real-Time Catalog, Costs & Margins',
    icon: '📦',
    badge: 'STOCK CONTROL',
    color: '#059669',
    description:
      'Manage catalog items, cost prices, retail selling prices, gross margin percentages, and low-stock warning limits.',
    bulletPoints: [
      {
        emoji: '📊',
        title: 'Gross Margin Percentage',
        detail: 'Computes retail profit margins automatically based on unit purchase cost vs selling price.',
      },
      {
        emoji: '⚠️',
        title: 'Low-Stock Reorder Triggers',
        detail: 'Receive proactive alerts when stock drops below safety thresholds.',
      },
      {
        emoji: '📥',
        title: 'CSV Bulk Import & Export',
        detail: 'Import hundreds of products via CSV or download current valuation sheets for auditors.',
      },
    ],
    tip: 'Use CSV spreadsheet export to quickly hand your stock valuation over to your accountant.',
  },
  {
    id: 'bookkeeping',
    category: 'FINANCE',
    title: '7. Daily Bookkeeping & Ledger Entry',
    subtitle: 'Spreadsheet-Style High-Speed Bookkeeping',
    icon: '📋',
    badge: 'GENERAL LEDGER',
    color: '#0284C7',
    description:
      'Rapidly record daily store expenses (rent, logistics, utilities, fuel) with quick category assignments and payment tagging.',
    bulletPoints: [
      {
        emoji: '⚡',
        title: 'Rapid Keyboard Navigation',
        detail: 'Designed for fast bookkeeping where you can add dozens of expenses in minutes without page reloads.',
      },
      {
        emoji: '🏷️',
        title: 'Chart of Accounts Categorization',
        detail: 'Maps all spending to standard accounting categories for automatic GAAP statements.',
      },
      {
        emoji: '📁',
        title: 'Receipt Attachment & Notes',
        detail: 'Attach vendor descriptions and payment methods for complete end-of-month reconciliations.',
      },
    ],
    tip: 'Log small petty cash expenditures daily to keep your profit and loss statements 100% accurate.',
  },
  {
    id: 'banking',
    category: 'FINANCE',
    title: '8. Mobile Money (MoMo) Wallet & Bank Sync',
    subtitle: 'Reconcile Cash Inflows & Mobile Money',
    icon: '📱',
    badge: 'BANKING & MOMO',
    color: '#047857',
    description:
      'Track liquid bank accounts and Mobile Money merchant wallets with automatic reconciliation against recorded sales.',
    bulletPoints: [
      {
        emoji: '💳',
        title: 'MoMo & Bank Balances',
        detail: 'Keep track of cash on hand vs Mobile Money merchant wallet holdings in one central screen.',
      },
      {
        emoji: '🔍',
        title: 'Discrepancy Detection',
        detail: 'Easily match recorded POS receipts against your actual telecom MoMo statement totals.',
      },
      {
        emoji: '🛡️',
        title: 'Zero Direct Bank Credentials Required',
        detail: 'Your financial assets remain 100% secure with manual internal ledger verification.',
      },
    ],
    tip: 'Perform a 2-minute daily MoMo reconciliation before closing your register at the end of each shift.',
  },
  {
    id: 'suppliers',
    category: 'SUPPLIERS',
    title: '9. Suppliers & Vendor Hub',
    subtitle: 'Payables Directory, POs & Bill Payments',
    icon: '🏭',
    badge: 'TRADE PAYABLES',
    color: '#4F46E5',
    description:
      'Manage vendor orders, track credit balances owed to distributors, and generate official Payment Vouchers (PV).',
    bulletPoints: [
      {
        emoji: '📑',
        title: 'Purchase Orders & Stock Receiving',
        detail: 'Issue sequential POs and 1-click "Receive Stock at Dock" to restock inventory upon delivery.',
      },
      {
        emoji: '📱',
        title: 'MoMo (*170#) Settlement Workflow',
        detail: 'Deduct supplier debt, apply statutory Withholding Tax (WHT), and share remittance slips on WhatsApp.',
      },
      {
        emoji: '📉',
        title: 'Total Creditor Debt Tracking',
        detail: 'Know your exact upcoming vendor obligations so cash flow remains healthy and protected.',
      },
    ],
    tip: 'Send generated payment vouchers directly to vendor WhatsApp to confirm received funds immediately.',
  },
  {
    id: 'migrate',
    category: 'CORE',
    title: '10. Data Migration & CSV Import Hub',
    subtitle: 'Zero-Downtime Migration from Legacy Systems',
    icon: '⚡',
    badge: 'DATA MIGRATION',
    color: '#0D9488',
    description:
      'Seamlessly import existing customers, historical sales, supplier catalogs, and inventory items from Excel or QuickBooks.',
    bulletPoints: [
      {
        emoji: '📂',
        title: 'Smart CSV Column Mapping',
        detail: 'Auto-maps your spreadsheet headers to AMS database fields with validation previews.',
      },
      {
        emoji: '🛡️',
        title: 'Duplicate Prevention Engine',
        detail: 'Detects existing SKUs and customer phone numbers to prevent duplicate entries.',
      },
      {
        emoji: '⚡',
        title: 'Bulk Ingestion Speed',
        detail: 'Import thousands of historical lines in seconds with instant ledger verification.',
      },
    ],
    tip: 'Download the provided CSV template before importing to ensure 100% smooth mapping.',
  },
  {
    id: 'team',
    category: 'MANAGEMENT',
    title: '11. Team, Staff & Confidential Payroll',
    subtitle: 'Role Clearances & Monthly Wages',
    icon: '🧑‍🤝‍🧑',
    badge: 'STAFF & ACCESS',
    color: '#DB2777',
    description:
      'Manage employee accounts with role-based access control and pay monthly salaries via MoMo or Cash.',
    bulletPoints: [
      {
        emoji: '🧑‍💼',
        title: 'Cashier vs Accountant vs Owner Clearances',
        detail: 'Cashiers only see POS and sales; Accountants see ledgers; only Owners see profits and salaries.',
      },
      {
        emoji: '💸',
        title: 'Confidential Staff Payroll',
        detail: 'Record monthly wages into the ledger as Operating Expenses and disburse funds cleanly.',
      },
      {
        emoji: '🏢',
        title: 'Multi-Branch & Shift Allocation',
        detail: 'Assign staff to specific shop branches or warehouse shifts for accurate accountability.',
      },
    ],
    tip: 'Staff directory and salary management are confidential and strictly locked to the Business Owner account.',
  },
  {
    id: 'reports',
    category: 'FINANCE',
    title: '12. 7 GAAP Financial Statements & Reports',
    subtitle: 'Audit-Grade Profit & Loss, Balance Sheet & Cash Flow',
    icon: '📈',
    badge: 'FINANCIAL STATEMENTS',
    color: '#059669',
    description:
      'Generate complete, compliant financial statements generated automatically from your daily shop sales and bookkeeping.',
    bulletPoints: [
      {
        emoji: '📈',
        title: 'Statement of Profit or Loss (P&L)',
        detail: 'Revenue, Cost of Goods Sold (COGS), Gross Profit, Operating Expenses, and Net Profit.',
      },
      {
        emoji: '⚖️',
        title: 'Statement of Financial Position (Balance Sheet)',
        detail: 'Current Assets, Fixed Assets (NBV), Liabilities, Retained Earnings, and Owner Equity balance (A = L + E).',
      },
      {
        emoji: '📊',
        title: 'Cash Flow, Trial Balance, Margins & Aged Debtors',
        detail: 'Operating/Investing/Financing cash flows, double-entry trial balance, product margin catalog, and debtor aging.',
      },
    ],
    tip: 'Click "Export PDF Statement" on any report to generate official signed documents for tax filing or bank loans.',
  },
  {
    id: 'audit_logs',
    category: 'SECURITY',
    title: '13. Immutable Security Audit Trail',
    subtitle: 'Tamper-Evident Security & Anti-Fraud Logging',
    icon: '🛡️',
    badge: 'SECURITY & AUDIT',
    color: '#15803D',
    description:
      'Tamper-evident activity logs recording every transaction, stock modification, voided receipt, and role change for total transparency.',
    bulletPoints: [
      {
        emoji: '🛡️',
        title: 'Tamper-Evident Logging',
        detail: 'Records user email, timestamp, entity type, and action description for every modification in the app.',
      },
      {
        emoji: '🚫',
        title: 'Anti-Theft Void & Delete Tracking',
        detail: 'Immediately highlights if a cashier voids a sale or adjusts stock quantities without clearance.',
      },
      {
        emoji: '📥',
        title: 'Export CSV Compliance Audit Logs',
        detail: 'Download full chronological audit history for external auditors or board review.',
      },
    ],
    tip: 'Regularly inspect the Audit Trail for red DELETE or VOID tags to ensure zero internal shrinkage.',
  },
  {
    id: 'accountant',
    category: 'FINANCE',
    title: '14. Accountant & CPA Dashboard',
    subtitle: 'Double-Entry Audit Hub & Period Locking',
    icon: '💼',
    badge: 'CPA PORTAL',
    color: '#1E293B',
    description:
      'Dedicated portal for professional CPAs and external auditors to audit journal entries, verify debits/credits, and close accounting periods.',
    bulletPoints: [
      {
        emoji: '⚖️',
        title: 'Double-Entry Ledger Verification',
        detail: 'Automatic anomaly detection alerts your accountant if Debits do not equal Credits.',
      },
      {
        emoji: '🔒',
        title: 'Period Closing & Book Locking',
        detail: 'Lock historical months once tax reports are filed to prevent accidental editing or tampering.',
      },
      {
        emoji: '📑',
        title: 'Full General Ledger Inspection',
        detail: 'Inspect every transaction line with debit/credit breakdown, account codes, and timestamps.',
      },
    ],
    tip: 'Invite your external accountant with the "Accountant" role so they can audit your books without seeing owner salary edits.',
  },
  {
    id: 'tax',
    category: 'TAX',
    title: '15. GRA Tax Preparation & VAT Hub',
    subtitle: 'Standard VAT, NHIL, GETFund & Income Tax Estimates',
    icon: '🏛️',
    badge: 'TAX COMPLIANCE',
    color: '#B45309',
    description:
      'Keep your business compliant with automatic calculations of statutory taxes and countdowns to Ghana Revenue Authority (GRA) deadlines.',
    bulletPoints: [
      {
        emoji: '🏛️',
        title: 'Statutory Tax Breakdown',
        detail: 'Computes standard 15% VAT, 2.5% NHIL, 2.5% GETFund, 1% COVID-19 Levy, and estimated corporate tax.',
      },
      {
        emoji: '📅',
        title: 'Filing Deadline Countdown',
        detail: 'Real-time countdown banner warns you days before monthly VAT/WHT filing deadlines to avoid penalties.',
      },
      {
        emoji: '📄',
        title: 'Tax Filing Summary Export',
        detail: 'Export clean tax preparation sheets ready for submission to the GRA portal or your tax consultant.',
      },
    ],
    tip: 'Keep tax estimates enabled on your invoices so the system tracks your tax liability as sales happen.',
  },
  {
    id: 'pricing',
    category: 'CORE',
    title: '16. Pricing, Licenses & Workstation Quotas',
    subtitle: 'Flexible Multi-Terminal Licensing',
    icon: '✨',
    badge: 'MEMBERSHIP',
    color: '#7C3AED',
    description:
      'Review your active license tier, connected mobile/desktop cashier terminals, and invoice quotas.',
    bulletPoints: [
      {
        emoji: '💻',
        title: 'Multi-Terminal Scaling',
        detail: 'Add multiple cashier POS workstations and mobile manager devices under one business account.',
      },
      {
        emoji: '🛡️',
        title: 'Full Data Ownership',
        detail: 'All customer records and financial ledgers remain 100% private and owned by your business.',
      },
      {
        emoji: '⚡',
        title: 'Instant Upgrades & Add-ons',
        detail: 'Seamlessly upgrade for multi-branch consolidation and advanced CPA capabilities.',
      },
    ],
    tip: 'Contact AMS support anytime for custom multi-store deployment assistance.',
  },
  {
    id: 'settings_profile',
    category: 'CORE',
    title: '17. Settings & AI Knowledge Search',
    subtitle: 'Business Profile, Tax ID & Built-In Assistant',
    icon: '⚙️',
    badge: 'SETTINGS & AI',
    color: '#0284C7',
    description:
      'Configure company legal details, official currency, TIN number, and use the built-in AI Knowledge Assistant to search any question.',
    bulletPoints: [
      {
        emoji: '🔍',
        title: 'Instant Knowledge Assistant',
        detail: 'Ask any question about POS, taxes, salary, or accounting to get instant step-by-step guidance.',
      },
      {
        emoji: '🏷️',
        title: 'TIN & Business Header Details',
        detail: 'Add your Tax Identification Number (TIN) and address to appear on all printed invoices and receipts.',
      },
      {
        emoji: '💱',
        title: 'Multi-Currency Support',
        detail: 'Set your primary business currency for all receipts, reports, and financial statements.',
      },
    ],
    tip: 'Type any keyword in the Settings search bar to immediately jump to the right feature.',
  },
  {
    id: 'desktop_app',
    category: 'CORE',
    title: '18. Desktop Native App & Thermal Printing',
    subtitle: 'Hardware Barcode Scanners & ESC/POS Thermal Printers',
    icon: '💻',
    badge: 'WORKSTATION',
    color: '#0284C7',
    description:
      'Download the native desktop workstation for high-speed counter POS, automatic 80mm/58mm thermal receipt printing, and USB barcode scanner integration.',
    bulletPoints: [
      {
        emoji: '🖨️',
        title: 'Direct Thermal Receipt Printing',
        detail: 'Prints 80mm/58mm receipts instantly upon checkout without browser print dialog popups.',
      },
      {
        emoji: '⚡',
        title: 'Hardware USB & Bluetooth Scanners',
        detail: 'Instant barcode recognition for retail supermarkets, wholesale depots, and pharmacies.',
      },
      {
        emoji: '🖥️',
        title: 'Dual-Screen Customer Display',
        detail: 'Display live cart subtotals to customers on counter-facing screens.',
      },
    ],
    tip: 'Download the desktop app from the download page to unlock raw ESC/POS thermal printer support.',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function WebWalkthroughModal({ isOpen, onClose }: Props) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIndexView, setShowIndexView] = useState(false);

  const filteredSteps = useMemo(() => {
    if (!searchQuery.trim()) return ALL_WEB_APP_STEPS;
    const q = searchQuery.toLowerCase();
    return ALL_WEB_APP_STEPS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.bulletPoints.some((b) => b.title.toLowerCase().includes(q) || b.detail.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const step = ALL_WEB_APP_STEPS[currentStepIndex] || ALL_WEB_APP_STEPS[0];
  const totalSteps = ALL_WEB_APP_STEPS.length;
  const isLast = currentStepIndex === totalSteps - 1;

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleJumpToStep = (index: number) => {
    setCurrentStepIndex(index);
    setShowIndexView(false);
    setSearchQuery('');
  };

  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(WEB_WALKTHROUGH_STORAGE_KEY, 'true');
      } catch (_e) {}
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowIndexView(!showIndexView)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition flex items-center gap-1.5"
            >
              <span>{showIndexView ? '📖 Slide View' : '📑 All 18 Modules'}</span>
            </button>
            <span className="text-xs font-medium text-slate-500">
              Module {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>

          <button
            onClick={handleComplete}
            className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition px-2 py-1"
          >
            Close ✕
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-1">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${((currentStepIndex + 1) / totalSteps) * 100}%`,
              backgroundColor: step.color,
            }}
          />
        </div>

        {/* Modal Body */}
        {showIndexView ? (
          /* INDEX DIRECTORY VIEW */
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search any function (e.g. POS, tax, payroll, MoMo, stock)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredSteps.map((item) => {
                const origIndex = ALL_WEB_APP_STEPS.findIndex((s) => s.id === item.id);
                const isCurrent = origIndex === currentStepIndex;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleJumpToStep(origIndex)}
                    className={`text-left p-3 rounded-xl border transition flex items-start gap-2.5 ${
                      isCurrent
                        ? 'border-slate-900 bg-slate-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* SLIDE BY SLIDE VIEW */
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Step Header */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl shadow-sm">
                {step.icon}
              </div>
              <span className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border tracking-wider"
                    style={{ backgroundColor: `${step.color}15`, color: step.color, borderColor: `${step.color}30` }}>
                {step.badge} · MODULE {currentStepIndex + 1} OF {totalSteps}
              </span>
              <h2 className="text-lg font-black text-slate-900">{step.title}</h2>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">{step.subtitle}</p>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-700 leading-relaxed text-center bg-slate-50 p-3 rounded-xl border border-slate-200">
              {step.description}
            </p>

            {/* 3 Bullet Points */}
            <div className="space-y-2.5">
              {step.bulletPoints.map((b, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition">
                  <span className="text-lg">{b.emoji}</span>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-slate-900">{b.title}</h4>
                    <p className="text-[11px] text-slate-600 leading-normal mt-0.5">{b.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pro Tip Box */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <span className="text-base">💡</span>
              <p className="flex-1 leading-normal">
                <strong className="font-bold">Pro Tip: </strong>
                {step.tip}
              </p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {!showIndexView && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50/50">
            {currentStepIndex > 0 ? (
              <button
                onClick={handlePrev}
                className="text-xs font-bold px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                ← Back
              </button>
            ) : (
              <button
                onClick={() => setShowIndexView(true)}
                className="text-xs font-bold px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                📑 Directory
              </button>
            )}

            <button
              onClick={handleNext}
              className="text-xs font-bold px-5 py-2.5 rounded-xl text-white shadow-sm transition"
              style={{ backgroundColor: step.color }}
            >
              {isLast ? '🚀 Finish & Get Started' : `Next (${currentStepIndex + 2}/${totalSteps}) →`}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
