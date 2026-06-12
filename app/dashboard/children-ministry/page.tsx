"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const ACCENT = "#F28C28";

type Child = { id: string; first_name: string; last_name: string; date_of_birth: string | null };
type SessionSummary = { id: string; service_name: string; date: string; status: string };
type SpiritualBirthdayEntry = {
  id: string;
  child_id: string;
  completed_at: string;
  notes: string | null;
  first_name: string;
  last_name: string;
};

function upcomingBirthdays(children: Child[], days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: { child: Child; next: Date; daysAway: number }[] = [];
  for (const child of children) {
    if (!child.date_of_birth) continue;
    const dob = new Date(child.date_of_birth + "T00:00:00");
    const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (daysAway <= days) results.push({ child, next, daysAway });
  }
  return results.sort((a, b) => a.daysAway - b.daysAway);
}

function upcomingSpiritualBirthdays(entries: SpiritualBirthdayEntry[], days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: { entry: SpiritualBirthdayEntry; next: Date; daysAway: number; years: number }[] = [];
  for (const entry of entries) {
    const saved = new Date(entry.completed_at + "T00:00:00");
    const next = new Date(today.getFullYear(), saved.getMonth(), saved.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (daysAway <= days) {
      results.push({ entry, next, daysAway, years: next.getFullYear() - saved.getFullYear() });
    }
  }
  return results.sort((a, b) => a.daysAway - b.daysAway);
}

const SECTIONS = [
  { label: "📋 Check-In Setup", href: "/dashboard/children-ministry/checkin-setup", desc: "Manage sessions & rooms" },
  { label: "⚡ Live Check-In", href: "/dashboard/children-ministry/live-checkin", desc: "View who's checked in now" },
  { label: "📊 Attendance Reports", href: "/dashboard/children-ministry/attendance-report", desc: "Historical attendance data" },
  { label: "🧒 Children", href: "/dashboard/children-ministry/children", desc: "Child directory & profiles" },
  { label: "👨‍👩‍👧 Parents", href: "/dashboard/children-ministry/parents", desc: "All registered families" },
  { label: "📧 Parent Update", href: "/dashboard/children-ministry/parent-update", desc: "Send family communications" },
];

export default function ChildrenMinistryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Child[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [spiritualBirthdayEntries, setSpiritualBirthdayEntries] = useState<SpiritualBirthdayEntry[]>([]);

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        console.log("Dashboard client user unavailable:", error?.message ?? null);
        return;
      }
      const [childrenRes, sessionsRes, spiritualBdRes] = await Promise.all([
        apiFetch("/api/children-ministry/children", { credentials: "include" }),
        apiFetch("/api/checkin/attendance-report", { credentials: "include" }),
        apiFetch("/api/children-ministry/spiritual-birthdays", { credentials: "include" }),
      ]);
      if (childrenRes.ok) { const d = await childrenRes.json(); setChildren(d.children ?? []); }
      if (sessionsRes.ok) { const d = await sessionsRes.json(); setRecentSessions((d.sessions ?? []).slice(0, 4)); }
      if (spiritualBdRes.ok) { const d = await spiritualBdRes.json(); setSpiritualBirthdayEntries(d.entries ?? []); }
      setLoading(false);
    }
    init();
  }, [router]);

  const birthdays = upcomingBirthdays(children);
  const spiritualBirthdays = upcomingSpiritualBirthdays(spiritualBirthdayEntries);

  if (loading) return (
    <MinistryShell type="childrens">
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400" style={{ fontFamily: "Georgia, serif" }}>Loading…</div>
      </div>
    </MinistryShell>
  );

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm font-medium mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Children's Ministry</h1>
        <p className="text-orange-100 text-sm mt-1">{children.length} children enrolled</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Children", value: children.length, emoji: "🧒" },
            { label: "Upcoming Birthdays", value: birthdays.length, emoji: "🎂", sub: "next 30 days" },
            { label: "Spiritual Birthdays", value: spiritualBirthdays.length, emoji: "✝️", sub: "this week" },
            { label: "Recent Sessions", value: recentSessions.length, emoji: "📋" },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl shadow-md px-5 py-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: ACCENT + "22" }}>
                {card.emoji}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">Sections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {SECTIONS.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="bg-white rounded-xl shadow border border-gray-100 px-5 py-4 hover:border-orange-200 hover:shadow-md transition-all block"
            >
              <p className="font-bold text-gray-900 text-sm mb-0.5">{s.label}</p>
              <p className="text-xs text-gray-400">{s.desc}</p>
            </Link>
          ))}
        </div>

        {/* Spiritual Birthdays This Week */}
        {spiritualBirthdays.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-6 border border-gray-100 mb-6">
            <h2 className="font-bold text-gray-800 mb-4" style={{ fontFamily: "Georgia, serif" }}>✝️ Spiritual Birthdays This Week</h2>
            <div className="space-y-1">
              {spiritualBirthdays.map(({ entry, next, daysAway, years }) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{entry.first_name} {entry.last_name}</p>
                    <p className="text-xs text-gray-400">
                      {next.toLocaleDateString("en-US", { month: "long", day: "numeric" })} · {years} {years === 1 ? "year" : "years"} ago
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{
                    backgroundColor: daysAway === 0 ? "#fef9c3" : daysAway <= 3 ? "#fef3c7" : "#f0fdf4",
                    color: daysAway === 0 ? "#713f12" : daysAway <= 3 ? "#92400e" : "#166534",
                  }}>
                    {daysAway === 0 ? "Today! 🎉" : daysAway === 1 ? "Tomorrow" : `${daysAway} days`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Birthdays */}
          <div className="bg-white rounded-2xl shadow p-6 border border-gray-100">
            <h2 className="font-bold text-gray-800 mb-4" style={{ fontFamily: "Georgia, serif" }}>🎂 Upcoming Birthdays</h2>
            {birthdays.length === 0 ? (
              <p className="text-sm text-gray-400">No birthdays in the next 30 days.</p>
            ) : (
              <div className="space-y-1">
                {birthdays.map(({ child, next, daysAway }) => (
                  <div key={child.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{child.first_name} {child.last_name}</p>
                      <p className="text-xs text-gray-400">{next.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{
                      backgroundColor: daysAway === 0 ? "#fef9c3" : daysAway <= 7 ? "#fef3c7" : "#f0fdf4",
                      color: daysAway === 0 ? "#713f12" : daysAway <= 7 ? "#92400e" : "#166534",
                    }}>
                      {daysAway === 0 ? "Today! 🎉" : daysAway === 1 ? "Tomorrow" : `${daysAway} days`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Check-In Sessions */}
          <div className="bg-white rounded-2xl shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>📋 Recent Check-Ins</h2>
              <Link href="/dashboard/children-ministry/attendance-report" className="text-xs font-medium" style={{ color: ACCENT }}>View all →</Link>
            </div>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-gray-400">
                No sessions yet.{" "}
                <Link href="/dashboard/children-ministry/checkin-setup" className="underline" style={{ color: ACCENT }}>Set one up →</Link>
              </p>
            ) : (
              <div className="space-y-1">
                {recentSessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{s.service_name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.status === "open" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MinistryShell>
  );
}
