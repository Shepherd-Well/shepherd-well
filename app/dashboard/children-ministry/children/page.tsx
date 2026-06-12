"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const CM_ACCENT = "#F28C28";

type Child = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  visit_date: string | null;
};

type MilestoneRecord = {
  id: string;
  milestone_type: string;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
};

type Milestones = {
  salvation: MilestoneRecord | null;
  water_baptism: MilestoneRecord | null;
};

function calcAge(dob: string): number {
  const d = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ChildrenPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [search, setSearch] = useState("");
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [milestones, setMilestones] = useState<Milestones | null>(null);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [editField, setEditField] = useState<"salvation" | "water_baptism" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(t: string) {
    const selectedChurchId = localStorage.getItem("selected_church_id");
    console.log("[Children] load: selectedChurchId from localStorage:", selectedChurchId ?? "(none — will use logged-in church)");
    const res = await fetch("/api/children-ministry/children", {
      headers: {
        Authorization: `Bearer ${t}`,
        ...(selectedChurchId ? { "x-selected-church-id": selectedChurchId } : {}),
      },
    });
    console.log("[Children] fetch x-selected-church-id sent:", selectedChurchId ?? "(not sent)");
    const data = await res.json();
    setChildren(data.children ?? []);
  }

  async function refreshMilestones(childId: string, t: string) {
    const res = await fetch(`/api/children-ministry/children/${childId}/milestones`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const m: Milestones = { salvation: null, water_baptism: null };
    for (const item of (data.milestones ?? []) as MilestoneRecord[]) {
      if (item.milestone_type === "salvation") m.salvation = item;
      if (item.milestone_type === "water_baptism") m.water_baptism = item;
    }
    setMilestones(m);
  }

  async function saveMilestone(type: "salvation" | "water_baptism") {
    if (!selectedChild || !token || !editValue) return;
    setSaving(true);
    const res = await fetch(`/api/children-ministry/children/${selectedChild.id}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ milestoneType: type, completedAt: editValue }),
    });
    if (res.ok) {
      await refreshMilestones(selectedChild.id, token);
      setEditField(null);
      setEditValue("");
    }
    setSaving(false);
  }

  useEffect(() => {
    if (!selectedChild || !token) {
      setMilestones(null);
      setEditField(null);
      setEditValue("");
      return;
    }
    let cancelled = false;
    setMilestonesLoading(true);
    setMilestones(null);
    setEditField(null);
    setEditValue("");
    fetch(`/api/children-ministry/children/${selectedChild.id}/milestones`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (cancelled || !res.ok) return;
      const data = await res.json();
      const m: Milestones = { salvation: null, water_baptism: null };
      for (const item of (data.milestones ?? []) as MilestoneRecord[]) {
        if (item.milestone_type === "salvation") m.salvation = item;
        if (item.milestone_type === "water_baptism") m.water_baptism = item;
      }
      setMilestones(m);
    }).finally(() => { if (!cancelled) setMilestonesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedChild?.id, token]);

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
  }, [router]);

  const filtered = children.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (c.parent_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400">Loading…</div>
    </div>
  );

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${CM_ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Children</h1>
        <p className="text-orange-100 text-sm mt-1">{children.length} registered</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="mb-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or parent…"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
          />
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">🧒</div>
              <p className="text-gray-400">
                {search ? "No children match your search." : "No children registered yet. They'll appear here after their first kiosk check-in."}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Child</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Parent</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">First Visit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(child => (
                  <tr
                    key={child.id}
                    onClick={() => setSelectedChild(child)}
                    className="border-b border-gray-50 hover:bg-orange-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: CM_ACCENT }}
                        >
                          {child.first_name[0]}{child.last_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{child.first_name} {child.last_name}</p>
                          {child.date_of_birth && (
                            <p className="text-xs text-gray-400">{calcAge(child.date_of_birth)} years old</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {child.parent_name && (
                        <p className="text-sm text-gray-700">{child.parent_name}</p>
                      )}
                      {child.parent_phone && (
                        <p className="text-xs text-gray-400">{child.parent_phone}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {child.visit_date ? fmtDate(child.visit_date) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Child Detail Modal */}
      {selectedChild && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setSelectedChild(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>
                  {selectedChild.first_name} {selectedChild.last_name}
                </h2>
                {selectedChild.date_of_birth && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {calcAge(selectedChild.date_of_birth)} years old · DOB {fmtDate(selectedChild.date_of_birth)}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedChild(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {(selectedChild.parent_name || selectedChild.parent_phone || selectedChild.parent_email) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Parent / Guardian</p>
                  {selectedChild.parent_name && <p className="font-medium text-gray-800 text-sm">{selectedChild.parent_name}</p>}
                  {selectedChild.parent_phone && <p className="text-xs text-gray-500 mt-0.5">{selectedChild.parent_phone}</p>}
                  {selectedChild.parent_email && <p className="text-xs text-gray-500">{selectedChild.parent_email}</p>}
                </div>
              )}
              {selectedChild.visit_date && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">First Visit</p>
                  <p className="text-sm text-gray-700">{fmtDate(selectedChild.visit_date)}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Faith Journey</p>
                {milestonesLoading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : (
                  <div className="space-y-3">
                    {(["salvation", "water_baptism"] as const).map((type) => {
                      const label = type === "salvation" ? "✝️ Spiritual Birthday" : "🌊 Baptism Date";
                      const current = milestones?.[type] ?? null;
                      return (
                        <div key={type}>
                          <p className="text-xs text-gray-500 mb-1">{label}</p>
                          {editField === type ? (
                            <div className="flex gap-2 items-center flex-wrap">
                              <input
                                type="date"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                              />
                              <button
                                onClick={() => saveMilestone(type)}
                                disabled={saving || !editValue}
                                className="text-xs font-medium text-white px-3 py-1 rounded-lg disabled:opacity-50"
                                style={{ backgroundColor: CM_ACCENT }}
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => { setEditField(null); setEditValue(""); }}
                                className="text-xs text-gray-400"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : current?.completed_at ? (
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-gray-700">{fmtDate(current.completed_at)}</p>
                              <button
                                onClick={() => { setEditField(type); setEditValue(current.completed_at ?? ""); }}
                                className="text-xs font-medium"
                                style={{ color: CM_ACCENT }}
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditField(type); setEditValue(""); }}
                              className="text-xs font-medium"
                              style={{ color: CM_ACCENT }}
                            >
                              + Add date
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
