import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { sessionId, memberId, visitorName, visitorPhone, visitorEmail } = await request.json();
  if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 });

  const admin = adminClient();

  // Validate session belongs to this church + type
  const { data: session } = await admin
    .from('ministry_checkin_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .maybeSingle();
  if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

  if (memberId) {
    // Toggle member check-in: if exists → remove, if not → add
    const { data: existing } = await admin
      .from('ministry_checkin_records')
      .select('id')
      .eq('church_id', churchId)
      .eq('session_id', sessionId)
      .eq('member_id', memberId)
      .maybeSingle();

    if (existing) {
      await admin.from('ministry_checkin_records').delete().eq('id', existing.id);
      return Response.json({ action: 'removed' });
    }

    const { data: member } = await admin
      .from('members')
      .select('first_name, last_name')
      .eq('church_id', churchId)
      .eq('id', memberId)
      .maybeSingle();

    const memberName = member ? `${member.first_name} ${member.last_name}` : null;

    const { data: created, error } = await admin
      .from('ministry_checkin_records')
      .insert({
        session_id: sessionId,
        church_id: churchId,
        ministry_type: type,
        member_id: memberId,
        visitor_name: memberName,
        is_new_visitor: false,
        visit_count: 1,
      })
      .select('*')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ action: 'added', record: created });
  }

  // Walk-in visitor
  if (!visitorName?.trim()) return Response.json({ error: 'visitorName required for walk-in' }, { status: 400 });

  const normalizedPhone = visitorPhone?.replace(/\D/g, '') ?? null;

  // Count distinct prior sessions for this visitor (by phone if available)
  let distinctPrior = 0;
  if (normalizedPhone) {
    const { data: priorSessions } = await admin
      .from('ministry_checkin_records')
      .select('session_id')
      .eq('church_id', churchId)
      .eq('ministry_type', type)
      .eq('visitor_phone', normalizedPhone);
    distinctPrior = new Set((priorSessions ?? []).map((r: any) => r.session_id as string)).size;
  }

  const visitCount = distinctPrior + 1;
  const isNewVisitor = distinctPrior === 0;

  const { data: created, error } = await admin
    .from('ministry_checkin_records')
    .insert({
      session_id: sessionId,
      church_id: churchId,
      ministry_type: type,
      member_id: null,
      visitor_name: visitorName.trim(),
      visitor_phone: normalizedPhone,
      visitor_email: visitorEmail?.trim() || null,
      is_new_visitor: isNewVisitor,
      visit_count: visitCount,
    })
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ action: 'added', record: created, isNewVisitor, visitCount });
}
