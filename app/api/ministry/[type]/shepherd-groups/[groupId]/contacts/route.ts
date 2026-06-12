import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; groupId: string }> }
) {
  const { groupId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const admin = adminClient();

  // Get all members in this group
  const { data: memberships } = await admin
    .from('shepherd_group_members')
    .select('member_id')
    .eq('group_id', groupId);

  const memberIds = (memberships ?? []).map((m: any) => m.member_id);

  const { data: members } = await admin
    .from('members')
    .select('id, first_name, last_name, email, phone')
    .in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);

  const memberMap: Record<string, any> = {};
  for (const m of members ?? []) memberMap[m.id] = m;

  // Get contact records for current period
  const { data: contacts } = await admin
    .from('shepherd_group_contacts')
    .select('*')
    .eq('group_id', groupId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth);

  const contactMap: Record<string, any> = {};
  for (const c of contacts ?? []) contactMap[c.member_id] = c;

  const enriched = memberIds.map((mid: string) => {
    const m = memberMap[mid] ?? { id: mid, first_name: '?', last_name: '?' };
    const c = contactMap[mid] ?? {};
    return {
      id: mid,
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email,
      phone: m.phone,
      phone_call_done: c.phone_call_done ?? false,
      phone_call_date: c.phone_call_date ?? null,
      phone_call_note: c.phone_call_note ?? null,
      two_on_one_done: c.two_on_one_done ?? false,
      two_on_one_date: c.two_on_one_date ?? null,
      two_on_one_note: c.two_on_one_note ?? null,
      letter_done: c.letter_done ?? false,
      letter_date: c.letter_date ?? null,
      letter_note: c.letter_note ?? null,
      letter_generated_at: c.letter_generated_at ?? null,
    };
  }).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

  const total = memberIds.length;
  const summary = {
    calls_done: enriched.filter((m: any) => m.phone_call_done).length,
    visits_done: enriched.filter((m: any) => m.two_on_one_done).length,
    letters_done: enriched.filter((m: any) => m.letter_done).length,
    total,
  };

  return Response.json({ members: enriched, summary, period: { year: periodYear, month: periodMonth } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; groupId: string }> }
) {
  const { groupId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const { member_id, contact_type, date, note } = body;
  if (!member_id || !contact_type) return Response.json({ error: 'member_id and contact_type required' }, { status: 400 });
  if (!['phone_call', 'two_on_one', 'letter'].includes(contact_type)) {
    return Response.json({ error: 'contact_type must be phone_call, two_on_one, or letter' }, { status: 400 });
  }

  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const admin = adminClient();

  const { data: existing } = await admin
    .from('shepherd_group_contacts')
    .select('id')
    .eq('group_id', groupId)
    .eq('member_id', member_id)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    [`${contact_type}_done`]: true,
    [`${contact_type}_date`]: date || now.toISOString().slice(0, 10),
    [`${contact_type}_note`]: note?.trim() || null,
  };
  if (contact_type === 'letter') updates.letter_generated_at = now.toISOString();

  let record;
  if (existing) {
    const { data } = await admin.from('shepherd_group_contacts').update(updates).eq('id', existing.id).select('*').single();
    record = data;
  } else {
    const { data } = await admin.from('shepherd_group_contacts').insert({
      church_id: churchId,
      group_id: groupId,
      member_id,
      period_year: periodYear,
      period_month: periodMonth,
      ...updates,
    }).select('*').single();
    record = data;
  }

  return Response.json({ record });
}
