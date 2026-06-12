import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; recordId: string }> }
) {
  const { type, recordId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();

  // Children's Ministry: look up via cm_visitor_families or cm_visitor_children
  if (type === 'childrens') {
    let familyRecord: any = null;

    const { data: family } = await admin
      .from('cm_visitor_families')
      .select('parent1_first_name, parent1_last_name, parent1_email, parent1_phone, visit_date')
      .eq('id', recordId)
      .eq('church_id', churchId)
      .maybeSingle();

    if (family) {
      familyRecord = family;
    } else {
      const { data: child } = await admin
        .from('cm_visitor_children')
        .select('family_id')
        .eq('id', recordId)
        .eq('church_id', churchId)
        .maybeSingle();

      if (child?.family_id) {
        const { data: fam } = await admin
          .from('cm_visitor_families')
          .select('parent1_first_name, parent1_last_name, parent1_email, parent1_phone, visit_date')
          .eq('id', child.family_id)
          .maybeSingle();
        familyRecord = fam ?? null;
      }
    }

    if (!familyRecord) return Response.json({ error: 'Record not found' }, { status: 404 });

    const [logRes, churchRes] = await Promise.all([
      admin.from('ministry_followup_log').select('personalized_message').eq('church_id', churchId).eq('record_id', recordId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('churches').select('name').eq('id', churchId).maybeSingle(),
    ]);

    return Response.json({
      record: {
        visitor_name: `${familyRecord.parent1_first_name} ${familyRecord.parent1_last_name}`.trim(),
        visitor_phone: familyRecord.parent1_phone ?? null,
        visitor_email: familyRecord.parent1_email ?? null,
        checked_in_at: familyRecord.visit_date,
      },
      session: null,
      followupLog: logRes.data ?? null,
      churchName: churchRes.data?.name ?? 'Our Church',
      ministryName: "Children's Ministry",
    });
  }

  const { data: record } = await admin
    .from('ministry_checkin_records')
    .select('*')
    .eq('id', recordId)
    .eq('church_id', churchId)
    .maybeSingle();

  if (!record) return Response.json({ error: 'Record not found' }, { status: 404 });

  const { data: session } = await admin
    .from('ministry_checkin_sessions')
    .select('service_name, date')
    .eq('church_id', churchId)
    .eq('id', record.session_id)
    .maybeSingle();

  const { data: logEntry } = await admin
    .from('ministry_followup_log')
    .select('personalized_message')
    .eq('church_id', churchId)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: church } = await admin
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle();

  const ministryMap: Record<string, string> = { childrens: "Children's Ministry", 'middle-school': "Middle School Ministry", 'high-school': "High School Ministry", 'young-adults': "Young Adults Ministry", mens: "Men's Ministry", womens: "Women's Ministry", seniors: "Senior Ministry", ushers: "Ushers Ministry", drama: "Drama Ministry", 'music-choir': "Music & Choir Ministry" };
  const ministryName = ministryMap[type] ?? `${type} Ministry`;

  return Response.json({
    record,
    session: session ?? null,
    followupLog: logEntry ?? null,
    churchName: church?.name ?? 'Our Church',
    ministryName,
  });
}
