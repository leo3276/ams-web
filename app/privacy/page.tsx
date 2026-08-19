'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface2 px-4 py-12">
      <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-border">
        <Link href="/" className="text-xs font-semibold text-accentText hover:underline mb-6 inline-block">
          ← Back to AMS
        </Link>

        <h1 className="text-3xl font-extrabold text-textPrimary mb-2">Privacy Policy</h1>
        <p className="text-xs text-textSecondary mb-8">Effective Date: January 1, 2026 · Copyright © 2026 AMS. All rights reserved.</p>

        <div className="space-y-6 text-sm text-textPrimary leading-relaxed">
          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">1. Information We Collect</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              We collect user account information (such as name and email address) and business bookkeeping data (receipt images, transactions, invoice records, and inventory listings) strictly to deliver the AMS accounting software service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">2. Data Protection &amp; Security</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              All financial data is stored securely using encrypted cloud database connections (TLS/SSL encryption and row-level security). We never sell, monetize, or lease your private accounting entries.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">3. AI Processing Notice</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              Receipt and invoice images uploaded for Vision OCR extraction are processed securely to extract line items and totals, and are never shared with unauthorized third parties.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-textPrimary mb-1">4. Your Rights</h2>
            <p className="text-textSecondary text-xs leading-relaxed">
              You have full rights to export your data at any time via CSV or PDF statements, and you can request account data deletion at any time.
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
