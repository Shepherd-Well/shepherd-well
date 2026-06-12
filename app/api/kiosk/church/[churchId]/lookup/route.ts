import { type NextRequest } from 'next/server';
import { adminClient } from '@/lib/api-auth';

type VisitorChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  allergies: string | null;
  medical_notes: string | null;
  special_instructions: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ churchId: string }> },
) {
  const { churchId } = await params;
  const phone = req.nextUrl.searchParams.get('phone');

  if (!phone || !churchId) {
    return Response.json({ error: 'phone and churchId required' }, { status: 400 });
  }

  const normalizedPhone = phone.replace(/\D/g, '');
  const admin = adminClient();

  // SECURITY: church-scoped lookup — family must belong to this church
  const { data: family } = await admin
    .from('cm_visitor_families')
    .select('id, parent1_first_name, parent1_last_name, parent1_phone')
    .eq('church_id', churchId)
    .eq('parent1_phone', normalizedPhone)
    .maybeSingle();

  if (!family) {
    return Response.json({ found: false });
  }

  const f = family as {
    id: string;
    parent1_first_name: string;
    parent1_last_name: string;
    parent1_phone: string;
  };

  // SECURITY: church-scoped lookup — children scoped by both family_id and church_id
  const { data: visitorChildren } = await admin
    .from('cm_visitor_children')
    .select('id, first_name, last_name, date_of_birth, allergies, medical_notes, special_instructions')
    .eq('family_id', f.id)
    .eq('church_id', churchId)
    .order('created_at', { ascending: true });

  return Response.json({
    found: true,
    parentFirstName: f.parent1_first_name,
    parentLastName: f.parent1_last_name,
    parentPhone: f.parent1_phone,
    children: ((visitorChildren ?? []) as VisitorChildRow[]).map((c) => ({
      id: c.id,
      childId: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      firstName: c.first_name,
      lastName: c.last_name,
      dateOfBirth: c.date_of_birth ?? null,
      allergies: c.allergies,
      medicalNotes: c.medical_notes,
      specialInstructions: c.special_instructions,
    })),
  });
}
