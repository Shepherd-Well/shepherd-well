import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  console.log('[/api/children-ministry/parents] auth.churchId:', auth.churchId, 'x-selected-church-id header:', request.headers.get('x-selected-church-id') ?? '(not sent)');

  const admin = adminClient();
  const { data: parents, error } = await admin
    .from('cm_visitor_families')
    .select('*')
    .eq('church_id', auth.churchId)
    .order('created_at', { ascending: false });

  console.log('[/api/children-ministry/parents] Supabase query church_id:', auth.churchId, '→ rows returned:', parents?.length ?? 0, 'row church_ids:', [...new Set((parents ?? []).map((p: any) => p.church_id))]);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ parents: parents ?? [] });
}
