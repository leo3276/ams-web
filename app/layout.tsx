import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import './globals.css';

export const metadata: Metadata = {
  title: 'AMS — Accounting Made Simple',
  description: 'Bookkeeping and financial reports, made simple.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
