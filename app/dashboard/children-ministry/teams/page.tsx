"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";
import { ProLockedOverlay } from "@/components/ProLockedOverlay";

const supabase = createClient();


const CM_ACCENT = "#F28C28";

const TEAM_COLORS = [
  { label: "Red", value: "#EF4444" }, { label: "Blue", value: "#3B82F6" },
  { label: "Green", value: "#22C55E" }, { label: "Yellow", value: "#EAB308" },
  { label: "Purple", value: "#A855F7" }, { label: "Orange", value: "#F97316" },
  { label: "Pink", value: "#EC4899" }, { label: "Teal", value: "#14B8A6" },
  { label: "Indigo", value: "#6366F1" }, { label: "Crimson", value: "#DC2626" },
];

type Season = { id: string; name: string; status: string };
type Child = { id: string; first_name: string; last_name: string };
type Member = { id: string; first_name: string; last_name: string; grade?: string };
type Team = {
  id: string; name: string; color: string; mascot: string | null;
  volunteer_leader_name: string | null; volunteer_leader_email: string | null;
  total_points: number; member_count: number;
  captain: { first_name: string; last_name: string } | null;
  co_captain: { first_name: string; last_name: string } | null;
  members: Member[];
};

export default function TeamsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasPro, setHasPro] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Create team modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#EF4444", mascot: "", leaderName: "", leaderEmail: "", captainId: "", coCaptainId: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Edit team modal
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editTeamForm, setEditTeamForm] = useState({ name: "", color: "#EF4444", mascot: "", leaderName: "", leaderEmail: "", captainId: "", coCaptainId: "" });
  const [editTeamSaving, setEditTeamSaving] = useState(false);
  const [editTeamError, setEditTeamError] = useState("");

  // Split modal
  const [splitTeam, setSplitTeam] = useState<Team | null>(null);
  const [splitForm, setSplitForm] = useState({ name: "", color: "#3B82F6", mascot: "" });
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState("");

  // Award points to whole team
  const [awardTeam, setAwardTeam] = useState<Team | null>(null);
  const [awardPts, setAwardPts] = useState("");
  const [awardNote, setAwardNote] = useState("");
  const [awarding, setAwarding] = useState(false);

  async function load(t: string, sid: string) {
    const res = await apiFetch(`/api/children-ministry/teams?season_id=${sid}`, { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    setTeams(data.teams ?? []);
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

      const [proRes, sRes, cRes] = await Promise.all([
        apiFetch("/api/addons/ministry-pro", { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch("/api/children-ministry/seasons", { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch("/api/children-ministry/children", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const proData = proRes.ok ? await proRes.json() : { active: false };
      setHasPro(proData.active ?? false);
      const sData = await sRes.json();
      const cData = await cRes.json();
      const allSeasons: Season[] = sData.seasons ?? [];
      setSeasons(allSeasons);
      setChildren(cData.children ?? []);
      const active = allSeasons.find(s => s.status === "active") ?? allSeasons[0] ?? null;
      setActiveSeason(active);
      if (active) await load(t, active.id);
      setLoading(false);
    }
    init();
  }, [router]);

  async function createTeam() {
    if (!form.name.trim()) { setSaveError("Team name required"); return; }
    if (!activeSeason) { setSaveError("No active season"); return; }
    setSaving(true); setSaveError("");
    const res = await apiFetch("/api/children-ministry/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seasonId: activeSeason.id, name: form.name, color: form.color, mascot: form.mascot, volunteerLeaderName: form.leaderName, volunteerLeaderEmail: form.leaderEmail, captainChildId: form.captainId || undefined, coCaptainChildId: form.coCaptainId || undefined }),
    });
    if (!res.ok) { const d = await res.json(); setSaveError(d.error ?? "Error"); setSaving(false); return; }
    setSaving(false); setShowCreate(false);
    if (token && activeSeason) await load(token, activeSeason.id);
  }

  function openEditTeam(team: Team) {
    setEditTeam(team);
    setEditTeamForm({ name: team.name, color: team.color, mascot: team.mascot ?? "", leaderName: team.volunteer_leader_name ?? "", leaderEmail: team.volunteer_leader_email ?? "", captainId: (team.captain as any)?.id ?? "", coCaptainId: (team.co_captain as any)?.id ?? "" });
    setEditTeamError("");
  }

  async function saveEditTeam() {
    if (!editTeam || !editTeamForm.name.trim()) { setEditTeamError("Team name required"); return; }
    setEditTeamSaving(true); setEditTeamError("");
    const res = await apiFetch(`/api/children-ministry/teams/${editTeam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: editTeamForm.name, color: editTeamForm.color, mascot: editTeamForm.mascot, volunteerLeaderName: editTeamForm.leaderName, volunteerLeaderEmail: editTeamForm.leaderEmail, captainChildId: editTeamForm.captainId || null, coCaptainChildId: editTeamForm.coCaptainId || null }),
    });
    if (!res.ok) { const d = await res.json(); setEditTeamError(d.error ?? "Error"); setEditTeamSaving(false); return; }
    setEditTeamSaving(false); setEditTeam(null);
    if (token && activeSeason) await load(token, activeSeason.id);
  }

  async function doSplit() {
    if (!splitTeam || !splitForm.name.trim()) { setSplitError("New team name required"); return; }
    setSplitting(true); setSplitError("");
    const res = await apiFetch(`/api/children-ministry/teams/${splitTeam.id}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newTeamName: splitForm.name, newTeamColor: splitForm.color, newTeamMascot: splitForm.mascot }),
    });
    if (!res.ok) { const d = await res.json(); setSplitError(d.error ?? "Error"); setSplitting(false); return; }
    setSplitting(false); setSplitTeam(null);
    if (token && activeSeason) await load(token, activeSeason.id);
  }

  async function awardTeamPoints() {
    if (!awardTeam || !awardPts || Number(awardPts) <= 0) return;
    setAwarding(true);
    await apiFetch("/api/children-ministry/points", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seasonId: activeSeason?.id, teamId: awardTeam.id, category: "other", points: Number(awardPts), note: awardNote }),
    });
    setAwarding(false); setAwardTeam(null); setAwardPts(""); setAwardNote("");
    if (token && activeSeason) await load(token, activeSeason.id);
  }

  if (loading) return <MinistryShell type="childrens"><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${CM_ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Teams</h1>
        {activeSeason && <p className="text-orange-100 text-sm mt-1">{activeSeason.name}</p>}
      </div>

      {hasPro === false ? (
        <ProLockedOverlay />
      ) : (
      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="flex justify-end mb-6">
          <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-xl font-bold text-white text-sm" style={{ backgroundColor: CM_ACCENT }}>
            + Create Team
          </button>
        </div>

        {teams.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <div className="text-5xl mb-4">🏆</div>
            <p className="text-gray-400">No teams yet. Create your first team to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map((team, idx) => (
              <div key={team.id} className="bg-white rounded-2xl shadow overflow-hidden">
                {/* Team header */}
                <div className="flex items-center gap-4 p-5" style={{ borderLeft: `6px solid ${team.color}` }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0" style={{ backgroundColor: team.color }}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-bold text-gray-900 text-lg" style={{ fontFamily: "Georgia, serif" }}>{team.name}</h3>
                      {team.mascot && <span className="text-sm text-gray-400">· {team.mascot}</span>}
                      {team.member_count >= 12 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>Split Ready!</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {team.member_count} members · {team.captain ? `Captain: ${team.captain.first_name} ${team.captain.last_name}` : "No captain"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-black" style={{ color: team.color }}>{Number(team.total_points).toLocaleString()}</p>
                    <p className="text-xs text-gray-400">points</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setAwardTeam(team)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>
                      ⭐ Award
                    </button>
                    <button onClick={() => openEditTeam(team)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">
                      Edit
                    </button>
                    {team.member_count >= 12 && (
                      <button onClick={() => setSplitTeam(team)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600">
                        ✂️ Split
                      </button>
                    )}
                    <button onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600">
                      {expandedTeam === team.id ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {/* Expanded member list */}
                {expandedTeam === team.id && (
                  <div className="px-5 pb-5 pt-2 border-t border-gray-50">
                    {team.volunteer_leader_name && (
                      <p className="text-xs text-gray-500 mb-3">Volunteer Leader: <strong>{team.volunteer_leader_name}</strong>{team.volunteer_leader_email ? ` · ${team.volunteer_leader_email}` : ""}</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {team.members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: team.color }}>
                            {m.first_name[0]}{m.last_name[0]}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">{m.first_name} {m.last_name}</p>
                            {m.id === (team.captain as any)?.id && <p className="text-xs text-yellow-600 font-bold">Captain</p>}
                            {m.id === (team.co_captain as any)?.id && <p className="text-xs text-gray-500">Co-captain</p>}
                          </div>
                        </div>
                      ))}
                      {team.members.length === 0 && <p className="text-xs text-gray-400 col-span-4">No members assigned yet.</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Create Team Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Create Team</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Team Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="The Mighty Eagles" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Team Color *</label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_COLORS.map(c => (
                    <button key={c.value} onClick={() => setForm(f => ({ ...f, color: c.value }))} className="w-8 h-8 rounded-full border-2 transition-all" style={{ backgroundColor: c.value, borderColor: form.color === c.value ? "#111" : "transparent" }} title={c.label} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mascot</label>
                <input value={form.mascot} onChange={e => setForm(f => ({ ...f, mascot: e.target.value }))} placeholder="Eagles, Lions…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Volunteer Leader</label>
                  <input value={form.leaderName} onChange={e => setForm(f => ({ ...f, leaderName: e.target.value }))} placeholder="Name" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Leader Email</label>
                  <input type="email" value={form.leaderEmail} onChange={e => setForm(f => ({ ...f, leaderEmail: e.target.value }))} placeholder="email@church.org" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              {children.length > 0 && <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Captain</label>
                  <select value={form.captainId} onChange={e => setForm(f => ({ ...f, captainId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">— Select Captain —</option>
                    {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Co-Captain</label>
                  <select value={form.coCaptainId} onChange={e => setForm(f => ({ ...f, coCaptainId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">— Select Co-Captain —</option>
                    {children.filter(c => c.id !== form.captainId).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
              </>}
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={createTeam} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>
                  {saving ? "Creating…" : "Create Team"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {splitTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setSplitTeam(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Split Team</h2>
              <p className="text-sm text-gray-500 mt-1">The co-captain will become captain of the new team. Both teams receive +5,000 bonus points.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Team Name *</label>
                <input value={splitForm.name} onChange={e => setSplitForm(f => ({ ...f, name: e.target.value }))} placeholder="Team name…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Team Color</label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_COLORS.map(c => (
                    <button key={c.value} onClick={() => setSplitForm(f => ({ ...f, color: c.value }))} className="w-8 h-8 rounded-full border-2" style={{ backgroundColor: c.value, borderColor: splitForm.color === c.value ? "#111" : "transparent" }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mascot</label>
                <input value={splitForm.mascot} onChange={e => setSplitForm(f => ({ ...f, mascot: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              {splitError && <p className="text-sm text-red-600">{splitError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setSplitTeam(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={doSplit} disabled={splitting} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500">
                  {splitting ? "Splitting…" : "✂️ Split Team"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Award Points Modal */}
      {awardTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setAwardTeam(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b" style={{ borderColor: awardTeam.color }}>
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif", color: awardTeam.color }}>Award Points to {awardTeam.name}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Points</label>
                <input type="number" value={awardPts} onChange={e => setAwardPts(e.target.value)} placeholder="1000" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <input value={awardNote} onChange={e => setAwardNote(e.target.value)} placeholder="Game win, special challenge…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAwardTeam(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={awardTeamPoints} disabled={awarding} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>
                  {awarding ? "Awarding…" : "⭐ Award"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit Team Modal */}
      {editTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setEditTeam(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Edit {editTeam.name}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Team Name *</label>
                <input value={editTeamForm.name} onChange={e => setEditTeamForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Team Color</label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_COLORS.map(c => (
                    <button key={c.value} onClick={() => setEditTeamForm(f => ({ ...f, color: c.value }))} className="w-8 h-8 rounded-full border-2" style={{ backgroundColor: c.value, borderColor: editTeamForm.color === c.value ? "#111" : "transparent" }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mascot</label>
                <input value={editTeamForm.mascot} onChange={e => setEditTeamForm(f => ({ ...f, mascot: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Volunteer Leader</label>
                  <input value={editTeamForm.leaderName} onChange={e => setEditTeamForm(f => ({ ...f, leaderName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Leader Email</label>
                  <input type="email" value={editTeamForm.leaderEmail} onChange={e => setEditTeamForm(f => ({ ...f, leaderEmail: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              {children.length > 0 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Captain</label>
                    <select value={editTeamForm.captainId} onChange={e => setEditTeamForm(f => ({ ...f, captainId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option value="">— None —</option>
                      {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Co-Captain</label>
                    <select value={editTeamForm.coCaptainId} onChange={e => setEditTeamForm(f => ({ ...f, coCaptainId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option value="">— None —</option>
                      {children.filter(c => c.id !== editTeamForm.captainId).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                </>
              )}
              {editTeamError && <p className="text-sm text-red-600">{editTeamError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditTeam(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={saveEditTeam} disabled={editTeamSaving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>
                  {editTeamSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
