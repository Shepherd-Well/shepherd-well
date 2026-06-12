import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

const DEFAULTS = {
  frequency: 'monthly',
  touch1_label: 'Phone Call',
  touch2_label: 'Personal Letter',
  touch3_label: 'Personal Visit',
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const { data } = await adminClient()
    .from('ministry_followup_settings')
    .select('*')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .maybeSingle();

  return Response.json({ settings: data ?? { ...DEFAULTS, church_id: churchId, ministry_type: type } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const { frequency, touch1_label, touch2_label, touch3_label } = body;

  const { data: existing } = await adminClient()
    .from('ministry_followup_settings')
    .select('id')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .maybeSingle();

  const payload: Record<string, unknown> = {};
  if (frequency) payload.frequency = frequency;
  if (touch1_label) payload.touch1_label = touch1_label.trim();
  if (touch2_label) payload.touch2_label = touch2_label.trim();
  if (touch3_label) payload.touch3_label = touch3_label.trim();

  let data;
  if (existing) {
    const { data: d } = await adminClient()
      .from('ministry_followup_settings')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    data = d;
  } else {
    const { data: d } = await adminClient()
      .from('ministry_followup_settings')
      .insert({ church_id: churchId, ministry_type: type, ...DEFAULTS, ...payload })
      .select('*')
      .single();
    data = d;
  }

  return Response.json({ settings: data });
}
