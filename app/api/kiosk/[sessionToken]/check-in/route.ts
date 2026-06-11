import { type NextRequest } from 'next/server';
import { adminClient } from '@/lib/api-auth';

type ChildInput = {
  childName: string;
  childId?: string;
  childFirstName?: string;
  childLastName?: string;
  childDateOfBirth?: string;
  roomId?: string;
  isNew?: boolean;
  allergies?: string[];
  allergyOther?: string;
  medicalNotes?: string;
  specialInstructions?: string;
};

type RoomRow = {
  id: string;
  name: string;
  min_age: number | null;
  max_age: number | null;
};

type ImmediateLabel = {
  labelType: 'child' | 'parent';
  childName: string;
  parentName: string;
  parentPhone: string | null;
  roomName: string | null;
  securityCode: string;
  allergies: string | null;
  medicalNotes: string | null;
  specialInstructions: string | null;
  visitNumber: number | null;
  authorizedPickups: string | null;
};

function serializeAllergies(allergies: string[], allergyOther: string): string | null {
  if (!allergies.length) return null;

  const arr = allergies.map((a) =>
    a === 'Other' && allergyOther.trim() ? `Other: ${allergyOther.trim()}` : a,
  );

  return JSON.stringify(arr);
}

function allergyLine(allergies: string[] | undefined, allergyOther: string | undefined): string | null {
  if (!allergies?.length) return null;

  return allergies
    .map((a) =>
      a === 'Other' && allergyOther?.trim()
        ? `Other: ${allergyOther.trim()}`
        : a,
    )
    .join(', ');
}

/**
 * Calculates age in whole years as of `todayStr` (YYYY-MM-DD in church timezone).
 * Returns null if dob is missing or unparseable.
 */
