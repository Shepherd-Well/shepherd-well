"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell, { type NavItem } from "@/components/layout/AppShell";
import { MINISTRY_NAV_ITEMS } from "@/lib/ministry-config";

const supabase = createClient();

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Church Family", href: "#", isSection: true },
  { label: "👥 Members", href: "/dashboard/members" },
  { label: "🏛️ Departments", href: "/dashboard/departments" },
  { label: "🆕 Visitors", href: "/dashboard/visitors" },
  { label: "Engagement", href: "#", isSection: true },
  { label: "📅 Calendar", href: "/dashboard/calendar" },
  { label: "✅ Attendance", href: "/dashboard/attendance" },
  { label: "📋 Bulletin", href: "/dashboard/bulletin" },
  { label: "📢 Communication Hub", href: "/dashboard/communication" },
  { label: "Pastoral Care", href: "#", isSection: true },
  { label: "🙏 Annual Pastor Touch", href: "/dashboard/pastor-touch" },
  { label: "🏥 Visitation", href: "/dashboard/visitation" },
  { label: "🎂 Birthdays", href: "/dashboard/birthdays" },
  { label: "🔄 Shepherd Pipeline", href: "/dashboard/shepherd" },
  { label: "🙋 Prayer", href: "/dashboard/prayer" },
  { label: "Ministry", href: "#", isSection: true },
  ...MINISTRY_NAV_ITEMS,
  { label: "Outreach", href: "#", isSection: true },
  { label: "✝️ Evangelism", href: "/dashboard/evangelism" },
  { label: "📧 Visitor Onboarding", href: "/dashboard/visitors/sequences" },
  { label: "Marketing", href: "#", isSection: true },
  { label: "⭐ Review Campaign", href: "/dashboard/reviews" },
  { label: "Settings", href: "#", isSection: true },
  { label: "⚙️ Settings", href: "/dashboard/settings" },
  { label: "💳 Billing", href: "/dashboard/billing" },
  { label: "📖 Tutorials", href: "/dashboard/tutorials" },
];

