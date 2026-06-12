import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; visitorId: string }> }) {
  const { visitorId } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: visitor } = await admin.from('ministry_visitors').select('visit_count').eq('id', visitorId).eq('church_id', churchId).maybeSingle();
  if (!visitor) return Response.json({ error: 'Visitor not found' }, { status: 404 });

  const newCount = (visitor.visit_count ?? 1) + 1;
  const flagged = newCount >= 3;

  const { data, error } = await admin.from('ministry_visitors')
    .update({
      visit_count: newCount,
      last_visit_date: today,
      status: flagged ? 'flagged' : 'visitor',
    })
    .eq('id', visitorId)
    .eq('church_id', churchId)
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ visitor: data, flagged });
}
