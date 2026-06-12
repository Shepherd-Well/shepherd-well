import { type NextRequest } from 'next/server';
import { getAuthContext, adminClient } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await adminClient()
    .from('cm_checkin_rooms')
    .select('*')
    .eq('church_id', auth.churchId)
    .order('name');

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ rooms: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, minAge, maxAge, capacity } = await request.json();
  if (!name) return Response.json({ error: 'name required' }, { status: 400 });

  console.error('[DEBUG] app/api/checkin/rooms/route.ts POST — explicit single-room insert\n  name:', name, '\n  churchId:', auth.churchId, '\n  stack:', new Error().stack);

  const { data, error } = await adminClient()
    .from('cm_checkin_rooms')
    .insert({ church_id: auth.churchId, name, min_age: minAge ?? null, max_age: maxAge ?? null, capacity: capacity ?? null })
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ room: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await adminClient()
    .from('cm_checkin_rooms')
    .delete()
    .eq('id', id)
    .eq('church_id', auth.churchId)
    .eq('is_active', false);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ deleted: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...fields } = await request.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.minAge !== undefined) updates.min_age = fields.minAge;
  if (fields.maxAge !== undefined) updates.max_age = fields.maxAge;
  if (fields.capacity !== undefined) updates.capacity = fields.capacity;
  if (fields.isActive !== undefined) updates.is_active = fields.isActive;

  const { data, error } = await adminClient()
    .from('cm_checkin_rooms')
    .update(updates)
    .eq('id', id)
    .eq('church_id', auth.churchId)
    .select('*')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ room: data });
}
