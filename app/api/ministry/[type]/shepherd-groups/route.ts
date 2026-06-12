import { type NextRequest } from 'next/server';
import { MINISTRY_CONFIG } from '@/lib/ministry-config';
import { getAuthContext, adminClient } from '@/lib/api-auth';

const SHEPHERD_TYPES = new Set(['childrens', 'middle-school', 'high-school']);

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ratio = Math.min(10, Math.max(3, parseInt(request.nextUrl.searchParams.get('ratio') ?? '5') || 5));
  if (!SHEPHERD_TYPES.has(type)) return Response.json({ error: 'Shepherd groups not available for this ministry' }, { status: 403 });

  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;

  // Fetch all groups
  const { data: groups, error } = await admin
    .from('shepherd_groups')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!groups?.length) {
    const { count: rosterCount } = await admin.from('ministry_rosters').select('*', { count: 'exact', head: true }).eq('church_id', churchId).eq('ministry_type', type).eq('status', 'active');
    const total = rosterCount ?? 0;
    return Response.json({ groups: [], total_kids: total, total_volunteers: 0, recommended_volunteers: Math.ceil(total / ratio), is_understaffed: total > 0 });
  }

  const groupIds = groups.map((g: any) => g.id);

  // Fetch all group memberships
  const { data: memberships } = await admin
    .from('shepherd_group_members')
    .select('group_id, member_id')
    .eq('church_id', churchId)
    .in('group_id', groupIds);

  // Collect all member_ids
  const allMemberIds = [...new Set([
    ...(memberships ?? []).map((m: any) => m.member_id),
    ...groups.map((g: any) => g.leadership_kid_id).filter(Boolean),
  ])];

  // Fetch member details
  const { data: members } = await admin
    .from('members')
    .select('id, first_name, last_name, email, phone')
    .eq('church_id', churchId)
    .in('id', allMemberIds.length ? allMemberIds : ['00000000-0000-0000-0000-000000000000']);

  const memberMap: Record<string, any> = {};
  for (const m of members ?? []) memberMap[m.id] = m;

  // Fetch current month contacts for all group members
  const { data: contacts } = await admin
    .from('shepherd_group_contacts')
    .select('*')
    .eq('church_id', churchId)
    .in('group_id', groupIds)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth);

  const contactMap: Record<string, any> = {}; // key: groupId:memberId
  for (const c of contacts ?? []) contactMap[`${c.group_id}:${c.member_id}`] = c;

  // Build membership map per group
  const membershipMap: Record<string, string[]> = {};
  for (const m of memberships ?? []) {
    if (!membershipMap[m.group_id]) membershipMap[m.group_id] = [];
    membershipMap[m.group_id].push(m.member_id);
  }

  const enriched = groups.map((g: any) => {
    const groupMemberIds = membershipMap[g.id] ?? [];
    const groupMembers = groupMemberIds.map((mid: string) => memberMap[mid] ?? { id: mid }).filter(Boolean);
    const leadershipKid = g.leadership_kid_id ? (memberMap[g.leadership_kid_id] ?? null) : null;

    const calls = groupMemberIds.filter(mid => contactMap[`${g.id}:${mid}`]?.phone_call_done).length;
    const visits = groupMemberIds.filter(mid => contactMap[`${g.id}:${mid}`]?.two_on_one_done).length;
    const letters = groupMemberIds.filter(mid => contactMap[`${g.id}:${mid}`]?.letter_done).length;
    const total = groupMemberIds.length || 1;

    const pct = Math.round(((calls + visits + letters) / (total * 3)) * 100);
    const overall_status = pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'red';

    return {
      ...g,
      leadership_kid: leadershipKid,
      members: groupMembers,
      member_count: groupMemberIds.length,
      contacts_this_month: { phone_call: calls, two_on_one: visits, letter: letters, total: groupMemberIds.length },
      overall_status,
    };
  });

  const totalKids = [...new Set((memberships ?? []).map((m: any) => m.member_id))].length;
  const totalVols = groups.length;
  const recommended = Math.ceil(totalKids / ratio);

  return Response.json({
    groups: enriched,
    total_kids: totalKids,
    total_volunteers: totalVols,
    recommended_volunteers: recommended,
    is_understaffed: totalVols < recommended,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!SHEPHERD_TYPES.has(type)) return Response.json({ error: 'Shepherd groups not available for this ministry' }, { status: 403 });

  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const { volunteer_name, volunteer_email, volunteer_phone, leadership_kid_id, member_ids } = body;
  if (!volunteer_name?.trim()) return Response.json({ error: 'Volunteer name required' }, { status: 400 });

  const allIds: string[] = [...new Set([
    ...(leadership_kid_id ? [leadership_kid_id] : []),
    ...(Array.isArray(member_ids) ? member_ids : []),
  ])];

  if (allIds.length > 5) return Response.json({ error: `Maximum 5 members per group` }, { status: 400 });

  const admin = adminClient();

  const { data: group, error } = await admin.from('shepherd_groups').insert({
    church_id: churchId,
    ministry_type: type,
    volunteer_name: volunteer_name.trim(),
    volunteer_email: volunteer_email?.trim() || null,
    volunteer_phone: volunteer_phone?.trim() || null,
    leadership_kid_id: leadership_kid_id || null,
  }).select('*').single();

  if (error) return Response.json({ error: error.message }, { status: 400 });

  if (allIds.length > 0) {
    await admin.from('shepherd_group_members').insert(
      allIds.map(mid => ({ church_id: churchId, group_id: group.id, member_id: mid }))
    );
  }

  return Response.json({ group });
}
