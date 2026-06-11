import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api-auth";
import DashboardClient from "./DashboardClient";

type Church = { id: string; name: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const params = await searchParams;
  const admin = adminClient();

  // ── Determine platform-admin status ───────────────────────────────────────
  // Two sources of truth, same as the subscriptions API:
  //   1. platform_admins DB table
  //   2. OWNER_EMAILS env var (comma-separated)
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const ownerEmails = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isOwnerEmail =
    !!user.email &&
    ownerEmails.length > 0 &&
    ownerEmails.includes(user.email.toLowerCase());

  const isPlatformAdmin = !!adminRow || isOwnerEmail;

  // ── Handle ?churchId param ────────────────────────────────────────────────
  // If present, ONLY platform admins may use it.
  // Never silently fall through to a different church on failure.
  const requestedChurchId =
    typeof params.churchId === "string" ? params.churchId : null;

  if (requestedChurchId) {
    if (!isPlatformAdmin) {
      // Normal user attempting church context switch — strip param and redirect.
      redirect("/dashboard");
    }

    const { data: churchData } = await admin
      .from("churches")
      .select("id, name")
      .eq("id", requestedChurchId)
      .maybeSingle();

    if (!churchData) {
      // churchId not found — return to selector, never fall back to another church.
      redirect("/dashboard");
    }

    return (
      <DashboardClient
        userId={user.id}
        userEmail={user.email ?? null}
        churchId={churchData.id}
        churchName={churchData.name}
        isPlatformAdmin
        allChurches={[]}
      />
    );
  }

  // ── Platform admin without churchId → church selector ────────────────────
  if (isPlatformAdmin) {
    const { data: churches } = await admin
      .from("churches")
      .select("id, name")
      .order("name");

    return (
      <DashboardClient
        userId={user.id}
        userEmail={user.email ?? null}
        churchId={null}
        churchName={null}
        isPlatformAdmin
        allChurches={(churches ?? []) as Church[]}
      />
    );
  }

  // ── Normal church user ────────────────────────────────────────────────────
  const { data: churchUsers } = await admin
    .from("church_users")
    .select("church_id, churches(name)")
    .eq("user_id", user.id)
    .limit(1);

  const churchUser = (churchUsers ?? [])[0] ?? null;
  if (!churchUser) redirect("/onboarding");

  const churchName =
    (churchUser.churches as unknown as { name: string } | null)?.name ?? null;

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email ?? null}
      churchId={churchUser.church_id}
      churchName={churchName}
      isPlatformAdmin={false}
      allChurches={[]}
    />
  );
}
