"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();


const CM_ACCENT = "#F28C28";

type Season = { id: string; name: string; status: string };
type Team = { id: string; name: string; color: string };
type Child = { id: string; first_name: string; last_name: string };
type PointRecord = {
  id: string; points: number; category: string; note: string | null; created_at: string;
  team: { name: string; color: string } | null;
  child: { first_name: string; last_name: string } | null;
};

type AwardTarget = "team" | "child";

const QUICK_BUTTONS = [
  { label: "✝️ Attendance", category: "attendance", points: 1000, requiresChild: false },
  { label: "🔥 Streak (3 in a row)", category: "streak_bonus", points: 3000, requiresChild: false },
  { label: "📖 Memory Verse", category: "memory_verse", points: 2000, requiresChild: false },
  { label: "🤝 Bring a Friend", category: "friend_referral", points: 3000, requiresChild: false },
  { label: "🔄 Friend Returns", category: "friend_returns", points: 3000, requiresChild: true },
  { label: "🏆 Game Win", category: "game_win", points: 5000, requiresChild: false },
  { label: "🙋 Participation", category: "participation", points: 1000, requiresChild: false },
  { label: "😊 Behavior", category: "behavior", points: 1000, requiresChild: false },
  { label: "💛 Encouragement", category: "encouragement", points: 1000, requiresChild: false },
  { label: "💰 Fundraising", category: "fundraising", points: 3000, requiresChild: false },
  { label: "⭐ Other", category: "other", points: 1000, requiresChild: false },
];

const CATEGORY_LABELS: Record<string, string> = {
  attendance: "Attendance", memory_verse: "Memory Verse", friend_referral: "Bring a Friend",
  friend_returns: "Friend Returns", game_win: "Game Win", participation: "Participation",
  behavior: "Behavior", encouragement: "Encouragement", fundraising: "Fundraising",
  streak_bonus: "Streak Bonus", split_bonus: "Split Bonus", other: "Other",
};

