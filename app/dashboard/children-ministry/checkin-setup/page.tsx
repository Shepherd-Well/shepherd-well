"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const ACCENT = "#F28C28";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "");

type Room = { id: string; name: string; min_age: number | null; max_age: number | null; capacity: number | null; is_active: boolean };
type Template = { id: string; name: string; typical_day: string | null; typical_time: string | null; is_active: boolean };
type Session = { id: string; service_name: string; date: string; scheduled_time: string | null; status: string; kiosk_pin: string };
type NVChild = { id: string; child_name: string; room_id: string | null; room_name: string | null; checked_in_at: string };
type NVFamily = { parentName: string; parentPhone: string; primaryRecordId: string; children: NVChild[]; followupLog: { id: string; status: string; follow_up_type: string; sent_at: string | null; parent_email: string | null } | null; visitCount: number };
type NVSession = { session: { id: string; service_name: string; date: string; auto_followup: boolean }; families: NVFamily[] };

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}
function ageRange(room: Room) {
  if (room.min_age === null && room.max_age === null) return "All ages";
  if (room.min_age === null) return `Up to age ${room.max_age}`;
  if (room.max_age === null) return `Age ${room.min_age}+`;
  return `Ages ${room.min_age}–${room.max_age}`;
}
async function copyText(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {});
}

