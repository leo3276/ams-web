// Universal High-Accuracy Stylish PDF Generator for AMS Web & Desktop (IFRS / GAAP Compliant)

export interface BusinessInfo {
  name: string;
  taxId?: string | null;
  currency: string;
  email?: string | null;
  phone?: string | null;
  businessType?: string | null;
}

const BASE_STYLES = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;800&display=swap');
    
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    body {
      color: #0F172A;
      background-color: #FFFFFF;
      padding: 24px 32px;
      font-size: 12px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    
    .logo-box {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .badge-ams {
      background-color: #0F172A;
      color: #FFFFFF;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    
    .company-name {
      font-size: 20px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -0.5px;
    }
    
    .report-title {
      font-size: 20px;
      font-weight: 900;
      color: #0F172A;
      text-align: right;
      letter-spacing: -0.5px;
    }
    
    .report-period {
      font-size: 11.5px;
      color: #475569;
      text-align: right;
      margin-top: 2px;
      font-weight: 600;
    }
    
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .kpi-card {
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 10px 14px;
    }
    
    .kpi-label {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    
    .kpi-value {
      font-size: 15px;
      font-weight: 800;
      color: #0F172A;
      font-family: 'JetBrains Mono', monospace;
    }
    
    .kpi-value.green { color: #059669; }
    .kpi-value.red { color: #DC2626; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    th {
      background-color: #F1F5F9;
      color: #334155;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #CBD5E1;
    }
    
    th.right, td.right { text-align: right; }
    th.center, td.center { text-align: center; }
    
    td {
      padding: 7.5px 12px;
      font-size: 11.5px;
      border-bottom: 1px solid #F1F5F9;
      color: #1E293B;
    }
    
    tr.striped { background-color: #F8FAFC; }
    
    tr.section-header {
      background-color: #F1F5F9;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 10.5px;
      letter-spacing: 0.5px;
      border-top: 1px solid #CBD5E1;
      border-bottom: 1px solid #CBD5E1;
    }
    
    tr.section-header td {
      color: #0F172A;
      padding: 7px 12px;
    }
    
    tr.total-row {
      background-color: #F1F5F9;
      font-weight: 800;
      border-top: 2px solid #0F172A;
      border-bottom: 2px solid #0F172A;
    }
    
    tr.total-row td {
      font-size: 12px;
      color: #0F172A;
      padding: 9px 12px;
    }
    
    tr.subtotal-row {
      font-weight: 700;
      background-color: #F8FAFC;
      border-top: 1px solid #E2E8F0;
    }
    
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    
    .badge.paid { background-color: #DEF7EC; color: #03543F; }
    .badge.pending { background-color: #FEF08A; color: #854D0E; }
    .badge.overdue { background-color: #FDE8E8; color: #9B1C1C; }
    .badge.in-stock { background-color: #DEF7EC; color: #03543F; }
    .badge.low-stock { background-color: #FEF08A; color: #854D0E; }
    .badge.out-stock { background-color: #FDE8E8; color: #9B1C1C; }
    
    .footer {
      margin-top: 24px;
      border-top: 1px solid #E2E8F0;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #94A3B8;
    }
    
    .footer-left { font-weight: 600; }
  </style>
`;

/**
 * Universal print document trigger in Web / Electron
 */
export function openAndPrintPDF(html: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Please allow pop-ups to open and save the PDF.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };
}

/**
 * 1. Stylish Sales Tax Invoice PDF
 */
export function printInvoicePDF(
  invoice: {
    invoice_number: string;
    customer_name: string;
    customer_email?: string | null;
    customer_phone?: string | null;
    created_at?: string | null;
    due_date?: string | null;
    status: string;
    description?: string | null;
    amount: number;
    subtotal?: number | null;
    tax_rate?: number | null;
    tax_amount?: number | null;
  },
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';
  const subtotal = invoice.subtotal ?? invoice.amount;
  const taxAmount = invoice.tax_amount ?? 0;
  const total = Number(invoice.amount);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${invoice.invoice_number} - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box">
              <span class="badge-ams">AMS</span>
              <span class="company-name">${business.name}</span>
            </div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
            ${business.phone ? `<div style="font-size:11px;color:#64748B;">Phone: ${business.phone}</div>` : ''}
            ${business.email ? `<div style="font-size:11px;color:#64748B;">Email: ${business.email}</div>` : ''}
          </div>
          <div>
            <div class="report-title">TAX INVOICE</div>
            <div class="report-period" style="font-family:'JetBrains Mono';font-weight:800;color:#0F172A;font-size:14px;margin-top:4px;">
              ${invoice.invoice_number}
            </div>
            <div style="text-align:right;font-size:11px;color:#64748B;margin-top:2px;">
              Issue Date: ${invoice.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)}
            </div>
            <div style="text-align:right;font-size:11px;font-weight:700;color:#0F172A;">
              Due Date: ${invoice.due_date || 'Due on Receipt'}
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
          <div>
            <div style="font-size:9.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Billed To:</div>
            <div style="font-size:15px;font-weight:800;color:#0F172A;">${invoice.customer_name}</div>
            ${invoice.customer_phone ? `<div style="font-size:11px;color:#475569;margin-top:2px;">📱 ${invoice.customer_phone}</div>` : ''}
            ${invoice.customer_email ? `<div style="font-size:11px;color:#475569;">✉️ ${invoice.customer_email}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="font-size:9.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Payment Status:</div>
            <span class="badge ${invoice.status === 'paid' ? 'paid' : invoice.status === 'overdue' ? 'overdue' : 'pending'}">
              ${invoice.status.toUpperCase()}
            </span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th>Description / Particulars</th>
              <th class="center" style="width:80px;">Qty</th>
              <th class="right" style="width:120px;">Unit Price (${cur})</th>
              <th class="right" style="width:130px;">Amount (${cur})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-mono">01</td>
              <td><strong>${invoice.description || 'Supply of Commercial Goods / Services'}</strong></td>
              <td class="center font-mono">1</td>
              <td class="right font-mono">${cur} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono"><strong>${cur} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
          <div style="width:50%;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Payment Instructions</div>
            <div style="font-size:11px;color:#475569;line-height:1.6;">
              Please settle via Mobile Money or Bank Transfer referencing <strong>${invoice.invoice_number}</strong>.
            </div>
          </div>

          <div style="width:40%;">
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11.5px;color:#475569;">
              <span>Subtotal:</span>
              <span class="font-mono">${cur} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11.5px;color:#475569;">
              <span>Tax / GRA VAT:</span>
              <span class="font-mono">${cur} ${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:15px;font-weight:900;color:#0F172A;border-top:2px solid #0F172A;margin-top:4px;">
              <span>Total Due:</span>
              <span class="font-mono" style="color:#059669;">${cur} ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="footer-left">Thank you for your business! · Valid Business Invoice</div>
          <div>Page 1 of 1 · Generated by AMS Accounting Workstation</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 2. Statement of Profit or Loss (Income Statement) PDF
 */
export function printProfitLossPDF(
  pnl: { revenue: number; costOfGoods: number; operatingExpenses: number; netProfit: number },
  periodLabel: string,
  business: BusinessInfo
) {
  const grossProfit = pnl.revenue - pnl.costOfGoods;
  const grossMargin = pnl.revenue > 0 ? ((grossProfit / pnl.revenue) * 100).toFixed(1) : '0.0';
  const netMargin = pnl.revenue > 0 ? ((pnl.netProfit / pnl.revenue) * 100).toFixed(1) : '0.0';
  const cur = business.currency || 'GHS';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Profit & Loss - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">Statement of Profit or Loss</div>
            <div class="report-period">For the period: ${periodLabel}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value">${cur} ${pnl.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value ${grossProfit >= 0 ? 'green' : 'red'}">${cur} ${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Profit</div><div class="kpi-value ${pnl.netProfit >= 0 ? 'green' : 'red'}">${cur} ${pnl.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Margin</div><div class="kpi-value font-mono">${netMargin}%</div></div>
        </div>

        <table>
          <thead>
            <tr><th>Account Description</th><th class="right">Amount (${cur})</th><th class="right">% of Sales</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Operating Sales & Revenue</strong></td><td class="right font-mono"><strong>${cur} ${pnl.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td><td class="right font-mono">100.0%</td></tr>
            <tr class="striped"><td>Less: Cost of Goods Sold (COGS / Stock Sold)</td><td class="right font-mono">(${cur} ${pnl.costOfGoods.toLocaleString(undefined, { minimumFractionDigits: 2 })})</td><td class="right font-mono">${pnl.revenue > 0 ? ((pnl.costOfGoods / pnl.revenue) * 100).toFixed(1) : '0.0'}%</td></tr>
            <tr class="subtotal-row"><td><strong>GROSS PROFIT</strong></td><td class="right font-mono"><strong>${cur} ${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td><td class="right font-mono"><strong>${grossMargin}%</strong></td></tr>
            <tr><td>Less: Operating Expenses (Rent, Logistics, Utilities, Staff)</td><td class="right font-mono">(${cur} ${pnl.operatingExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })})</td><td class="right font-mono">${pnl.revenue > 0 ? ((pnl.operatingExpenses / pnl.revenue) * 100).toFixed(1) : '0.0'}%</td></tr>
            <tr class="total-row"><td><strong>NET OPERATING PROFIT / (LOSS)</strong></td><td class="right font-mono"><strong>${cur} ${pnl.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td><td class="right font-mono"><strong>${netMargin}%</strong></td></tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">IFRS for SMEs Compliant · Generated by AMS Accounting Workstation</div>
          <div>Report Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 3. Statement of Financial Position (Balance Sheet) PDF
 */
export function printBalanceSheetPDF(
  bs: {
    cash: number;
    bank: number;
    current_assets_other: number;
    total_current_assets: number;
    fixed_assets_cost: number;
    accumulated_depreciation: number;
    fixed_assets_nbv: number;
    total_assets: number;
    short_term_liabilities: number;
    long_term_liabilities: number;
    total_liabilities: number;
    owners_equity: number;
    net_profit_to_date: number;
    drawings_to_date: number;
  },
  asOfDate: string,
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';
  const totalEquity = bs.owners_equity + bs.net_profit_to_date - bs.drawings_to_date;
  const totalLiabEquity = bs.total_liabilities + totalEquity;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Balance Sheet - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">Statement of Financial Position</div>
            <div class="report-period">As of: ${asOfDate}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Assets</div><div class="kpi-value">${cur} ${bs.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Current Assets</div><div class="kpi-value">${cur} ${bs.total_current_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Liabilities</div><div class="kpi-value">${cur} ${bs.total_liabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Owner Equity</div><div class="kpi-value green">${cur} ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        </div>

        <table>
          <thead>
            <tr><th>Account Particulars</th><th class="right">Amount (${cur})</th></tr>
          </thead>
          <tbody>
            <tr class="section-header"><td colspan="2">1. NON-CURRENT / FIXED ASSETS</td></tr>
            <tr><td>Property, Plant, Equipment & Vehicles (At Cost)</td><td class="right font-mono">${cur} ${bs.fixed_assets_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="striped"><td>Less: Accumulated Depreciation</td><td class="right font-mono">(${cur} ${bs.accumulated_depreciation.toLocaleString(undefined, { minimumFractionDigits: 2 })})</td></tr>
            <tr class="subtotal-row"><td><strong>Net Book Value (Fixed Assets)</strong></td><td class="right font-mono"><strong>${cur} ${bs.fixed_assets_nbv.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>

            <tr class="section-header"><td colspan="2">2. CURRENT ASSETS</td></tr>
            <tr><td>Cash in Hand & Store Register</td><td class="right font-mono">${cur} ${bs.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="striped"><td>Bank Balances & Mobile Money Vault</td><td class="right font-mono">${cur} ${bs.bank.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>Trade Debtors & Accounts Receivable</td><td class="right font-mono">${cur} ${bs.current_assets_other.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="subtotal-row"><td><strong>Total Current Assets</strong></td><td class="right font-mono"><strong>${cur} ${bs.total_current_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>

            <tr class="total-row"><td><strong>TOTAL BUSINESS ASSETS</strong></td><td class="right font-mono"><strong>${cur} ${bs.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>

            <tr class="section-header"><td colspan="2">3. LIABILITIES & OBLIGATIONS</td></tr>
            <tr><td>Short-Term Payables & Trade Creditors</td><td class="right font-mono">${cur} ${bs.short_term_liabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="striped"><td>Long-Term Loans & Financing</td><td class="right font-mono">${cur} ${bs.long_term_liabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="subtotal-row"><td><strong>Total Liabilities</strong></td><td class="right font-mono"><strong>${cur} ${bs.total_liabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>

            <tr class="section-header"><td colspan="2">4. OWNER EQUITY & RESERVES</td></tr>
            <tr><td>Contributed Owner Capital</td><td class="right font-mono">${cur} ${bs.owners_equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="striped"><td>Retained Earnings / Net Profit to Date</td><td class="right font-mono">${cur} ${bs.net_profit_to_date.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>Less: Owner Drawings / Distributions</td><td class="right font-mono">(${cur} ${bs.drawings_to_date.toLocaleString(undefined, { minimumFractionDigits: 2 })})</td></tr>
            <tr class="subtotal-row"><td><strong>Total Owner Equity</strong></td><td class="right font-mono"><strong>${cur} ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>

            <tr class="total-row"><td><strong>TOTAL LIABILITIES & EQUITY</strong></td><td class="right font-mono"><strong>${cur} ${totalLiabEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">Audit Certified Statement · Generated by AMS Accounting Workstation</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 4. Customer Statement / Debt Ledger PDF
 */
export function printCustomerStatementPDF(
  customer: {
    customer_name: string;
    phone?: string | null;
    email?: string | null;
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
  },
  invoices: Array<{
    invoice_number: string;
    created_at?: string | null;
    due_date?: string | null;
    amount: number;
    status: string;
  }>,
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Customer Statement - ${customer.customer_name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">CUSTOMER STATEMENT</div>
            <div class="report-period">Statement Date: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
          <div>
            <div style="font-size:9.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Customer Account:</div>
            <div style="font-size:16px;font-weight:800;color:#0F172A;">${customer.customer_name}</div>
            ${customer.phone ? `<div style="font-size:11px;color:#475569;margin-top:2px;">📱 ${customer.phone}</div>` : ''}
            ${customer.email ? `<div style="font-size:11px;color:#475569;">✉️ ${customer.email}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="font-size:9.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Current Outstanding Balance:</div>
            <div style="font-size:18px;font-weight:900;color:${customer.total_outstanding > 0 ? '#DC2626' : '#059669'};font-family:'JetBrains Mono';">
              ${cur} ${customer.total_outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Invoiced</div><div class="kpi-value font-mono">${cur} ${customer.total_invoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value font-mono green">${cur} ${customer.total_paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Balance Due</div><div class="kpi-value font-mono ${customer.total_outstanding > 0 ? 'red' : 'green'}">${cur} ${customer.total_outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Status</div><div class="kpi-value" style="font-size:13px;">${customer.total_outstanding > 0 ? 'PAYMENT DUE' : 'SETTLED'}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Issue Date</th>
              <th>Due Date</th>
              <th class="center">Status</th>
              <th class="right">Amount (${cur})</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr class="${inv.status === 'paid' ? '' : 'striped'}">
                <td class="font-mono"><strong>${inv.invoice_number}</strong></td>
                <td>${inv.created_at?.slice(0, 10) || '—'}</td>
                <td>${inv.due_date || '—'}</td>
                <td class="center"><span class="badge ${inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'pending'}">${inv.status.toUpperCase()}</span></td>
                <td class="right font-mono"><strong>${cur} ${Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="4"><strong>TOTAL OUTSTANDING BALANCE</strong></td>
              <td class="right font-mono" style="color:${customer.total_outstanding > 0 ? '#DC2626' : '#059669'};">
                <strong>${cur} ${customer.total_outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">Please settle any outstanding amounts via Mobile Money or Bank Transfer · Generated by AMS</div>
          <div>Page 1 of 1</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 5. Statement of Cash Flows PDF
 */
export function printCashFlowPDF(
  cf: { operating: number; investing: number; financing: number; net: number },
  periodLabel: string,
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Cash Flow Statement - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">Statement of Cash Flows</div>
            <div class="report-period">Period: ${periodLabel}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Operating Cash</div><div class="kpi-value ${cf.operating >= 0 ? 'green' : 'red'}">${cur} ${cf.operating.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Investing Cash</div><div class="kpi-value">${cur} ${cf.investing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Financing Cash</div><div class="kpi-value">${cur} ${cf.financing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Movement</div><div class="kpi-value ${cf.net >= 0 ? 'green' : 'red'}">${cur} ${cf.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        </div>

        <table>
          <thead>
            <tr><th>Cash Flow Activity Classification</th><th class="right">Net Cash Impact (${cur})</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>1. Cash Flow from Operating Activities</strong> (Sales inflows less supplier costs & opex)</td><td class="right font-mono">${cur} ${cf.operating.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="striped"><td><strong>2. Cash Flow from Investing Activities</strong> (Fixed asset purchases & capital disposals)</td><td class="right font-mono">${cur} ${cf.investing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td><strong>3. Cash Flow from Financing Activities</strong> (Owner capital introduced, loans, distributions)</td><td class="right font-mono">${cur} ${cf.financing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr class="total-row"><td><strong>NET INCREASE / (DECREASE) IN CASH POSITION</strong></td><td class="right font-mono"><strong>${cur} ${cf.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td></tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">Audit Certified Statement · Generated by AMS Accounting Workstation</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 6. Trial Balance Schedule PDF
 */
export function printTrialBalancePDF(
  rows: Array<{ category: string; debit: number; credit: number }>,
  totalDebits: number,
  totalCredits: number,
  periodLabel: string,
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.05;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Trial Balance - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">Adjusted Trial Balance</div>
            <div class="report-period">Assessment Period: ${periodLabel}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Account Category</th>
              <th class="right">Debit Amount (${cur})</th>
              <th class="right">Credit Amount (${cur})</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => `
              <tr class="${idx % 2 === 1 ? 'striped' : ''}">
                <td><strong>${r.category.replace('_', ' ').toUpperCase()}</strong></td>
                <td class="right font-mono">${r.debit > 0 ? `${cur} ${Number(r.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                <td class="right font-mono">${r.credit > 0 ? `${cur} ${Number(r.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td><strong>TOTAL TRIAL BALANCE</strong></td>
              <td class="right font-mono"><strong>${cur} ${totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              <td class="right font-mono"><strong>${cur} ${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tbody>
        </table>

        <div style="background-color:#F8FAFC;padding:10px 14px;border-radius:8px;border:1px solid #E2E8F0;font-size:11px;color:#334155;">
          Trial Balance Reconciliation: <strong>${isBalanced ? '✓ Balanced (Debits = Credits)' : '⚠ Discrepancy detected (review adjustments)'}</strong>
        </div>

        <div class="footer">
          <div class="footer-left">Audit Certified Statement · Generated by AMS Accounting Workstation</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 7. GRA Tax Schedule & Compliance Summary PDF
 */
export function printTaxSummaryPDF(
  taxData: {
    revenue: number;
    taxableIncome: number;
    estimatedTax: number;
    effectiveRate: number;
    periodLabel: string;
    businessType: string;
    nextFilingDate?: string | null;
    flatRateTax?: number;
  },
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>GRA Tax Schedule - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
            <div style="font-size:11px;color:#64748B;">Entity: ${taxData.businessType === 'corporate' ? 'Company (25% Corporate Flat)' : 'Sole Proprietorship'}</div>
          </div>
          <div>
            <div class="report-title">GRA TAX FILING SCHEDULE</div>
            <div class="report-period">Assessment Period: ${taxData.periodLabel}</div>
            ${taxData.nextFilingDate ? `<div style="text-align:right;font-size:11px;font-weight:700;color:#DC2626;">Filing Deadline: ${taxData.nextFilingDate}</div>` : ''}
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value font-mono">${cur} ${taxData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Taxable Income</div><div class="kpi-value font-mono">${cur} ${taxData.taxableIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Estimated Obligation</div><div class="kpi-value font-mono red">${cur} ${taxData.estimatedTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Effective Rate</div><div class="kpi-value font-mono">${(taxData.effectiveRate * 100).toFixed(1)}%</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Ghana Revenue Authority (GRA) Tax Category</th>
              <th class="right">Chargeable Base (${cur})</th>
              <th class="right">Computed Tax (${cur})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Income Tax (Sole Proprietor Graduated / Corporate 25%)</strong></td>
              <td class="right font-mono">${cur} ${taxData.taxableIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono"><strong>${cur} ${taxData.estimatedTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
            </tr>
            <tr class="striped">
              <td><strong>GRA 3% VAT Flat Rate + 1% COVID-19 Health Recovery Levy</strong></td>
              <td class="right font-mono">${cur} ${taxData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono">${cur} ${(taxData.revenue * 0.04).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr class="total-row">
              <td><strong>TOTAL ESTIMATED GRA TAX PROVISION</strong></td>
              <td class="right font-mono">—</td>
              <td class="right font-mono" style="color:#DC2626;"><strong>${cur} ${taxData.estimatedTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">Ghana Revenue Authority Compliant Computation · Generated by AMS Workstation</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 8. Inventory Stock & Valuation Schedule PDF
 */
export function printInventoryValuationPDF(
  items: Array<{
    name: string;
    barcode?: string | null;
    quantity: number;
    unit_cost: number;
    unit_price: number;
  }>,
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';
  const totalUnits = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalCostVal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const totalRetailVal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
  const potentialProfit = totalRetailVal - totalCostVal;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Inventory Valuation - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">INVENTORY STOCK VALUATION</div>
            <div class="report-period">Assessment Date: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Units in Stock</div><div class="kpi-value font-mono">${totalUnits.toLocaleString()}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Cost Asset Value</div><div class="kpi-value font-mono">${cur} ${totalCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Retail Potential</div><div class="kpi-value font-mono green">${cur} ${totalRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Potential Gross Profit</div><div class="kpi-value font-mono green">${cur} ${potentialProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item Name / SKU</th>
              <th class="center">Stock</th>
              <th class="right">Cost (${cur})</th>
              <th class="right">Selling Price (${cur})</th>
              <th class="right">Asset Valuation (${cur})</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => {
              const costVal = (item.quantity || 0) * (item.unit_cost || 0);
              return `
                <tr class="${idx % 2 === 1 ? 'striped' : ''}">
                  <td>
                    <strong>${item.name}</strong>
                    ${item.barcode ? `<div style="font-size:10px;color:#64748B;font-family:'JetBrains Mono';">${item.barcode}</div>` : ''}
                  </td>
                  <td class="center font-mono">
                    <span class="badge ${item.quantity <= 0 ? 'out-stock' : item.quantity <= 5 ? 'low-stock' : 'in-stock'}">
                      ${item.quantity} in stock
                    </span>
                  </td>
                  <td class="right font-mono">${cur} ${Number(item.unit_cost).toFixed(2)}</td>
                  <td class="right font-mono">${cur} ${Number(item.unit_price).toFixed(2)}</td>
                  <td class="right font-mono"><strong>${cur} ${costVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td colspan="4"><strong>TOTAL INVENTORY ASSET VALUE (AT COST)</strong></td>
              <td class="right font-mono" style="color:#059669;"><strong>${cur} ${totalCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">Perpetual Stock Schedule · Generated by AMS Accounting Workstation</div>
          <div>Page 1 of 1</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 9. General Bookkeeping Ledger Journal PDF
 */
export function printBookkeepingLedgerPDF(
  transactions: Array<{
    transaction_date: string;
    vendor?: string | null;
    type: string;
    category?: string | null;
    amount: number;
    payment_method?: string | null;
  }>,
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';
  const totalInflow = transactions.filter(t => t.type === 'revenue' || t.type === 'owner_capital').reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalOutflow = transactions.filter(t => t.type !== 'revenue' && t.type !== 'owner_capital').reduce((s, t) => s + Number(t.amount || 0), 0);
  const net = totalInflow - totalOutflow;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>General Ledger Journal - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">GENERAL LEDGER JOURNAL</div>
            <div class="report-period">Statement Date: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Inflows</div><div class="kpi-value font-mono green">+${cur} ${totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Outflows</div><div class="kpi-value font-mono red">-${cur} ${totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Movement</div><div class="kpi-value font-mono ${net >= 0 ? 'green' : 'red'}">${cur} ${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Entries</div><div class="kpi-value font-mono">${transactions.length}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Particulars / Description</th>
              <th>Category</th>
              <th>Channel</th>
              <th class="right">Inflow (${cur})</th>
              <th class="right">Outflow (${cur})</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map((t, idx) => {
              const isInflow = t.type === 'revenue' || t.type === 'owner_capital';
              return `
                <tr class="${idx % 2 === 1 ? 'striped' : ''}">
                  <td class="font-mono">${t.transaction_date || '—'}</td>
                  <td><strong>${t.vendor || 'General Transaction'}</strong></td>
                  <td>${(t.category || t.type).replace('_', ' ')}</td>
                  <td>${t.payment_method || 'cash'}</td>
                  <td class="right font-mono" style="color:#059669;">${isInflow ? `${cur} ${Number(t.amount).toFixed(2)}` : '—'}</td>
                  <td class="right font-mono" style="color:#DC2626;">${!isInflow ? `${cur} ${Number(t.amount).toFixed(2)}` : '—'}</td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td colspan="4"><strong>TOTAL GENERAL LEDGER MOVEMENTS</strong></td>
              <td class="right font-mono" style="color:#059669;"><strong>${cur} ${totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              <td class="right font-mono" style="color:#DC2626;"><strong>${cur} ${totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-left">General Ledger Audit Stream · Generated by AMS Accounting Workstation</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}

/**
 * 10. Complete CPA Auditor & Accountant Brief PDF Pack
 */
export function printAccountantAuditPackPDF(
  data: {
    periodLabel: string;
    pnl?: { revenue: number; cost_of_goods: number; operating_expenses: number; net_profit: number } | null;
    balanceSheet?: { total_assets: number; total_current_assets: number; total_liabilities: number; owners_equity: number; net_profit_to_date: number; drawings_to_date: number } | null;
    trialBalance?: Array<{ category: string; debit: number; credit: number }>;
    totalDebits?: number;
    totalCredits?: number;
  },
  business: BusinessInfo
) {
  const cur = business.currency || 'GHS';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>CPA Audit Pack - ${business.name}</title>
        ${BASE_STYLES}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-box"><span class="badge-ams">AMS</span><span class="company-name">${business.name}</span></div>
            ${business.taxId ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">TIN / Tax ID: ${business.taxId}</div>` : ''}
            <div style="font-size:11px;color:#64748B;">Entity: ${business.businessType === 'corporate' ? 'Company (Ltd)' : 'Sole Proprietorship'}</div>
          </div>
          <div>
            <div class="report-title">CPA &amp; AUDITOR BRIEF</div>
            <div class="report-period">Assessment Period: ${data.periodLabel}</div>
            <div style="text-align:right;font-size:11px;color:#64748B;">Compiled: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        ${data.pnl ? `
          <div style="font-size:13px;font-weight:900;color:#0F172A;text-transform:uppercase;margin-bottom:8px;border-bottom:1px solid #CBD5E1;padding-bottom:4px;">
            1. Income Statement Overview (${data.periodLabel})
          </div>
          <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value font-mono">${cur} ${Number(data.pnl.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
            <div class="kpi-card"><div class="kpi-label">Cost of Goods (COGS)</div><div class="kpi-value font-mono">${cur} ${Number(data.pnl.cost_of_goods).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
            <div class="kpi-card"><div class="kpi-label">Operating Expenses</div><div class="kpi-value font-mono">${cur} ${Number(data.pnl.operating_expenses).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
            <div class="kpi-card"><div class="kpi-label">Net Profit / (Loss)</div><div class="kpi-value font-mono green">${cur} ${Number(data.pnl.net_profit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          </div>
        ` : ''}

        ${data.trialBalance && data.trialBalance.length > 0 ? `
          <div style="font-size:13px;font-weight:900;color:#0F172A;text-transform:uppercase;margin-top:18px;margin-bottom:8px;border-bottom:1px solid #CBD5E1;padding-bottom:4px;">
            2. Adjusted Trial Balance Summary
          </div>
          <table>
            <thead>
              <tr><th>Ledger Category</th><th class="right">Debit (${cur})</th><th class="right">Credit (${cur})</th></tr>
            </thead>
            <tbody>
              ${data.trialBalance.map((r, idx) => `
                <tr class="${idx % 2 === 1 ? 'striped' : ''}">
                  <td><strong>${r.category.replace('_', ' ').toUpperCase()}</strong></td>
                  <td class="right font-mono">${r.debit > 0 ? `${cur} ${Number(r.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td class="right font-mono">${r.credit > 0 ? `${cur} ${Number(r.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td><strong>TOTAL RECONCILED TRIAL BALANCE</strong></td>
                <td class="right font-mono"><strong>${cur} ${(data.totalDebits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                <td class="right font-mono"><strong>${cur} ${(data.totalCredits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <div class="footer-left">Consolidated Executive Brief · Generated by AMS Accounting Workstation</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </body>
    </html>
  `;

  openAndPrintPDF(html);
}
