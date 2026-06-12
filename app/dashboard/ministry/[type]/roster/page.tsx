"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG, stageColor, isInvitationOnly } from "@/lib/ministry-config";

const supabase = createClient();

const ACCENT = "#F28C28";



type RosterEntry = {
  id: string;
  member_id: string;
  pipeline_stage: string | null;
  status: string;
  joined_date: string | null;
  notes: string | null;
  member: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
};

type MemberResult = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };

export default function RosterPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const cfg = MINISTRY_CONFIG[type];


  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"members" | "visitors">("members");
  const [visitors, setVisitors] = useState<any[]>([]);
  const [showAddVisitor, setShowAddVisitor] = useState(false);
  const [visitorForm, setVisitorForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [addingVisitor, setAddingVisitor] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<RosterEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  // Add member modal
  const [showAdd, setShowAdd] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [allMembers, setAllMembers] = useState<MemberResult[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState("");

  // Edit modal
  const [editEntry, setEditEntry] = useState<RosterEntry | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function load(t: string) {
    const res = await apiFetch(`/api/ministry/${type}/roster`, { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    setRoster(data.roster ?? []);
  }

  async function loadVisitors(t: string) {
    if (isInvitationOnly(type)) return;
    const res = await apiFetch(`/api/ministry/${type}/visitors`, { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) { const d = await res.json(); setVisitors(d.visitors ?? []); }
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

      const [_, membersRes] = await Promise.all([
        load(t),
        apiFetch("/api/members", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const mData = await membersRes.json();
      setAllMembers(mData.members ?? []);
      await loadVisitors(t);
      setLoading(false);
    }
    init();
  }, [type, router]);

  async function addVisitor() {
    if (!token || !visitorForm.first_name.trim() || !visitorForm.last_name.trim()) return;
    setAddingVisitor(true);
    const res = await apiFetch(`/api/ministry/${type}/visitors`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(visitorForm),
    });
    setAddingVisitor(false);
    if (res.ok) { setShowAddVisitor(false); setVisitorForm({ first_name: "", last_name: "", email: "", phone: "" }); await loadVisitors(token); }
  }

  async function logVisit(visitorId: string) {
    if (!token) return;
    await apiFetch(`/api/ministry/${type}/visitors/${visitorId}/attend`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    await loadVisitors(token);
  }

  async function promoteVisitor(visitorId: string) {
    if (!token) return;
    setPromotingId(visitorId);
    const res = await apiFetch(`/api/ministry/${type}/visitors/${visitorId}/promote`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    setPromotingId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert((d as { error?: string }).error ?? "Failed to promote visitor");
      return;
    }
    setVisitors(prev => prev.filter(v => v.id !== visitorId));
    await Promise.all([load(token), loadVisitors(token)]);
  }

  const rosterMemberIds = new Set(roster.map(r => r.member_id));

  const filteredRoster = roster.filter(r => {
    const name = `${r.member?.first_name ?? ""} ${r.member?.last_name ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const filteredMembers = allMembers.filter(m =>
    !rosterMemberIds.has(m.id) &&
    `${m.first_name} ${m.last_name} ${m.email ?? ""}`.toLowerCase().includes(memberSearch.toLowerCase())
  ).slice(0, 10);

  async function addMember(member: MemberResult) {
    if (!token) return;
    setAdding(member.id); setAddError("");
    const res = await apiFetch(`/api/ministry/${type}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ member_id: member.id, pipeline_stage: cfg?.stages[0] ?? null }),
    });
    if (!res.ok) { const d = await res.json(); setAddError(d.error ?? "Error"); setAdding(null); return; }
    setAdding(null);
    await load(token);
  }

  function openEdit(entry: RosterEntry) {
    setEditEntry(entry);
    setEditStage(entry.pipeline_stage ?? "");
    setEditStatus(entry.status);
    setEditNotes(entry.notes ?? "");
    setSaveError("");
  }

  async function saveEdit() {
    if (!editEntry || !token) return;
    setSaving(true); setSaveError("");
    const res = await apiFetch(`/api/ministry/${type}/roster/${editEntry.member_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pipeline_stage: editStage || null, status: editStatus, notes: editNotes }),
    });
    if (!res.ok) { const d = await res.json(); setSaveError(d.error ?? "Error"); setSaving(false); return; }
    setSaving(false);
    setEditEntry(null);
    await load(token);
  }

  async function removeMember() {
    if (!confirmRemove || !token) return;
    setRemoving(true);
    await apiFetch(`/api/ministry/${type}/roster/${confirmRemove.member_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setRemoving(false);
    setConfirmRemove(null);
    await load(token);
  }

  if (!cfg) return <MinistryShell type={type}><div className="p-8 text-gray-500">Ministry not found.</div></MinistryShell>;
  if (loading) return <MinistryShell type={type}><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type={type}>
      {/* Hero */}
      <div className="px-8 py-8" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <Link href={`/dashboard/ministry/${type}`} className="text-orange-200 text-xs mb-1 block hover:text-white">← {cfg.name}</Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Roster</h1>
            <p className="text-orange-100 text-sm mt-1">{roster.length} member{roster.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => { setShowAdd(true); setMemberSearch(""); setAddError(""); }} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white" style={{ color: ACCENT }}>
            + Add Member
          </button>
        </div>
      </div>


      {/* Tabs — only for non-invitation-only ministries */}
      {!isInvitationOnly(type) && (
        <div className="flex border-b border-gray-200 bg-white px-8">
          {(["members", "visitors"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className="px-5 py-3 text-sm font-medium border-b-2 transition-colors capitalize" style={{ borderColor: activeTab === tab ? ACCENT : "transparent", color: activeTab === tab ? ACCENT : "#6b7280" }}>
              {tab === "members" ? `Members (${roster.length})` : `Visitors (${visitors.length})`}
            </button>
          ))}
        </div>
      )}

      <div className="px-8 py-8 bg-gray-50 min-h-screen">

        {/* ── VISITORS TAB ── */}
        {activeTab === "visitors" && !isInvitationOnly(type) && (
          <div>
            <div className="flex justify-between items-center mb-5">
              <p className="text-sm text-gray-500">Log visits and promote ready members to the roster.</p>
              <button onClick={() => setShowAddVisitor(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>+ Add Visitor</button>
            </div>
            {visitors.length === 0 ? (
              <div className="bg-white rounded-2xl shadow p-10 text-center"><div className="text-5xl mb-3">🆕</div><p className="text-gray-400">No visitors yet. Add your first visitor above.</p></div>
            ) : (
              <div className="space-y-3">
                {visitors.map(v => (
                  <div key={v.id} className="bg-white rounded-2xl shadow px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-bold text-gray-900">{v.first_name} {v.last_name}</p>
                        {(v.status === "flagged" || v.visit_count >= 4) && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">⭐ Ready to Promote</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {v.visit_count} visit{v.visit_count !== 1 ? "s" : ""} · First: {v.first_visit_date} · Last: {v.last_visit_date}
                        {v.email ? ` · ${v.email}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => logVisit(v.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">
                        + Log Visit
                      </button>
                      <div className="flex flex-col items-end gap-0.5">
                        <button
                          onClick={() => promoteVisitor(v.id)}
                          disabled={promotingId === v.id || v.visit_count < 4}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                          style={{
                            backgroundColor: promotingId === v.id || v.visit_count < 4 ? "#9ca3af" : ACCENT,
                            cursor: promotingId === v.id || v.visit_count < 4 ? "not-allowed" : "pointer",
                          }}
                        >
                          {promotingId === v.id ? "Promoting…" : "→ Change to Member"}
                        </button>
                        {v.visit_count < 4 && promotingId !== v.id && (
                          <p className="text-xs text-gray-400">{v.visit_count} of 4 visits</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddVisitor && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowAddVisitor(false)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                  <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-bold" style={{ fontFamily: "Georgia, serif" }}>Add Visitor</h2></div>
                  <div className="p-6 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label><input value={visitorForm.first_name} onChange={e => setVisitorForm(f => ({ ...f, first_name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label><input value={visitorForm.last_name} onChange={e => setVisitorForm(f => ({ ...f, last_name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                    </div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label><input type="email" value={visitorForm.email} onChange={e => setVisitorForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input value={visitorForm.phone} onChange={e => setVisitorForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowAddVisitor(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                      <button onClick={addVisitor} disabled={addingVisitor} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>{addingVisitor ? "Adding…" : "Add Visitor"}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MEMBERS TAB ── */}
        {(activeTab === "members" || isInvitationOnly(type)) && (
          <div>
        {/* Search */}
        <div className="mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members…" className="w-full max-w-sm px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm" />
        </div>

        {/* Roster table */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {filteredRoster.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">{cfg.emoji}</div>
              <p className="text-gray-400">{search ? "No members match your search." : "No members on this roster yet. Click + Add Member to get started."}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Shepherd Pipeline Stage</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Joined</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map(entry => (
                  <tr key={entry.id} className="border-b border-gray-50 hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                          {entry.member?.first_name?.[0]}{entry.member?.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{entry.member?.first_name} {entry.member?.last_name}</p>
                          {entry.member?.email && <p className="text-xs text-gray-400">{entry.member.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {entry.pipeline_stage ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: stageColor(cfg.stages, entry.pipeline_stage) }}>
                          {entry.pipeline_stage}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.status === "active" ? "#22c55e" : "#9ca3af" }} />
                        <span className="text-sm text-gray-600 capitalize">{entry.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {entry.joined_date ? new Date(entry.joined_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(entry)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => setConfirmRemove(entry)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 border border-red-100 hover:border-red-300 transition-colors">
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
        )}

      </div>

      {/* Add Member Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Add Member to Roster</h2>
            </div>
            <div className="p-6">
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search by name or email…"
                autoFocus
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm mb-4"
              />
              {addError && <p className="text-sm text-red-600 mb-3">{addError}</p>}
              {memberSearch.trim() === "" ? (
                <p className="text-sm text-gray-400 text-center py-4">Start typing to search members</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No matching members found (or all are already on this roster)</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {filteredMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addMember(m)}
                      disabled={adding === m.id}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                        {m.first_name[0]}{m.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.first_name} {m.last_name}</p>
                        {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                      </div>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: adding === m.id ? "#9ca3af" : ACCENT }}>
                        {adding === m.id ? "Adding…" : "Add →"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => setShowAdd(false)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setEditEntry(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>
                Edit — {editEntry.member?.first_name} {editEntry.member?.last_name}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shepherd Pipeline Stage</label>
                <select value={editStage} onChange={e => setEditStage(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">— None —</option>
                  {cfg.stages.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditEntry(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setConfirmRemove(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="font-bold text-gray-900 mb-2">Remove from Roster?</h2>
            <p className="text-sm text-gray-500 mb-6">
              Remove <strong>{confirmRemove.member?.first_name} {confirmRemove.member?.last_name}</strong> from the {cfg.name} roster?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemove(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={removeMember} disabled={removing} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500">
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
