import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; memberId: string }> }
) {
  const { type, memberId } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { pipeline_stage, note } = await req.json();
  if (!pipeline_stage) return Response.json({ error: 'pipeline_stage required' }, { status: 400 });

  const { data, error } = await adminClient()
    .from('ministry_rosters')
    .update({ pipeline_stage: pipeline_stage.toLowerCase(), notes: note ? `Stage → ${pipeline_stage}: ${note.trim()}` : undefined })
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('member_id', memberId)
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ record: data });
}
