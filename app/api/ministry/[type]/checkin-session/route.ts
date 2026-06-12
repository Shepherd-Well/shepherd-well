import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const admin = adminClient();

  if (sessionId) {
    const { data: records } = await admin
      .from('ministry_checkin_records')
      .select('id, member_id, visitor_name')
      .eq('session_id', sessionId)
      .eq('church_id', churchId);
    return Response.json({ records: records ?? [] });
  }

  const { data, error } = await admin
    .from('ministry_checkin_sessions')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ sessions: data ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { serviceName, date } = await request.json();
  if (!serviceName || !date) return Response.json({ error: 'serviceName and date required' }, { status: 400 });

  const { data, error } = await adminClient()
    .from('ministry_checkin_sessions')
    .insert({ church_id: churchId, ministry_type: type, service_name: serviceName, date, status: 'open' })
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ session: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { id, status, autoFollowup } = await request.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (autoFollowup !== undefined) updates.auto_followup = autoFollowup;
  if (!Object.keys(updates).length) return Response.json({ error: 'nothing to update' }, { status: 400 });

  const { data, error } = await adminClient()
    .from('ministry_checkin_sessions')
    .update(updates)
    .eq('id', id)
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ session: data });
}
