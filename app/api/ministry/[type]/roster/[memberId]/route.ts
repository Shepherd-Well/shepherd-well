import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; memberId: string }> }
) {
  const { type, memberId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.pipeline_stage !== undefined) updates.pipeline_stage = body.pipeline_stage ?? null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() ?? null;

  const { data, error } = await adminClient()
    .from('ministry_rosters')
    .update(updates)
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('member_id', memberId)
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ record: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; memberId: string }> }
) {
  const { type, memberId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { error } = await adminClient()
    .from('ministry_rosters')
    .delete()
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('member_id', memberId);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}
