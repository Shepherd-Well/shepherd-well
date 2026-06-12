"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG } from "@/lib/ministry-config";

const supabase = createClient();

// Only these ministry types show wedding anniversaries
const ANNIVERSARY_TYPES = new Set(["mens", "womens", "seniors", "ushers"]);

type BirthdayEntry = {
  member_id: string;
  first_name: string;
  last_name: string;
  event_type: "birthday" | "anniversary" | "spiritual_birthday";
  date: string;
  age: number | null;
  is_milestone: boolean;
  is_visitor: boolean;
};

const BIRTHDAY_MILESTONES           = new Set([1, 5, 10, 16, 18, 21, 25, 30, 40, 50, 60, 70, 75, 80]);
const ANNIVERSARY_MILESTONES        = new Set([1, 5, 10, 15, 20, 25, 30, 40, 50]);
const SPIRITUAL_BIRTHDAY_MILESTONES = new Set([1, 5, 10, 15, 20, 25, 30, 40, 50]);

function isMilestone(years: number | null, type: BirthdayEntry["event_type"]): boolean {
  if (!years) return false;
  if (type === "birthday")          return BIRTHDAY_MILESTONES.has(years);
  if (type === "anniversary")       return ANNIVERSARY_MILESTONES.has(years);
  return SPIRITUAL_BIRTHDAY_MILESTONES.has(years);
}

function calcAge(dateStr: string): number | null {
  if (!dateStr) return null;
  const birth = new Date(dateStr + "T00:00:00");
  if (isNaN(birth.getTime()) || birth.getFullYear() < 1900) return null;
  return new Date().getFullYear() - birth.getFullYear();
}

export default function MinistryBirthdaysPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const cfg = MINISTRY_CONFIG[type];
  const showAnniversary = ANNIVERSARY_TYPES.has(type);

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<BirthdayEntry[]>([]);

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        console.log("Dashboard client user unavailable:", error?.message ?? null);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const t = session.access_token;

      const [rosterRes, membersRes, visitorsRes] = await Promise.all([
        apiFetch(`/api/ministry/${type}/roster`, { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch("/api/members", { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch(`/api/ministry/${type}/visitors`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);

      if (!rosterRes.ok) { setLoading(false); return; }
      const roster = (await rosterRes.json()).roster ?? [];
      const allMembers: any[] = membersRes.ok ? (await membersRes.json()).members ?? [] : [];
      const visitors: any[] = visitorsRes.ok ? (await visitorsRes.json()).visitors ?? [] : [];

      const memberIds = new Set(roster.map((r: any) => r.member_id as string));
      const rosterMembers = allMembers.filter((m: any) => memberIds.has(m.id));

      const thisMonth = new Date().getMonth() + 1;
      const result: BirthdayEntry[] = [];

      for (const m of rosterMembers) {
        const checks: Array<{ date: string | null; type: BirthdayEntry["event_type"] }> = [
          { date: m.birthdate,          type: "birthday" },
          { date: showAnniversary ? m.anniversary : null, type: "anniversary" },
          { date: m.spiritual_birthday, type: "spiritual_birthday" },
        ];

        for (const { date, type: evType } of checks) {
          if (!date) continue;
          const d = new Date(date + "T00:00:00");
          if (d.getMonth() + 1 === thisMonth) {
            const age = calcAge(date);
            result.push({
              member_id: m.id,
              first_name: m.first_name,
              last_name: m.last_name,
              event_type: evType,
              date,
              age,
              is_milestone: isMilestone(age, evType),
              is_visitor: false,
            });
          }
        }
      }

      for (const v of visitors) {
        const date: string | null = v.date_of_birth ?? v.birthdate ?? null;
        if (!date) continue;
        const d = new Date(date + "T00:00:00");
        if (d.getMonth() + 1 === thisMonth) {
          const age = calcAge(date);
          result.push({
            member_id: v.id,
            first_name: v.first_name,
            last_name: v.last_name,
            event_type: "birthday",
            date,
            age,
            is_milestone: isMilestone(age, "birthday"),
            is_visitor: true,
          });
        }
      }

      result.sort((a, b) =>
        new Date(a.date + "T00:00:00").getDate() - new Date(b.date + "T00:00:00").getDate()
      );

      setEntries(result);
      setLoading(false);
    }
    init();
  }, [type, router, showAnniversary]);

  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  function eventIcon(t: BirthdayEntry["event_type"]) {
    if (t === "birthday") return "🎂";
    if (t === "anniversary") return "💍";
    return "🕊️";
  }

  function eventBg(t: BirthdayEntry["event_type"]) {
    if (t === "birthday") return "#fef3c7";
    if (t === "anniversary") return "#fce7f3";
    return "#ede9fe";
  }

  function eventLabel(t: BirthdayEntry["event_type"]) {
    if (t === "birthday") return "Birthday";
    if (t === "anniversary") return "Anniversary";
    return "Spiritual Birthday";
  }

  function yearsLabel(e: BirthdayEntry) {
    if (!e.age || e.is_milestone) return "";
    if (e.event_type === "birthday") return `${e.age} years old`;
    if (e.event_type === "anniversary") return `${e.age} years`;
    return `${e.age} years in faith`;
  }

  function milestoneLabel(e: BirthdayEntry) {
    if (!e.age) return "";
    if (e.event_type === "birthday") return `🎉 ${e.age}th Birthday`;
    if (e.event_type === "anniversary") return `🎉 ${e.age}th Anniversary`;
    return `🎉 ${e.age} Years in Faith`;
  }

  if (loading) return <MinistryShell type={type}><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type={type}>
      <div className="px-8 py-8" style={{ background: "linear-gradient(135deg, #1a2e1a 0%, #2d5a2d 100%)" }}>
        <Link href={`/dashboard/ministry/${type}`} className="text-green-300 text-xs mb-1 block hover:text-white">← {cfg?.name}</Link>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>
          🎂 Birthdays{showAnniversary ? ", Anniversaries" : ""} & Spiritual Birthdays
        </h1>
        <p className="text-green-200 text-sm mt-1">{monthName} · {entries.length} celebration{entries.length !== 1 ? "s" : ""} this month</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {entries.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <div className="text-5xl mb-4">🎂</div>
            <p className="text-gray-400">No celebrations in {monthName} for {cfg?.name} members.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
              const day = new Date(e.date + "T00:00:00").getDate();
              return (
                <div key={`${e.member_id}-${e.event_type}`} className="bg-white rounded-2xl shadow border border-gray-100 px-5 py-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: eventBg(e.event_type) }}>
                    {eventIcon(e.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-gray-900">{e.first_name} {e.last_name}</p>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: e.is_visitor ? "#e0f2fe" : "#dcfce7", color: e.is_visitor ? "#0369a1" : "#166534" }}>
                        {e.is_visitor ? "Visitor" : "Member"}
                      </span>
                      {e.is_milestone && e.age && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#F28C28", color: "white" }}>
                          {milestoneLabel(e)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      {eventLabel(e.event_type)} — {monthName} {day}
                      {yearsLabel(e) ? ` · ${yearsLabel(e)}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/members/${e.member_id}/edit`}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-green-300 transition-colors flex-shrink-0"
                  >
                    View
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MinistryShell>
  );
}
