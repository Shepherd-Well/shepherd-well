import { type NextRequest } from 'next/server';
import { getCurrentPeriod } from '@/lib/ministry-period';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; memberId: string }> }
) {
  const { type, memberId } = await params;
  const ctx = await getAuthContext(request);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await request.json();
  const { touch, date, note } = body;
  if (!touch || ![1, 2, 3].includes(touch)) return Response.json({ error: 'touch must be 1, 2, or 3' }, { status: 400 });
  if (!date) return Response.json({ error: 'date required' }, { status: 400 });

  const admin = adminClient();

  // Get frequency from settings
  const { data: settings } = await admin
    .from('ministry_followup_settings')
    .select('frequency')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .maybeSingle();
  const period = getCurrentPeriod(settings?.frequency ?? 'monthly');

  // Check for existing log row
  const { data: existing } = await admin
    .from('ministry_followup_log')
    .select('id')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .eq('member_id', memberId)
    .eq('period_year', period.year)
    .eq('period_month', period.month)
    .maybeSingle();

  const touchKey = `touch${touch}`;
  const updates: Record<string, unknown> = {
    [`${touchKey}_completed`]: true,
    [`${touchKey}_date`]: date,
    [`${touchKey}_note`]: note?.trim() || null,
  };

  let record;
  if (existing) {
    const { data } = await admin
      .from('ministry_followup_log')
      .update(updates)
      .eq('id', existing.id)
      .select('*')
      .single();
    record = data;
  } else {
    const { data } = await admin
      .from('ministry_followup_log')
      .insert({
        church_id: churchId,
        ministry_type: type,
        member_id: memberId,
        period_year: period.year,
        period_month: period.month,
        ...updates,
      })
      .select('*')
      .single();
    record = data;
  }

  return Response.json({ record });
}
