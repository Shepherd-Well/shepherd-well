import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  console.log('[/api/children-ministry/visitors] auth.churchId:', churchId, 'x-selected-church-id header:', req.headers.get('x-selected-church-id') ?? '(not sent)');

  const admin = adminClient();

  const { data: families, error } = await admin
    .from('cm_visitor_families')
    .select('id, parent1_first_name, parent1_last_name, parent1_phone, parent1_email, parent2_first_name, parent2_last_name, parent2_phone, parent2_email, address, how_did_you_hear, visit_date, follow_up_sent, follow_up_sent_at, next_day_sent, next_day_sent_at, notes, status, created_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false });

  console.log('[/api/children-ministry/visitors] Supabase query church_id:', churchId, '→ families returned:', families?.length ?? 0);

  if (error) return Response.json({ error: error.message }, { status: 400 });

  const familyIds = (families ?? []).map((f: any) => f.id as string);

  const { data: children } = familyIds.length
    ? await admin
        .from('cm_visitor_children')
        .select('id, family_id, first_name, last_name, date_of_birth')
        .in('family_id', familyIds)
        .order('created_at')
    : { data: [] };

  const childMap: Record<string, { id: string; first_name: string; last_name: string; date_of_birth: string | null }[]> = {};
  for (const c of children ?? []) {
    if (!childMap[c.family_id]) childMap[c.family_id] = [];
    childMap[c.family_id].push({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      date_of_birth: c.date_of_birth ?? null,
    });
  }

  const result = (families ?? []).map((f: any) => ({
    id: f.id,
    parent1_first_name: f.parent1_first_name,
    parent1_last_name: f.parent1_last_name,
    parent1_phone: f.parent1_phone ?? null,
    parent1_email: f.parent1_email ?? null,
    parent2_first_name: f.parent2_first_name ?? null,
    parent2_last_name: f.parent2_last_name ?? null,
    parent2_phone: f.parent2_phone ?? null,
    parent2_email: f.parent2_email ?? null,
    address: f.address ?? null,
    how_did_you_hear: f.how_did_you_hear ?? null,
    visit_date: f.visit_date,
    follow_up_sent: f.follow_up_sent ?? false,
    follow_up_sent_at: f.follow_up_sent_at ?? null,
    next_day_sent: f.next_day_sent ?? false,
    next_day_sent_at: f.next_day_sent_at ?? null,
    notes: f.notes ?? null,
    status: f.status,
    created_at: f.created_at,
    children: childMap[f.id] ?? [],
  }));

  return Response.json({ families: result });
}
