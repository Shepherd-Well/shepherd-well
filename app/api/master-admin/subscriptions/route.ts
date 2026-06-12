import { createClient } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { wrapClientForRoomsDebug } from '@/lib/debug-rooms';

function adminClient() {
  return wrapClientForRoomsDebug(
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
    'app/api/master-admin/subscriptions/route.ts adminClient()',
  );
}

async function getAuthUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await adminClient().auth.getUser(token);
  return user ?? null;
}

async function checkMasterAdmin(req: NextRequest): Promise<boolean> {
  const user = await getAuthUser(req);
  if (!user?.email) return false;
  const masterEmails = (process.env.OWNER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return masterEmails.includes(user.email.toLowerCase());
}

function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uniqueSlug(admin: ReturnType<typeof adminClient>, base: string): Promise<string> {
  const { data } = await admin.from('churches').select('slug').like('slug', `${base}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const CHURCH_SELECT =
  'id, name, city, state, email, phone, subscription_status, subscription_tier, trial_ends_at, created_at';

export async function GET(req: NextRequest) {
  const ok = await checkMasterAdmin(req);
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await adminClient()
    .from('churches')
    .select(CHURCH_SELECT)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ churches: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ok = await checkMasterAdmin(req);
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { churchId, action } = body as { churchId: string; action: string };
  if (!churchId || !action) {
    return Response.json({ error: 'churchId and action required' }, { status: 400 });
  }

  const admin = adminClient();
  const now = new Date();

  let updates: Record<string, unknown> = {};

  if (action === 'reset_trial_30' || action === 'reactivate_trial') {
    const newDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    updates = { subscription_status: 'trial', trial_ends_at: newDate.toISOString() };
  } else if (action === 'extend_trial_7' || action === 'extend_trial_30') {
    const days = action === 'extend_trial_7' ? 7 : 30;
    const { data: church } = await admin
      .from('churches')
      .select('trial_ends_at')
      .eq('id', churchId)
      .single();
    const base =
      church?.trial_ends_at && new Date(church.trial_ends_at) > now
        ? new Date(church.trial_ends_at)
        : now;
    const newDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    updates = { subscription_status: 'trial', trial_ends_at: newDate.toISOString() };
  } else if (action === 'mark_paid') {
    updates = { subscription_status: 'active', subscription_tier: 'paid' };
  } else if (action === 'suspend') {
    updates = { subscription_status: 'suspended' };
  } else {
    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { data, error } = await admin
    .from('churches')
    .update(updates)
    .eq('id', churchId)
    .select(CHURCH_SELECT)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ church: data });
}

export async function POST(req: NextRequest) {
  const ok = await checkMasterAdmin(req);
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const {
    churchName, city, state, churchEmail, phone,
    ownerEmail, ownerPassword,
    subscriptionStatus,
  } = body as {
    churchName: string;
    city?: string;
    state?: string;
    churchEmail?: string;
    phone?: string;
    ownerEmail: string;
    ownerPassword: string;
    subscriptionStatus?: 'trial' | 'active';
  };

  if (!churchName?.trim()) return Response.json({ error: 'Church name is required' }, { status: 400 });
  if (!ownerEmail?.trim()) return Response.json({ error: 'Owner email is required' }, { status: 400 });
  if (!ownerPassword || ownerPassword.length < 8) {
    return Response.json({ error: 'Owner password must be at least 8 characters' }, { status: 400 });
  }

  const admin = adminClient();

  // 1. Create or find owner auth user
  const normalizedOwnerEmail = ownerEmail.trim().toLowerCase();
  let ownerId: string;
  let createdAuthUser = false;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: normalizedOwnerEmail,
    password: ownerPassword,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.toLowerCase().includes('already been registered') || authError.message.toLowerCase().includes('already exists')) {
      // User already exists — look them up and link to the new church
      const { data: existingUsers } = await admin.auth.admin.listUsers();
      const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === normalizedOwnerEmail);
      if (!existing) {
        return Response.json({ error: `Owner account already exists but could not be located: ${authError.message}` }, { status: 400 });
      }
      ownerId = existing.id;
    } else {
      return Response.json({ error: `Owner account creation failed: ${authError.message}` }, { status: 400 });
    }
  } else {
    ownerId = authData.user.id;
    createdAuthUser = true;
  }

  // 2. Create church record
  const namePart = slugify(churchName.trim());
  const cityPart = city?.trim() ? slugify(city.trim()) : '';
  const baseSlug = cityPart ? `${namePart}-${cityPart}` : namePart;
  const slug = await uniqueSlug(admin, baseSlug);

  const isPaid = subscriptionStatus === 'active';
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: church, error: churchError } = await admin
    .from('churches')
    .insert({
      name: churchName.trim(),
      slug,
      email: churchEmail?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      subscription_status: isPaid ? 'active' : 'trial',
      subscription_tier: isPaid ? 'paid' : null,
      trial_ends_at: isPaid ? null : trialEndsAt,
    })
    .select(CHURCH_SELECT)
    .single();

  if (churchError) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(ownerId).catch(() => {});
    return Response.json({ error: `Church creation failed: ${churchError.message}` }, { status: 400 });
  }

  // 3. Link owner to church
  const { error: cuError } = await admin.from('church_users').insert({
    church_id: church.id,
    user_id: ownerId,
    role: 'admin',
  });
  if (cuError) console.error('[create-church] church_users:', cuError.message);

  // 4. Default departments
  const { error: deptErr } = await admin.from('departments').insert([
    { church_id: church.id, name: "General",              description: "All church members",                           color: "#1A4A2E", icon: "⛪" },
    { church_id: church.id, name: "Choir & Worship",      description: "Worship team and choir members",               color: "#7C3AED", icon: "🎵" },
    { church_id: church.id, name: "Youth Group",          description: "Teen ministry ages 13–17",                     color: "#F59E0B", icon: "⚡" },
    { church_id: church.id, name: "Children's Ministry",  description: "Children ages 12 and under",                   color: "#EC4899", icon: "🌟" },
    { church_id: church.id, name: "Men's Ministry",       description: "Men's fellowship and discipleship",            color: "#2563EB", icon: "🔥" },
    { church_id: church.id, name: "Women's Ministry",     description: "Women's fellowship and discipleship",          color: "#DB2777", icon: "❤️" },
    { church_id: church.id, name: "Young Adults",         description: "Young adults ages 18–35",                      color: "#059669", icon: "🌱" },
    { church_id: church.id, name: "Ushers & Greeters",    description: "Welcome and hospitality team",                 color: "#D97706", icon: "🤝" },
    { church_id: church.id, name: "Prayer Team",          description: "Intercessory prayer ministry",                 color: "#0891B2", icon: "🙏" },
    { church_id: church.id, name: "Volunteers",           description: "General church volunteers",                    color: "#65A30D", icon: "⭐" },
  ]);
  if (deptErr) console.error('[create-church] departments:', deptErr.message);

  return Response.json({ church });
}
