import { type NextRequest } from 'next/server';
import { Resend } from 'resend';
import { MINISTRY_CONFIG } from '@/lib/ministry-config';
import { getCurrentPeriod, getPeriodLabel } from '@/lib/ministry-period';
import { getAuthContext, adminClient } from '@/lib/api-auth';


async function getSettings(admin: ReturnType<typeof adminClient>, churchId: string, type: string) {
  const { data } = await admin
    .from('ministry_followup_settings')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .maybeSingle();
  return data ?? {
    frequency: 'monthly',
    touch1_label: 'Phone Call',
    touch2_label: 'Personal Letter',
    touch3_label: 'Personal Visit',
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();
  const settings = await getSettings(admin, churchId, type);
  const period = getCurrentPeriod(settings.frequency);
  const periodLabel = getPeriodLabel(settings.frequency, period.year, period.month);

  let memberIds: string[] = [];
  const memberMap: Record<string, any> = {};

  if (type === 'childrens') {
    const { data: children } = await admin
      .from('cm_visitor_children')
      .select('id, first_name, last_name, family_id')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false });

    const familyIds = [...new Set((children ?? []).map((c: any) => c.family_id as string).filter(Boolean))];

    const { data: families } = familyIds.length
      ? await admin
          .from('cm_visitor_families')
          .select('id, parent1_email, parent1_phone')
          .in('id', familyIds)
      : { data: [] };

    const familyMap: Record<string, any> = {};
    for (const f of families ?? []) familyMap[f.id] = f;

    for (const c of children ?? []) {
      const fam = familyMap[c.family_id] ?? {};
      memberMap[c.id] = {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: fam.parent1_email ?? null,
        phone: fam.parent1_phone ?? null,
      };
    }

    memberIds = Object.keys(memberMap);
  } else {
    // Get active roster members + member details
    const { data: roster } = await admin
      .from('ministry_rosters')
      .select('member_id, pipeline_stage')
      .eq('church_id', churchId)
      .eq('ministry_type', type)
      .eq('status', 'active');

    memberIds = (roster ?? []).map((r: any) => r.member_id);

    if (memberIds.length) {
      const { data: members } = await admin
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .in('id', memberIds);
      for (const m of members ?? []) memberMap[m.id] = m;
    }
  }

  if (!memberIds.length) {
    return Response.json({ members: [], settings, period: { ...period, label: periodLabel }, summary: { total: 0, complete: 0, partial: 0, none: 0 } });
  }

  // Get followup logs for current period
  const { data: logs } = await admin
    .from('ministry_followup_log')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('period_year', period.year)
    .eq('period_month', period.month)
    .in('member_id', memberIds);

  const logMap: Record<string, any> = {};
  for (const l of logs ?? []) logMap[l.member_id] = l;

  let complete = 0, partial = 0, none = 0;

  const enriched = memberIds.map((mid: string) => {
    const m = memberMap[mid] ?? { id: mid, first_name: '?', last_name: '?', email: null, phone: null };
    const log = logMap[mid] ?? {};
    const done = [log.touch1_completed, log.touch2_completed, log.touch3_completed].filter(Boolean).length;
    const status = done === 3 ? 'complete' : done > 0 ? 'partial' : 'none';
    if (status === 'complete') complete++;
    else if (status === 'partial') partial++;
    else none++;
    return {
      id: mid,
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email,
      phone: m.phone,
      log_id: log.id ?? null,
      touch1_completed: log.touch1_completed ?? false,
      touch1_date: log.touch1_date ?? null,
      touch1_note: log.touch1_note ?? null,
      touch2_completed: log.touch2_completed ?? false,
      touch2_date: log.touch2_date ?? null,
      touch2_note: log.touch2_note ?? null,
      touch3_completed: log.touch3_completed ?? false,
      touch3_date: log.touch3_date ?? null,
      touch3_note: log.touch3_note ?? null,
      assigned_to: log.assigned_to ?? null,
      status,
    };
  }).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

  const total = memberIds.length;

  return Response.json({
    members: enriched,
    settings,
    period: { ...period, label: periodLabel },
    summary: { total, complete, partial, none },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  if (body.action !== 'remind') return Response.json({ error: 'Unknown action' }, { status: 400 });

  const admin = adminClient();
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return Response.json({ error: 'Email not configured' }, { status: 500 });

  const settings = await getSettings(admin, churchId, type);
  const period = getCurrentPeriod(settings.frequency);
  const periodLabel = getPeriodLabel(settings.frequency, period.year, period.month);
  const cfg = MINISTRY_CONFIG[type];

  const { data: church } = await admin.from('churches').select('name').eq('id', churchId).single();
  const churchName = church?.name ?? 'Your Church';

  // Get admin emails
  const { data: cuList } = await admin.from('church_users').select('user_id').eq('church_id', churchId);
  const adminEmails: string[] = [];
  for (const cu of cuList ?? []) {
    const { data: { user: u } } = await admin.auth.admin.getUserById(cu.user_id);
    if (u?.email) adminEmails.push(u.email);
  }
  if (!adminEmails.length) return Response.json({ sent: 0 });

  // Get members needing follow up
  const { data: roster } = await admin.from('ministry_rosters').select('member_id').eq('church_id', churchId).eq('ministry_type', type).eq('status', 'active');
  const memberIds = (roster ?? []).map((r: any) => r.member_id);
  if (!memberIds.length) return Response.json({ sent: 0 });

  const { data: members } = await admin.from('members').select('id, first_name, last_name').in('id', memberIds);
  const { data: logs } = await admin.from('ministry_followup_log').select('*').eq('church_id', churchId).eq('ministry_type', type).eq('period_year', period.year).eq('period_month', period.month).in('member_id', memberIds);
  const logMap: Record<string, any> = {};
  for (const l of logs ?? []) logMap[l.member_id] = l;

  const rows = (members ?? []).map((m: any) => {
    const log = logMap[m.id] ?? {};
    const done = [log.touch1_completed, log.touch2_completed, log.touch3_completed].filter(Boolean).length;
    return { name: `${m.first_name} ${m.last_name}`, done };
  }).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const tableRows = rows.map(r => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:10px 0;font-size:15px;color:#111827;">${r.name}</td><td style="padding:10px 0;text-align:right;font-size:14px;color:${r.done === 3 ? '#22c55e' : r.done > 0 ? '#f59e0b' : '#9ca3af'}">${r.done === 3 ? '✅ Complete' : r.done > 0 ? `🟡 ${r.done}/3 touches` : '⬜ Not started'}</td></tr>`).join('');

  const html = `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1f2937"><div style="background:#1A4A2E;padding:28px 32px;border-radius:12px 12px 0 0"><h1 style="color:white;margin:0;font-size:22px;font-weight:normal">${churchName}</h1><p style="color:#86efac;margin:6px 0 0;font-size:14px">${cfg?.name ?? type} Follow Up Reminder — ${periodLabel}</p></div><div style="background:white;padding:36px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px"><table style="width:100%;border-collapse:collapse">${tableRows}</table><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"><p style="font-size:12px;color:#9ca3af;text-align:center">Sent via ShepherdWell</p></div></div>`;

  try {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'ShepherdWell <onboarding@resend.dev>',
      to: adminEmails,
      subject: `${cfg?.name ?? type} Follow Up Reminder — ${periodLabel}`,
      html,
    });
  } catch (_) { /* email failure never blocks */ }

  return Response.json({ sent: adminEmails.length });
}
