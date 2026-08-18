const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} = require('docx');

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: 'Calibri',
          size: 22, // 11pt
          color: '1A1A18',
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 1440, // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
      children: [
        // Title
        new Paragraph({
          text: 'AMS (Accounting Made Simple)',
          heading: HeadingLevel.TITLE,
          spacing: { after: 120 },
          run: { size: 36, bold: true, color: '0C447C' },
        }),
        new Paragraph({
          text: 'Complete Business Capabilities, System Architecture & User Guide',
          spacing: { after: 200 },
          run: { size: 24, bold: true, color: '378ADD' },
        }),
        new Paragraph({
          text: 'The All-in-One Dual-Platform Financial Operating System for Growing Businesses',
          spacing: { after: 400 },
          run: { size: 20, italics: true, color: '5F5E5A' },
        }),

        // 1. Executive Summary
        new Paragraph({
          text: '1. Executive Summary',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
          run: { bold: true, size: 28, color: '0C447C' },
        }),
        new Paragraph({
          text: 'AMS (Accounting Made Simple) is an enterprise-grade financial management and bookkeeping ecosystem designed specifically for SMEs, entrepreneurs, and fast-growing businesses.',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: 'Historically, business owners have faced a frustrating dilemma: either use overly complicated corporate accounting software requiring specialized accounting degrees, or rely on manual paper notebooks and scattered Excel sheets that lead to tax non-compliance, uncollected debts, and cash flow blind spots.',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: 'AMS permanently solves this through a unified Dual-Platform Architecture:',
          spacing: { after: 80 },
        }),
        new Paragraph({
          text: '• The Native Mobile App (ams-app): Fast, frictionless, on-the-go data capture powered by Vision AI OCR, receipt photo scanning, verbal financial situation reporting, and instant WhatsApp customer billing.',
          spacing: { after: 80 },
        }),
        new Paragraph({
          text: '• The Companion Web Application (ams-web): A powerful desktop workstation featuring keyboard-accelerated spreadsheet bookkeeping, comprehensive stock valuation radars, continuous all-in-one financial statements, and certified accountant audit hubs.',
          spacing: { after: 200 },
        }),

        // 2. Dual-Platform Architecture
        new Paragraph({
          text: '2. Dual-Platform Architecture Overview',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
          run: { bold: true, size: 28, color: '0C447C' },
        }),
        new Paragraph({
          text: 'Both platforms connect directly to a secure, real-time Supabase Cloud Ledger with automated double-entry synthesis. When you snap a receipt on your phone, your desktop books, inventory stock, and trial balance update instantly in real time.',
          spacing: { after: 200 },
        }),

        // 3. Mobile Capabilities
        new Paragraph({
          text: '3. Mobile App Capabilities (ams-app)',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
          run: { bold: true, size: 28, color: '0C447C' },
        }),
        new Paragraph({
          text: 'A. Vision AI OCR & Document Snapping Engine',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Powered by Claude 3.5 Sonnet Vision Intelligence for 1-pass extraction.\n• Snaps single expense receipts (fuel, rent, utility, equipment) and itemized multi-line wholesale inventory restock invoices.\n• Automatically updates catalog stock counts and records expenses in the general ledger.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'B. Safe-to-Spend Liquidity Radar & Cash Runway Forecast',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Shielded Spendable Cash: Automatically reserves 15% for taxes and a 7-day operating overhead buffer from bank/cash totals.\n• 30-Day Cash Runway: Estimates days of runway based on current operating burn.\n• Trapped Capital Radar: Live breakdown of uncollected customer debt and tied-up stock.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'C. Verbal Financial Situation Narrative & AI CFO Story',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Translates complex financial statements into plain spoken English.\n• Identifies revenue expansion/contraction, largest spending culprits (e.g. "Fuel took 42% of budget"), liquidity cushions, and prioritized action items.\n• 1-Tap Share Sheet to export narrative briefs via WhatsApp or Email.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'D. 5-Module Accountant & Audit Hub',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Continuous 4-report review (P&L, Balance Sheet, Cash Flow, Trial Balance).\n• 4 Data Quality Flags: Unsent draft invoices, generic categories, un-depreciated fixed assets, and Trial Balance gap explanation.\n• Receivables aging ledger sorted by most overdue first (daysOverdue).\n• Monthly period close and lock toggles.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'E. Ghana Revenue Authority (GRA) Tax Filing Preparation',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Dual Entity Support: Sole Proprietorship (Graduated Bands) vs Corporate (25% Flat Rate).\n• Slice-by-slice statutory bracket calculation table across all 7 statutory GRA bands.\n• Live deadline countdown and allowable deductions summary.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'F. Enterprise Settings & Multi-File CSV Export Center',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Business profile, TIN, MoMo payment settings, and banking details.\n• 1-Click CSV exports for General Ledger, Inventory Catalog, and Invoices.',
          spacing: { after: 200 },
        }),

        // 4. Companion Web Capabilities
        new Paragraph({
          text: '4. Companion Web Portal Capabilities (ams-web)',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
          run: { bold: true, size: 28, color: '0C447C' },
        }),
        new Paragraph({
          text: 'A. Executive Financial Dashboard (/dashboard)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Desktop Safe-to-Spend hero banner with cash runway and trapped capital widgets.\n• Core monthly KPI grid (Revenue, COGS, OpEx, Net Profit, Margin %).\n• Recent activity feed and fast action shortcuts.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'B. Full Invoicing & Billing Studio (/invoices)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Multi-line item builder with real-time Inventory Item Picker (auto-fills prices and displays available stock).\n• Printable Branded PDF layout ready for browser Print/Save as PDF.\n• 1-Click WhatsApp payment reminders and 1-tap Mark Paid ledger sync.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'C. Spreadsheet Fast-Entry Bookkeeping & General Ledger (/bookkeeping)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Keyboard-accelerated tab editing row with automatic database auto-save.\n• Valuation summary strip (Total Inflows, Outflows, Net Cash Movement).\n• Category/type filter pills, search bar, and 1-click General Ledger CSV export.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'D. Inventory Management & Stock Valuation Radar (/inventory)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Real-time stock valuation at cost and retail valuation.\n• Live margin % and unit profit column for every product.\n• Filter chips (All, Low Stock, Out of Stock, In Stock) and CSV export.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'E. Financial Reports & Statements (/reports)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Continuous All-in-One Accountant Sheet (P&L, Balance Sheet, Cash Flow, Trial Balance in one continuous view).\n• Period presets (Month, Quarter, Year), 1-click package export, and print/PDF layout.',
          spacing: { after: 140 },
        }),

        new Paragraph({
          text: 'F. Web Accountant Dashboard (/accountant) & Tax Prep (/tax)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          run: { bold: true, size: 24, color: '1A1A18' },
        }),
        new Paragraph({
          text: '• Debits vs credits sanity check (Delta = 0 balance indicator).\n• Debt aging ledger sorted by most overdue first.\n• Full GRA statutory tax bracket schedule calculation and printable tax handoff.',
          spacing: { after: 200 },
        }),

        // 5. Accounting Philosophy
        new Paragraph({
          text: '5. The Single-Ledger Double-Entry Philosophy',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
          run: { bold: true, size: 28, color: '0C447C' },
        }),
        new Paragraph({
          text: 'AMS eliminates the confusion of manual debit/credit journal entries. Business owners record single events (e.g. Fuel GHS 100 via Cash), and the AMS engine automatically synthesizes balanced double-entry debits/credits in the cloud, guaranteeing balanced balance sheets and audit-ready trial balances without manual accounting effort.',
          spacing: { after: 200 },
        }),

        // 6. Tax Table
        new Paragraph({
          text: '6. Ghana Statutory Tax Schedule (GRA)',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
          run: { bold: true, size: 28, color: '0C447C' },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: 'Tax Band', run: { bold: true } })], shading: { fill: 'E6F1FB', type: ShadingType.CLEAR } }),
                new TableCell({ children: [new Paragraph({ text: 'Slice Amount (GHS)', run: { bold: true } })], shading: { fill: 'E6F1FB', type: ShadingType.CLEAR } }),
                new TableCell({ children: [new Paragraph({ text: 'Statutory Rate', run: { bold: true } })], shading: { fill: 'E6F1FB', type: ShadingType.CLEAR } }),
              ],
            }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'First Band' })] }), new TableCell({ children: [new Paragraph({ text: 'First GHS 5,880' })] }), new TableCell({ children: [new Paragraph({ text: '0% (Tax-Free Allowance)' })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Second Band' })] }), new TableCell({ children: [new Paragraph({ text: 'Next GHS 1,200' })] }), new TableCell({ children: [new Paragraph({ text: '5%' })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Third Band' })] }), new TableCell({ children: [new Paragraph({ text: 'Next GHS 6,000' })] }), new TableCell({ children: [new Paragraph({ text: '10%' })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Fourth Band' })] }), new TableCell({ children: [new Paragraph({ text: 'Next GHS 24,000' })] }), new TableCell({ children: [new Paragraph({ text: '17.5%' })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Fifth Band' })] }), new TableCell({ children: [new Paragraph({ text: 'Next GHS 24,000' })] }), new TableCell({ children: [new Paragraph({ text: '25%' })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Sixth Band' })] }), new TableCell({ children: [new Paragraph({ text: 'Next GHS 178,920' })] }), new TableCell({ children: [new Paragraph({ text: '30%' })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: 'Exceeding Band' })] }), new TableCell({ children: [new Paragraph({ text: 'Above GHS 240,000' })] }), new TableCell({ children: [new Paragraph({ text: '35%' })] })] }),
          ],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outputPath = 'C:\\Users\\Administrator\\Desktop\\AMS_COMPLETE_CAPABILITIES_AND_BUSINESS_GUIDE.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log('Successfully generated Word Document at:', outputPath);
});
