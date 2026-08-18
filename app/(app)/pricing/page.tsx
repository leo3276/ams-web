'use client';

import { useState } from 'react';

type BillingCycle = 'monthly' | 'annual';

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      monthlyPrice: 0,
      annualPrice: 0,
      description: 'Ideal for micro-businesses, solo vendors, and testing.',
      features: [
        'Up to 25 ledger transactions / month',
        'Manual bookkeeping & expense logging',
        'Basic P&L and Balance Sheet summary',
        'Single device access',
        'Standard community support',
      ],
      isPopular: false,
      cta: 'Current Plan',
    },
    {
      id: 'pro',
      name: 'Pro Growth',
      badge: 'MOST POPULAR',
      monthlyPrice: 89,
      annualPrice: 790,
      description: 'For growing retail shops, merchants, and service providers.',
      features: [
        'Unlimited Vision AI Receipt & Invoice OCR',
        'Instant MoMo SMS Fast Extractor (MTN, Telecel, AT)',
        'Full Invoicing Hub with PDF layout & WhatsApp Chaser',
        'Safe-to-Spend Liquidity Radar & Runway Forecast',
        'Inventory Stock Valuation & Profit Margin Radar',
        'Offline Transaction Queue & Auto Cloud Sync',
        'Verbal AI CFO Situation Reports',
        'Priority email & WhatsApp support',
      ],
      isPopular: true,
      cta: 'Subscribe with In-App Billing',
    },
    {
      id: 'business',
      name: 'Business / CPA Suite',
      badge: 'FULL SUITE',
      monthlyPrice: 249,
      annualPrice: 2190,
      description: 'For established companies, multi-branch stores, and accounting firms.',
      features: [
        'Everything in Pro Growth',
        'Accountant Audit Hub (Debits/Credits & sanity flags)',
        'Ghana Statutory Tax Preparation (GRA 7-band schedule)',
        'Historical Monthly Period Locking',
        'Continuous All-in-One Financial Reports',
        'Companion Desktop Web Workstation Access',
        'Multi-User / Staff Role Management',
        'Dedicated Account Manager',
      ],
      isPopular: false,
      cta: 'Subscribe to Business Suite',
    },
  ];

  const faqs = [
    {
      q: 'How does in-app subscription billing work?',
      a: 'Subscriptions are securely processed directly through your Apple ID or Google Play account. You can pay with your linked card or carrier billing.',
    },
    {
      q: 'Can I cancel or switch my plan anytime?',
      a: 'Yes, you can upgrade, downgrade, or cancel your subscription at any time with zero penalties or hidden fees.',
    },
    {
      q: 'Is my financial data secure?',
      a: 'All data is encrypted in transit and at rest using bank-grade SSL encryption and secure cloud database backups.',
    },
    {
      q: 'Can my external accountant access my business books?',
      a: 'Yes! On the Business/CPA plan, you can invite your accountant or export the 1-click Accountant Statement Brief directly to them.',
    },
  ];

  const handleUpgrade = (planName: string, price: string) => {
    alert(`In-App billing triggered for ${planName} (${price}). Confirm on your mobile device to activate.`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Header Hero */}
      <div className="text-center space-y-3">
        <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-zinc-100 text-zinc-800 rounded-full border border-zinc-200">
          Simple, Transparent Pricing
        </span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-zinc-900 tracking-tight">
          Invest in peace of mind &amp; automated bookkeeping
        </h1>
        <p className="text-base text-zinc-600 max-w-2xl mx-auto">
          Save 5+ hours every week with AI receipt OCR, MoMo SMS extraction, and automated GRA tax schedules.
        </p>

        {/* Monthly vs Annual Toggle (Soft charcoal black) */}
        <div className="inline-flex items-center bg-zinc-100 p-1 rounded-full border border-zinc-200 mt-4">
          <button
            onClick={() => setCycle('monthly')}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
              cycle === 'monthly'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setCycle('annual')}
            className={`px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition ${
              cycle === 'annual'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Annual Billing
            <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              SAVE 25%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan) => {
          const price = cycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
          const period =
            plan.monthlyPrice === 0
              ? 'Free forever'
              : cycle === 'monthly'
              ? '/ month'
              : '/ year (billed annually)';

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl p-6 md:p-8 border transition ${
                plan.isPopular
                  ? 'border-zinc-900 bg-white shadow-lg ring-1 ring-zinc-900/10'
                  : 'border-zinc-200 bg-white'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-6 px-3 py-0.5 text-[11px] font-bold tracking-wider bg-zinc-900 text-white rounded-full shadow-sm">
                  {plan.badge}
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-zinc-900">{plan.name}</h3>
                <p className="text-xs text-zinc-600 mt-1">{plan.description}</p>
              </div>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-lg font-semibold text-zinc-900">GHS</span>
                <span className="text-4xl font-extrabold text-zinc-900 tracking-tight">{price}</span>
                <span className="text-xs text-zinc-500 ml-1">{period}</span>
              </div>

              {/* Feature Checklist */}
              <ul className="space-y-3 text-sm text-zinc-900 flex-1 border-t border-zinc-200 pt-6 mb-8">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span className="text-xs md:text-sm text-zinc-600">{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() =>
                  handleUpgrade(
                    plan.name,
                    cycle === 'monthly' ? `GHS ${plan.monthlyPrice}/mo` : `GHS ${plan.annualPrice}/yr`
                  )
                }
                className={`w-full py-3 rounded-xl text-sm font-bold transition ${
                  plan.isPopular
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border border-zinc-200'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Security Guarantee Strip */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-2">
        <h4 className="text-sm font-semibold text-zinc-900">🔒 Bank-Grade Encryption &amp; Security</h4>
        <p className="text-xs text-zinc-500 max-w-lg mx-auto">
          All subscriptions and transaction data are protected by 256-bit SSL encryption. Zero card details stored on our servers.
        </p>
      </div>

      {/* FAQ Section */}
      <div className="space-y-4 max-w-3xl mx-auto">
        <h3 className="text-xl font-bold text-zinc-900 text-center">Frequently Asked Questions</h3>
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isExpanded = expandedFaq === idx;
            return (
              <div
                key={idx}
                onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                className="bg-white border border-zinc-200 rounded-xl p-4 cursor-pointer hover:border-zinc-400 transition"
              >
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold text-zinc-900">{faq.q}</h4>
                  <span className="text-xs text-zinc-500 font-bold">{isExpanded ? '−' : '+'}</span>
                </div>
                {isExpanded && <p className="text-xs text-zinc-600 mt-2 leading-relaxed">{faq.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
