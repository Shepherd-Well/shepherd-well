"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG } from "@/lib/ministry-config";

const supabase = createClient();

const ACCENT = "#F28C28";
const SHEPHERD_TYPES = new Set(['childrens', 'middle-school', 'high-school']);



type GroupMember = { id: string; first_name: string; last_name: string };
type Group = {
  id: string;
  volunteer_name: string;
  volunteer_email: string | null;
  volunteer_phone: string | null;
  leadership_kid: GroupMember | null;
  members: GroupMember[];
  member_count: number;
  contacts_this_month: { phone_call: number; two_on_one: number; letter: number; total: number };
  overall_status: 'green' | 'yellow' | 'red';
};

const STATUS_COLORS = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };
const STATUS_LABELS = { green: "On Track", yellow: "Some Overdue", red: "Needs Attention" };

export default function ShepherdGroupsPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const cfg = MINISTRY_CONFIG[type];

  const selectedChurchIdRef = useRef<string | null>(null);
  const ch = (): Record<string, string> => selectedChurchIdRef.current ? { "x-selected-church-id": selectedChurchIdRef.current } : {};

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [totalKids, setTotalKids] = useState(0);
  const [totalVols, setTotalVols] = useState(0);
  const [recommended, setRecommended] = useState(0);
  const [isUnderstaffed, setIsUnderstaffed] = useState(false);
  const [ratio, setRatio] = useState(5);

  // Create group modal
  const [showCreate, setShowCreate] = useState(false);
  const [allMembers, setAllMembers] = useState<GroupMember[]>([]);
  const [form, setForm] = useState({
    volunteer_name: "", volunteer_email: "", volunteer_phone: "",
    leadership_kid_id: "", member_ids: [] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function load(t: string, r: number = 5) {
    const res = await fetch(`/api/ministry/${type}/shepherd-groups?ratio=${r}`, { headers: { Authorization: `Bearer ${t}`, ...ch() } });
    if (!res.ok) return;
    const data = await res.json();
    setGroups(data.groups ?? []);
    setTotalKids(data.total_kids ?? 0);
    setTotalVols(data.total_volunteers ?? 0);
    setRecommended(data.recommended_volunteers ?? 0);
    setIsUnderstaffed(data.is_understaffed ?? false);
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
      selectedChurchIdRef.current = localStorage.getItem("selected_church_id");
      setToken(t);

      const stored = localStorage.getItem(`sw_shepherd_ratio_${type}`);
      const storedRatio = stored ? Math.min(10, Math.max(3, parseInt(stored) || 5)) : 5;
      setRatio(storedRatio);

      const [_, membersRes] = await Promise.all([
        load(t, storedRatio),
        fetch(`/api/ministry/${type}/roster`, { headers: { Authorization: `Bearer ${t}`, ...ch() } }),
      ]);
      const mData = await membersRes.json();
      setAllMembers((mData.roster ?? []).map((r: any) => ({ id: r.member_id, first_name: r.member?.first_name ?? "?", last_name: r.member?.last_name ?? "?" })));
      setLoading(false);
    }
    init();
  }, [type, router]);

  async function createGroup() {
    if (!form.volunteer_name.trim()) { setCreateError("Volunteer name required"); return; }
    const allIds = [...new Set([form.leadership_kid_id, ...form.member_ids].filter(Boolean))];
    if (allIds.length > 5) { setCreateError("Maximum 5 members per group"); return; }
    setCreating(true); setCreateError("");
    const res = await fetch(`/api/ministry/${type}/shepherd-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...ch() },
      body: JSON.stringify({ ...form, member_ids: allIds }),
    });
    if (!res.ok) { const d = await res.json(); setCreateError(d.error ?? "Error"); setCreating(false); return; }
    setCreating(false);
    setShowCreate(false);
    setForm({ volunteer_name: "", volunteer_email: "", volunteer_phone: "", leadership_kid_id: "", member_ids: [] });
    if (token) await load(token, ratio);
  }

  async function deleteGroup(groupId: string) {
    if (!confirm("Delete this group? All contact history will be lost.")) return;
    await fetch(`/api/ministry/${type}/shepherd-groups/${groupId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, ...ch() } });
    if (token) await load(token, ratio);
  }

  function handleRatioChange(newRatio: number) {
    setRatio(newRatio);
    localStorage.setItem(`sw_shepherd_ratio_${type}`, String(newRatio));
    if (token) load(token, newRatio);
  }

  function toggleMember(id: string) {
    setForm(f => ({
      ...f,
      member_ids: f.member_ids.includes(id) ? f.member_ids.filter(m => m !== id) : [...f.member_ids, id],
    }));
  }

  const avgKids = totalVols > 0 ? (totalKids / totalVols).toFixed(1) : "—";
  const allContacts = groups.flatMap(g => [g.contacts_this_month.phone_call, g.contacts_this_month.two_on_one, g.contacts_this_month.letter]);
  const totalContacts = allContacts.reduce((s, v) => s + v, 0);
  const maxContacts = groups.reduce((s, g) => s + g.contacts_this_month.total * 3, 0);
  const contactRate = maxContacts > 0 ? Math.round((totalContacts / maxContacts) * 100) : 0;

  const neededVols = Math.max(0, recommended - totalVols);
  const staffingLabel = totalKids === 0 ? "Awaiting Enrollment" : !isUnderstaffed ? "✅ Fully Staffed" : neededVols <= 2 ? `⚠️ ${neededVols} Volunteer${neededVols > 1 ? "s" : ""} Needed` : `🚨 Understaffed — ${neededVols} Needed`;
  const staffingColor = totalKids === 0 ? "#6b7280" : !isUnderstaffed ? "#22c55e" : neededVols <= 2 ? "#f59e0b" : "#ef4444";

  if (!cfg || !SHEPHERD_TYPES.has(type)) return (
    <MinistryShell type={type}><div className="p-8 text-gray-500">Shepherd Groups are not available for this ministry type.</div></MinistryShell>
  );
  if (loading) return <MinistryShell type={type}><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type={type}>
      {/* Hero */}
      <div className="px-8 py-8" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <Link href={`/dashboard/ministry/${type}`} className="text-orange-200 text-xs mb-1 block hover:text-white">← {cfg.name}</Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Shepherd Groups</h1>
            <p className="text-orange-100 text-sm mt-1">{cfg.name} · {ratio}:1 ratio</p>
            <div className="flex items-center gap-2 mt-2">
              <label className="text-orange-200 text-xs">Children per Volunteer:</label>
              <input
                type="number"
                min={3}
                max={10}
                value={ratio}
                onChange={e => handleRatioChange(Math.min(10, Math.max(3, parseInt(e.target.value) || 5)))}
                className="w-14 px-2 py-1 rounded text-sm font-bold text-gray-800 bg-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: staffingColor }}>
              {staffingLabel}
            </span>
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white" style={{ color: ACCENT }}>
              + Create Group
            </button>
          </div>
        </div>
      </div>


      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {/* Understaffed banner */}
        {isUnderstaffed && (
          <div className="mb-6 rounded-2xl px-6 py-4 border" style={{ backgroundColor: "#fff7ed", borderColor: ACCENT + "44" }}>
            <p className="text-sm font-medium" style={{ color: "#9a3412" }}>
              ⚠️ You have {totalKids} kids but only {totalVols} volunteer group{totalVols !== 1 ? "s" : ""}. You need at least {recommended} volunteer{recommended !== 1 ? "s" : ""} to maintain a {ratio}:1 ratio.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Kids", value: totalKids, emoji: "🧒" },
            { label: "Total Groups", value: groups.length, emoji: "👥" },
            { label: "Avg per Group", value: avgKids, emoji: "⚖️" },
            { label: "Contact Rate", value: `${contactRate}%`, emoji: "📞" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl shadow-sm px-5 py-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: ACCENT + "22" }}>{s.emoji}</div>
              <div>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Groups grid */}
        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <div className="text-5xl mb-4">👥</div>
            <p className="text-gray-400">No shepherd groups yet. Create your first group to start the {ratio}:1 care model.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {groups.map(group => (
              <div key={group.id} className="bg-white rounded-2xl shadow overflow-hidden">
                {/* Card header */}
                <div className="px-5 pt-5 pb-4 border-b border-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[group.overall_status] }} />
                        <h3 className="font-bold text-gray-900 truncate" style={{ fontFamily: "Georgia, serif" }}>{group.volunteer_name}</h3>
                      </div>
                      {group.volunteer_email && <p className="text-xs text-gray-400 truncate">{group.volunteer_email}</p>}
                      {group.volunteer_phone && <p className="text-xs text-gray-400">{group.volunteer_phone}</p>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[group.overall_status] + "22", color: STATUS_COLORS[group.overall_status] }}>
                      {STATUS_LABELS[group.overall_status]}
                    </span>
                  </div>
                </div>

                {/* Members */}
                <div className="px-5 py-4">
                  {group.leadership_kid && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">👑</span>
                      <span className="text-sm font-semibold text-gray-900">{group.leadership_kid.first_name} {group.leadership_kid.last_name}</span>
                      <span className="text-xs text-gray-400 ml-1">Captain</span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {group.members.filter((m: GroupMember) => m.id !== group.leadership_kid?.id).map((m: GroupMember) => (
                      <p key={m.id} className="text-sm text-gray-600">· {m.first_name} {m.last_name}</p>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{group.member_count} / 5 members</p>
                </div>

                {/* Contact progress */}
                <div className="px-5 pb-4">
                  <div className="flex gap-4 text-sm">
                    <span>📞 <strong>{group.contacts_this_month.phone_call}</strong>/{group.contacts_this_month.total}</span>
                    <span>🤝 <strong>{group.contacts_this_month.two_on_one}</strong>/{group.contacts_this_month.total}</span>
                    <span>✉️ <strong>{group.contacts_this_month.letter}</strong>/{group.contacts_this_month.total}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 flex gap-2">
                  <Link href={`/dashboard/ministry/${type}/shepherd-groups/${group.id}`} className="flex-1 py-2 rounded-xl text-xs font-bold text-white text-center transition-opacity hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                    Manage
                  </Link>
                  <button onClick={() => deleteGroup(group.id)} className="px-3 py-2 rounded-xl text-xs font-medium border border-red-100 text-red-500 hover:bg-red-50 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Create Shepherd Group</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Volunteer Name *</label>
                <input value={form.volunteer_name} onChange={e => setForm(f => ({ ...f, volunteer_name: e.target.value }))} placeholder="Jane Smith" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={form.volunteer_email} onChange={e => setForm(f => ({ ...f, volunteer_email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input value={form.volunteer_phone} onChange={e => setForm(f => ({ ...f, volunteer_phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">👑 Captain (Leadership Kid)</label>
                <select value={form.leadership_kid_id} onChange={e => setForm(f => ({ ...f, leadership_kid_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">— No captain yet —</option>
                  {allMembers.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Members (max 5 total including captain)</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-100 rounded-xl p-3">
                  {allMembers.filter(m => m.id !== form.leadership_kid_id).map(m => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.member_ids.includes(m.id)} onChange={() => toggleMember(m.id)} className="rounded" />
                      <span className="text-sm text-gray-700">{m.first_name} {m.last_name}</span>
                    </label>
                  ))}
                  {allMembers.length === 0 && <p className="text-xs text-gray-400">No roster members. Add members to the roster first.</p>}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {[form.leadership_kid_id, ...form.member_ids].filter(Boolean).length} / 5 selected
                </p>
              </div>

              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={createGroup} disabled={creating} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>
                  {creating ? "Creating…" : "Create Group"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
