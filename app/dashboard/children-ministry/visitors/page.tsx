"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const CM_ACCENT = "#F28C28";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://shepherd-well.vercel.app";


type Family = {
  id: string; parent1_first_name: string; parent1_last_name: string;
  parent1_email: string | null; parent1_phone: string | null;
  parent2_first_name: string | null; parent2_last_name: string | null;
  parent2_email: string | null; parent2_phone: string | null;
  how_did_you_hear: string | null; visit_date: string;
  follow_up_sent: boolean; next_day_sent: boolean;
  notes: string | null; status: string;
  children: any[];
};

type Token = { id: string; token: string; label: string; is_active: boolean };

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6", contacted: "#f59e0b", returning: "#8b5cf6", converted: "#22c55e",
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function calcAge(dob: string): number {
  const d = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}

export default function VisitorsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState<Family[]>([]);
  const [stats, setStats] = useState({ today: 0, this_week: 0, this_month: 0, converted: 0 });
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [showAddToken, setShowAddToken] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertMsg, setConvertMsg] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  async function load() {
    const [famRes, tokRes] = await Promise.all([
      apiFetch("/api/children-ministry/visitors", { credentials: "include" }),
      apiFetch("/api/children-ministry/visitor-tokens", { credentials: "include" }),
    ]);
    if (famRes.ok) { const d = await famRes.json(); setFamilies(d.families ?? []); setStats(d.stats ?? stats); }
    if (tokRes.ok) { const d = await tokRes.json(); setTokens(d.tokens ?? []); }
  }

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        console.log("Dashboard client user unavailable:", error?.message ?? null);
        return;
      }
      await load();
      setLoading(false);
    }
    init();
  }, [router]);

  async function generateQr(tok: Token) {
    if (qrDataUrls[tok.id]) return;
    const url = `${APP_URL}/kids-checkin/${tok.token}`;
    const { default: QRCode } = await import("qrcode");
    const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: "#1A4A2E", light: "#ffffff" } });
    setQrDataUrls(m => ({ ...m, [tok.id]: dataUrl }));
  }

  async function addToken() {
    if (!newTokenLabel.trim()) return;
    await apiFetch("/api/children-ministry/visitor-tokens", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newTokenLabel }),
    });
    setNewTokenLabel(""); setShowAddToken(false);
    await load();
  }

  async function updateStatus(familyId: string, status: string) {
    await apiFetch(`/api/children-ministry/visitors/${familyId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setFamilies(fs => fs.map(f => f.id === familyId ? { ...f, status } : f));
  }

  async function saveNotes(familyId: string) {
    setSavingNotes(familyId);
    await apiFetch(`/api/children-ministry/visitors/${familyId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes[familyId] ?? "" }),
    });
    setSavingNotes(null);
    setFamilies(fs => fs.map(f => f.id === familyId ? { ...f, notes: notes[familyId] ?? null } : f));
  }

  async function convertFamily(familyId: string) {
    setConverting(familyId);
    const res = await apiFetch(`/api/children-ministry/visitors/${familyId}/convert`, {
      method: "POST",
      credentials: "include",
    });
    const d = await res.json();
    setConverting(null);
    if (res.ok) {
      setConvertMsg(m => ({ ...m, [familyId]: `✅ ${d.children?.length ?? 0} children added to Children's Ministry` }));
      setFamilies(fs => fs.map(f => f.id === familyId ? { ...f, status: 'converted' } : f));
    } else {
      setConvertMsg(m => ({ ...m, [familyId]: `❌ ${d.error ?? "Error"}` }));
    }
  }

  const filtered = families.filter(f => filter === "all" || f.status === filter);

  if (loading) return <MinistryShell type="childrens"><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${CM_ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>🆕 First-Time Visitors</h1>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 -mt-6">
          {[
            { label: "Today", value: stats.today, emoji: "📅" },
            { label: "This Week", value: stats.this_week, emoji: "📆" },
            { label: "This Month", value: stats.this_month, emoji: "📊" },
            { label: "Converted", value: stats.converted, emoji: "✅" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl shadow-md px-5 py-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: CM_ACCENT + "22" }}>{s.emoji}</div>
              <div><p className="text-xl font-bold text-gray-900">{s.value}</p><p className="text-xs text-gray-400">{s.label}</p></div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {["all", "new", "contacted", "returning", "converted"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-4 py-2 rounded-xl text-xs font-bold transition-colors capitalize" style={{ backgroundColor: filter === f ? CM_ACCENT : "white", color: filter === f ? "white" : "#6b7280", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              {f === "all" ? `All (${families.length})` : f}
            </button>
          ))}
        </div>

        {/* Family list */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center mb-8">
            <div className="text-5xl mb-4">👨‍👩‍👧</div>
            <p className="text-gray-400">No visitor families {filter !== "all" ? `with status "${filter}"` : "yet"}.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-10">
            {filtered.map(fam => {
              const isOpen = expanded === fam.id;
              return (
                <div key={fam.id} className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-4 px-5 py-4" onClick={() => setExpanded(isOpen ? null : fam.id)} style={{ cursor: "pointer" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900">{fam.parent1_last_name} Family</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: STATUS_COLORS[fam.status] ?? "#9ca3af" }}>
                          {fam.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                        <span>📅 {fmtDate(fam.visit_date)}</span>
                        <span>👨‍👩‍👧 {fam.children.map((c: any) => c.first_name).join(", ") || "No children"}</span>
                        {fam.follow_up_sent && <span className="text-green-600">✅ Welcome email</span>}
                        {fam.next_day_sent && <span className="text-green-600">✅ Follow-up sent</span>}
                        {!fam.next_day_sent && <span className="text-gray-300">⬜ Follow-up pending</span>}
                      </div>
                    </div>
                    <span className="text-gray-300 text-lg">{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-gray-50 pt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        {/* Parent info */}
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Parent 1</p>
                          <p className="text-sm font-medium text-gray-900">{fam.parent1_first_name} {fam.parent1_last_name}</p>
                          {fam.parent1_phone && <p className="text-xs text-gray-500">{fam.parent1_phone}</p>}
                          {fam.parent1_email && <p className="text-xs text-gray-500">{fam.parent1_email}</p>}
                        </div>
                        {fam.parent2_first_name && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Parent 2</p>
                            <p className="text-sm font-medium text-gray-900">{fam.parent2_first_name} {fam.parent2_last_name}</p>
                            {fam.parent2_phone && <p className="text-xs text-gray-500">{fam.parent2_phone}</p>}
                            {fam.parent2_email && <p className="text-xs text-gray-500">{fam.parent2_email}</p>}
                          </div>
                        )}
                      </div>

                      {/* Children */}
                      {fam.children.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Children:</p>
                          <ul className="space-y-1 pl-1">
                            {fam.children.map((c: any, i: number) => (
                              <li key={c.id ?? i} className="text-sm text-gray-600 flex items-baseline gap-1.5">
                                <span className="text-gray-400 flex-shrink-0">•</span>
                                <span>
                                  {c.first_name} {c.last_name}
                                  {c.date_of_birth ? ` · ${calcAge(c.date_of_birth)} yrs old` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {fam.how_did_you_hear && <p className="text-xs text-gray-400 mb-4">Heard via: {fam.how_did_you_hear}</p>}

                      {/* Notes */}
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
                        <div className="flex gap-2">
                          <textarea
                            value={notes[fam.id] ?? (fam.notes ?? "")}
                            onChange={e => setNotes(n => ({ ...n, [fam.id]: e.target.value }))}
                            rows={2}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                          />
                          <button onClick={() => saveNotes(fam.id)} disabled={savingNotes === fam.id} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: CM_ACCENT }}>
                            {savingNotes === fam.id ? "…" : "Save"}
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <select value={fam.status} onChange={e => updateStatus(fam.id, e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium">
                          {["new", "contacted", "returning", "converted"].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                        {fam.status !== "converted" && (
                          <button onClick={() => convertFamily(fam.id)} disabled={converting === fam.id} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#22c55e" }}>
                            {converting === fam.id ? "Converting…" : "✅ Convert to Members"}
                          </button>
                        )}
                        {convertMsg[fam.id] && <span className="text-xs font-medium text-green-600">{convertMsg[fam.id]}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* QR Token Management */}
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-800 text-lg" style={{ fontFamily: "Georgia, serif" }}>Check-In Points</h2>
              <p className="text-xs text-gray-400 mt-0.5">QR codes for your welcome desk, entrance, or tablets</p>
            </div>
            <button onClick={() => setShowAddToken(true)} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>
              + Add Point
            </button>
          </div>

          {tokens.length === 0 ? (
            <p className="text-gray-400 text-sm">No check-in points yet. Create one to get your QR code.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tokens.map(tok => (
                <div key={tok.id} className="border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{tok.label}</p>
                      <p className="text-xs text-gray-400 font-mono truncate">{tok.token.slice(0, 12)}…</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${tok.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {tok.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {qrDataUrls[tok.id] ? (
                    <div className="text-center">
                      <img src={qrDataUrls[tok.id]} alt="QR" className="mx-auto rounded-xl mb-2" style={{ width: 140, height: 140 }} />
                      <div className="flex gap-2">
                        <a href={qrDataUrls[tok.id]} download={`${tok.label}.png`} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white text-center" style={{ backgroundColor: CM_ACCENT }}>⬇ Download</a>
                        <a href={`${APP_URL}/kids-checkin/${tok.token}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 text-center">Open ↗</a>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => generateQr(tok)} className="w-full py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-300 transition-colors">
                      Show QR Code
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddToken && (
            <div className="mt-4 flex gap-2 max-w-sm">
              <input value={newTokenLabel} onChange={e => setNewTokenLabel(e.target.value)} placeholder="e.g. Main Entrance QR" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <button onClick={addToken} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>Add</button>
              <button onClick={() => setShowAddToken(false)} className="px-3 py-2 rounded-lg text-xs border border-gray-200 text-gray-500">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </MinistryShell>
  );
}
