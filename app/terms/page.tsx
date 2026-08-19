'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface2 px-4 py-12">
      <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-border">
        <Link href="/" className="text-xs font-semibold text-accentText hover:underline mb-6 inline-block">
          ← Back to AMS
        </Link>

        <h1 className="text-3xl font-extrabold text-textPrimary mb-2">Terms of Service &amp; Copyright Policy</h1>
        <p className="text-xs text-textSecondary mb-8">Effective Date: January 1, 2026 · Copyright © 2026 AMS. All rights reserved.</p>

        <div className="space-y-6 text-sm text-textPrimary leading-relaxed">
          <section className="bg-gray-50 p-4 rounded-xl border border-border">
            <h2 className="text-base font-bold text-textPrimary mb-1">1. Proprietary Software &amp; Ownership</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              AMS (Accounting Made Simple), including its mobile and web software, user interface design, branding, database architectures, and proprietary algorithms (Gemini AI Vision OCR, barcode lookup, automated statutory tax schedule calculations, and PDF generation engines) are the exclusive intellectual property and copyright of the creator and owner of AMS.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">2. User Data &amp; Accounting Records</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              Users retain 100% full and exclusive ownership over all transactions, financial figures, customer information, invoices, and business records entered into AMS. AMS does not sell or distribute user business data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">3. Usage Restrictions</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              Users may not decompile, reverse-engineer, copy, redistribute, or create unauthorized derivative clones of the AMS software platform without express written authorization from the owner.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">4. Financial &amp; Tax Disclaimer</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              AMS is designed to simplify and automate SME bookkeeping following IFRS/GAAP standards and Ghana Revenue Authority guidelines. It does not replace certified public accountants or statutory auditors for formal corporate audit certifications.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-center text-xs text-textSecondary">
          © 2026 AMS (Accounting Made Simple) · All Rights Reserved
        </div>
      </div>
    </div>
  );
}