const MODULE_CARDS = [
  { label: "Members", href: "/dashboard/members", desc: "Manage your congregation", emoji: "👥", gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)" },
  { label: "Departments", href: "/dashboard/departments", desc: "Ministries & teams", emoji: "🏛️", gradient: "linear-gradient(135deg, #a855f7, #7c3aed)" },
  { label: "Visitors", href: "/dashboard/visitors", desc: "Track & follow up visitors", emoji: "🆕", gradient: "linear-gradient(135deg, #8b5cf6, #6d28d9)" },
  { label: "Calendar", href: "/dashboard/calendar", desc: "Events & scheduling", emoji: "📅", gradient: "linear-gradient(135deg, #f59e0b, #d97706)" },
  { label: "Attendance", href: "/dashboard/attendance", desc: "Track service attendance", emoji: "✅", gradient: "linear-gradient(135deg, #14b8a6, #0f766e)" },
  { label: "Communication", href: "/dashboard/communication", desc: "Keep every ministry connected", emoji: "📢", gradient: "linear-gradient(135deg, #06b6d4, #0e7490)" },
  { label: "Annual Pastor Touch", href: "/dashboard/pastor-touch", desc: "Personal touch for every member", emoji: "🙏", gradient: "linear-gradient(135deg, #7c3aed, #4338ca)" },
  { label: "Visitation", href: "/dashboard/visitation", desc: "Member care & visits", emoji: "🏥", gradient: "linear-gradient(135deg, #fb7185, #be123c)" },
  { label: "Birthdays", href: "/dashboard/birthdays", desc: "Birthdays, anniversaries & letters", emoji: "🎂", gradient: "linear-gradient(135deg, #f59e0b, #92400e)" },
  { label: "Prayer", href: "/dashboard/prayer", desc: "Prayer requests & updates", emoji: "🙋", gradient: "linear-gradient(135deg, #22c55e, #15803d)" },
  { label: "Evangelism", href: "/dashboard/evangelism", desc: "Share the Gospel", emoji: "✝️", gradient: "linear-gradient(135deg, #ef4444, #991b1b)" },
  { label: "Ministry Rosters", href: "/dashboard/ministry/childrens", desc: "Roster, attendance & follow-up", emoji: "⛪", gradient: "linear-gradient(135deg, #6366f1, #4338ca)" },
  { label: "Bible Study Pods", href: "/dashboard/bible-study-pods", desc: "Small groups & curriculum", emoji: "🏠", gradient: "linear-gradient(135deg, #0ea5e9, #0369a1)" },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Stats = {
  members: number | null;
  events: number | null;
  prayers: number | null;
};

type Church = { id: string; name: string };

type Props = {
  userId: string;
  userEmail: string | null;
  churchId: string | null;
  churchName: string | null;
  isPlatformAdmin: boolean;
  allChurches: Church[];
};

export default function DashboardClient({
  userId,
  userEmail,
  churchId,
  churchName,
  isPlatformAdmin,
  allChurches,
}: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ members: null, events: null, prayers: null });
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    if (isPlatformAdmin || !churchId) return;
    fetch("/api/trial-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { expired: false }))
      .then((d) => { if (d.expired) setTrialExpired(true); })
      .catch(() => {});
  }, [isPlatformAdmin, churchId]);

  useEffect(() => {
    if (!churchId) return;

    async function fetchStats() {
      const [membersRes, eventsRes, prayersRes] = await Promise.all([
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("church_id", churchId),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("church_id", churchId)
          .gt("starts_at", new Date().toISOString()),
        supabase
          .from("prayer_requests")
          .select("id", { count: "exact", head: true })
          .eq("church_id", churchId)
          .eq("status", "open"),
      ]);

      setStats({
        members: membersRes.count ?? 0,
        events: eventsRes.count ?? 0,
        prayers: prayersRes.count ?? 0,
      });
    }

    fetchStats();
  }, [churchId]);

  function handleChurchSelect(church: Church) {
    localStorage.setItem("selected_church_id", church.id);
    localStorage.setItem("selected_church_name", church.name);
    router.push(`/dashboard?churchId=${church.id}`);
  }

  // Platform admin all-churches view
  if (isPlatformAdmin && !churchId) {
    return (
      <AppShell navItems={navItems}>
        <div
          className="px-8 py-10"
          style={{ background: "linear-gradient(135deg, #1A4A2E 0%, #2D6B42 100%)" }}
        >
          <p className="text-green-200 text-sm font-medium mb-1">{formatDate()}</p>
          <h1 className="text-3xl font-bold text-white mb-1">Master Admin</h1>
          {userEmail && (
            <p className="text-green-300 text-sm mt-2">Signed in as {userEmail}</p>
          )}
        </div>

        <div className="px-8 py-8 bg-gray-50 min-h-screen">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            All Churches ({allChurches.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allChurches.map((church) => (
              <button
                key={church.id}
                onClick={() => handleChurchSelect(church)}
                className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 text-left w-full hover:border-green-700 hover:shadow-md transition-all cursor-pointer"
              >
                <p className="font-semibold text-gray-900">{church.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{church.id}</p>
              </button>
            ))}
            {allChurches.length === 0 && (
              <p className="text-gray-400 text-sm col-span-full">No churches found.</p>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  if (trialExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center max-w-md w-full">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-5"
            style={{ backgroundColor: "#F28C2818" }}
          >
            ⏰
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "Georgia, serif" }}>
            Your free trial has ended
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            To continue using ShepherdWell, please contact us to activate your subscription.
          </p>
          <a
            href="mailto:support@shepherdwell.com"
            className="inline-block px-7 py-2.5 rounded-xl font-semibold text-sm text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#1A4A2E" }}
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  return (
    <AppShell navItems={navItems}>
      <div
        className="px-8 py-10"
        style={{ background: "linear-gradient(135deg, #1A4A2E 0%, #2D6B42 100%)" }}
      >
        {isPlatformAdmin && (
          <button
            onClick={() => {
              localStorage.removeItem("selected_church_id");
              localStorage.removeItem("selected_church_name");
              router.push("/dashboard");
            }}
            className="text-green-300 hover:text-white text-sm mb-2 block transition-colors"
          >
            ← All Churches
          </button>
        )}
        <p className="text-green-200 text-sm font-medium mb-1">{formatDate()}</p>
        <h1 className="text-3xl font-bold text-white mb-1">
          {getGreeting()}{churchName ? `, ${churchName}` : ""}
        </h1>
        {userEmail && (
          <p className="text-green-300 text-sm mt-2">Signed in as {userEmail}</p>
        )}
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 -mt-6">
          {[
            { label: "Total Members", value: stats.members, emoji: "👥", color: "#3b82f6" },
            { label: "Upcoming Events", value: stats.events, emoji: "📅", color: "#f59e0b" },
            { label: "Open Prayer Requests", value: stats.prayers, emoji: "🙏", color: "#22c55e" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl shadow-md px-6 py-5 flex items-center gap-4 border border-gray-100"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor: stat.color + "18" }}
              >
                {stat.emoji}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stat.value === null ? "—" : stat.value}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Modules
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {MODULE_CARDS.map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="group block rounded-2xl p-5 text-white transition-transform duration-150 hover:-translate-y-1 hover:shadow-xl shadow-md"
              style={{ background: card.gradient }}
            >
              <div className="text-3xl mb-3">{card.emoji}</div>
              <p className="font-bold text-base leading-tight">{card.label}</p>
              <p className="text-xs mt-1 opacity-75 leading-snug">{card.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
