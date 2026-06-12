"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const ACCENT = "#F28C28";

type LiveChild = { id: string; child_name: string; parent_name: string; is_new_visitor: boolean; allergies: string[]; allergy_other: string | null; checked_in_at: string };
type LiveRoom = { room_id: string; room_name: string; children: LiveChild[] };
type LiveSession = { id: string; service_name: string; date: string; scheduled_time: string | null };
type Room = { id: string; name: string };

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function LiveCheckinPage() {
  const router = useRouter();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [totalCheckedIn, setTotalCheckedIn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLive = useCallback(async () => {
    const res = await apiFetch("/api/checkin/live", { credentials: "include" });
    if (!res.ok) return;
    const d = await res.json();
    setSession(d.session ?? null);
    setRooms(d.rooms ?? []);
    setTotalCheckedIn(d.totalCheckedIn ?? 0);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        console.log("Dashboard client user unavailable:", error?.message ?? null);
        return;
      }
      await fetchLive();
      const roomsRes = await apiFetch("/api/checkin/update-record", { credentials: "include" });
      if (roomsRes.ok) { const d = await roomsRes.json(); setAllRooms(d.rooms ?? []); }
    }
    init();
  }, [router, fetchLive]);

  useEffect(() => {
    const interval = setInterval(() => fetchLive(), 30000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  async function handleSaveRoom(recordId: string) {
    setSaving(true);
    await apiFetch("/api/checkin/update-record", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ recordId, roomId: editRoomId || null }),
    });
    setSaving(false);
    setEditingId(null);
    fetchLive();
  }

  async function handleDelete(recordId: string) {
    if (!window.confirm("Remove this check-in record?")) return;
    setDeletingId(recordId);
    await apiFetch("/api/checkin/update-record", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ recordId }),
    });
    setDeletingId(null);
    fetchLive();
  }

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>⚡ Live Check-In</h1>
        {lastUpdated && <p className="text-orange-100 text-xs mt-1">Last updated {lastUpdated.toLocaleTimeString()} · auto-refreshes every 30s</p>}
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {loading && (
          <div className="bg-white rounded-2xl shadow p-12 text-center"><div className="text-gray-400">Loading…</div></div>
        )}

        {!loading && !session && (
          <div className="bg-white rounded-2xl shadow p-16 text-center">
            <div className="text-5xl mb-4">🕐</div>
            <p className="text-gray-600 font-bold text-lg">No open session right now</p>
            <p className="text-gray-400 text-sm mt-1">Create and open a session in Check-In Setup to see live data here.</p>
          </div>
        )}

        {!loading && session && (
          <>
            {/* Session info + total count */}
            <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>{session.service_name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{fmtDate(session.date)}</p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black" style={{ color: ACCENT }}>{totalCheckedIn}</div>
                <div className="text-sm font-semibold text-gray-500 mt-0.5">Checked In</div>
              </div>
            </div>

            {rooms.length === 0 && (
              <div className="bg-white rounded-2xl shadow p-12 text-center">
                <div className="text-5xl mb-4">👋</div>
                <p className="text-gray-500 font-semibold">No children checked in yet.</p>
              </div>
            )}

            {/* Per-room cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map(room => (
                <div key={room.room_id} className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "#1a2e1a" }}>
                    <h3 className="font-bold text-white text-base">{room.room_name}</h3>
                    <span className="text-2xl font-black" style={{ color: "#4ade80" }}>{room.children.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {room.children.map(child => {
                      const hasAllergy = child.allergies.length > 0 || child.allergy_other;
                      const allergyText = [...child.allergies, child.allergy_other].filter(Boolean).join(", ");
                      return (
                        <div key={child.id} className="px-5 py-3">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900">{child.child_name}</span>
                              {child.is_new_visitor && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: ACCENT }}>🆕 NEW</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => { setEditingId(child.id); setEditRoomId(room.room_id === "unassigned" ? "" : room.room_id); }}
                                className="text-xs px-2 py-0.5 rounded font-semibold border"
                                style={{ borderColor: ACCENT, color: ACCENT }}
                              >Edit</button>
                              <button
                                onClick={() => handleDelete(child.id)}
                                disabled={deletingId === child.id}
                                className="text-xs px-2 py-0.5 rounded font-semibold border border-red-300 text-red-500"
                              >{deletingId === child.id ? "…" : "Delete"}</button>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400">{child.parent_name} · in {fmtTime(child.checked_in_at)}</div>
                          {hasAllergy && (
                            <div className="text-xs font-bold text-white mt-1.5 px-2 py-1 rounded-lg" style={{ backgroundColor: "#dc2626" }}>
                              ⚠️ {allergyText}
                            </div>
                          )}
                          {editingId === child.id && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <select
                                value={editRoomId}
                                onChange={e => setEditRoomId(e.target.value)}
                                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                              >
                                <option value="">— No Room —</option>
                                {allRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                              <button
                                onClick={() => handleSaveRoom(child.id)}
                                disabled={saving}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-bold text-white flex-shrink-0"
                                style={{ backgroundColor: ACCENT }}
                              >{saving ? "…" : "Save"}</button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-semibold text-gray-500 border border-gray-200 flex-shrink-0"
                              >Cancel</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </MinistryShell>
  );
}
