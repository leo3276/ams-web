// Universal PDF Document & Print Generator for AMS Web
export interface BusinessInfo {
  name: string;
  taxId?: string | null;
  currency: string;
  email?: string | null;
  phone?: string | null;
}

export function printDocumentHtml(html: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=750');
  if (!printWindow) {
    alert('Please allow popups to export and print PDF reports.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 350);
}

const BASE_STYLES = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; }
    body { color: #111827; background-color: #FFFFFF; padding: 32px 40px; font-size: 13px; line-height: 1.5; }
    @media print { body { padding: 15mm; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 20px; }
    .badge-ams { background-color: #111827; color: #FFFFFF; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 900; }
    .company-name { font-size: 20px; font-weight: 900; color: #111827; }
    .report-title { font-size: 22px; font-weight: 900; color: #111827; text-align: right; }
    .report-period { font-size: 12px; color: #4B5563; text-align: right; margin-top: 2px; font-weight: 600; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi-card { background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; }
    .kpi-label { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; }
    .kpi-value { font-size: 16px; font-weight: 800; color: #111827; }
    .kpi-value.green { color: #059669; }
    .kpi-value.red { color: #DC2626; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background-color: #F3F4F6; color: #374151; font-size: 10.5px; font-weight: 800; text-transform: uppercase; padding: 9px 12px; text-align: left; border-bottom: 1px solid #D1D5DB; }
    th.right, td.right { text-align: right; }
    th.center, td.center { text-align: center; }
    td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #F3F4F6; }
    tr.striped { background-color: #FAFAFA; }
    tr.total-row { background-color: #F3F4F6; font-weight: 800; border-top: 2px solid #111827; border-bottom: 2px solid #111827; }
    tr.total-row td { font-size: 13px; color: #111827; padding: 10px 12px; }
    tr.subtotal-row { font-weight: 700; background-color: #F9FAFB; border-top: 1px solid #E5E7EB; }
    .footer { margin-top: 24px; border-top: 1px solid #E5E7EB; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #9CA3AF; }
  </style>
`;

export function printPnLPdf(
  pnl: { revenue: number; costOfGoods: number; operatingExpenses: number; netProfit: number },
  periodLabel: string,
  business: BusinessInfo
) {
  const grossProfit = pnl.revenue - pnl.costOfGoods;
  const grossMargin = pnl.revenue > 0 ? ((grossProfit / pnl.revenue) * 100).toFixed(1) : '0.0';
  const netMargin = pnl.revenue > 0 ? ((pnl.netProfit / pnl.revenue) * 100).toFixed(1) : '0.0';
  const cur = business.currency;

  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>P&L Statement - ${business.name}</title><meta charset="utf-8" />${BASE_STYLES}</head>
      <body>
        <div class="header">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge-ams">AMS</span>
              <span class="company-name">${business.name}</span>
            </div>
            ${business.taxId ? `<div style="font-size:11px;color:#6B7280;margin-top:4px;">TIN: ${business.taxId}</div>` : ''}
          </div>
          <div>
            <div class="report-title">Statement of Profit or Loss</div>
            <div class="report-period">Period: ${periodLabel}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value">${cur} ${pnl.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value ${grossProfit >= 0 ? 'green' : 'red'}">${cur} ${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Profit</div><div class="kpi-value ${pnl.netProfit >= 0 ? 'green' : 'red'}">${cur} ${pnl.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Margin</div><div class="kpi-value">${netMargin}%</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Financial Component</th>
              <th class="right">Amount (${cur})</th>
              <th class="right">% of Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Operating Revenue / Sales</strong></td>
              <td class="right"><strong>${cur} ${pnl.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              <td class="right">100.0%</td>
            </tr>
            <tr class="striped">
              <td>Less: Cost of Goods Sold (COGS / Inventory)</td>
              <td class="right">(${cur} ${pnl.costOfGoods.toLocaleString(undefined, { minimumFractionDigits: 2 })})</td>
              <td class="right">${pnl.revenue > 0 ? ((pnl.costOfGoods / pnl.revenue) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
            <tr class="subtotal-row">
              <td><strong>GROSS PROFIT</strong></td>
              <td class="right"><strong>${cur} ${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              <td class="right"><strong>${grossMargin}%</strong></td>
            </tr>
            <tr>
              <td>Less: Operating Expenses (Rent, Utilities, Salaries, Logistics)</td>
              <td class="right">(${cur} ${pnl.operatingExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })})</td>
              <td class="right">${pnl.revenue > 0 ? ((pnl.operatingExpenses / pnl.revenue) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
            <tr class="total-row">
              <td><strong>NET OPERATING PROFIT / (LOSS)</strong></td>
              <td class="right"><strong>${cur} ${pnl.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              <td class="right"><strong>${netMargin}%</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div>Generated via AMS Accounting Workstation</div>
          <div>${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </body>
    </html>
  `;

  printDocumentHtml(html);
}
