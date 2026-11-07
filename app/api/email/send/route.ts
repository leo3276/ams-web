import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendInvoiceEmail } from '@/lib/resend';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { type, to, subject, html, text, from, invoiceData } = body;

    // Type 1: Branded Invoice email
    if (type === 'invoice' && invoiceData) {
      const res = await sendInvoiceEmail(invoiceData);
      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, id: res.id });
    }

    // Type 2: Standard transactional email
    if (!to || !subject || (!html && !text)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, subject, and html/text are required.' },
        { status: 400 }
      );
    }

    const res = await sendEmail({
      to,
      subject,
      html,
      text,
      from,
    });

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: res.id });
  } catch (err: any) {
    console.error('[API/email/send] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while dispatching email.' },
      { status: 500 }
    );
  }
}
