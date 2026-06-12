"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();


const CM_ACCENT = "#F28C28";

type Season = { id: string; name: string; status: string; start_date: string; end_date: string };
type Child = { id: string; first_name: string; last_name: string; grade: string; team?: { color: string; name: string } | null };
type AttendanceRecord = { child_id: string; session_date: string; present: boolean; consecutive_weeks: number };

function getRecentSundays(count = 8): string[] {
  const sundays: string[] = [];
  const d = new Date();
  // Go back to most recent Sunday
  d.setDate(d.getDate() - d.getDay());
  for (let i = 0; i < count; i++) {
    sundays.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 7);
  }
  return sundays;
}

function formatSunday(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AttendancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [toggling, setToggling] = useState<string | null>(null); // "childId:date"
  const [streak, setStreak] = useState<{ childId: string; weeks: number; bonus?: number } | null>(null);

  const sundays = useMemo(() => getRecentSundays(8), []);

  // Build lookup: "childId:date" → present boolean
  const attendanceMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of records) m[`${r.child_id}:${r.session_date}`] = r.present;
    return m;
  }, [records]);

  const streakMap = useMemo(() => {
    // Records are already sorted descending by session_date — first record per child wins
    const m: Record<string, number> = {};
    for (const r of records) {
      if (m[r.child_id] === undefined) {
        m[r.child_id] = r.consecutive_weeks;
      }
    }
    return m;
  }, [records]);

  async function loadAttendance(t: string, sid: string) {
    const res = await apiFetch(`/api/children-ministry/attendance?season_id=${sid}`, { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    setRecords(data.attendance ?? []);
  }

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
      setToken(t);

      const [sRes, cRes] = await Promise.all([
        apiFetch("/api/children-ministry/seasons", { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch("/api/children-ministry/children", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      const allSeasons: Season[] = sData.seasons ?? [];
      setSeasons(allSeasons);
      const active = allSeasons.find(s => s.status === "active") ?? allSeasons[0] ?? null;
      setActiveSeason(active);
      setChildren(cData.children ?? []);
      if (active) await loadAttendance(t, active.id);
      setLoading(false);
    }
    init();
  }, [router]);

  async function toggleAttendance(child: Child, date: string) {
    if (!activeSeason || !token) return;
    const key = `${child.id}:${date}`;
    if (toggling) return;
    setToggling(key);

    const currentlyPresent = attendanceMap[key] ?? false;
    const res = await apiFetch("/api/children-ministry/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seasonId: activeSeason.id, childId: child.id, sessionDate: date, present: !currentlyPresent }),
    });

    const data = await res.json();

    if (res.ok && !currentlyPresent && data.streakBonusAwarded) {
      setStreak({ childId: child.id, weeks: data.consecutiveWeeks, bonus: data.consecutiveWeeks === 3 ? 2500 : data.consecutiveWeeks === 5 ? 5000 : data.consecutiveWeeks === 10 ? 10000 : 25000 });
      setTimeout(() => setStreak(null), 4000);
    }

    await loadAttendance(token, activeSeason.id);
    setToggling(null);
  }

  function exportCSV() {
    const headers = ["Name", "Grade", "Team", ...sundays.map(formatSunday), "Streak"];
    const rows = children.map(c => [
      `${c.first_name} ${c.last_name}`,
      c.grade,
      c.team?.name ?? "",
      ...sundays.map(s => attendanceMap[`${c.id}:${s}`] ? "✓" : ""),
      streakMap[c.id] ?? 0,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "attendance.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <MinistryShell type="childrens"><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${CM_ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Attendance</h1>
        {activeSeason && <p className="text-orange-100 text-sm mt-1">{activeSeason.name}</p>}
      </div>

      {/* Streak bonus toast */}
      {streak && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl px-8 py-5 text-center border-2" style={{ borderColor: CM_ACCENT }}>
          <div className="text-3xl mb-1">🔥</div>
          <p className="font-bold text-gray-900">{children.find(c => c.id === streak.childId)?.first_name} — {streak.weeks}-Week Streak!</p>
          <p className="text-sm font-bold" style={{ color: CM_ACCENT }}>+{streak.bonus?.toLocaleString()} bonus points awarded!</p>
        </div>
      )}

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">Tap a cell to mark present/absent. Streak bonuses auto-award at 3, 5, and 10 weeks.</p>
          <button onClick={exportCSV} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-white">
            ⬇️ Export CSV
          </button>
        </div>

        {children.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <p className="text-gray-400">No children found. <a href="/dashboard/children-ministry/children" style={{ color: CM_ACCENT }} className="underline">Add children →</a></p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest sticky left-0 bg-white">Child</th>
                  {sundays.map(s => (
                    <th key={s} className="px-3 py-3 text-xs font-semibold text-gray-400 text-center whitespace-nowrap">{formatSunday(s)}</th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-center">Streak</th>
                </tr>
              </thead>
              <tbody>
                {children.map(child => (
                  <tr key={child.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: child.team?.color ?? CM_ACCENT }}>
                          {child.first_name[0]}{child.last_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{child.first_name} {child.last_name}</p>
                          <p className="text-xs text-gray-400">{child.grade}{child.team ? ` · ${child.team.name}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    {sundays.map(date => {
                      const key = `${child.id}:${date}`;
                      const present = attendanceMap[key];
                      const isToggling = toggling === key;
                      return (
                        <td key={date} className="px-3 py-3 text-center">
                          <button
                            onClick={() => toggleAttendance(child, date)}
                            disabled={!!toggling}
                            className="w-9 h-9 rounded-full flex items-center justify-center mx-auto transition-all hover:scale-110"
                            style={{
                              backgroundColor: present ? (child.team?.color ?? CM_ACCENT) : "#f3f4f6",
                              opacity: isToggling ? 0.5 : 1,
                            }}
                          >
                            {present ? <span className="text-white text-sm font-bold">✓</span> : <span className="text-gray-400 text-sm">·</span>}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      {(streakMap[child.id] ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: CM_ACCENT }}>
                          🔥 {streakMap[child.id]}
                        </span>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MinistryShell>
  );
}