export default function PointsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [history, setHistory] = useState<PointRecord[]>([]);

  const [target, setTarget] = useState<AwardTarget>("team");
  const [teamId, setTeamId] = useState("");
  const [childId, setChildId] = useState("");
  const [category, setCategory] = useState("game_win");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [awarding, setAwarding] = useState(false);
  const [awardError, setAwardError] = useState("");
  const [awardSuccess, setAwardSuccess] = useState("");

  async function loadHistory(t: string, sid: string) {
    const res = await apiFetch(`/api/children-ministry/points?season_id=${sid}&limit=50`, { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    setHistory(data.points ?? []);
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

      const [sRes, tRes, cRes] = await Promise.all([
        apiFetch("/api/children-ministry/seasons", { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch("/api/children-ministry/teams", { headers: { Authorization: `Bearer ${t}` } }),
        apiFetch("/api/children-ministry/children", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const sData = await sRes.json();
      const tData = await tRes.json();
      const cData = await cRes.json();
      const allSeasons: Season[] = sData.seasons ?? [];
      setSeasons(allSeasons);
      setTeams(tData.teams ?? []);
      setChildren(cData.children ?? []);
      const active = allSeasons.find(s => s.status === "active") ?? allSeasons[0] ?? null;
      setActiveSeason(active);
      if (active) {
        await loadHistory(t, active.id);
        // Pre-select first team
        if (tData.teams?.length) setTeamId(tData.teams[0].id);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  function applyQuick(btn: typeof QUICK_BUTTONS[0]) {
    setCategory(btn.category);
    setPoints(String(btn.points));
    if (btn.requiresChild) setTarget("child");
  }

  async function awardPoints() {
    if (!activeSeason) { setAwardError("No active season"); return; }
    if (!points || Number(points) <= 0) { setAwardError("Enter a point amount"); return; }
    if (category === "friend_returns" && !childId) { setAwardError("Select the child who brought the friend"); return; }
    if (target === "team" && !teamId) { setAwardError("Select a team"); return; }
    if (target === "child" && !childId) { setAwardError("Select a child"); return; }

    setAwarding(true); setAwardError(""); setAwardSuccess("");
    const res = await apiFetch("/api/children-ministry/points", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seasonId: activeSeason.id,
        teamId: target === "team" ? teamId : undefined,
        childId: target === "child" ? childId : undefined,
        category, points: Number(points), note,
      }),
    });
    if (!res.ok) { const d = await res.json(); setAwardError(d.error ?? "Error"); setAwarding(false); return; }
    setAwarding(false);
    setAwardSuccess(`+${Number(points).toLocaleString()} points awarded! 🎉`);
    setPoints(""); setNote("");
    setTimeout(() => setAwardSuccess(""), 3000);
    if (token && activeSeason) await loadHistory(token, activeSeason.id);
  }

  if (loading) return <MinistryShell type="childrens"><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${CM_ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Award Points</h1>
        {activeSeason && <p className="text-orange-100 text-sm mt-1">{activeSeason.name}</p>}
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Award form */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-5" style={{ fontFamily: "Georgia, serif" }}>Award Points</h2>

            {/* Target toggle */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-5">
              <button onClick={() => setTarget("team")} className="flex-1 py-2.5 text-sm font-bold transition-colors" style={{ backgroundColor: target === "team" ? CM_ACCENT : "white", color: target === "team" ? "white" : "#374151" }}>
                👥 Team
              </button>
              <button onClick={() => setTarget("child")} className="flex-1 py-2.5 text-sm font-bold transition-colors" style={{ backgroundColor: target === "child" ? CM_ACCENT : "white", color: target === "child" ? "white" : "#374151" }}>
                🧒 Individual
              </button>
            </div>

            {/* Team or child selector */}
            {target === "team" ? (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">Select Team</label>
                <div className="grid grid-cols-2 gap-2">
                  {teams.map(t => (
                    <button key={t.id} onClick={() => setTeamId(t.id)} className="px-3 py-2.5 rounded-xl text-sm font-bold text-white border-2 transition-all" style={{ backgroundColor: t.color, borderColor: teamId === t.id ? "#000" : "transparent" }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {category === "friend_returns" ? "Child who brought the friend *" : "Select Child"}
                </label>
                {category === "friend_returns" && (
                  <p className="text-xs text-orange-600 mb-1.5">🔄 Points go to the child who originally brought the friend.</p>
                )}
                <select value={childId} onChange={e => setChildId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">— Select a child —</option>
                  {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
            )}

            {/* Quick buttons */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">Quick Select</label>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_BUTTONS.map(btn => (
                  <button key={btn.label} onClick={() => applyQuick(btn)} className="px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-left hover:border-orange-300 transition-colors" style={{ backgroundColor: category === btn.category && String(btn.points) === points ? "#fff7ed" : "white" }}>
                    <span>{btn.label}</span>
                    <span className="float-right font-bold" style={{ color: CM_ACCENT }}>{btn.points.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Category + Points */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {Object.entries(CATEGORY_LABELS).filter(([k]) => !["streak_bonus","split_bonus","friend_returns"].includes(k)).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Points</label>
                <input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="1000" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Memory verse: John 3:16…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>

            {awardError && <p className="text-sm text-red-600 mb-3">{awardError}</p>}
            {awardSuccess && <p className="text-sm text-green-600 font-bold mb-3">{awardSuccess}</p>}

            <button onClick={awardPoints} disabled={awarding} className="w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity hover:opacity-90" style={{ backgroundColor: CM_ACCENT }}>
              {awarding ? "Awarding…" : `⭐ Award ${points ? Number(points).toLocaleString() + " pts" : "Points"}`}
            </button>
          </div>

          {/* History */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-5" style={{ fontFamily: "Georgia, serif" }}>Points History</h2>
            {history.length === 0 ? (
              <p className="text-gray-400 text-sm">No points awarded yet this season.</p>
            ) : (
              <div className="space-y-2">
                {history.map(p => (
                  <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    {p.team && <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.team.color }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {p.child ? `${p.child.first_name} ${p.child.last_name}` : p.team?.name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400">{CATEGORY_LABELS[p.category] ?? p.category}{p.note ? ` · ${p.note}` : ""}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black" style={{ color: CM_ACCENT }}>+{Number(p.points).toLocaleString()}</p>
                      <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MinistryShell>
  );
}
