import { Resend } from 'resend';

// Initialize Resend client using the environment API key
const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export const DEFAULT_FROM_EMAIL = 
  process.env.RESEND_FROM_EMAIL || 'AMS Software <onboarding@resend.dev>';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Universal email dispatcher for AMS Software via Resend
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = DEFAULT_FROM_EMAIL,
  replyTo,
  attachments,
}: SendEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Resend] Warning: RESEND_API_KEY is not defined in environment variables.');
    return {
      success: false,
      error: 'RESEND_API_KEY is missing. Please set RESEND_API_KEY in .env.local',
    };
  }

  try {
    const client = resend || new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html: html || text || '',
      text,
      replyTo,
      attachments,
    });

    if (error) {
      console.error('[Resend] API Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Resend] Unexpected dispatch failure:', err);
    return { success: false, error: err?.message || 'Failed to dispatch email' };
  }
}

/**
 * Helper to dispatch branded Customer Invoices
 */
export async function sendInvoiceEmail({
  customerEmail,
  customerName,
  invoiceNumber,
  totalAmount,
  currency = 'GHS',
  dueDate,
  invoiceUrl,
  businessName = 'AMS Software',
}: {
  customerEmail: string;
  customerName: string;
  invoiceNumber: string;
  totalAmount: number | string;
  currency?: string;
  dueDate?: string;
  invoiceUrl?: string;
  businessName?: string;
}) {
  const formattedAmount = typeof totalAmount === 'number' 
    ? `${currency} ${totalAmount.toFixed(2)}` 
    : `${currency} ${totalAmount}`;

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
          <p>Hello <strong>${customerName}</strong>,</p>
          <p>Please find details for invoice <strong>#${invoiceNumber}</strong> below:</p>
          
          <div class="box">
            <div style="font-size: 12px; color: #64748b;">AMOUNT DUE</div>
            <div class="amount">${formattedAmount}</div>
            ${dueDate ? `<div style="font-size: 12px; color: #64748b;">Due Date: <strong>${dueDate}</strong></div>` : ''}
          </div>

          ${invoiceUrl ? `<a href="${invoiceUrl}" class="btn">View & Download Invoice</a>` : ''}

          <div class="footer">
            Sent securely via ${businessName}. If you have any questions regarding this invoice, please reply directly to this email.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `Invoice #${invoiceNumber} from ${businessName}`,
    html,
  });
}
