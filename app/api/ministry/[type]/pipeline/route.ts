import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

function weeksAttending(joinedDate: string | null): number {
  if (!joinedDate) return 0;
  const ms = Date.now() - new Date(joinedDate + 'T00:00:00').getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();

  // Children's Ministry: query cm_visitor_children joined with cm_visitor_families
  if (type === 'childrens') {
    const { data: children, error } = await admin
      .from('cm_visitor_children')
      .select('id, first_name, last_name, family_id, created_at')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 400 });

    const familyIds = [...new Set((children ?? []).map((c: any) => c.family_id as string).filter(Boolean))];

    const { data: families } = familyIds.length
      ? await admin
          .from('cm_visitor_families')
          .select('id, parent1_email, visit_date')
          .in('id', familyIds)
      : { data: [] };

    const familyMap: Record<string, any> = {};
    for (const f of families ?? []) familyMap[f.id] = f;

    const enriched = (children ?? []).map((c: any) => {
      const fam = familyMap[c.family_id] ?? {};
      const joinedDate = fam.visit_date ?? null;
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: fam.parent1_email ?? null,
        pipeline_stage: 'visitor',
        joined_date: joinedDate,
        weeks_attending: weeksAttending(joinedDate),
        last_contact_date: null,
      };
    }).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

    const stageCounts: Record<string, number> = { visitor: enriched.length };
    return Response.json({ members: enriched, stage_counts: stageCounts, total: enriched.length });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Active roster with joined_date and pipeline_stage
  const { data: roster, error } = await admin
    .from('ministry_rosters')
    .select('member_id, pipeline_stage, joined_date, status')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('status', 'active');

  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!roster?.length) return Response.json({ members: [], stage_counts: {}, total: 0 });

  const memberIds = roster.map((r: any) => r.member_id);

  // Member details — use the correct table for youth ministry types
  const memberTable =
    type === 'middle-school' ? 'middle_school_students' :
    type === 'high-school'   ? 'high_school_students' :
    'members';
  const { data: members } = await admin
    .from(memberTable)
    .select('id, first_name, last_name, email')
    .in('id', memberIds);
  const memberMap: Record<string, any> = {};
  for (const m of members ?? []) memberMap[m.id] = m;

  // Last contact from followup log (current month)
  const { data: logs } = await admin
    .from('ministry_followup_log')
    .select('member_id, touch1_date, touch2_date, touch3_date')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('period_year', year)
    .eq('period_month', month)
    .in('member_id', memberIds);

  const contactMap: Record<string, string | null> = {};
  for (const l of logs ?? []) {
    const dates = [l.touch1_date, l.touch2_date, l.touch3_date].filter(Boolean) as string[];
    contactMap[l.member_id] = dates.sort().reverse()[0] ?? null;
  }

  const enriched = roster.map((r: any) => ({
    id: r.member_id,
    first_name: memberMap[r.member_id]?.first_name ?? '?',
    last_name: memberMap[r.member_id]?.last_name ?? '?',
    email: memberMap[r.member_id]?.email ?? null,
    pipeline_stage: r.pipeline_stage ?? null,
    joined_date: r.joined_date ?? null,
    weeks_attending: weeksAttending(r.joined_date),
    last_contact_date: contactMap[r.member_id] ?? null,
  })).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

  const stageCounts: Record<string, number> = {};
  for (const m of enriched) {
    const stage = m.pipeline_stage ?? 'Unassigned';
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  return Response.json({ members: enriched, stage_counts: stageCounts, total: enriched.length });
}
