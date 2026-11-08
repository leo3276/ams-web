/**
 * Client-Safe Email Dispatcher for AMS Software
 * Works across both Desktop Electron Workstation and Next.js Web environments.
 */

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface InvoiceEmailPayload {
  customerEmail: string;
  customerName: string;
  invoiceNumber: string;
  totalAmount: number | string;
  currency?: string;
  dueDate?: string;
  invoiceUrl?: string;
  businessName?: string;
}

export async function sendEmailClient(payload: EmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // 1. In Desktop Electron Workstation: use native IPC bridge
    if (typeof window !== 'undefined' && (window as any).electronAPI?.sendEmail) {
      return await (window as any).electronAPI.sendEmail(payload);
    }

    // 2. In Web App (Next.js server): call server route
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { success: false, error: data?.error || `Server returned ${res.status}` };
    }

    return data || { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch email.' };
  }
}

export async function sendInvoiceEmailClient(data: InvoiceEmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const currency = data.currency || 'GHS';
  const formattedAmount = typeof data.totalAmount === 'number'
    ? `${currency} ${data.totalAmount.toFixed(2)}`
    : `${currency} ${data.totalAmount}`;
  const businessName = data.businessName || 'AMS Software';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 20px; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; }
          .header { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 16px; }
          .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
          .amount { font-size: 24px; font-weight: 800; color: #2563eb; margin: 8px 0; }
          .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 12px; }
          .footer { font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">${businessName}</div>
          <p>Hello <strong>${data.customerName || 'Valued Customer'}</strong>,</p>
          <p>Please find details for invoice <strong>#${data.invoiceNumber}</strong> below:</p>
          
          <div class="box">
            <div style="font-size: 12px; color: #64748b;">TOTAL AMOUNT</div>
            <div class="amount">${formattedAmount}</div>
            ${data.dueDate ? `<div style="font-size: 12px; color: #64748b;">Due Date: <strong>${data.dueDate}</strong></div>` : ''}
          </div>

          ${data.invoiceUrl ? `<a href="${data.invoiceUrl}" class="btn">View Invoice Online</a>` : ''}

          <div class="footer">
            Sent securely via ${businessName}. If you have any questions regarding this invoice, please contact us.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmailClient({
    to: data.customerEmail,
    subject: `Invoice #${data.invoiceNumber} from ${businessName}`,
    html,
  });
}
