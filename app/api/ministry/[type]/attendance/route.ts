import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const sessionCount = parseInt(request.nextUrl.searchParams.get('sessions') ?? '8');
  const admin = adminClient();

  // Active roster members with member details
  const { data: roster } = await admin
    .from('ministry_rosters')
    .select('member_id, pipeline_stage')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('status', 'active');

  const memberIds = (roster ?? []).map((r: any) => r.member_id);

  const { data: members } = await admin
    .from('members')
    .select('id, first_name, last_name')
    .in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);

  const memberMap: Record<string, any> = {};
  for (const m of members ?? []) memberMap[m.id] = m;

  const rosterWithNames = (roster ?? []).map((r: any) => ({
    id: r.member_id,
    first_name: memberMap[r.member_id]?.first_name ?? '',
    last_name: memberMap[r.member_id]?.last_name ?? '',
    pipeline_stage: r.pipeline_stage,
  })).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

  // All attendance records (last 90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: records } = await admin
    .from('ministry_attendance')
    .select('member_id, session_date, present, consecutive_weeks')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .gte('session_date', since.toISOString().slice(0, 10))
    .order('session_date', { ascending: false });

  // Extract last N distinct session dates
  const dateSet = new Set<string>();
  for (const r of records ?? []) dateSet.add(r.session_date);
  const sessions = Array.from(dateSet).sort().reverse().slice(0, sessionCount);

  return Response.json({ members: rosterWithNames, sessions, records: records ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const { member_id, session_date, present, notes } = body;
  if (!member_id || !session_date) return Response.json({ error: 'member_id and session_date required' }, { status: 400 });

  const admin = adminClient();

  let consecutiveWeeks = 0;

  if (present !== false) {
    // Look at prior sessions for this member in this ministry
    const { data: history } = await admin
      .from('ministry_attendance')
      .select('session_date, present')
      .eq('member_id', member_id)
      .eq('ministry_type', type)
      .eq('church_id', churchId)
      .lt('session_date', session_date)
      .order('session_date', { ascending: false })
      .limit(30);

    let streak = 1;
    let prevDate = new Date(session_date + 'T00:00:00');
    for (const h of history ?? []) {
      if (!h.present) break;
      const d = new Date(h.session_date + 'T00:00:00');
      const diff = Math.round((prevDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 5 && diff <= 9) {
        streak++;
        prevDate = d;
      } else {
        break;
      }
    }
    consecutiveWeeks = streak;
  }

  // Check if record exists
  const { data: existing } = await admin
    .from('ministry_attendance')
    .select('id')
    .eq('member_id', member_id)
    .eq('ministry_type', type)
    .eq('session_date', session_date)
    .maybeSingle();

  let record;
  if (existing) {
    const { data } = await admin
      .from('ministry_attendance')
      .update({ present: present !== false, consecutive_weeks: consecutiveWeeks, notes: notes?.trim() ?? null })
      .eq('id', existing.id)
      .select('*')
      .single();
    record = data;
  } else {
    const { data } = await admin
      .from('ministry_attendance')
      .insert({
        church_id: churchId,
        ministry_type: type,
        member_id,
        session_date,
        present: present !== false,
        consecutive_weeks: consecutiveWeeks,
        notes: notes?.trim() ?? null,
      })
      .select('*')
      .single();
    record = data;
  }

  return Response.json({ record, consecutiveWeeks });
}