export default function CheckinSetupPage() {
  const router = useRouter();
  const selectedChurchIdRef = useRef<string | null>(null);
  function ch(): Record<string, string> {
    return selectedChurchIdRef.current ? { "x-selected-church-id": selectedChurchIdRef.current } : {};
  }
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"rooms" | "templates" | "sessions" | "visitors">("rooms");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  // Room form
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", minAge: "", maxAge: "", capacity: "" });
  const [savingRoom, setSavingRoom] = useState(false);

  // Template form
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [tplForm, setTplForm] = useState({ name: "", typicalDay: "", typicalTime: "" });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Session form
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({ serviceName: "", templateId: "", date: "", scheduledTime: "", kioskPin: "", sessionGroup: "" });
  const [savingSession, setSavingSession] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Daily PIN management
  const [showChangePIN, setShowChangePIN] = useState(false);
  const [newPINInput, setNewPINInput] = useState("");
  const [savingPIN, setSavingPIN] = useState(false);

  // New Visitors tab
  const [nvSessions, setNvSessions] = useState<NVSession[]>([]);
  const [nvLoaded, setNvLoaded] = useState(false);
  const [nvLoading, setNvLoading] = useState(false);
  const [nvEmails, setNvEmails] = useState<Record<string, string>>({});
  const [nvPersonalize, setNvPersonalize] = useState<Record<string, string>>({});
  const [nvPersonalizeOpen, setNvPersonalizeOpen] = useState<Record<string, boolean>>({});
  const [nvSending, setNvSending] = useState<Record<string, string>>({});

  async function loadVisitors() {
    setNvLoading(true);
    const res = await fetch("/api/checkin/new-visitors", { credentials: "include", headers: ch() });
    if (res.ok) { const d = await res.json(); setNvSessions(d.sessions ?? []); }
    setNvLoading(false);
  }

  useEffect(() => {
    if (tab === "visitors" && !loading && !nvLoaded) {
      setNvLoaded(true);
      loadVisitors();
    }
  }, [tab, loading, nvLoaded]);

  async function toggleAutoFollowup(sessionId: string, current: boolean) {
    await fetch("/api/checkin/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ id: sessionId, autoFollowup: !current }),
    });
    setNvSessions(ss => ss.map(s => s.session.id === sessionId ? { ...s, session: { ...s.session, auto_followup: !current } } : s));
  }

  async function sendFollowup(sessionId: string, family: NVFamily, type: "email" | "letter" | "both" | "skip") {
    const key = `${sessionId}-${family.parentPhone}`;
    const email = (nvEmails[key] ?? "").trim();
    if ((type === "email" || type === "both") && !email) { alert("Enter an email address to send."); return; }
    if (type === "letter" || type === "both") {
      window.open(`/api/checkin/followup/letter/${family.primaryRecordId}`, "_blank");
    }
    setNvSending(s => ({ ...s, [key]: type }));
    await fetch("/api/checkin/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({
        sessionId,
        recordIds: family.children.map(c => c.id),
        parentName: family.parentName,
        parentEmail: email || null,
        childNames: family.children.map(c => c.child_name),
        followUpType: type,
        personalizedMessage: nvPersonalize[key] || null,
      }),
    });
    setNvSending(s => { const n = { ...s }; delete n[key]; return n; });
    await loadVisitors();
  }

  async function load() {
    const [rRes, tRes, sRes] = await Promise.all([
      fetch("/api/checkin/rooms", { credentials: "include", headers: ch() }),
      fetch("/api/checkin/templates", { credentials: "include", headers: ch() }),
      fetch("/api/checkin/sessions", { credentials: "include", headers: ch() }),
    ]);
    if (rRes.ok) { const d = await rRes.json(); setRooms(d.rooms ?? []); }
    if (tRes.ok) { const d = await tRes.json(); setTemplates(d.templates ?? []); }
    if (sRes.ok) { const d = await sRes.json(); setSessions(d.sessions ?? []); }
  }

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        console.log("Dashboard client user unavailable:", error?.message ?? null);
        return;
      }
      // MASTER ADMIN: honor selected church from localStorage first.
      // This prevents the page from reverting back to the logged-in user's default church.
      const storedChurchId =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_church_id")
          : null;

      if (storedChurchId) {
        selectedChurchIdRef.current = storedChurchId;
        console.log("[CheckinSetup] init: selectedChurchId from localStorage:", storedChurchId);
      } else {
        const churchRes = await fetch("/api/auth/church", {
          credentials: "include",
        });

        if (churchRes.ok) {
          const churchData = await churchRes.json();
          selectedChurchIdRef.current = churchData.churchId;
          console.log("[CheckinSetup] init: selectedChurchId from /api/auth/church:", churchData.churchId);
        }
      }

      console.log("[CheckinSetup] fetch headers:", ch());
      await load();
      setLoading(false);
    }
    init();
  }, [router]);

  async function saveRoom() {
    if (!roomForm.name.trim()) return;
    setSavingRoom(true);
    const res = await fetch("/api/checkin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ name: roomForm.name, minAge: roomForm.minAge ? parseInt(roomForm.minAge) : null, maxAge: roomForm.maxAge ? parseInt(roomForm.maxAge) : null, capacity: roomForm.capacity ? parseInt(roomForm.capacity) : null }),
    });
    if (res.ok) { const d = await res.json(); setRooms(r => [...r, d.room]); setRoomForm({ name: "", minAge: "", maxAge: "", capacity: "" }); setShowAddRoom(false); }
    else { const errBody = await res.json().catch(() => ({})); console.log('[saveRoom] failed', res.status, errBody); }
    setSavingRoom(false);
  }

  async function toggleRoom(room: Room) {
    const res = await fetch("/api/checkin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ id: room.id, isActive: !room.is_active }),
    });
    if (res.ok) { const d = await res.json(); setRooms(rs => rs.map(r => r.id === room.id ? d.room : r)); }
  }

  async function deleteRoom(room: Room) {
    if (!confirm(`Permanently delete "${room.name}"? This cannot be undone.`)) return;
    const res = await fetch("/api/checkin/rooms", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ id: room.id }),
    });
    if (res.ok) { setRooms(rs => rs.filter(r => r.id !== room.id)); }
  }

  async function saveTemplate() {
    if (!tplForm.name.trim()) return;
    setSavingTemplate(true);
    const res = await fetch("/api/checkin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ name: tplForm.name, typicalDay: tplForm.typicalDay || null, typicalTime: tplForm.typicalTime || null }),
    });
    if (res.ok) { const d = await res.json(); setTemplates(t => [...t, d.template]); setTplForm({ name: "", typicalDay: "", typicalTime: "" }); setShowAddTemplate(false); }
    setSavingTemplate(false);
  }

  async function toggleTemplate(tpl: Template) {
    const res = await fetch("/api/checkin/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ id: tpl.id, isActive: !tpl.is_active }),
    });
    if (res.ok) { const d = await res.json(); setTemplates(ts => ts.map(t => t.id === tpl.id ? d.template : t)); }
  }

  async function saveSession() {
    if (!sessionForm.serviceName.trim() || !sessionForm.date || !sessionForm.kioskPin) return;
    if (!/^\d{4}$/.test(sessionForm.kioskPin)) { alert("PIN must be exactly 4 digits"); return; }
    setSavingSession(true);
    const res = await fetch("/api/checkin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ serviceName: sessionForm.serviceName, serviceTemplateId: sessionForm.templateId || null, date: sessionForm.date, scheduledTime: sessionForm.scheduledTime || null, kioskPin: sessionForm.kioskPin, sessionGroup: sessionForm.sessionGroup || null }),
    });
    if (res.ok) { const d = await res.json(); setSessions(s => [d.session, ...s]); setSessionForm({ serviceName: "", templateId: "", date: "", scheduledTime: "", kioskPin: "", sessionGroup: "" }); setShowAddSession(false); }
    setSavingSession(false);
  }

  async function toggleSession(session: Session) {
    const newStatus = session.status === "open" ? "closed" : "open";
    const res = await fetch("/api/checkin/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ id: session.id, status: newStatus }),
    });
    if (res.ok) { const d = await res.json(); setSessions(ss => ss.map(s => s.id === session.id ? d.session : s)); }
  }

  function handleCopy(url: string) {
    copyText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  async function saveDailyPin() {
    if (!/^\d{4}$/.test(newPINInput)) return;
    setSavingPIN(true);
    const today = new Date().toLocaleDateString('en-CA');
    const res = await fetch("/api/checkin/sessions/daily-pin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ch() },
      credentials: "include",
      body: JSON.stringify({ date: today, pin: newPINInput }),
    });
    if (res.ok) {
      setSessions(ss => ss.map(s => s.date === today ? { ...s, kiosk_pin: newPINInput } : s));
      setShowChangePIN(false);
      setNewPINInput("");
    }
    setSavingPIN(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div>;

  const activeRooms = rooms.filter(r => r.is_active);
  const activeSessions = sessions.filter(s => s.status === "open");

  return (
    <MinistryShell type="childrens">
      {/* Header */}
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>📋 Check-In Setup</h1>
        <p className="text-orange-100 text-sm mt-1">Manage rooms, service templates, and kiosk sessions</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit">
          {(["rooms", "templates", "sessions", "visitors"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors" style={{ backgroundColor: tab === t ? ACCENT : "transparent", color: tab === t ? "white" : "#6b7280" }}>
              {t === "rooms" ? "🏠 Rooms" : t === "templates" ? "📅 Service Templates" : t === "sessions" ? "🔑 Sessions" : "🆕 New Visitors"}
            </button>
          ))}
        </div>

        {/* ── ROOMS TAB ── */}
        {tab === "rooms" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>Check-In Rooms</h2>
                <p className="text-xs text-gray-400 mt-0.5">Children are assigned by age range</p>
              </div>
              <button onClick={() => setShowAddRoom(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>+ Add Room</button>
            </div>

            {showAddRoom && (
              <div className="bg-white rounded-2xl shadow p-6 mb-6 border border-orange-100">
                <h3 className="font-bold text-gray-800 mb-4">New Room</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Room Name *</label>
                    <input value={roomForm.name} onChange={e => setRoomForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nursery, K–2nd Grade" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Min Age</label>
                    <input type="number" value={roomForm.minAge} onChange={e => setRoomForm(f => ({ ...f, minAge: e.target.value }))} placeholder="e.g. 0" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Max Age</label>
                    <input type="number" value={roomForm.maxAge} onChange={e => setRoomForm(f => ({ ...f, maxAge: e.target.value }))} placeholder="e.g. 3" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Capacity</label>
                    <input type="number" value={roomForm.capacity} onChange={e => setRoomForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 20" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveRoom} disabled={savingRoom || !roomForm.name.trim()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT, opacity: savingRoom ? 0.6 : 1 }}>{savingRoom ? "Saving…" : "Save Room"}</button>
                  <button onClick={() => setShowAddRoom(false)} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-500">Cancel</button>
                </div>
              </div>
            )}

            {rooms.length === 0 ? (
              <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-4xl mb-3">🏠</div><p className="text-gray-400">No rooms yet. Add your first room above.</p></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map(room => (
                  <div key={room.id} className="bg-white rounded-2xl shadow border border-gray-100 p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-gray-900">{room.name}</h3>
                        <p className="text-sm text-gray-500">{ageRange(room)}</p>
                        {room.capacity && <p className="text-xs text-gray-400 mt-0.5">Capacity: {room.capacity}</p>}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${room.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>{room.is_active ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => toggleRoom(room)} className="flex-1 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: ACCENT, color: room.is_active ? "#6b7280" : ACCENT, backgroundColor: room.is_active ? "transparent" : ACCENT + "11" }}>
                        {room.is_active ? "Deactivate" : "Activate"}
                      </button>
                      {room.is_active && APP_URL && (
                        <a href={`${APP_URL}/classroom/${room.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 rounded-xl text-xs font-bold text-white text-center" style={{ backgroundColor: ACCENT }}>
                          Open Classroom ↗
                        </a>
                      )}
                      {!room.is_active && (
                        <button onClick={() => deleteRoom(room)} className="py-2 px-3 rounded-xl text-xs font-bold border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {tab === "templates" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>Service Templates</h2>
                <p className="text-xs text-gray-400 mt-0.5">Reusable service definitions for quick session creation</p>
              </div>
              <button onClick={() => setShowAddTemplate(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>+ Add Template</button>
            </div>

            {showAddTemplate && (
              <div className="bg-white rounded-2xl shadow p-6 mb-6 border border-orange-100">
                <h3 className="font-bold text-gray-800 mb-4">New Template</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Service Name *</label>
                    <input value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sunday Morning Service" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Typical Day</label>
                    <input value={tplForm.typicalDay} onChange={e => setTplForm(f => ({ ...f, typicalDay: e.target.value }))} placeholder="e.g. Sunday" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Typical Time</label>
                    <input type="time" value={tplForm.typicalTime} onChange={e => setTplForm(f => ({ ...f, typicalTime: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveTemplate} disabled={savingTemplate || !tplForm.name.trim()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT, opacity: savingTemplate ? 0.6 : 1 }}>{savingTemplate ? "Saving…" : "Save Template"}</button>
                  <button onClick={() => setShowAddTemplate(false)} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-500">Cancel</button>
                </div>
              </div>
            )}

            {templates.length === 0 ? (
              <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-4xl mb-3">📅</div><p className="text-gray-400">No templates yet. Add your first service template above.</p></div>
            ) : (
              <div className="space-y-3">
                {templates.map(tpl => (
                  <div key={tpl.id} className="bg-white rounded-2xl shadow border border-gray-100 p-5 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">{tpl.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {[tpl.typical_day, tpl.typical_time ? fmtTime(tpl.typical_time) : null].filter(Boolean).join(" · ") || "No schedule set"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${tpl.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>{tpl.is_active ? "Active" : "Inactive"}</span>
                      <button onClick={() => toggleTemplate(tpl)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500">
                        {tpl.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {tab === "sessions" && (
          <div>
            {/* Permanent church kiosk URL */}
            {selectedChurchIdRef.current && APP_URL && (
              <div className="rounded-2xl shadow p-5 mb-6 border-2" style={{ backgroundColor: ACCENT + "0d", borderColor: ACCENT }}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl flex-shrink-0">📱</span>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">Church Check-In Kiosk</h3>
                    <p className="text-xs text-gray-500 mt-0.5">This link never changes — bookmark it on your check-in tablet</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-orange-200">
                  <code className="text-sm text-gray-700 flex-1 truncate min-w-0">
                    {APP_URL}/kiosk/church/{selectedChurchIdRef.current}
                  </code>
                  <button
                    onClick={() => handleCopy(`${APP_URL}/kiosk/church/${selectedChurchIdRef.current!}`)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: ACCENT + "22", color: ACCENT }}
                  >
                    {copiedUrl === `${APP_URL}/kiosk/church/${selectedChurchIdRef.current}` ? "Copied!" : "Copy"}
                  </button>
                  <a
                    href={`${APP_URL}/kiosk/church/${selectedChurchIdRef.current}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex-shrink-0"
                    style={{ backgroundColor: ACCENT }}
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            )}

            {/* Volunteer Room View card */}
            {selectedChurchIdRef.current && APP_URL && (
              <div className="rounded-2xl shadow p-5 mb-6 border-2" style={{ backgroundColor: "#7c3aed0d", borderColor: "#7c3aed" }}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl flex-shrink-0">👥</span>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">Volunteer Room View</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Share with room volunteers — they enter today&apos;s PIN and select their room</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-purple-200">
                  <code className="text-sm text-gray-700 flex-1 truncate min-w-0">
                    {APP_URL}/kiosk/volunteer/{selectedChurchIdRef.current}
                  </code>
                  <button
                    onClick={() => handleCopy(`${APP_URL}/kiosk/volunteer/${selectedChurchIdRef.current!}`)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: "#7c3aed22", color: "#7c3aed" }}
                  >
                    {copiedUrl === `${APP_URL}/kiosk/volunteer/${selectedChurchIdRef.current}` ? "Copied!" : "Copy"}
                  </button>
                  <a
                    href={`${APP_URL}/kiosk/volunteer/${selectedChurchIdRef.current}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex-shrink-0"
                    style={{ backgroundColor: "#7c3aed" }}
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            )}

            {/* Today's PIN card */}
            {(() => {
              const today = new Date().toLocaleDateString('en-CA');
              const todaySessions = sessions.filter(s => s.date === today);
              const todayPin = todaySessions[0]?.kiosk_pin ?? null;
              return (
                <div className="bg-white rounded-2xl shadow p-5 mb-6 border border-gray-100">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm mb-0.5">🔑 Today&apos;s PIN</h3>
                      {todayPin ? (
                        <p className="text-2xl font-mono font-bold tracking-widest text-gray-900">{todayPin}</p>
                      ) : (
                        <p className="text-sm text-gray-400 mt-0.5">No sessions today</p>
                      )}
                    </div>
                    {!showChangePIN && (
                      <button
                        onClick={() => { setNewPINInput(todayPin ?? ""); setShowChangePIN(true); }}
                        className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:border-gray-300 flex-shrink-0"
                      >
                        Change PIN
                      </button>
                    )}
                  </div>
                  {showChangePIN && (
                    <div className="mt-4 flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newPINInput}
                        onChange={e => setNewPINInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="New 4-digit PIN"
                        maxLength={4}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono w-36"
                        autoFocus
                      />
                      <button
                        onClick={saveDailyPin}
                        disabled={savingPIN || newPINInput.length !== 4}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                        style={{ backgroundColor: ACCENT }}
                      >
                        {savingPIN ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => { setShowChangePIN(false); setNewPINInput(""); }}
                        className="px-3 py-2 rounded-xl text-sm border border-gray-200 text-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Classroom access links */}
            {activeRooms.length > 0 && APP_URL && (
              <div className="bg-white rounded-2xl shadow p-5 mb-6 border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">🏫 Classroom Tablet Links</h3>
                <div className="flex flex-wrap gap-2">
                  {activeRooms.map(room => {
                    const url = `${APP_URL}/classroom/${room.id}`;
                    return (
                      <div key={room.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <span className="text-sm font-medium text-gray-700">{room.name}</span>
                        <button onClick={() => handleCopy(url)} className="text-xs px-2 py-0.5 rounded font-bold" style={{ color: ACCENT }}>{copiedUrl === url ? "Copied!" : "Copy"}</button>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">↗</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>Check-In Sessions</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create a session to open the kiosk for check-in</p>
              </div>
              <button
                onClick={() => {
                  const today = new Date().toLocaleDateString('en-CA');
                  const todayPin = sessions.find(s => s.date === today)?.kiosk_pin
                    ?? String(Math.floor(1000 + Math.random() * 9000));
                  setSessionForm(f => ({ ...f, kioskPin: todayPin }));
                  setShowAddSession(true);
                }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: ACCENT }}
              >
                + New Session
              </button>
            </div>

            {showAddSession && (
              <div className="bg-white rounded-2xl shadow p-6 mb-6 border border-orange-100">
                <h3 className="font-bold text-gray-800 mb-4">New Check-In Session</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Service Name *</label>
                    <input value={sessionForm.serviceName} onChange={e => setSessionForm(f => ({ ...f, serviceName: e.target.value }))} placeholder="e.g. Sunday Morning Service" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-2">Use Template (optional)</label>
                    <div className="space-y-1.5">
                      <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${sessionForm.templateId === "" ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <input
                          type="radio"
                          name="sessionTemplate"
                          value=""
                          checked={sessionForm.templateId === ""}
                          onChange={() => setSessionForm(f => ({ ...f, templateId: "" }))}
                          className="accent-orange-500"
                        />
                        <span className="text-sm text-gray-400 italic">No template</span>
                      </label>
                      {templates.filter(t => t.is_active).map(t => (
                        <label key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${sessionForm.templateId === t.id ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
                          <input
                            type="radio"
                            name="sessionTemplate"
                            value={t.id}
                            checked={sessionForm.templateId === t.id}
                            onChange={() => setSessionForm(f => ({ ...f, templateId: t.id, serviceName: t.name, scheduledTime: t.typical_time ?? f.scheduledTime }))}
                            className="accent-orange-500"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{t.name}</p>
                            {(t.typical_day || t.typical_time) && (
                              <p className="text-xs text-gray-400">{[t.typical_day, t.typical_time ? fmtTime(t.typical_time) : null].filter(Boolean).join(" · ")}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Session Group (optional)</label>
                    <input value={sessionForm.sessionGroup} onChange={e => setSessionForm(f => ({ ...f, sessionGroup: e.target.value }))} placeholder="e.g. Sunday Morning" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">Sessions with the same group name on the same date will share a security code at check-in.</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Date *</label>
                    <input type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Time</label>
                    <input type="time" value={sessionForm.scheduledTime} onChange={e => setSessionForm(f => ({ ...f, scheduledTime: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Kiosk PIN (4 digits) *</label>
                    <input value={sessionForm.kioskPin} onChange={e => setSessionForm(f => ({ ...f, kioskPin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="e.g. 1234" maxLength={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveSession} disabled={savingSession || !sessionForm.serviceName.trim() || !sessionForm.date || sessionForm.kioskPin.length !== 4} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT, opacity: savingSession ? 0.6 : 1 }}>{savingSession ? "Creating…" : "Create Session"}</button>
                  <button onClick={() => setShowAddSession(false)} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-500">Cancel</button>
                </div>
              </div>
            )}

            {sessions.length === 0 ? (
              <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-4xl mb-3">🔑</div><p className="text-gray-400">No sessions yet. Create one to start check-in.</p></div>
            ) : (
              <div className="space-y-4">
                {sessions.map(session => {
                  const isOpen = session.status === "open";
                  return (
                    <div key={session.id} className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-gray-900">{session.service_name}</h3>
                              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${isOpen ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{isOpen ? "Open" : "Closed"}</span>
                            </div>
                            <p className="text-sm text-gray-500">{fmtDate(session.date)}{session.scheduled_time ? ` · ${fmtTime(session.scheduled_time)}` : ""}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">PIN: {session.kiosk_pin}</p>
                          </div>
                          <button onClick={() => toggleSession(session)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: isOpen ? "#fee2e2" : "#dcfce7", color: isOpen ? "#dc2626" : "#16a34a" }}>
                            {isOpen ? "Close Session" : "Reopen"}
                          </button>
                        </div>

                        {/* Classroom links for this session */}
                        {isOpen && activeRooms.length > 0 && APP_URL && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Classroom Links</p>
                            <div className="flex flex-wrap gap-2">
                              {activeRooms.map(room => {
                                const url = `${APP_URL}/classroom/${room.id}`;
                                return (
                                  <a key={room.id} href={url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-xl font-semibold border" style={{ borderColor: ACCENT, color: ACCENT }}>
                                    {room.name} ↗
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── NEW VISITORS TAB ── */}
        {tab === "visitors" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>New Visitor Follow-Up</h2>
                <p className="text-xs text-gray-400 mt-0.5">Send welcome emails or print letters for first-time families</p>
              </div>
              <button onClick={() => loadVisitors()} className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 text-gray-500">↻ Refresh</button>
            </div>

            {nvLoading && <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-gray-400">Loading new visitors…</div></div>}

            {!nvLoading && nvSessions.length === 0 && (
              <div className="bg-white rounded-2xl shadow p-12 text-center">
                <div className="text-5xl mb-4">🎉</div>
                <p className="text-gray-500 font-semibold">No new visitors recorded yet.</p>
                <p className="text-xs text-gray-400 mt-1">New families who check in for the first time will appear here.</p>
              </div>
            )}

            {!nvLoading && nvSessions.map(({ session: sess, families }) => (
              <div key={sess.id} className="bg-white rounded-2xl shadow border border-gray-100 mb-6 overflow-hidden">
                {/* Session header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">{sess.service_name}</h3>
                    <p className="text-sm text-gray-500">{fmtDate(sess.date)} · {families.length} new {families.length === 1 ? "family" : "families"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {sess.auto_followup && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-green-100 text-green-700">⚡ Auto 24hr follow-up active</span>
                    )}
                    <button
                      onClick={() => toggleAutoFollowup(sess.id, sess.auto_followup)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                      style={{ borderColor: sess.auto_followup ? "#dc2626" : ACCENT, color: sess.auto_followup ? "#dc2626" : ACCENT, backgroundColor: sess.auto_followup ? "#fee2e2" : ACCENT + "11" }}
                    >
                      {sess.auto_followup ? "Disable Auto-Send" : "Enable Auto-Send"}
                    </button>
                  </div>
                </div>

                {/* Family cards */}
                <div className="divide-y divide-gray-50">
                  {families.map(family => {
                    const key = `${sess.id}-${family.parentPhone}`;
                    const log = family.followupLog;
                    const isSent = log?.status === "sent";
                    const isSkipped = log?.status === "skipped";
                    const sending = nvSending[key];
                    const personalizeOn = nvPersonalizeOpen[key] ?? false;

                    return (
                      <div key={family.parentPhone} className="px-6 py-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <div className="font-bold text-gray-900 text-base">{family.parentName}</div>
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: family.visitCount === 1 ? "#3b82f6" : family.visitCount === 2 ? "#8b5cf6" : family.visitCount === 3 ? ACCENT : "#16a34a" }}>
                                {family.visitCount === 1 ? "1st Visit" : family.visitCount === 2 ? "2nd Visit" : family.visitCount === 3 ? "3rd Visit" : "4+ Visits"}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">{family.parentPhone}</div>
                            <div className="mt-1 space-y-0.5">
                              {family.children.map(c => (
                                <div key={c.id} className="text-sm text-gray-600">
                                  🧒 {c.child_name}{c.room_name ? ` — ${c.room_name}` : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {isSent && (
                              <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-green-100 text-green-700 block mb-1">
                                ✅ {log!.follow_up_type === "email" ? "Email sent" : log!.follow_up_type === "letter" ? "Letter printed" : "Both sent"}
                              </span>
                            )}
                            {isSkipped && (
                              <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-gray-100 text-gray-500 block mb-1">Skipped</span>
                            )}
                          </div>
                        </div>

                        {!isSent && !isSkipped && (
                          <>
                            <div className="flex gap-2 mb-2 flex-wrap">
                              <input
                                type="email"
                                value={nvEmails[key] ?? ""}
                                onChange={e => setNvEmails(m => ({ ...m, [key]: e.target.value }))}
                                placeholder="Parent email address"
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
                                placeholder="Add a personal note that will appear in the email or letter…"
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none mb-2"
                              />
                            )}
                            <div className="flex gap-2 flex-wrap">
                              {(["email", "letter", "both", "skip"] as const).map(type => (
                                <button
                                  key={type}
                                  onClick={() => sendFollowup(sess.id, family, type)}
                                  disabled={!!sending}
                                  className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                                  style={{
                                    backgroundColor: sending === type ? ACCENT : type === "skip" ? "white" : ACCENT,
                                    color: type === "skip" ? "#6b7280" : "white",
                                    borderColor: type === "skip" ? "#e5e7eb" : ACCENT,
                                    opacity: sending && sending !== type ? 0.5 : 1,
                                  }}
                                >
                                  {sending === type ? "…" : type === "email" ? "📧 Send Email" : type === "letter" ? "🖨️ Print Letter" : type === "both" ? "📧🖨️ Both" : "Skip"}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MinistryShell>
  );
}
