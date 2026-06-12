import { type NextRequest } from 'next/server';
import { Resend } from 'resend';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId, userId } = ctx;

  const { data, error } = await adminClient()
    .from('ministry_communications')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 400 });

  // Enrich with sender name
  const comms = await Promise.all((data ?? []).map(async (c: any) => {
    let sentByName = 'Staff';
    if (c.sent_by) {
      try {
        const { data: { user: u } } = await adminClient().auth.admin.getUserById(c.sent_by);
        sentByName = u?.user_metadata?.full_name ?? u?.email ?? 'Staff';
      } catch (_) {}
    }
    return { ...c, sent_by_name: sentByName };
  }));

  return Response.json({ communications: comms });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId, userId } = ctx;

  const { title, body, send_email } = await req.json();
  if (!title?.trim()) return Response.json({ error: 'Title required' }, { status: 400 });
  if (!body?.trim()) return Response.json({ error: 'Body required' }, { status: 400 });

  const admin = adminClient();
  let recipientCount = 0;
  let emailSent = false;

  // Get active roster members with emails
  const { data: roster } = await admin
    .from('ministry_rosters')
    .select('member_id')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('status', 'active');

  const memberIds = (roster ?? []).map((r: any) => r.member_id);

  if (send_email && memberIds.length > 0) {
    const { data: members } = await admin
      .from('members')
      .select('email')
      .in('id', memberIds)
      .not('email', 'is', null);

    const memberEmails = (members ?? []).map((m: any) => m.email).filter(Boolean) as string[];
    recipientCount = memberEmails.length;

    if (memberEmails.length > 0 && process.env.RESEND_API_KEY) {
      try {
        const { data: church } = await admin.from('churches').select('name').eq('id', churchId).single();
        const churchName = church?.name ?? 'Your Church';

        const resend = new Resend(process.env.RESEND_API_KEY);

        // Get sender email for the "to" field (required by Resend)
        const { data: { user: authUser } } = await admin.auth.admin.getUserById(userId);
        const senderEmail = authUser?.email ?? 'onboarding@resend.dev';

        const htmlBody = body.trim().split('\n').map((line: string) =>
          line.trim() ? `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">${line}</p>` : '<br>'
        ).join('');

        await resend.emails.send({
          from: `${churchName} <onboarding@resend.dev>`,
          to: senderEmail,
          bcc: memberEmails,
          subject: `${title.trim()}`,
          html: `
            <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1f2937;">
              <div style="background:#1A4A2E;padding:28px 32px;border-radius:12px 12px 0 0;">
                <h1 style="color:white;margin:0;font-size:20px;font-weight:normal;">${churchName}</h1>
              </div>
              <div style="background:white;padding:36px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                <h2 style="color:#1A4A2E;font-size:20px;margin:0 0 20px;">${title.trim()}</h2>
                ${htmlBody}
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">
                <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">Sent via ShepherdWell</p>
              </div>
            </div>`,
        });
        emailSent = true;
      } catch (_) {
        // Email failure never blocks record creation
      }
    }
  }

  const { data: record, error } = await admin.from('ministry_communications').insert({
    church_id: churchId,
    ministry_type: type,
    title: title.trim(),
    body: body.trim(),
    sent_by: userId,
    sent_at: new Date().toISOString(),
    email_sent: emailSent,
    recipient_count: recipientCount,
  }).select('*').single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ communication: { ...record, sent_by_name: 'Staff' } });
}
