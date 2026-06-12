import { type NextRequest } from 'next/server';
import { MINISTRY_CONFIG, STAGE_COLORS } from '@/lib/ministry-config';
import { getAuthContext, adminClient } from '@/lib/api-auth';

type StageRow = {
  id: string;
  stage_key: string;
  name: string;
  description: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
};

type StageInput = {
  stage_key: string;
  name: string;
  description?: string | null;
  color?: string | null;
  display_order: number;
  is_active: boolean;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const admin = adminClient();
  const { data: rows } = await admin
    .from('ministry_pipeline_stages')
    .select('id, stage_key, name, description, color, display_order, is_active')
    .eq('church_id', churchId)
    .eq('ministry_type', type)
    .order('display_order', { ascending: true });

  if (rows?.length) {
    return Response.json({
      stages: (rows as StageRow[]).map((r) => ({
        id: r.id,
        stage_key: r.stage_key,
        name: r.name,
        description: r.description,
        color: r.color,
        display_order: r.display_order,
        is_active: r.is_active,
        is_default: false,
      })),
    });
  }

  // No custom rows — return config defaults
  const cfg = MINISTRY_CONFIG[type];
  if (!cfg) return Response.json({ stages: [] });

  const defaultStages = (cfg.pipelineStages ?? cfg.stages ?? []).map((name, idx) => ({
    id: null,
    stage_key: name,
    name,
    description: cfg.stageDescriptions?.[name] ?? null,
    color: STAGE_COLORS[Math.min(idx, STAGE_COLORS.length - 1)],
    display_order: idx,
    is_active: true,
    is_default: true,
  }));

  return Response.json({ stages: defaultStages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getAuthContext(req);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { churchId } = ctx;

  const body = await req.json();
  const stages: StageInput[] = body.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    return Response.json({ error: 'stages array required' }, { status: 400 });
  }

  const admin = adminClient();
  const now = new Date().toISOString();
  const upserts = stages.map((s, idx) => ({
    church_id: churchId,
    ministry_type: type,
    stage_key: s.stage_key,
    name: s.name.trim(),
    description: s.description?.trim() || null,
    color: s.color || null,
    display_order: s.display_order ?? idx,
    is_active: s.is_active,
    updated_at: now,
  }));

  const { data, error } = await admin
    .from('ministry_pipeline_stages')
    .upsert(upserts, { onConflict: 'church_id,ministry_type,stage_key' })
    .select('id, stage_key, name, description, color, display_order, is_active');

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({
    stages: ((data ?? []) as StageRow[]).map((r) => ({
      id: r.id,
      stage_key: r.stage_key,
      name: r.name,
      description: r.description,
      color: r.color,
      display_order: r.display_order,
      is_active: r.is_active,
      is_default: false,
    })),
  });
}