function calculateAge(dob: string | null, todayStr: string): number | null {
  if (!dob) return null;
  try {
    const [birthYear, birthMonth, birthDay] = dob.split('-').map(Number);
    const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
    let age = todayYear - birthYear;
    if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
      age--;
    }
    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the room for a child.
 * Priority:
 *   1. If roomId is provided and exists in activeRooms, use it (validated override).
 *   2. Auto-assign by DOB + church-timezone today.
 *      - Picks the narrowest age-range match, then alphabetical on ties.
 *   3. Returns null if no DOB and no valid override.
 */
function resolveRoom(
  dob: string | undefined,
  explicit: string | undefined,
  rooms: RoomRow[],
  today: string,
): string | null {
  // Validated manual override
  if (explicit && rooms.find((r) => r.id === explicit)) return explicit;

  if (!dob) return null;

  const age = calculateAge(dob, today);
  if (age === null) return null;

  const candidates = rooms.filter((r) => {
    const minOk = r.min_age === null || age >= r.min_age;
    const maxOk = r.max_age === null || age <= r.max_age;
    return minOk && maxOk;
  });

  if (!candidates.length) return null;

  // Narrowest range wins; alphabetical on tie
  candidates.sort((a, b) => {
    const rangeA = (a.max_age ?? 999) - (a.min_age ?? 0);
    const rangeB = (b.max_age ?? 999) - (b.min_age ?? 0);
    if (rangeA !== rangeB) return rangeA - rangeB;
    return a.name.localeCompare(b.name);
  });

  return candidates[0].id;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionToken: string }> },
) {
  const { sessionToken } = await params;
  const body = await req.json();

  const {
    parentName,
    parentPhone,
    parentEmail,
    familyId,
    isNewFamily,
    children,
    authorizedPickups,
  } = body as {
    parentName: string;
    parentPhone: string;
    parentEmail?: string;
    familyId?: string;
    isNewFamily?: boolean;
    children: ChildInput[];
    authorizedPickups?: string;
  };

  if (!parentName || !parentPhone || !children?.length) {
    return Response.json(
      { error: 'parentName, parentPhone, and children are required' },
      { status: 400 },
    );
  }

  const admin = adminClient();

  const { data: session } = await admin
    .from('cm_checkin_sessions')
    .select('id, church_id, status')
    .eq('id', sessionToken)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.status !== 'open') {
    return Response.json({ error: 'Session is closed' }, { status: 400 });
  }

  const [{ data: churchRow }, { data: activeRoomsRaw }] = await Promise.all([
    admin.from('churches').select('timezone').eq('id', session.church_id).maybeSingle(),
    admin
      .from('cm_checkin_rooms')
      .select('id, name, min_age, max_age')
      .eq('church_id', session.church_id)
      .eq('is_active', true)
      .order('min_age', { ascending: true }),
  ]);

  const tz =
    (churchRow as { timezone?: string } | null)?.timezone ?? 'America/Los_Angeles';

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

  const activeRooms = (activeRoomsRaw ?? []) as RoomRow[];

  function roomNameFor(roomId: string | null | undefined): string | null {
    if (!roomId) return null;
    return activeRooms.find((r) => r.id === roomId)?.name ?? null;
  }

  const normalizedPhone = parentPhone.replace(/\D/g, '');
  const normalizedEmail = parentEmail ? parentEmail.trim().toLowerCase() : null;
  const securityCode = String(Math.floor(100000 + Math.random() * 900000));

  let resolvedFamilyId: string | null = familyId ?? null;

  if (!resolvedFamilyId) {
    const { data: existing } = await admin
      .from('cm_visitor_families')
      .select('id')
      .eq('church_id', session.church_id)
      .eq('parent1_phone', normalizedPhone)
      .maybeSingle();

    if (existing) {
      resolvedFamilyId = existing.id;
    } else {
      const parts = parentName.trim().split(/\s+/);
      const firstName = parts[0] ?? '';
      const lastName = parts.slice(1).join(' ');

      const { data: created, error: familyError } = await admin
        .from('cm_visitor_families')
        .insert({
          church_id: session.church_id,
          parent1_first_name: firstName,
          parent1_last_name: lastName,
          parent1_phone: normalizedPhone,
          parent1_email: normalizedEmail,
          authorized_pickups: authorizedPickups ?? null,
          visit_date: today,
          status: 'new',
          follow_up_sent: false,
          next_day_sent: false,
        })
        .select('id')
        .single();

      if (familyError) console.error('[check-in] family insert error:', familyError.message);
      resolvedFamilyId = created?.id ?? null;
    }
  } else {
    const updates: Record<string, unknown> = {};
    if (normalizedEmail) updates.parent1_email = normalizedEmail;
    if (authorizedPickups) updates.authorized_pickups = authorizedPickups;
    if (Object.keys(updates).length > 0) {
      await admin
        .from('cm_visitor_families')
        .update(updates)
        .eq('id', resolvedFamilyId!);
    }
  }

  if (resolvedFamilyId) {
    for (const child of children) {
      const nameParts = child.childName.trim().split(/\s+/);
      const firstName = child.childFirstName?.trim() || nameParts[0] || '';
      const lastName = child.childLastName?.trim() || nameParts.slice(1).join(' ') || '';

      let existingId: string | null = null;
      let existingDob: string | null = null;

      if (child.childId) {
        const { data: cur } = await admin
          .from('cm_visitor_children')
          .select('id, date_of_birth')
          .eq('id', child.childId)
          .maybeSingle();
        existingId = cur?.id ?? null;
        existingDob = (cur as { id: string; date_of_birth: string | null } | null)?.date_of_birth ?? null;
      } else if (firstName) {
        const { data: found } = await admin
          .from('cm_visitor_children')
          .select('id, date_of_birth')
          .eq('family_id', resolvedFamilyId)
          .eq('first_name', firstName)
          .eq('last_name', lastName)
          .maybeSingle();
        existingId = found?.id ?? null;
        existingDob = (found as { id: string; date_of_birth: string | null } | null)?.date_of_birth ?? null;
      }

      const profileData: Record<string, unknown> = {
        allergies: serializeAllergies(child.allergies ?? [], child.allergyOther ?? ''),
        medical_notes: child.medicalNotes ?? null,
        special_instructions: child.specialInstructions ?? null,
      };
      if (child.childDateOfBirth && !existingDob) {
        profileData.date_of_birth = child.childDateOfBirth;
      }

      if (existingId) {
        const { error: updateError } = await admin
          .from('cm_visitor_children')
          .update(profileData)
          .eq('id', existingId);
        if (updateError) console.error('[check-in] child update error:', updateError.message);
      } else if (firstName) {
        const { error: insertError } = await admin
          .from('cm_visitor_children')
          .insert({
            church_id: session.church_id,
            family_id: resolvedFamilyId,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: child.childDateOfBirth ?? null,
            ...profileData,
          });
        if (insertError) console.error('[check-in] child insert error:', insertError.message);
      }
    }
  }

  const inserts = children.map((child) => ({
    session_id: session.id,
    church_id: session.church_id,
    child_name: child.childName,
    parent_name: parentName,
    parent_phone: normalizedPhone,
    room_id: resolveRoom(child.childDateOfBirth, child.roomId, activeRooms, today),
    security_code: securityCode,
    is_new_visitor: !!isNewFamily,
    allergies: child.allergies ?? [],
    allergy_other: child.allergyOther ?? null,
    date_of_birth: child.childDateOfBirth ?? null,
    special_instructions: child.specialInstructions ?? null,
    authorized_pickups: authorizedPickups ?? null,
  }));

  const { data: records, error } = await admin
    .from('cm_checkin_records')
    .insert(inserts)
    .select('id, child_name, room_id, security_code');

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  const safeRecords = records ?? [];

  const childImmediateLabels: ImmediateLabel[] = safeRecords.map((record, i) => {
    const child = children[i];

    return {
      labelType: 'child',
      childName: record.child_name,
      parentName,
      parentPhone: normalizedPhone,
      roomName: roomNameFor(record.room_id),
      securityCode: record.security_code,
      allergies: allergyLine(child?.allergies, child?.allergyOther),
      medicalNotes: child?.medicalNotes || null,
      specialInstructions: child?.specialInstructions || null,
      visitNumber: null,
      authorizedPickups: null,
    };
  });

  const parentImmediateLabel: ImmediateLabel | null = safeRecords[0]
    ? {
        labelType: 'parent',
        childName: safeRecords
          .map((r) => {
            const roomName = roomNameFor(r.room_id);
            return roomName ? `${r.child_name} (${roomName})` : r.child_name;
          })
          .join(', '),
        parentName,
        parentPhone: normalizedPhone,
        roomName: roomNameFor(safeRecords[0]?.room_id),
        securityCode,
        allergies: null,
        medicalNotes: null,
        specialInstructions: null,
        visitNumber: null,
        authorizedPickups: authorizedPickups ?? null,
      }
    : null;

  const immediateLabels: ImmediateLabel[] = parentImmediateLabel
    ? [...childImmediateLabels, parentImmediateLabel]
    : childImmediateLabels;

  let printJobsCreated = 0;
  let printJobWarning: string | undefined;

  try {
    const childJobs = safeRecords.map((record, i) => {
      const child = children[i];

      return {
        church_id: session.church_id,
        session_id: session.id,
        checkin_record_id: record.id,
        child_name: record.child_name,
        parent_name: parentName,
        parent_phone: normalizedPhone,
        room_id: record.room_id ?? null,
        security_code: record.security_code,
        allergies: allergyLine(child?.allergies, child?.allergyOther),
        medical_notes: child?.medicalNotes || null,
        special_instructions: child?.specialInstructions || null,
        label_type: 'child',
        status: 'pending',
      };
    });

    const firstRecord = safeRecords[0];

    const parentJob = firstRecord
      ? {
          church_id: session.church_id,
          session_id: session.id,
          checkin_record_id: firstRecord.id,
          child_name: safeRecords
            .map((r) => {
              const roomName = roomNameFor(r.room_id);
              return roomName ? `${r.child_name} (${roomName})` : r.child_name;
            })
            .join(', '),
          parent_name: parentName,
          parent_phone: normalizedPhone,
          room_id: firstRecord.room_id ?? null,
          security_code: securityCode,
          allergies: null,
          medical_notes: null,
          special_instructions: null,
          authorized_pickups: authorizedPickups ?? null,
          label_type: 'parent',
          status: 'pending',
        }
      : null;

    const printJobs = parentJob ? [...childJobs, parentJob] : childJobs;

    const { error: printError } = await admin
      .from('cm_label_print_jobs')
      .insert(printJobs);

    if (printError) {
      printJobWarning = printError.message;
    } else {
      printJobsCreated = printJobs.length;
    }
  } catch {
    printJobWarning = 'Label jobs could not be queued';
  }

  return Response.json({
    securityCode,
    records: safeRecords,
    labels: immediateLabels,
    printJobsCreated,
    ...(printJobWarning ? { printJobWarning } : {}),
  });
}
