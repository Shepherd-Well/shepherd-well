import { type NextRequest } from 'next/server';
import { MINISTRY_CONFIG, getAutoMinistries, isInvitationOnly } from '@/lib/ministry-config';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();
  const cfg = MINISTRY_CONFIG[type];

  // Invitation-only ministries (ushers, drama) — skip auto-population entirely
  if (!isInvitationOnly(type)) {
    const { data: allMembers } = await admin
      .from('members')
      .select('id, gender, birthdate, member_type')
      .eq('church_id', churchId)
      .eq('status', 'active');

    const matching = (allMembers ?? []).filter((m: any) => getAutoMinistries(m).includes(type));

    if (matching.length > 0) {
      // Get existing roster member_ids
      const { data: existing } = await admin
        .from('ministry_rosters')
        .select('member_id')
        .eq('church_id', churchId)
        .eq('ministry_type', type);

      const existingIds = new Set((existing ?? []).map((r: any) => r.member_id));

      // Batch-insert new matches
      const toInsert = matching
        .filter((m: any) => !existingIds.has(m.id))
        .map((m: any) => ({
          church_id: churchId,
          ministry_type: type,
          member_id: m.id,
          status: 'active',
          pipeline_stage: cfg?.stages[0] ?? null,
        }));

      if (toInsert.length > 0) {
        await admin.from('ministry_rosters').upsert(toInsert, {
          onConflict: 'church_id,ministry_type,member_id',
          ignoreDuplicates: true,
        });
      }
    }
  }

  // Fetch final roster
  const { data: roster, error } = await admin
    .from('ministry_rosters')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .order('joined_date', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!roster?.length) return Response.json({ roster: [], total: 0 });

  // Enrich with member details
  const memberIds = roster.map((r: any) => r.member_id);
  const { data: members } = await admin
    .from('members')
    .select('id, first_name, last_name, email, phone')
    .eq('church_id', churchId)
    .in('id', memberIds);

  const memberMap: Record<string, any> = {};
  for (const m of members ?? []) memberMap[m.id] = m;

  const enriched = roster.map((r: any) => ({
    ...r,
    member: memberMap[r.member_id] ?? null,
  }));

  return Response.json({ roster: enriched, total: enriched.length });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const { member_id, pipeline_stage, notes } = body;
  if (!member_id) return Response.json({ error: 'member_id required' }, { status: 400 });

  const { data, error } = await adminClient().from('ministry_rosters').insert({
    church_id: churchId,
    ministry_type: type,
    member_id,
    pipeline_stage: pipeline_stage ?? null,
    notes: notes?.trim() ?? null,
    status: 'active',
  }).select('*').single();

  if (error) {
    if (error.code === '23505') return Response.json({ error: 'Member already on this roster' }, { status: 409 });
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ record: data });
}
