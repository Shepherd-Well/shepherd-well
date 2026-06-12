"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG } from "@/lib/ministry-config";

const supabase = createClient();

const ACCENT = "#F28C28";

// ── Existing types ──
type AttendanceMember = { id: string; first_name: string; last_name: string; pipeline_stage: string | null };
type AttendanceRecord = { member_id: string; session_date: string; present: boolean; consecutive_weeks: number };

// ── New types ──
type MCRecord = { id: string; member_id: string | null; visitor_name: string | null };
type NVVisitor = {
  id: string; first_name: string; last_name: string;
  email: string | null; phone: string | null;
  visit_count: number; first_visit_date: string; last_visit_date: string;
  status: string; notes: string | null; attendance: string[];
};

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function visitBadge(count: number) {
  return count === 1 ? "1st Visit" : count === 2 ? "2nd Visit" : count === 3 ? "3rd Visit" : "4+ Visits";
}
function visitColor(count: number) {
  return count === 1 ? "#3b82f6" : count === 2 ? "#8b5cf6" : count === 3 ? ACCENT : "#16a34a";
}

export default function AttendancePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const cfg = MINISTRY_CONFIG[type];


  // ── Existing state ──
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [toggling, setToggling] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  // ── New state: tabs ──
  const [activeTab, setActiveTab] = useState<"attendance" | "visitors">("attendance");

  // ── New state: check-in session ──
  const [checkinSession, setCheckinSession] = useState<{ id: string; service_name: string } | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [checkinRecords, setCheckinRecords] = useState<MCRecord[]>([]);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ name: "", phone: "", email: "" });
  const [savingWalkIn, setSavingWalkIn] = useState(false);
  const [togglingCheckin, setTogglingCheckin] = useState<string | null>(null);

  // ── New state: new visitors tab ──
  const [nvSessions, setNvSessions] = useState<any[]>([]);
  const [nvLoaded, setNvLoaded] = useState(false);
  const [nvLoading, setNvLoading] = useState(false);
  const [nvEmails, setNvEmails] = useState<Record<string, string>>({});
  const [nvPersonalize, setNvPersonalize] = useState<Record<string, string>>({});
  const [nvPersonalizeOpen, setNvPersonalizeOpen] = useState<Record<string, boolean>>({});
  const [nvSending, setNvSending] = useState<Record<string, string>>({});

  // ── Existing memos ──
  const attendanceMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of records) m[`${r.member_id}:${r.session_date}`] = r.present;
    return m;
  }, [records]);

  const streakMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of records) {
      if (m[r.member_id] === undefined) m[r.member_id] = r.consecutive_weeks;
    }
    return m;
  }, [records]);

  const displaySessions = useMemo(() => {
    const s = new Set(sessions);
    s.add(sessionDate);
    return Array.from(s).sort().reverse().slice(0, 8);
  }, [sessions, sessionDate]);

  // ── Existing load ──
  async function load(t: string) {
    const res = await apiFetch(`/api/ministry/${type}/attendance?sessions=8`, { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    setMembers(data.members ?? []);
    setSessions(data.sessions ?? []);
    setRecords(data.records ?? []);
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
      await load(t);
      setLoading(false);
    }
    init();
  }, [type, router]);

  // ── Lazy load visitors tab ──
  useEffect(() => {
    if (activeTab === "visitors" && token && !nvLoaded) {
      setNvLoaded(true);
      loadVisitors(token);
    }
  }, [activeTab, token, nvLoaded]);

  // ── Existing functions ──
  async function toggleAttendance(memberId: string, date: string) {
    if (!token || toggling) return;
    const key = `${memberId}:${date}`;
    const current = attendanceMap[key] ?? false;
    setToggling(key);
    const res = await apiFetch(`/api/ministry/${type}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ member_id: memberId, session_date: date, present: !current }),
    });
    if (res.ok) await load(token);
    setToggling(null);
  }

  async function markAllPresent() {
    if (!token || markingAll || members.length === 0) return;
    setMarkingAll(true);
    await Promise.all(members.map(m =>
      apiFetch(`/api/ministry/${type}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ member_id: m.id, session_date: sessionDate, present: true }),
      })
    ));
    await load(token);
    setMarkingAll(false);
  }

  function exportCSV() {
    const headers = ["Name", "Shepherd Pipeline Stage", ...displaySessions.map(fmt), "Streak"];
    const rows = members.map(m => [
      `${m.first_name} ${m.last_name}`,
      m.pipeline_stage ?? "",
      ...displaySessions.map(s => (attendanceMap[`${m.id}:${s}`] ? "✓" : "")),
      streakMap[m.id] ?? 0,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${type}-attendance.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── New: check-in session functions ──
  async function startCheckinSession() {
    if (!token) return;
    setStartingSession(true);
    const res = await apiFetch(`/api/ministry/${type}/checkin-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ serviceName: cfg?.name ?? type, date: sessionDate }),
    });
    if (res.ok) {
      const d = await res.json();
      setCheckinSession(d.session);
      setCheckinRecords([]);
    }
    setStartingSession(false);
  }

  async function toggleMemberCheckin(memberId: string) {
    if (!token || !checkinSession || togglingCheckin) return;
    setTogglingCheckin(memberId);
    const res = await apiFetch(`/api/ministry/${type}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId: checkinSession.id, memberId }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.action === "added") {
        setCheckinRecords(r => [...r, { id: d.record.id, member_id: memberId, visitor_name: null }]);
      } else {
        setCheckinRecords(r => r.filter(x => x.member_id !== memberId));
      }
    }
    setTogglingCheckin(null);
  }

  async function addWalkIn() {
    if (!token || !checkinSession || !walkInForm.name.trim()) return;
    setSavingWalkIn(true);
    const res = await apiFetch(`/api/ministry/${type}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId: checkinSession.id, visitorName: walkInForm.name, visitorPhone: walkInForm.phone || null, visitorEmail: walkInForm.email || null }),
    });
    if (res.ok) {
      const d = await res.json();
      setCheckinRecords(r => [...r, { id: d.record.id, member_id: null, visitor_name: walkInForm.name }]);
      setWalkInForm({ name: "", phone: "", email: "" });
      setShowWalkIn(false);
      if (d.isNewVisitor) setNvLoaded(false); // reset so visitors tab reloads
    }
    setSavingWalkIn(false);
  }

  // ── New: visitors tab functions ──
  async function loadVisitors(t: string) {
    setNvLoading(true);
    const res = await apiFetch(`/api/ministry/${type}/new-visitors`, { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) { const d = await res.json(); setNvSessions(d ?? []); }
    setNvLoading(false);
  }

  async function toggleAutoFollowup(sessionId: string, current: boolean) {
    if (!token) return;
    await apiFetch(`/api/ministry/${type}/checkin-session`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: sessionId, autoFollowup: !current }),
    });
    setNvSessions(ss => ss.map(s => s.session.id === sessionId ? { ...s, session: { ...s.session, auto_followup: !current } } : s));
  }

  async function sendFollowup(sessionId: string, visitor: NVVisitor, followType: "email" | "letter" | "both" | "skip") {
    const key = visitor.id;
    const email = (nvEmails[key] ?? "").trim();
    if ((followType === "email" || followType === "both") && !email) { alert("Enter an email address to send."); return; }
    if (followType === "letter" || followType === "both") {
      window.open(`/dashboard/ministry/${type}/visitor-letter/${visitor.id}`, "_blank");
    }
    if (!token) return;
    setNvSending(s => ({ ...s, [key]: followType }));
    await apiFetch(`/api/ministry/${type}/visitor-followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId, recordId: visitor.id, visitorName: `${visitor.first_name} ${visitor.last_name}`, visitorEmail: email || null, visitorPhone: visitor.phone || null, followUpType: followType, personalizedMessage: nvPersonalize[key] || null }),
    });
    setNvSending(s => { const n = { ...s }; delete n[key]; return n; });
    if (token) await loadVisitors(token);
  }

  // ── Derived ──
  const todayPresent = members.filter(m => attendanceMap[`${m.id}:${sessionDate}`] === true).length;
  const todayPct = members.length > 0 ? Math.round((todayPresent / members.length) * 100) : 0;
  const checkinMemberIds = new Set(checkinRecords.filter(r => r.member_id).map(r => r.member_id!));
  const walkInVisitors = checkinRecords.filter(r => !r.member_id);

  if (!cfg) return <MinistryShell type={type}><div className="p-8 text-gray-500">Ministry not found.</div></MinistryShell>;
  if (loading) return <MinistryShell type={type}><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type={type}>
      {/* Hero — unchanged */}
      <div className="px-8 py-8" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <Link href={`/dashboard/ministry/${type}`} className="text-orange-200 text-xs mb-1 block hover:text-white">← {cfg.name}</Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Attendance</h1>
          <div className="flex items-center gap-3">
            <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} className="px-3 py-2 rounded-xl text-sm border-0 bg-white/20 text-white focus:outline-none focus:bg-white/30" />
            <button onClick={markAllPresent} disabled={markingAll || members.length === 0} className="px-4 py-2 rounded-xl text-sm font-bold bg-white" style={{ color: ACCENT }}>
              {markingAll ? "Marking…" : "✓ Mark All Present"}
            </button>
            <button onClick={exportCSV} className="px-4 py-2 rounded-xl text-sm font-medium border border-white/30 text-white hover:bg-white/10">
              ⬇️ CSV
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-8 pt-6 bg-gray-50">
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit">
          {(["attendance", "visitors"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors" style={{ backgroundColor: activeTab === t ? ACCENT : "transparent", color: activeTab === t ? "white" : "#6b7280" }}>
              {t === "attendance" ? "✅ Attendance" : "🆕 New Visitors"}
            </button>
          ))}
        </div>
      </div>

      {/* ── ATTENDANCE TAB ── */}
      {activeTab === "attendance" && (
        <div className="px-8 py-8 bg-gray-50 min-h-screen">
          {/* Stats bar — unchanged */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="bg-white rounded-xl px-5 py-3 shadow-sm border border-gray-100 flex items-center gap-2">
              <span className="text-sm text-gray-500">Today:</span>
              <span className="text-sm font-bold text-gray-900">{todayPresent} / {members.length}</span>
              <span className="text-sm font-bold" style={{ color: ACCENT }}>({todayPct}%)</span>
            </div>
            <div className="bg-white rounded-xl px-5 py-3 shadow-sm border border-gray-100 flex items-center gap-2">
              <span className="text-sm text-gray-500">Session date:</span>
              <span className="text-sm font-bold text-gray-900">{fmt(sessionDate)}</span>
            </div>
          </div>

          {/* Member table — unchanged */}
          {members.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-12 text-center">
              <p className="text-gray-400">No active members on this roster. <Link href={`/dashboard/ministry/${type}/roster`} style={{ color: ACCENT }} className="underline">Add members to the roster →</Link></p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest sticky left-0 bg-white min-w-[180px]">Member</th>
                    {displaySessions.map(s => (
                      <th key={s} className="px-3 py-3 text-xs font-semibold text-center whitespace-nowrap" style={{ color: s === sessionDate ? ACCENT : "#9ca3af" }}>
                        {fmt(s)}{s === sessionDate && " ●"}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-center">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(member => (
                    <tr key={member.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3 sticky left-0 bg-white">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                            {member.first_name[0]}{member.last_name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 whitespace-nowrap">
                              {(streakMap[member.id] ?? 0) >= 3 && <span className="mr-1">🔥</span>}
                              {member.first_name} {member.last_name}
                            </p>
                            {member.pipeline_stage && <p className="text-xs text-gray-400">{member.pipeline_stage}</p>}
                          </div>
                        </div>
                      </td>
                      {displaySessions.map(date => {
                        const key = `${member.id}:${date}`;
                        const present = attendanceMap[key];
                        const isToggling = toggling === key;
                        const isToday = date === sessionDate;
                        return (
                          <td key={date} className="px-3 py-3 text-center">
                            <button
                              onClick={() => toggleAttendance(member.id, date)}
                              disabled={!!toggling}
                              className="w-9 h-9 rounded-full flex items-center justify-center mx-auto transition-all hover:scale-110"
                              style={{ backgroundColor: present === true ? ACCENT : present === false ? "#fee2e2" : isToday ? "#fff7ed" : "#f3f4f6", opacity: isToggling ? 0.5 : 1, border: isToday ? `2px solid ${ACCENT}44` : "2px solid transparent" }}
                            >
                              {present === true && <span className="text-white text-sm font-bold">✓</span>}
                              {present === false && <span className="text-red-400 text-sm font-bold">✗</span>}
                              {present === undefined && <span className="text-gray-300 text-sm">·</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">
                        {(streakMap[member.id] ?? 0) >= 1 ? (
                          <span className="text-sm font-bold" style={{ color: ACCENT }}>
                            {(streakMap[member.id] ?? 0) >= 3 && "🔥"} {streakMap[member.id]}
                          </span>
                        ) : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Check-In Session ── */}
          <div className="mt-8">
            {!checkinSession ? (
              <button
                onClick={startCheckinSession}
                disabled={startingSession}
                className="px-5 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ backgroundColor: ACCENT, opacity: startingSession ? 0.7 : 1 }}
              >
                {startingSession ? "Starting…" : "▶ Start Check-In Session"}
              </button>
            ) : (
              <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: ACCENT + "0d" }}>
                  <div>
                    <h3 className="font-bold text-gray-900">Live Check-In — {fmt(sessionDate)}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{checkinMemberIds.size} members + {walkInVisitors.length} walk-ins</p>
                  </div>
                  <button onClick={() => { setCheckinSession(null); setCheckinRecords([]); setShowWalkIn(false); }} className="text-xs text-gray-400 hover:text-gray-600">End Session</button>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
                    {members.map(m => {
                      const checked = checkinMemberIds.has(m.id);
                      const isToggling = togglingCheckin === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleMemberCheckin(m.id)}
                          disabled={isToggling}
                          className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors border-2"
                          style={{ backgroundColor: checked ? ACCENT : "white", color: checked ? "white" : "#374151", borderColor: checked ? ACCENT : "#e5e7eb", opacity: isToggling ? 0.6 : 1 }}
                        >
                          {checked ? "✓ " : ""}{m.first_name} {m.last_name}
                        </button>
                      );
                    })}
                  </div>

                  {walkInVisitors.length > 0 && (
                    <div className="mb-4 p-3 bg-orange-50 rounded-xl">
                      <p className="text-xs font-bold text-orange-700 mb-1">Walk-in Visitors</p>
                      {walkInVisitors.map(v => (
                        <span key={v.id} className="inline-block text-xs bg-white border border-orange-200 text-orange-700 rounded-full px-2.5 py-1 mr-1 mb-1">{v.visitor_name}</span>
                      ))}
                    </div>
                  )}

                  {!showWalkIn ? (
                    <button onClick={() => setShowWalkIn(true)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: ACCENT, color: ACCENT }}>
                      + Add Walk-In Visitor
                    </button>
                  ) : (
                    <div className="border border-gray-200 rounded-xl p-4 mt-2">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Add Walk-In Visitor</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                        <input value={walkInForm.name} onChange={e => setWalkInForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name *" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                        <input type="tel" value={walkInForm.phone} onChange={e => setWalkInForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                        <input type="email" value={walkInForm.email} onChange={e => setWalkInForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addWalkIn} disabled={savingWalkIn || !walkInForm.name.trim()} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: ACCENT, opacity: savingWalkIn ? 0.7 : 1 }}>
                          {savingWalkIn ? "Adding…" : "Add Visitor"}
                        </button>
                        <button onClick={() => { setShowWalkIn(false); setWalkInForm({ name: "", phone: "", email: "" }); }} className="px-4 py-2 rounded-xl text-xs border border-gray-200 text-gray-500">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NEW VISITORS TAB ── */}
      {activeTab === "visitors" && (
        <div className="px-8 py-8 bg-gray-50 min-h-screen">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>New Visitor Follow-Up</h2>
              <p className="text-xs text-gray-400 mt-0.5">Send welcome emails or print letters for first-time visitors</p>
            </div>
            {token && <button onClick={() => loadVisitors(token)} className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 text-gray-500">↻ Refresh</button>}
          </div>

          {nvLoading && <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-gray-400">Loading…</div></div>}

          {!nvLoading && nvSessions.length === 0 && (
            <div className="bg-white rounded-2xl shadow p-12 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <p className="text-gray-500 font-semibold">No new visitors recorded yet.</p>
              <p className="text-xs text-gray-400 mt-1">Walk-in visitors added via "Start Check-In Session" will appear here.</p>
            </div>
          )}

          {!nvLoading && nvSessions.map((visitor: NVVisitor) => {
            const key = visitor.id;
            const sending = nvSending[key];
            const personalizeOn = nvPersonalizeOpen[key] ?? false;
            const v = visitor as any;

            if (type === "childrens") {
              return (
                <div key={v.id} className="bg-white rounded-2xl shadow border border-gray-100 mb-4 overflow-hidden">
                  <div className="px-6 py-5">
                    <div className="font-bold text-gray-900 mb-1">{v.first_name} {v.last_name}</div>
                    {v.date_of_birth && (
                      <div className="text-xs text-gray-500 mb-1">
                        DOB: {new Date(v.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    )}
                    {v.visit_date && (
                      <div className="text-xs text-gray-400 mb-2">{fmtDate(v.visit_date)}</div>
                    )}
                    {(v.parent_name || v.parent_phone || v.parent_email) && (
                      <div className="mt-2 pt-2 border-t border-gray-50">
                        {v.parent_name && <div className="text-sm text-gray-500">{v.parent_name}</div>}
                        {v.parent_phone && <div className="text-xs text-gray-400">{v.parent_phone}</div>}
                        {v.parent_email && <div className="text-xs text-gray-400">{v.parent_email}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={visitor.id} className="bg-white rounded-2xl shadow border border-gray-100 mb-4 overflow-hidden">
                <div className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="font-bold text-gray-900">{visitor.first_name} {visitor.last_name}</div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: visitColor(visitor.visit_count) }}>
                          {visitBadge(visitor.visit_count)}
                        </span>
                      </div>
                      {visitor.phone && <div className="text-sm text-gray-500">{visitor.phone}</div>}
                      <div className="text-xs text-gray-400 mt-0.5">First visit: {fmtDate(visitor.first_visit_date)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <input
                      type="email"
                      value={nvEmails[key] ?? (visitor.email ?? "")}
                      onChange={e => setNvEmails(m => ({ ...m, [key]: e.target.value }))}
                      placeholder="Email address"
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                    <button
                      onClick={() => setNvPersonalizeOpen(m => ({ ...m, [key]: !m[key] }))}
                      className="px-3 py-2 rounded-xl text-xs font-bold border"
                      style={{ borderColor: personalizeOn ? ACCENT : "#e5e7eb", color: personalizeOn ? ACCENT : "#6b7280", backgroundColor: personalizeOn ? ACCENT + "11" : "white" }}
                    >
                      ✏️ Personalize
                    </button>
                  </div>
                  {personalizeOn && (
                    <textarea
                      value={nvPersonalize[key] ?? ""}
                      onChange={e => setNvPersonalize(m => ({ ...m, [key]: e.target.value }))}
                      placeholder="Add a personal note…"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none mb-2"
                    />
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {(["email", "letter", "both", "skip"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => sendFollowup(visitor.id, visitor, t)}
                        disabled={!!sending}
                        className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                        style={{ backgroundColor: sending === t ? ACCENT : t === "skip" ? "white" : ACCENT, color: t === "skip" ? "#6b7280" : "white", borderColor: t === "skip" ? "#e5e7eb" : ACCENT, opacity: sending && sending !== t ? 0.5 : 1 }}
                      >
                        {sending === t ? "…" : t === "email" ? "📧 Send Email" : t === "letter" ? "🖨️ Print Letter" : t === "both" ? "📧🖨️ Both" : "Skip"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </MinistryShell>
  );
}
