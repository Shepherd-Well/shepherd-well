import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

const MAX_MEMBERS = 5;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; groupId: string }> }
) {
  const { groupId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { member_id } = await request.json();
  if (!member_id) return Response.json({ error: 'member_id required' }, { status: 400 });

  const admin = adminClient();

  const { count } = await admin
    .from('shepherd_group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if ((count ?? 0) >= MAX_MEMBERS) {
    return Response.json({ error: `Group is full (max ${MAX_MEMBERS} members)` }, { status: 400 });
  }

  const { data, error } = await admin.from('shepherd_group_members').insert({
    church_id: churchId,
    group_id: groupId,
    member_id,
  }).select('*').single();

  if (error) {
    if (error.code === '23505') return Response.json({ error: 'Member already in this group' }, { status: 409 });
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ member: data });
}
