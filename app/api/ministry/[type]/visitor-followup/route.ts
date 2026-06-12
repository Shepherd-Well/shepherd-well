import { type NextRequest } from 'next/server';
import { Resend } from 'resend';
import { getAuthContext, adminClient } from '@/lib/api-auth';

function buildEmailHtml(churchName: string, ministryName: string, visitorName: string, customMsg?: string | null): string {
  const firstName = visitorName.split(' ')[0] || visitorName;
  return `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1f2937;">
  <div style="background:#F28C28;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;font-weight:bold;">${churchName}</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">${ministryName}</p>
  </div>
  <div style="background:white;padding:36px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="color:#1f2937;font-size:20px;margin:0 0 16px;">We are so glad you joined us! 🎉</h2>
    <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Hi ${firstName}, it was such a blessing to have you with us. We hope you felt welcomed and at home.
    </p>
    ${customMsg ? `<div style="background:#fff7ed;border-left:4px solid #F28C28;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px;"><p style="margin:0;font-size:15px;color:#9a3412;line-height:1.7;">${customMsg}</p></div>` : ''}
    <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">
      We would love for you to make ${churchName} your church home. Our ${ministryName} meets regularly and we'd be overjoyed to see you again!
    </p>
    <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;">With love,<br><strong>${churchName} — ${ministryName}</strong></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">Sent via ShepherdWell</p>
  </div>
</div>`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { sessionId, recordId, visitorName, visitorEmail, visitorPhone, followUpType, personalizedMessage } =
    await request.json() as {
      sessionId: string; recordId: string; visitorName: string;
      visitorEmail?: string; visitorPhone?: string;
      followUpType: 'email' | 'letter' | 'both' | 'skip';
      personalizedMessage?: string;
    };

  if (!sessionId || !recordId) return Response.json({ error: 'sessionId and recordId required' }, { status: 400 });

  const admin = adminClient();
  const isSkip = followUpType === 'skip';
  const sendEmail = !isSkip && (followUpType === 'email' || followUpType === 'both') && !!visitorEmail?.trim();

  if (sendEmail) {
    const { data: church } = await admin.from('churches').select('name').eq('id', churchId).maybeSingle();
    const churchName = church?.name ?? 'Our Church';
    const ministryMap: Record<string, string> = { childrens: "Children's Ministry", 'middle-school': "Middle School Ministry", 'high-school': "High School Ministry", 'young-adults': "Young Adults Ministry", mens: "Men's Ministry", womens: "Women's Ministry", seniors: "Senior Ministry", ushers: "Ushers Ministry", drama: "Drama Ministry", 'music-choir': "Music & Choir Ministry" };
    const ministryName = ministryMap[type] ?? `${type.charAt(0).toUpperCase() + type.slice(1)} Ministry`;
    const html = buildEmailHtml(churchName, ministryName, visitorName, personalizedMessage);
    const resend = new Resend(process.env.RESEND_API_KEY!);
    try {
      await resend.emails.send({
        from: `${churchName} <onboarding@resend.dev>`,
        to: [visitorEmail!],
        subject: 'We are so glad you joined us!',
        html,
      });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? 'Email failed' }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  await admin.from('ministry_visitor_followup_log').insert({
    church_id: churchId,
    session_id: sessionId,
    record_id: recordId,
    visitor_name: visitorName ?? null,
    visitor_phone: visitorPhone ?? null,
    visitor_email: visitorEmail ?? null,
    follow_up_type: isSkip ? 'email' : followUpType,
    status: isSkip ? 'skipped' : 'sent',
    personalized_message: personalizedMessage ?? null,
    sent_at: sendEmail ? now : null,
  });

  return Response.json({ ok: true, sent: sendEmail, status: isSkip ? 'skipped' : 'sent' });
}
