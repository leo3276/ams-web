import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://amssoftware.site'),
  title: {
    default: 'AMS Software',
    template: '%s | AMS Software',
  },
  description: 'Smart bookkeeping, invoicing, and financial management for SMEs.',
  applicationName: 'AMS Software',
  authors: [{ name: 'AMS Software' }],
  keywords: [
    'AMS Software',
    'AMS',
    'amssoftware.site',
    'bookkeeping software',
    'accounting software Ghana',
    'POS software',
    'SME financial management',
    'inventory management',
  ],
  alternates: {
    canonical: 'https://amssoftware.site',
  },
  openGraph: {
    type: 'website',
    url: 'https://amssoftware.site',
    title: 'AMS Software',
    description: 'Smart bookkeeping, invoicing, and financial management for SMEs.',
    siteName: 'AMS Software',
    images: [{ url: '/icon.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AMS Software',
    description: 'Smart bookkeeping, invoicing, and financial management for SMEs.',
    images: ['/icon.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'AMS Software',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AMS Software" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}