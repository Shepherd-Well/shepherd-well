"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();


const CM_ACCENT = "#F28C28";

type Season = { id: string; name: string; status: string; reward_description: string | null };
type UpdateRecord = {
  id: string; session_date: string; memory_verse: string | null;
  lesson_summary: string | null; conversation_starter: string | null;
  special_notes: string | null; sent_at: string | null; created_at: string;
};

export default function ParentUpdatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [history, setHistory] = useState<UpdateRecord[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState({
    sessionDate: new Date().toISOString().slice(0, 10),
    memoryVerse: "",
    lessonSummary: "",
    conversationStarter: "",
    specialNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  async function loadHistory(t: string, sid: string) {
    const res = await apiFetch(`/api/children-ministry/parent-update?season_id=${sid}`, { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    setHistory(data.updates ?? []);
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
      const sRes = await apiFetch("/api/children-ministry/seasons", { headers: { Authorization: `Bearer ${t}` } });
      const sData = await sRes.json();
      const allSeasons: Season[] = sData.seasons ?? [];
      setSeasons(allSeasons);
      const active = allSeasons.find(s => s.status === "active") ?? allSeasons[0] ?? null;
      setActiveSeason(active);
      if (active) await loadHistory(t, active.id);
      setLoading(false);
    }
    init();
  }, [router]);

  function loadPastUpdate(u: UpdateRecord) {
    setForm({
      sessionDate: u.session_date,
      memoryVerse: u.memory_verse ?? "",
      lessonSummary: u.lesson_summary ?? "",
      conversationStarter: u.conversation_starter ?? "",
      specialNotes: u.special_notes ?? "",
    });
  }

  async function save(sendNow: boolean) {
    if (!activeSeason) { setSaveError("No active season"); return; }
    if (sendNow) { setSending(true); } else { setSaving(true); }
    setSaveError(""); setSendSuccess("");

    const res = await apiFetch("/api/children-ministry/parent-update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seasonId: activeSeason.id, ...form, sendNow }),
    });
    const data = await res.json();

    if (!res.ok) { setSaveError(data.error ?? "Error"); setSaving(false); setSending(false); return; }
    setSaving(false); setSending(false);

    if (sendNow) {
      setSendSuccess(`✅ Parent update sent to ${data.emailsSent} families!`);
      setTimeout(() => setSendSuccess(""), 5000);
    }
    if (token && activeSeason) await loadHistory(token, activeSeason.id);
  }

  if (loading) return <MinistryShell type="childrens"><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${CM_ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Weekly Parent Update</h1>
        {activeSeason && <p className="text-orange-100 text-sm mt-1">{activeSeason.name}</p>}
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-5" style={{ fontFamily: "Georgia, serif" }}>Compose Update</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session Date *</label>
                <input type="date" value={form.sessionDate} onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Memory Verse</label>
                <input value={form.memoryVerse} onChange={e => setForm(f => ({ ...f, memoryVerse: e.target.value }))} placeholder='e.g. "For God so loved the world…" — John 3:16' className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lesson Summary</label>
                <textarea value={form.lessonSummary} onChange={e => setForm(f => ({ ...f, lessonSummary: e.target.value }))} rows={4} placeholder="Today we learned about…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Conversation Starter for Parents</label>
                <input value={form.conversationStarter} onChange={e => setForm(f => ({ ...f, conversationStarter: e.target.value }))} placeholder="What was the most important thing you learned today?" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Parents will see: "Ask [child's name]: "…""</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Special Notes</label>
                <textarea value={form.specialNotes} onChange={e => setForm(f => ({ ...f, specialNotes: e.target.value }))} rows={3} placeholder="Upcoming events, reminders, announcements…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>

            {saveError && <p className="text-sm text-red-600 mt-4">{saveError}</p>}
            {sendSuccess && <p className="text-sm text-green-600 font-bold mt-4">{sendSuccess}</p>}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPreview(true)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">
                👁️ Preview Email
              </button>
              <button onClick={() => save(false)} disabled={saving} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">
                {saving ? "Saving…" : "💾 Save Draft"}
              </button>
              <button onClick={() => save(true)} disabled={sending} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: CM_ACCENT }}>
                {sending ? "Sending…" : "📧 Send to All Parents"}
              </button>
            </div>
          </div>

          {/* History sidebar */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-4" style={{ fontFamily: "Georgia, serif" }}>Past Updates</h2>
            {history.length === 0 ? (
              <p className="text-gray-400 text-sm">No updates sent yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(u => (
                  <button key={u.id} onClick={() => loadPastUpdate(u)} className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-orange-200 transition-colors">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-medium text-gray-800">
                        {new Date(u.session_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      {u.sent_at ? (
                        <span className="text-xs px-2 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: "#22c55e" }}>Sent</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">Draft</span>
                      )}
                    </div>
                    {u.memory_verse && <p className="text-xs text-gray-400 truncate">"{u.memory_verse}"</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Email Preview</h2>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              {/* Email preview */}
              <div style={{ fontFamily: "Georgia, serif" }}>
                <div style={{ background: CM_ACCENT, padding: "24px 28px", borderRadius: "8px 8px 0 0" }}>
                  <h1 style={{ color: "white", margin: 0, fontSize: "20px", fontWeight: "normal" }}>Your Church</h1>
                  <p style={{ color: "rgba(255,255,255,0.9)", margin: "4px 0 0", fontSize: "14px" }}>
                    This Week in Children's Ministry · {form.sessionDate ? new Date(form.sessionDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}
                  </p>
                </div>
                <div style={{ background: "white", padding: "28px", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  <div style={{ background: "#fff7ed", borderLeft: `4px solid ${CM_ACCENT}`, padding: "14px 18px", borderRadius: "0 8px 8px 0", marginBottom: "20px" }}>
                    <p style={{ margin: 0, fontSize: "15px", color: "#374151" }}>Team <strong style={{ color: CM_ACCENT }}>Eagles</strong> · <strong>1st place</strong> · <strong>45,000 pts</strong></p>
                  </div>
                  {form.memoryVerse && (
                    <div style={{ marginBottom: "20px" }}>
                      <h3 style={{ color: "#1A4A2E", fontSize: "15px", margin: "0 0 8px" }}>📖 Memory Verse This Week</h3>
                      <p style={{ fontSize: "15px", fontStyle: "italic", color: "#374151", margin: 0 }}>"{form.memoryVerse}"</p>
                    </div>
                  )}
                  {form.lessonSummary && (
                    <div style={{ marginBottom: "20px" }}>
                      <h3 style={{ color: "#1A4A2E", fontSize: "15px", margin: "0 0 8px" }}>✝️ This Week's Lesson</h3>
                      <p style={{ fontSize: "15px", color: "#374151", lineHeight: "1.7", margin: 0 }}>{form.lessonSummary}</p>
                    </div>
                  )}
                  {form.conversationStarter && (
                    <div style={{ marginBottom: "20px", background: "#f8fafc", borderRadius: "8px", padding: "14px 18px" }}>
                      <h3 style={{ color: "#1A4A2E", fontSize: "15px", margin: "0 0 8px" }}>💬 Conversation Starter</h3>
                      <p style={{ fontSize: "15px", color: "#374151", fontStyle: "italic", margin: 0 }}>Ask [child's name]: "{form.conversationStarter}"</p>
                    </div>
                  )}
                  {activeSeason?.reward_description && (
                    <div style={{ background: "#fef3c7", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px" }}>
                      <p style={{ margin: 0, fontSize: "14px", color: "#92400e" }}>🎉 Working toward: <strong>{activeSeason.reward_description}</strong></p>
                    </div>
                  )}
                  {form.specialNotes && (
                    <div>
                      <h3 style={{ color: "#1A4A2E", fontSize: "15px", margin: "0 0 8px" }}>📢 Special Notes</h3>
                      <p style={{ fontSize: "15px", color: "#374151", lineHeight: "1.7", margin: 0 }}>{form.specialNotes}</p>
                    </div>
                  )}
                  <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "20px 0" }} />
                  <p style={{ fontSize: "12px", color: "#9ca3af", textAlign: "center", margin: 0 }}>Each email is personalized with the child's name, team standing, points, and streak.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
