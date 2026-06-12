import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();

  // Children's Ministry: query cm_visitor_children joined with cm_visitor_families
  if (type === 'childrens') {
    const { data: children, error } = await admin
      .from('cm_visitor_children')
      .select('id, first_name, last_name, date_of_birth, family_id')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 400 });

    const familyIds = [...new Set((children ?? []).map((c: any) => c.family_id as string).filter(Boolean))];

    const { data: families } = familyIds.length
      ? await admin
          .from('cm_visitor_families')
          .select('id, parent1_first_name, parent1_last_name, parent1_phone, parent1_email, visit_date, status')
          .eq('church_id', churchId)
          .in('id', familyIds)
      : { data: [] };

    const familyMap: Record<string, any> = {};
    for (const f of families ?? []) familyMap[f.id] = f;

    const result = (children ?? []).map((c: any) => {
      const fam = familyMap[c.family_id] ?? {};
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        date_of_birth: c.date_of_birth ?? null,
        parent_name: [fam.parent1_first_name, fam.parent1_last_name].filter(Boolean).join(' ') || null,
        parent_phone: fam.parent1_phone ?? null,
        parent_email: fam.parent1_email ?? null,
        visit_date: fam.visit_date ?? null,
        status: fam.status ?? null,
      };
    });

    return Response.json(result);
  }

  // All other ministry types: query ministry_visitors
  const { data: visitors, error } = await admin
    .from('ministry_visitors')
    .select('id, first_name, last_name, email, phone, visit_count, first_visit_date, last_visit_date, status, notes')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('promoted_to_member', false)
    .order('last_visit_date', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 400 });

  const visitorIds = (visitors ?? []).map((v: any) => v.id as string);

  const { data: attendance } = visitorIds.length
    ? await admin
        .from('ministry_visitor_attendance')
        .select('visitor_id, session_date')
        .in('visitor_id', visitorIds)
        .order('session_date', { ascending: false })
    : { data: [] };

  const attendanceMap: Record<string, string[]> = {};
  for (const a of attendance ?? []) {
    if (!attendanceMap[a.visitor_id]) attendanceMap[a.visitor_id] = [];
    attendanceMap[a.visitor_id].push(a.session_date);
  }

  const result = (visitors ?? []).map((v: any) => ({
    id: v.id,
    first_name: v.first_name,
    last_name: v.last_name,
    email: v.email,
    phone: v.phone,
    visit_count: v.visit_count,
    first_visit_date: v.first_visit_date,
    last_visit_date: v.last_visit_date,
    status: v.status,
    notes: v.notes,
    attendance: attendanceMap[v.id] ?? [],
  }));

  return Response.json(result);
}
