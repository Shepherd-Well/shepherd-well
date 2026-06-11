import { type NextRequest } from 'next/server';
import { adminClient } from '@/lib/api-auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionToken: string }> },
) {
  const { sessionToken } = await params;
  const body = await req.json();
  const { parentPhone } = body as { parentPhone?: string };

  if (!parentPhone) {
    return Response.json({ error: 'parentPhone is required' }, { status: 400 });
  }

  const admin = adminClient();
  const phone = parentPhone.replace(/\D/g, '');

  // Validate session is open
  const { data: session } = await admin
    .from('cm_checkin_sessions')
    .select('id, church_id, status')
    .eq('id', sessionToken)
    .maybeSingle();

  if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
  if (session.status !== 'open') return Response.json({ error: 'Session is closed' }, { status: 400 });

  // Search visitor families by parent1_phone or parent2_phone
  const { data: families } = await admin
    .from('cm_visitor_families')
    .select('id, parent1_first_name, parent1_last_name, parent1_phone, parent1_email, parent2_first_name, parent2_last_name, parent2_phone, parent2_email, authorized_pickups')
    .eq('church_id', session.church_id)
    .or(`parent1_phone.eq.${phone},parent2_phone.eq.${phone}`)
    .limit(1);

  const family = families?.[0] ?? null;

  if (!family) {
    return Response.json({ found: false, family: null, children: [] });
  }

  // Determine which parent matched
  const matchedParent1 = family.parent1_phone === phone;
  const parentFirstName = matchedParent1
    ? family.parent1_first_name
    : (family.parent2_first_name ?? family.parent1_first_name);
  const parentLastName = matchedParent1
    ? family.parent1_last_name
    : (family.parent2_last_name ?? family.parent1_last_name);
  const parentEmail = matchedParent1
    ? (family.parent1_email ?? null)
    : (family.parent2_email ?? family.parent1_email ?? null);

  // Get saved children with birthday
  const { data: vcChildren } = await admin
    .from('cm_visitor_children')
    .select('id, first_name, last_name, date_of_birth, allergies, medical_notes, special_instructions')
    .eq('family_id', family.id)
    .order('created_at');

  const children = (vcChildren ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim(),
    source: 'visitor' as const,
    dateOfBirth: c.date_of_birth ?? null,
    allergies: c.allergies ?? null,
    medicalNotes: c.medical_notes ?? null,
    specialInstructions: c.special_instructions ?? null,
  }));

  return Response.json({
    found: true,
    family: {
      id: family.id,
      parentFirstName,
      parentLastName,
      parentPhone: phone,
      parentEmail,
      authorizedPickups: (family as { authorized_pickups?: string | null }).authorized_pickups ?? null,
    },
    children,
  });
}
