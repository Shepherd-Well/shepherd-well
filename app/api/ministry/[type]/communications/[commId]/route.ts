import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; commId: string }> }
) {
  const { type, commId } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { error } = await adminClient()
    .from('ministry_communications')
    .delete()
    .eq('id', commId)
    .eq('church_id', churchId)
    .eq('ministry_type', type);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}
