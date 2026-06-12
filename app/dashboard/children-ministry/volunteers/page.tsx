"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const ACCENT = "#F28C28";


type Volunteer = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; roles: string[]; background_check_status: string; background_check_date: string | null; reliability_score: number; is_active: boolean; notes: string | null; assignment_count: number };
type Role = { id: string; name: string; color: string; sort_order: number; is_active: boolean; description: string | null };
type ServiceEvent = { id: string; title: string; event_date: string; start_time: string | null; end_time: string | null; status: string; assignment_count: number; confirmed_count: number; notes: string | null };
type Assignment = { id: string; volunteer_id: string; role_name: string; status: string; reminder_sent: boolean; volunteer: { first_name: string; last_name: string; email: string | null; reliability_score: number } | null };
type AllMember = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };

const BG_STATUS: Record<string, string> = { cleared: "#22c55e", pending: "#f59e0b", expired: "#ef4444", failed: "#ef4444" };
const STATUS_COLORS: Record<string, string> = { assigned: "#6366f1", confirmed: "#22c55e", declined: "#ef4444", no_show: "#9ca3af" };

function reliabilityColor(score: number) { return score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444"; }

function fmtDate(iso: string) { return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
function fmtTime(t: string | null) { if (!t) return ""; try { const [h, m] = t.split(":"); const d = new Date(); d.setHours(parseInt(h), parseInt(m)); return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch { return t; } }

const COLORS = ["#6366f1","#F28C28","#22c55e","#3b82f6","#ec4899","#14b8a6","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

function VolunteersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "volunteers";

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [allMembers, setAllMembers] = useState<AllMember[]>([]);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [eventAssignments, setEventAssignments] = useState<Record<string, Assignment[]>>({});

  // Volunteer modal
  const [showVolModal, setShowVolModal] = useState(false);
  const [editVol, setEditVol] = useState<Volunteer | null>(null);
  const [volForm, setVolForm] = useState({ first_name: "", last_name: "", email: "", phone: "", roles: [] as string[], background_check_status: "pending", background_check_date: "", notes: "", memberSearch: "" });
  const [savingVol, setSavingVol] = useState(false);
  const [volError, setVolError] = useState("");

  // Event modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", event_date: "", start_time: "", end_time: "", notes: "" });
  const [savingEvent, setSavingEvent] = useState(false);

  // Assign modal
  const [assignEvent, setAssignEvent] = useState<ServiceEvent | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignRole, setAssignRole] = useState("");
  const [assignWarning, setAssignWarning] = useState("");

  // Role modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", color: "#6366f1" });
  const [savingRole, setSavingRole] = useState(false);

  // Reminders
  const [sendingReminders, setSendingReminders] = useState<string | null>(null);
  const [reminderMsg, setReminderMsg] = useState<Record<string, string>>({});

  // Unavailability
  const [unavailVol, setUnavailVol] = useState<Volunteer | null>(null);
  const [unavailDate, setUnavailDate] = useState(new Date().toISOString().slice(0, 10));

  async function loadAll(t: string) {
    const [vRes, rRes, eRes, mRes] = await Promise.all([
      apiFetch("/api/children-ministry/volunteers", { headers: { Authorization: `Bearer ${t}` } }),
      apiFetch("/api/children-ministry/volunteer-roles", { headers: { Authorization: `Bearer ${t}` } }),
      apiFetch("/api/children-ministry/service-events", { headers: { Authorization: `Bearer ${t}` } }),
      apiFetch("/api/members", { headers: { Authorization: `Bearer ${t}` } }),
    ]);
    if (vRes.ok) setVolunteers((await vRes.json()).volunteers ?? []);
    if (rRes.ok) setRoles((await rRes.json()).roles ?? []);
    if (eRes.ok) setEvents((await eRes.json()).events ?? []);
    if (mRes.ok) setAllMembers((await mRes.json()).members ?? []);
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
      await loadAll(t);
      setLoading(false);
    }
    init();
  }, [router]);

  async function loadAssignments(eventId: string) {
    if (!token) return;
    const res = await apiFetch(`/api/children-ministry/service-events/${eventId}/assignments`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); setEventAssignments(m => ({ ...m, [eventId]: d.assignments ?? [] })); }
  }

  async function toggleEvent(eventId: string) {
    if (expandedEvent === eventId) { setExpandedEvent(null); return; }
    setExpandedEvent(eventId);
    if (!eventAssignments[eventId]) await loadAssignments(eventId);
  }

  async function saveVolunteer() {
    if (!token || !volForm.first_name.trim() || !volForm.last_name.trim()) { setVolError("First and last name required"); return; }
    setSavingVol(true); setVolError("");
    const payload = { first_name: volForm.first_name, last_name: volForm.last_name, email: volForm.email, phone: volForm.phone, roles: volForm.roles, background_check_status: volForm.background_check_status, background_check_date: volForm.background_check_date || undefined, notes: volForm.notes };
    const url = editVol ? `/api/children-ministry/volunteers/${editVol.id}` : "/api/children-ministry/volunteers";
    const method = editVol ? "PATCH" : "POST";
    const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json(); setVolError(d.error ?? "Error"); setSavingVol(false); return; }
    setSavingVol(false); setShowVolModal(false); setEditVol(null);
    await loadAll(token);
  }

  function openEditVol(v: Volunteer) { setEditVol(v); setVolForm({ first_name: v.first_name, last_name: v.last_name, email: v.email ?? "", phone: v.phone ?? "", roles: v.roles, background_check_status: v.background_check_status, background_check_date: v.background_check_date ?? "", notes: v.notes ?? "", memberSearch: "" }); setVolError(""); setShowVolModal(true); }

  async function saveEvent() {
    if (!token || !eventForm.title.trim() || !eventForm.event_date) return;
    setSavingEvent(true);
    await apiFetch("/api/children-ministry/service-events", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(eventForm) });
    setSavingEvent(false); setShowEventModal(false); setEventForm({ title: "", event_date: "", start_time: "", end_time: "", notes: "" });
    await loadAll(token);
  }

  async function assignVolunteer(eventId: string, volunteerId: string) {
    if (!token || !assignRole) return;
    setAssigning(volunteerId); setAssignWarning("");
    const res = await apiFetch(`/api/children-ministry/service-events/${eventId}/assignments`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ volunteer_id: volunteerId, role_name: assignRole }) });
    const d = await res.json();
    setAssigning(null);
    if (!res.ok) { setAssignWarning(d.error ?? "Error"); return; }
    if (d.availability_warning) setAssignWarning(`⚠️ ${d.availability_warning}`);
    await loadAssignments(eventId);
    await loadAll(token);
  }

  async function updateAssignment(eventId: string, assignmentId: string, updates: any) {
    if (!token) return;
    await apiFetch(`/api/children-ministry/service-events/${eventId}/assignments/${assignmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(updates) });
    await loadAssignments(eventId);
    if (updates.status === "no_show") await loadAll(token);
  }

  async function removeAssignment(eventId: string, assignmentId: string) {
    if (!token || !confirm("Remove this volunteer?")) return;
    await apiFetch(`/api/children-ministry/service-events/${eventId}/assignments/${assignmentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await loadAssignments(eventId);
    await loadAll(token);
  }

  async function sendReminders(eventId: string) {
    if (!token) return;
    setSendingReminders(eventId);
    const res = await apiFetch(`/api/children-ministry/service-events/${eventId}/send-reminders`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    setSendingReminders(null);
    setReminderMsg(m => ({ ...m, [eventId]: res.ok ? `✅ ${d.sent} reminders sent` : "Failed" }));
    setTimeout(() => setReminderMsg(m => { const n = { ...m }; delete n[eventId]; return n; }), 4000);
    if (res.ok) await loadAssignments(eventId);
  }

  async function saveRole() {
    if (!token || !roleForm.name.trim()) return;
    setSavingRole(true);
    if (editRole) {
      await apiFetch(`/api/children-ministry/volunteer-roles/${editRole.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(roleForm) });
    } else {
      await apiFetch("/api/children-ministry/volunteer-roles", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...roleForm, sort_order: roles.length }) });
    }
    setSavingRole(false); setShowRoleModal(false); setEditRole(null);
    await loadAll(token);
  }

  async function markUnavailable() {
    if (!token || !unavailVol || !unavailDate) return;
    await apiFetch(`/api/children-ministry/volunteers/${unavailVol.id}/availability`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ unavailable_date: unavailDate }) });
    setUnavailVol(null);
  }

  const filteredMembers = useMemo(() =>
    allMembers.filter(m => `${m.first_name} ${m.last_name} ${m.email ?? ""}`.toLowerCase().includes(volForm.memberSearch.toLowerCase())).slice(0, 6),
    [allMembers, volForm.memberSearch]
  );

  const filteredVols = useMemo(() =>
    volunteers.filter(v => v.is_active && `${v.first_name} ${v.last_name}`.toLowerCase().includes(assignSearch.toLowerCase())),
    [volunteers, assignSearch]
  );

  const stats = { total: volunteers.length, active: volunteers.filter(v => v.is_active).length, cleared: volunteers.filter(v => v.background_check_status === "cleared").length, avgReliability: volunteers.length ? Math.round(volunteers.reduce((s, v) => s + v.reliability_score, 0) / volunteers.length) : 100 };

  if (loading) return <MinistryShell type="childrens"><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>👥 Volunteer Scheduling</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-8 pt-4 overflow-x-auto bg-white" style={{ borderBottom: "1px solid #e5e7eb" }}>
        {["Volunteers", "Schedule", "Roles"].map(tab => (
          <Link key={tab} href={`/dashboard/children-ministry/volunteers?tab=${tab.toLowerCase()}`} className="px-5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
            style={{ borderColor: activeTab === tab.toLowerCase() ? ACCENT : "transparent", color: activeTab === tab.toLowerCase() ? ACCENT : "#6b7280" }}>
            {tab}
          </Link>
        ))}
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">

        {/* ====== VOLUNTEERS TAB ====== */}
        {activeTab === "volunteers" && <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[{ label: "Total", value: stats.total, emoji: "👥" }, { label: "Active", value: stats.active, emoji: "✅" }, { label: "BG Cleared", value: stats.cleared, emoji: "🛡️" }, { label: "Avg Reliability", value: `${stats.avgReliability}%`, emoji: "⭐" }].map(s => (
              <div key={s.label} className="bg-white rounded-xl shadow-sm px-5 py-4 flex items-center gap-3 border border-gray-100">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: ACCENT + "22" }}>{s.emoji}</div>
                <div><p className="text-xl font-bold text-gray-900">{s.value}</p><p className="text-xs text-gray-400">{s.label}</p></div>
              </div>
            ))}
          </div>

          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditVol(null); setVolForm({ first_name: "", last_name: "", email: "", phone: "", roles: [], background_check_status: "pending", background_check_date: "", notes: "", memberSearch: "" }); setVolError(""); setShowVolModal(true); }} className="px-5 py-2.5 rounded-xl font-bold text-white text-sm" style={{ backgroundColor: ACCENT }}>+ Add Volunteer</button>
          </div>

          <div className="bg-white rounded-2xl shadow overflow-hidden">
            {volunteers.filter(v => v.is_active).length === 0 ? (
              <div className="p-12 text-center"><div className="text-5xl mb-4">👥</div><p className="text-gray-400">No volunteers yet. Add your first volunteer to get started.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Volunteer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest hidden md:table-cell">Roles</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">BG Check</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Reliability</th>
                  <th className="px-4 py-3" />
                </tr></thead>
                <tbody>
                  {volunteers.filter(v => v.is_active).map(v => (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-orange-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{v.first_name} {v.last_name}</p>
                        {v.email && <p className="text-xs text-gray-400">{v.email}</p>}
                        {v.assignment_count > 0 && <p className="text-xs text-gray-400">{v.assignment_count} times in 90d</p>}
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">{v.roles.slice(0, 3).map(r => { const role = roles.find(ro => ro.name === r); return <span key={r} className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: role?.color ?? "#6366f1" }}>{r}</span>; })}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white capitalize" style={{ backgroundColor: BG_STATUS[v.background_check_status] ?? "#9ca3af" }}>{v.background_check_status}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-2 rounded-full" style={{ width: `${v.reliability_score}%`, backgroundColor: reliabilityColor(v.reliability_score) }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: reliabilityColor(v.reliability_score) }}>{v.reliability_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEditVol(v)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">Edit</button>
                          <button onClick={() => { setUnavailVol(v); setUnavailDate(new Date().toISOString().slice(0, 10)); }} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">Unavail.</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>}

        {/* ====== SCHEDULE TAB ====== */}
        {activeTab === "schedule" && <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowEventModal(true)} className="px-5 py-2.5 rounded-xl font-bold text-white text-sm" style={{ backgroundColor: ACCENT }}>+ New Service Event</button>
          </div>

          {events.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-5xl mb-4">📅</div><p className="text-gray-400">No service events yet.</p></div>
          ) : (
            <div className="space-y-3">
              {events.map(e => {
                const isOpen = expandedEvent === e.id;
                const totalAssigned = e.assignment_count;
                const staffColor = totalAssigned === 0 ? "#ef4444" : e.confirmed_count < totalAssigned ? "#f59e0b" : "#22c55e";
                return (
                  <div key={e.id} className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleEvent(e.id)}>
                      <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: staffColor }} />
                      <div className="flex-shrink-0 text-center bg-orange-50 rounded-xl px-4 py-2 min-w-[60px]">
                        <p className="text-xs font-bold text-orange-600 uppercase">{new Date(e.event_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}</p>
                        <p className="text-xl font-black text-orange-800">{new Date(e.event_date + "T00:00:00").getDate()}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900">{e.title}</p>
                        <p className="text-xs text-gray-400">{[fmtTime(e.start_time), fmtTime(e.end_time)].filter(Boolean).join(" – ") || "Time TBD"}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-bold" style={{ color: staffColor }}>{totalAssigned} volunteer{totalAssigned !== 1 ? "s" : ""}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${e.status === "completed" ? "bg-gray-100 text-gray-500" : e.status === "cancelled" ? "bg-red-100 text-red-500" : "bg-green-100 text-green-700"}`}>{e.status}</span>
                        <span className="text-gray-300">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="px-5 pb-5 border-t border-gray-50 pt-4">
                        {/* Assignment table */}
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Volunteers</p>
                          <div className="flex items-center gap-2">
                            {reminderMsg[e.id] && <span className="text-xs font-medium text-green-600">{reminderMsg[e.id]}</span>}
                            <button onClick={() => sendReminders(e.id)} disabled={sendingReminders === e.id} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">
                              {sendingReminders === e.id ? "Sending…" : "📧 Send Reminders"}
                            </button>
                            <button onClick={() => { setAssignEvent(e); setAssignSearch(""); setAssignRole(roles[0]?.name ?? ""); setAssignWarning(""); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: ACCENT }}>+ Assign</button>
                          </div>
                        </div>

                        {(eventAssignments[e.id] ?? []).length === 0 ? (
                          <p className="text-xs text-gray-400 mb-3">No volunteers assigned yet.</p>
                        ) : (
                          <table className="w-full mb-3">
                            <thead><tr className="border-b border-gray-100"><th className="text-left py-2 text-xs text-gray-400">Name</th><th className="text-left py-2 text-xs text-gray-400">Role</th><th className="text-left py-2 text-xs text-gray-400">Status</th><th className="py-2" /></tr></thead>
                            <tbody>
                              {(eventAssignments[e.id] ?? []).map(a => (
                                <tr key={a.id} className="border-b border-gray-50">
                                  <td className="py-2 text-sm font-medium text-gray-900">{a.volunteer?.first_name} {a.volunteer?.last_name}
                                    <span className="ml-2 text-xs" style={{ color: reliabilityColor(a.volunteer?.reliability_score ?? 100) }}>({a.volunteer?.reliability_score ?? 100})</span>
                                  </td>
                                  <td className="py-2 text-xs text-gray-500">{a.role_name}</td>
                                  <td className="py-2">
                                    <select value={a.status} onChange={ev => updateAssignment(e.id, a.id, { status: ev.target.value })} className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold" style={{ color: STATUS_COLORS[a.status] ?? "#374151" }}>
                                      {["assigned","confirmed","declined","no_show"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                                    </select>
                                  </td>
                                  <td className="py-2 text-right"><button onClick={() => removeAssignment(e.id, a.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* Event status */}
                        <div className="flex items-center gap-3 mt-2">
                          <select value={e.status} onChange={async ev => { if (!token) return; await apiFetch(`/api/children-ministry/service-events/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: ev.target.value }) }); await loadAll(token); }} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium">
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>}

        {/* ====== ROLES TAB ====== */}
        {activeTab === "roles" && <>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditRole(null); setRoleForm({ name: "", description: "", color: COLORS[roles.length % COLORS.length] }); setShowRoleModal(true); }} className="px-5 py-2.5 rounded-xl font-bold text-white text-sm" style={{ backgroundColor: ACCENT }}>+ Add Role</button>
          </div>
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            {roles.length === 0 ? (
              <div className="p-12 text-center"><div className="text-5xl mb-4">🎯</div><p className="text-gray-400">No roles yet. Create roles like "Teacher", "Helper", "Check-In".</p></div>
            ) : (
              <div className="divide-y divide-gray-50">
                {roles.map((role, idx) => {
                  const volCount = volunteers.filter(v => v.roles.includes(role.name)).length;
                  return (
                    <div key={role.id} className="flex items-center gap-4 px-6 py-4">
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900">{role.name}</p>
                        {role.description && <p className="text-xs text-gray-400">{role.description}</p>}
                        <p className="text-xs text-gray-400">{volCount} volunteer{volCount !== 1 ? "s" : ""} can fill this role</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => { if (idx > 0) { apiFetch(`/api/children-ministry/volunteer-roles/${role.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ sort_order: role.sort_order - 1 }) }).then(() => loadAll(token!)); } }} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-sm px-1">▲</button>
                        <button onClick={() => { if (idx < roles.length - 1) { apiFetch(`/api/children-ministry/volunteer-roles/${role.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ sort_order: role.sort_order + 1 }) }).then(() => loadAll(token!)); } }} disabled={idx === roles.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-sm px-1">▼</button>
                        <button onClick={() => { setEditRole(role); setRoleForm({ name: role.name, description: role.description ?? "", color: role.color }); setShowRoleModal(true); }} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">Edit</button>
                        <button onClick={async () => { if (!confirm("Delete this role?") || !token) return; await apiFetch(`/api/children-ministry/volunteer-roles/${role.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); await loadAll(token); }} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-100 text-red-400 hover:border-red-300 transition-colors">Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>}
      </div>

      {/* ====== VOLUNTEER MODAL ====== */}
      {showVolModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowVolModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{editVol ? "Edit Volunteer" : "Add Volunteer"}</h2>
            </div>
            <div className="p-6 space-y-4">
              {!editVol && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Search existing members</label>
                  <input value={volForm.memberSearch} onChange={e => setVolForm(f => ({ ...f, memberSearch: e.target.value }))} placeholder="Name or email…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-1" />
                  {volForm.memberSearch && filteredMembers.length > 0 && (
                    <div className="border border-gray-100 rounded-xl overflow-hidden max-h-36 overflow-y-auto mb-2">
                      {filteredMembers.map(m => (
                        <button key={m.id} onClick={() => setVolForm(f => ({ ...f, first_name: m.first_name, last_name: m.last_name, email: m.email ?? "", phone: m.phone ?? "", memberSearch: "" }))} className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-gray-50 last:border-0">
                          {m.first_name} {m.last_name} {m.email && <span className="text-gray-400 text-xs">· {m.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label><input value={volForm.first_name} onChange={e => setVolForm(f => ({ ...f, first_name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label><input value={volForm.last_name} onChange={e => setVolForm(f => ({ ...f, last_name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label><input type="email" value={volForm.email} onChange={e => setVolForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input value={volForm.phone} onChange={e => setVolForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Roles (can fill)</label>
                <div className="flex flex-wrap gap-2">{roles.map(r => (
                  <button key={r.id} onClick={() => setVolForm(f => ({ ...f, roles: f.roles.includes(r.name) ? f.roles.filter(x => x !== r.name) : [...f.roles, r.name] }))} className="px-3 py-1.5 rounded-full text-xs font-bold transition-all" style={{ backgroundColor: volForm.roles.includes(r.name) ? r.color : "#f3f4f6", color: volForm.roles.includes(r.name) ? "white" : "#374151" }}>{r.name}</button>
                ))}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Background Check</label><select value={volForm.background_check_status} onChange={e => setVolForm(f => ({ ...f, background_check_status: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="pending">Pending</option><option value="cleared">Cleared</option><option value="expired">Expired</option><option value="failed">Failed</option></select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Check Date</label><input type="date" value={volForm.background_check_date} onChange={e => setVolForm(f => ({ ...f, background_check_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea value={volForm.notes} onChange={e => setVolForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" /></div>
              {volError && <p className="text-sm text-red-600">{volError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowVolModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={saveVolunteer} disabled={savingVol} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>{savingVol ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== EVENT MODAL ====== */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowEventModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100"><h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>New Service Event</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Title *</label><input value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} placeholder="Sunday Morning Service" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Date *</label><input type="date" value={eventForm.event_date} onChange={e => setEventForm(f => ({ ...f, event_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label><input type="time" value={eventForm.start_time} onChange={e => setEventForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">End Time</label><input type="time" value={eventForm.end_time} onChange={e => setEventForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea value={eventForm.notes} onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEventModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={saveEvent} disabled={savingEvent} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>{savingEvent ? "Creating…" : "Create Event"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== ASSIGN MODAL ====== */}
      {assignEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setAssignEvent(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold" style={{ fontFamily: "Georgia, serif" }}>Assign Volunteer — {assignEvent.title}</h2>
              <p className="text-xs text-gray-400 mt-1">{fmtDate(assignEvent.event_date)}</p>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                <select value={assignRole} onChange={e => setAssignRole(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  {roles.length === 0 && <option value="Helper">Helper</option>}
                </select>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Search volunteers</label>
                <input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="Name…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              {assignWarning && <p className="text-xs text-amber-600 mb-3">{assignWarning}</p>}
              <div className="space-y-2">
                {filteredVols.map(v => {
                  const alreadyAssigned = (eventAssignments[assignEvent.id] ?? []).some(a => a.volunteer_id === v.id);
                  return (
                    <div key={v.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${alreadyAssigned ? "border-green-100 bg-green-50" : "border-gray-100 hover:border-orange-200"}`}>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{v.first_name} {v.last_name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: reliabilityColor(v.reliability_score) }}>⭐ {v.reliability_score}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: BG_STATUS[v.background_check_status] ?? "#9ca3af" }}>{v.background_check_status}</span>
                        </div>
                      </div>
                      {alreadyAssigned ? (
                        <span className="text-xs font-bold text-green-600">✓ Assigned</span>
                      ) : (
                        <button onClick={() => assignVolunteer(assignEvent.id, v.id)} disabled={assigning === v.id || !assignRole} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: ACCENT }}>{assigning === v.id ? "…" : "Assign"}</button>
                      )}
                    </div>
                  );
                })}
                {filteredVols.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No volunteers found.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== ROLE MODAL ====== */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowRoleModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100"><h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{editRole ? "Edit Role" : "Add Role"}</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Role Name *</label><input value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} placeholder="Teacher, Helper, Check-In…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><input value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">{COLORS.map(c => <button key={c} onClick={() => setRoleForm(f => ({ ...f, color: c }))} className="w-8 h-8 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: roleForm.color === c ? "#111" : "transparent" }} />)}</div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRoleModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={saveRole} disabled={savingRole} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>{savingRole ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== UNAVAILABILITY MODAL ====== */}
      {unavailVol && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setUnavailVol(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-bold" style={{ fontFamily: "Georgia, serif" }}>Mark Unavailable</h2><p className="text-sm text-gray-500 mt-1">{unavailVol.first_name} {unavailVol.last_name}</p></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Date</label><input type="date" value={unavailDate} onChange={e => setUnavailDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setUnavailVol(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={markUnavailable} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>Mark Unavailable</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}

export default function VolunteersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div>}>
      <VolunteersPageContent />
    </Suspense>
  );
}
