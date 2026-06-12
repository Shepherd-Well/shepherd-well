import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; groupId: string; memberId: string }> }
) {
  const { groupId, memberId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { error } = await adminClient()
    .from('shepherd_group_members')
    .delete()
    .eq('church_id', churchId)
    .eq('group_id', groupId)
    .eq('member_id', memberId);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}
