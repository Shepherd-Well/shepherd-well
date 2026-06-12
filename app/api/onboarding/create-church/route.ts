import { createClient } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { wrapClientForRoomsDebug } from '@/lib/debug-rooms';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uniqueSlug(
  supabase: { from: (table: string) => any },
  base: string,
): Promise<string> {
  const { data } = await supabase
    .from('churches')
    .select('slug')
    .like('slug', `${base}%`);

  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    churchName,
    email,
    phone,
    website,
    address,
    city,
    state,
    zip,
    qrCheckin,
  } = body;

  if (!churchName?.trim()) {
    return Response.json({ error: 'Church name is required' }, { status: 400 });
  }

  const supabaseAdmin = wrapClientForRoomsDebug(
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    ),
    'app/api/onboarding/create-church/route.ts supabaseAdmin',
  );

  // Get the authenticated user from the Authorization header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Generate unique slug from church name + city
  const namePart = slugify(churchName);
  const cityPart = city?.trim() ? slugify(city.trim()) : '';
  const baseSlug = cityPart ? `${namePart}-${cityPart}` : namePart;
  const slug = await uniqueSlug(supabaseAdmin, baseSlug);

  // Insert church
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: church, error: churchError } = await supabaseAdmin
    .from('churches')
    .insert({
      name: churchName.trim(),
      slug,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zip: zip?.trim() || null,
      qr_checkin_enabled: qrCheckin ?? false,
      trial_ends_at: trialEndsAt,
      subscription_status: 'trial',
    })
    .select('id')
    .single();

  if (churchError) {
    console.log('Church insert error:', churchError);
    return Response.json({ error: churchError.message }, { status: 400 });
  }

  // Link user to church as admin
  const { error: memberError } = await supabaseAdmin
    .from('church_users')
    .insert({
      church_id: church.id,
      user_id: user.id,
      role: 'admin',
    });

  if (memberError) {
    console.log('church_users insert error:', memberError);
    return Response.json({ error: memberError.message }, { status: 400 });
  }

  // Insert default departments
  const defaultDepartments = [
    { name: "General", description: "All church members", color: "#1A4A2E", icon: "⛪" },
    { name: "Choir & Worship", description: "Worship team and choir members", color: "#7C3AED", icon: "🎵" },
    { name: "Youth Group", description: "Teen ministry ages 13-17", color: "#F59E0B", icon: "⚡" },
    { name: "Children's Ministry", description: "Children ages 12 and under", color: "#EC4899", icon: "🌟" },
    { name: "Men's Ministry", description: "Men's fellowship and discipleship", color: "#2563EB", icon: "🔥" },
    { name: "Women's Ministry", description: "Women's fellowship and discipleship", color: "#DB2777", icon: "❤️" },
    { name: "Young Adults", description: "Young adults ages 18-35", color: "#059669", icon: "🌱" },
    { name: "Ushers & Greeters", description: "Welcome and hospitality team", color: "#D97706", icon: "🤝" },
    { name: "Prayer Team", description: "Intercessory prayer ministry", color: "#0891B2", icon: "🙏" },
    { name: "Volunteers", description: "General church volunteers", color: "#65A30D", icon: "⭐" },
    { name: "Senior Ministry", description: "Ministry for senior members of the congregation", color: "#6366F1", icon: "🕊️" },
    { name: "Sunday School Teachers", description: "Teachers and leaders for Sunday school programs", color: "#0EA5E9", icon: "📖" },
    { name: "Missions", description: "Outreach and missionary programs", color: "#DC2626", icon: "🌍" },
    { name: "Bible Study Groups", description: "Small group Bible study and discipleship", color: "#7C2D12", icon: "📚" },
  ];

  const { error: deptError } = await supabaseAdmin
    .from('departments')
    .insert(defaultDepartments.map((d) => ({ ...d, church_id: church.id })));

  if (deptError) {
    console.log('Default departments insert error:', deptError);
  }

  return Response.json({ success: true, church_id: church.id });
}
