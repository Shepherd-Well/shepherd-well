"use client";

import { use, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG } from "@/lib/ministry-config";

const supabase = createClient();

const ACCENT = "#F28C28";


type Member = {
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null;
  log_id: string | null;
  touch1_completed: boolean; touch1_date: string | null; touch1_note: string | null;
  touch2_completed: boolean; touch2_date: string | null; touch2_note: string | null;
  touch3_completed: boolean; touch3_date: string | null; touch3_note: string | null;
  status: 'complete' | 'partial' | 'none';
};

type Settings = { frequency: string; touch1_label: string; touch2_label: string; touch3_label: string };

type TouchModal = { member: Member; touch: 1 | 2 | 3 } | null;

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtVisitDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function calcAge(dob: string): number {
  const d = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    complete: "bg-green-100 text-green-700",
    partial: "bg-amber-100 text-amber-700",
    none: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = { complete: "✅ Complete", partial: "🟡 Partial", none: "⬜ Not Started" };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${styles[status] ?? styles.none}`}>{labels[status] ?? status}</span>;
}

export default function FollowUpPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const cfg = MINISTRY_CONFIG[type];

  const selectedChurchIdRef = useRef<string | null>(null);
  const ch = (): Record<string, string> => selectedChurchIdRef.current ? { "x-selected-church-id": selectedChurchIdRef.current } : {};

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings>({ frequency: 'monthly', touch1_label: 'Phone Call', touch2_label: 'Personal Letter', touch3_label: 'Personal Visit' });
  const [period, setPeriod] = useState<{ year: number; month: number; label: string }>({ year: 0, month: 0, label: "" });
  const [summary, setSummary] = useState({ total: 0, complete: 0, partial: 0, none: 0 });
  const [filter, setFilter] = useState<'all' | 'complete' | 'partial' | 'none'>('all');

  // Touch log modal
  const [touchModal, setTouchModal] = useState<TouchModal>(null);
  const [touchDate, setTouchDate] = useState(new Date().toISOString().slice(0, 10));
  const [touchNote, setTouchNote] = useState("");
  const [logging, setLogging] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Settings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");

  async function load(t: string) {
    const res = await fetch(`/api/ministry/${type}/followup`, { headers: { Authorization: `Bearer ${t}`, ...ch() } });
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
    setSettings(data.settings ?? settings);
    setSettingsForm(data.settings ?? settings);
    setPeriod(data.period ?? period);
    setSummary(data.summary ?? summary);
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
      await load(t);
      setLoading(false);
    }
    init();
  }, [type, router]);

  function openTouch(member: Member, touch: 1 | 2 | 3) {
    const existing = member[`touch${touch}_date` as keyof Member] as string | null;
    const existingNote = member[`touch${touch}_note` as keyof Member] as string | null;
    setTouchDate(existing ?? new Date().toISOString().slice(0, 10));
    setTouchNote(existingNote ?? "");
    setTouchModal({ member, touch });
  }

  async function logTouch() {
    if (!touchModal || !token) return;
    setLogging(true);
    const res = await fetch(`/api/ministry/${type}/followup/${touchModal.member.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...ch() },
      body: JSON.stringify({ touch: touchModal.touch, date: touchDate, note: touchNote }),
    });
    setLogging(false);
    if (res.ok) {
      setTouchModal(null);
      await load(token);
    }
  }

  async function saveSettings() {
    if (!token) return;
    setSavingSettings(true);
    await fetch(`/api/ministry/${type}/followup/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...ch() },
      body: JSON.stringify(settingsForm),
    });
    setSavingSettings(false);
    setShowSettings(false);
    await load(token);
  }

  async function sendReminders() {
    if (!token) return;
    setSending(true); setSendMsg("");
    const res = await fetch(`/api/ministry/${type}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...ch() },
      body: JSON.stringify({ action: "remind" }),
    });
    const data = await res.json();
    setSending(false);
    setSendMsg(res.ok ? `✅ Reminders sent to ${data.sent} admin(s)` : "Failed to send");
    setTimeout(() => setSendMsg(""), 4000);
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return members;
    return members.filter(m => m.status === filter);
  }, [members, filter]);

  const pct = summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0;

  function touchLabel(n: 1 | 2 | 3) {
    return settings[`touch${n}_label` as keyof Settings] as string;
  }

  function TouchCell({ member, touch }: { member: Member; touch: 1 | 2 | 3 }) {
    const done = member[`touch${touch}_completed` as keyof Member] as boolean;
    const date = member[`touch${touch}_date` as keyof Member] as string | null;
    return (
      <button onClick={() => openTouch(member, touch)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors w-full text-left">
        {done ? (
          <>
            <span className="text-green-500 text-base flex-shrink-0">✅</span>
            <span className="text-xs text-gray-500">{fmt(date)}</span>
          </>
        ) : (
          <span className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
        )}
      </button>
    );
  }

  if (type === 'childrens') return <ChildrensFollowUpPage type={type} />;
  if (!cfg) return <MinistryShell type={type}><div className="p-8 text-gray-500">Ministry not found.</div></MinistryShell>;
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div>;

  return (
    <MinistryShell type={type}>
      {/* Hero */}
      <div className="px-8 py-8" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <Link href={`/dashboard/ministry/${type}`} className="text-orange-200 text-xs mb-1 block hover:text-white">← {cfg.name}</Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Follow Up</h1>
            <p className="text-orange-100 text-sm mt-1">{period.label}</p>
          </div>
          <div className="flex items-center gap-2">
            {sendMsg && <p className="text-sm text-white font-medium">{sendMsg}</p>}
            <button onClick={sendReminders} disabled={sending} className="px-4 py-2 rounded-xl text-sm font-bold bg-white" style={{ color: ACCENT }}>
              {sending ? "Sending…" : "📧 Send Reminders"}
            </button>
            <button onClick={() => setShowSettings(true)} className="px-3 py-2 rounded-xl text-sm font-bold bg-white/20 text-white hover:bg-white/30">
              ⚙️
            </button>
          </div>
        </div>
      </div>


      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        {/* Stats bar */}
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex gap-6">
              {[
                { label: "Total", value: summary.total, color: "#6b7280" },
                { label: "Complete", value: summary.complete, color: "#22c55e" },
                { label: "Partial", value: summary.partial, color: "#f59e0b" },
                { label: "Not Started", value: summary.none, color: "#9ca3af" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-2xl font-black" style={{ color: ACCENT }}>{pct}%</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5">
          {(['all', 'complete', 'partial', 'none'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize" style={{ backgroundColor: filter === f ? ACCENT : "white", color: filter === f ? "white" : "#6b7280", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              {f === 'none' ? 'Not Started' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && <span className="ml-1.5 text-xs opacity-75">({f === 'complete' ? summary.complete : f === 'partial' ? summary.partial : summary.none})</span>}
            </button>
          ))}
        </div>

        {/* Member table */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400">{filter === 'all' ? 'No members on this roster yet.' : `No members in "${filter}" status.`}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">{touchLabel(1)}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">{touchLabel(2)}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">{touchLabel(3)}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(member => (
                  <tr key={member.id} className="border-b border-gray-50 hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                          {member.first_name[0]}{member.last_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.first_name} {member.last_name}</p>
                          {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><TouchCell member={member} touch={1} /></td>
                    <td className="px-4 py-3"><TouchCell member={member} touch={2} /></td>
                    <td className="px-4 py-3"><TouchCell member={member} touch={3} /></td>
                    <td className="px-4 py-3"><StatusBadge status={member.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/letters/ministry-followup/${member.id}?ministry_type=${type}`}
                        target="_blank"
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-200 transition-colors whitespace-nowrap"
                      >
                        🖨️ Print Letter
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Log Touch Modal */}
      {touchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setTouchModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>
                Log {touchLabel(touchModal.touch)}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{touchModal.member.first_name} {touchModal.member.last_name}</p>
            </div>
            <div className="p-6 space-y-4">
              {touchModal.member[`touch${touchModal.touch}_completed` as keyof Member] && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-green-700">Already logged on {fmt(touchModal.member[`touch${touchModal.touch}_date` as keyof Member] as string | null)} — you can update below.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                <input type="date" value={touchDate} onChange={e => setTouchDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea value={touchNote} onChange={e => setTouchNote(e.target.value)} rows={3} placeholder="How did it go? Any prayer requests?" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setTouchModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={logTouch} disabled={logging} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>
                  {logging ? "Saving…" : "✅ Mark Complete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>Follow Up Settings</h2>
              <p className="text-sm text-gray-500 mt-1">{cfg.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Frequency</label>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {(['monthly', 'bimonthly'] as const).map(f => (
                    <button key={f} onClick={() => setSettingsForm(s => ({ ...s, frequency: f }))} className="flex-1 py-2.5 text-sm font-bold transition-colors capitalize" style={{ backgroundColor: settingsForm.frequency === f ? ACCENT : "white", color: settingsForm.frequency === f ? "white" : "#374151" }}>
                      {f === 'bimonthly' ? 'Bi-Monthly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
              {([1, 2, 3] as const).map(n => (
                <div key={n}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Touch {n} Label</label>
                  <input
                    value={settingsForm[`touch${n}_label` as keyof Settings] as string}
                    onChange={e => setSettingsForm(s => ({ ...s, [`touch${n}_label`]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSettings(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={saveSettings} disabled={savingSettings} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>
                  {savingSettings ? "Saving…" : "Save Settings"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Children's Ministry Follow Up (separate, specialized implementation)
// ─────────────────────────────────────────────────────────────────────────────

function ChildrensFollowUpPage({ type }: { type: string }) {
  const router = useRouter();
  const selectedChurchIdRef = useRef<string | null>(null);
  const ch = (): Record<string, string> => selectedChurchIdRef.current ? { "x-selected-church-id": selectedChurchIdRef.current } : {};

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // All parent families — completed + pending together
  const [allParents, setAllParents] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [letterModal, setLetterModal] = useState<{ fam: any } | null>(null);
  const [letterSubject, setLetterSubject] = useState("");
  const [letterBody, setLetterBody] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailToast, setEmailToast] = useState("");
  const [followupMap, setFollowupMap] = useState<Record<string, any>>({});
  const [loggingTouch, setLoggingTouch] = useState<string | null>(null);

  // Active | Completed | All filter for the whole page
  const [viewFilter, setViewFilter] = useState<'active' | 'completed' | 'all'>('active');

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
      const headers = { Authorization: `Bearer ${t}`, ...ch() };
      const [parentsRes, familiesRes, followupRes] = await Promise.all([
        fetch('/api/children-ministry/parents', { headers }),
        fetch('/api/children-ministry/visitors', { headers }),
        fetch('/api/ministry/childrens/followup', { headers }),
      ]);
      if (parentsRes.ok) {
        const d = await parentsRes.json();
        setAllParents(d.parents ?? []);
      }
      if (familiesRes.ok) {
        const d = await familiesRes.json();
        setFamilies(d.families ?? []);
      }
      if (followupRes.ok) {
        const d = await followupRes.json();
        const map: Record<string, any> = {};
        for (const m of d.members ?? []) map[m.id] = m;
        setFollowupMap(map);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const pendingParents = allParents.filter((p: any) => !p.follow_up_sent);
  const completedParents = allParents.filter((p: any) => p.follow_up_sent);

  function isChildComplete(childId: string): boolean {
    const log = followupMap[childId] ?? {};
    return !!(log.touch1_completed) && !!(log.touch2_completed) && !!(log.touch3_completed);
  }

  type ChildEntry = { child: any; fam: any };
  const allChildEntries: ChildEntry[] = families.flatMap((fam: any) =>
    (fam.children ?? []).map((child: any) => ({ child, fam }))
  );
  const activeChildEntries = allChildEntries.filter(({ child }) => !isChildComplete(child.id));
  const completedChildEntries = allChildEntries.filter(({ child }) => isChildComplete(child.id));

  const visibleParents: any[] =
    viewFilter === 'active' ? pendingParents :
    viewFilter === 'completed' ? completedParents :
    allParents;

  const visibleChildEntries: ChildEntry[] =
    viewFilter === 'active' ? activeChildEntries :
    viewFilter === 'completed' ? completedChildEntries :
    allChildEntries;

  const activeCount = pendingParents.length + activeChildEntries.length;
  const completedCount = completedParents.length + completedChildEntries.length;
  const totalCount = allParents.length + allChildEntries.length;

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function openLetterModal(fam: any) {
    if (!token) return;
    setLetterModal({ fam });
    setLoadingTemplate(true);
    const res = await fetch('/api/children-ministry/letter-template', { headers: { Authorization: `Bearer ${token}` } });
    const d = res.ok ? await res.json() : { template: { subject: '', body_html: '' } };
    const tmpl = d.template;
    const familyWithChildren = families.find((f: any) => f.id === fam.id);
    const firstChild = familyWithChildren?.children?.[0];
    const parentName = `${fam.parent1_first_name ?? ''} ${fam.parent1_last_name ?? ''}`.trim();
    const childName = firstChild?.first_name ?? 'your child';
    const childAge = firstChild?.date_of_birth ? `${calcAge(firstChild.date_of_birth)}` : '';
    const visitDate = fam.visit_date ? fmtVisitDate(fam.visit_date) : '';
    const fill = (s: string) => s
      .replace(/{parent_name}/g, parentName)
      .replace(/{child_name}/g, childName)
      .replace(/{child_age}/g, childAge)
      .replace(/{visit_date}/g, visitDate)
      .replace(/{church_name}/g, 'our church')
      .replace(/{pastor_name}/g, 'Pastor');
    setLetterSubject(fill(tmpl.subject ?? ''));
    setLetterBody(fill(tmpl.body_html ?? ''));
    setLoadingTemplate(false);
  }

  function printLetter() {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Letter</title><style>body{font-family:Georgia,serif;max-width:680px;margin:48px auto;color:#1f2937;padding:0 32px}p{line-height:1.8;margin-bottom:16px}</style></head><body>${letterBody}</body></html>`);
    win.document.close();
    win.print();
  }

  async function sendEmail() {
    if (!token || !letterModal) return;
    setSendingEmail(true);
    const res = await fetch(`/api/children-ministry/parents/${letterModal.fam.id}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: letterSubject, body: letterBody, email: letterModal.fam.parent1_email }),
    });
    setSendingEmail(false);
    if (res.ok) {
      const sentEmail = letterModal.fam.parent1_email;
      const famId = letterModal.fam.id;
      setAllParents(ps => ps.map((p: any) => p.id === famId ? { ...p, follow_up_sent: true } : p));
      setLetterModal(null);
      setEmailToast(`Email sent to ${sentEmail}`);
      setTimeout(() => setEmailToast(""), 4000);
    }
  }

  function previewEmail() {
    if (!letterModal) return;
    const escaped = letterSubject.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped}</title></head><body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Georgia,serif;"><div style="max-width:600px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><div style="background:#1a3a5c;padding:36px 40px;text-align:center;"><p style="margin:0 0 8px;font-size:11px;color:#C8A951;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Children's Ministry</p><h1 style="margin:0;color:white;font-size:26px;font-weight:normal;letter-spacing:1px;">Your Church</h1><div style="width:40px;height:2px;background:#C8A951;margin:16px auto 0;"></div></div><div style="padding:40px 48px 36px;color:#1f2937;font-size:16px;line-height:1.85;">${letterBody}</div><div style="padding:24px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">This message was sent by Your Church Children's Ministry</p></div></div></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  async function markAsSent() {
    if (!token || !letterModal) return;
    setMarkingSent(true);
    await fetch(`/api/children-ministry/parents/${letterModal.fam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ follow_up_sent: true }),
    });
    setMarkingSent(false);
    const famId = letterModal.fam.id;
    setAllParents(ps => ps.map((p: any) => p.id === famId ? { ...p, follow_up_sent: true } : p));
    setLetterModal(null);
  }

  async function logTouch(childId: string, touch: 1 | 2 | 3) {
    if (!token) return;
    const key = `${childId}-${touch}`;
    setLoggingTouch(key);
    // Optimistic update
    setFollowupMap(m => ({
      ...m,
      [childId]: {
        ...m[childId],
        [`touch${touch}_completed`]: true,
        [`touch${touch}_date`]: new Date().toISOString().slice(0, 10),
      },
    }));
    await fetch(`/api/ministry/childrens/followup/${childId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...ch() },
      body: JSON.stringify({ touch, date: new Date().toISOString().slice(0, 10) }),
    });
    setLoggingTouch(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400">Loading…</div>
    </div>
  );

  return (
    <MinistryShell type={type}>
      {/* Header */}
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <Link href="/dashboard/children-ministry" className="text-orange-200 text-xs mb-1 block hover:text-white">
          ← Children&#39;s Ministry
        </Link>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Follow Up</h1>
        <p className="text-orange-100 text-sm mt-1">First visit letters &amp; shepherd touches</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen space-y-6">

        {/* ── Filter tabs ──────────────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap items-center">
          {([
            { key: 'active' as const,    label: 'Active Follow Up', count: activeCount },
            { key: 'completed' as const, label: 'Completed',        count: completedCount },
            { key: 'all' as const,       label: 'All',              count: totalCount },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setViewFilter(f.key)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
              style={{
                backgroundColor: viewFilter === f.key ? ACCENT : 'white',
                color: viewFilter === f.key ? 'white' : '#6b7280',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              {f.label}
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                style={{
                  backgroundColor: viewFilter === f.key ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                  color: viewFilter === f.key ? 'white' : '#6b7280',
                }}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── SECTION 1: Parent First Visit Follow Up ──────────────────────── */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 bg-amber-100 border-b border-amber-200 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-amber-900 text-lg" style={{ fontFamily: "Georgia, serif" }}>
                ✉️ Parent First Visit Follow Up
              </h2>
              <p className="text-xs text-amber-700 mt-0.5">Send a welcome letter to each new family</p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="bg-amber-200 text-amber-900 px-2.5 py-1 rounded-full">
                {pendingParents.length} pending
              </span>
              {completedParents.length > 0 && (
                <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                  {completedParents.length} sent
                </span>
              )}
            </div>
          </div>

          {visibleParents.length === 0 ? (
            <div className="px-6 py-10 text-center">
              {viewFilter === 'active' ? (
                <>
                  <div className="text-3xl mb-2">✅</div>
                  <p className="font-semibold text-amber-800">All first visit letters sent!</p>
                </>
              ) : (
                <p className="text-amber-700 text-sm">No letters in this category yet.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-amber-100">
              {visibleParents.map((fam: any) => {
                const isSent = fam.follow_up_sent;
                return (
                  <div
                    key={fam.id}
                    className="px-6 py-4 flex items-center justify-between gap-4"
                    style={{ backgroundColor: isSent ? '#f0fdf4' : undefined }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isSent && (
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-sm">
                          ✅
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">
                          {fam.parent1_first_name} {fam.parent1_last_name}
                          {isSent && (
                            <span className="ml-2 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              Letter Sent
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-0.5">
                          {fam.parent1_phone && <span className="text-xs text-gray-500">{fam.parent1_phone}</span>}
                          {fam.parent1_email && <span className="text-xs text-gray-500">{fam.parent1_email}</span>}
                          {fam.visit_date && <span className="text-xs text-gray-400">{fmtVisitDate(fam.visit_date)}</span>}
                        </div>
                      </div>
                    </div>
                    {isSent ? (
                      <button
                        onClick={() => openLetterModal(fam)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-green-200 text-green-700 hover:bg-green-50 flex-shrink-0 transition-colors"
                      >
                        📄 View / Resend
                      </button>
                    ) : (
                      <button
                        onClick={() => openLetterModal(fam)}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: ACCENT }}
                      >
                        📄 Personalize &amp; Send
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SECTION 2: Child Shepherd Follow Up ──────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>
              🧒 Child Shepherd Follow Up
            </h2>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                {activeChildEntries.length} active
              </span>
              {completedChildEntries.length > 0 && (
                <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                  {completedChildEntries.length} complete
                </span>
              )}
            </div>
          </div>

          {visibleChildEntries.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-12 text-center border border-gray-100">
              {viewFilter === 'active' && allChildEntries.length > 0 ? (
                <>
                  <div className="text-3xl mb-2">🎉</div>
                  <p className="font-semibold text-gray-700">All children have been fully followed up!</p>
                  <p className="text-sm text-gray-400 mt-1">Switch to &quot;Completed&quot; or &quot;All&quot; to view records.</p>
                </>
              ) : (
                <p className="text-gray-400">
                  {allChildEntries.length === 0
                    ? 'No children to follow up with yet.'
                    : 'No children in this category.'}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleChildEntries.map(({ child, fam }) => {
                const log = followupMap[child.id] ?? {};
                const t1 = !!(log.touch1_completed);
                const t2 = !!(log.touch2_completed);
                const t3 = !!(log.touch3_completed);
                const allDone = t1 && t2 && t3;
                const parentLabel = [fam.parent1_first_name, fam.parent1_last_name].filter(Boolean).join(' ');

                return (
                  <div
                    key={child.id ?? `${fam.id}-${child.first_name}`}
                    className="bg-white rounded-2xl shadow border p-5"
                    style={{
                      borderColor: allDone ? '#bbf7d0' : '#f3f4f6',
                      backgroundColor: allDone ? '#f0fdf4' : 'white',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-bold text-gray-900">{child.first_name} {child.last_name}</p>
                        {child.date_of_birth && (
                          <p className="text-xs text-gray-400">{calcAge(child.date_of_birth)} yrs old</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {parentLabel}{fam.parent1_phone ? ` · ${fam.parent1_phone}` : ""}
                        </p>
                      </div>
                      {allDone && (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700 flex-shrink-0 whitespace-nowrap">
                          ✅ Ready for Shepherd Group
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 mt-3 pt-3 border-t" style={{ borderColor: allDone ? '#bbf7d0' : '#f9fafb' }}>
                      {([
                        { n: 1 as const, label: "Phone Call" },
                        { n: 2 as const, label: "Send Welcome Card" },
                        { n: 3 as const, label: "In-Person Visit" },
                      ]).map(({ n, label }) => {
                        const done = !!(log[`touch${n}_completed`]);
                        const touchKey = `${child.id}-${n}`;
                        const saving = loggingTouch === touchKey;
                        return (
                          <button
                            key={n}
                            onClick={() => !done && child.id && logTouch(child.id, n)}
                            disabled={done || saving || !child.id}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left"
                            style={{
                              backgroundColor: done ? "#f0fdf4" : "#f9fafb",
                              cursor: done ? "default" : "pointer",
                            }}
                          >
                            <span
                              className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                              style={{
                                borderColor: done ? "#22c55e" : "#d1d5db",
                                backgroundColor: done ? "#22c55e" : "white",
                                color: "white",
                              }}
                            >
                              {done && "✓"}
                            </span>
                            <span className="text-sm" style={{ color: done ? "#166534" : "#374151" }}>
                              {saving ? "Saving…" : label}
                            </span>
                            {done && log[`touch${n}_date`] && (
                              <span className="ml-auto text-xs text-gray-400">{fmt(log[`touch${n}_date`])}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Email success toast */}
      {emailToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl z-50 whitespace-nowrap">
          ✅ {emailToast}
        </div>
      )}

      {/* Letter Personalize Modal */}
      {letterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setLetterModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>Welcome Letter</h2>
                <p className="text-xs text-gray-400 mt-0.5">{letterModal.fam.parent1_first_name} {letterModal.fam.parent1_last_name}</p>
              </div>
              <button onClick={() => setLetterModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {loadingTemplate ? (
              <div className="flex-1 flex items-center justify-center p-12">
                <div className="text-gray-400">Loading template…</div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Subject</label>
                  <input
                    value={letterSubject}
                    onChange={e => setLetterSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Letter Body</label>
                  <textarea
                    value={letterBody}
                    onChange={e => setLetterBody(e.target.value)}
                    rows={14}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono resize-none"
                  />
                </div>
              </div>
            )}
            <div className="p-6 border-t border-gray-100 flex flex-col gap-3">
              {!letterModal.fam.parent1_email && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ No email on file for this family. Please add an email to send this letter.
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setLetterModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                  Cancel
                </button>
                <button
                  onClick={previewEmail}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  👁️ Preview
                </button>
                <button
                  onClick={sendEmail}
                  disabled={sendingEmail || !letterModal.fam.parent1_email}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold border"
                  style={{ borderColor: ACCENT, color: ACCENT, opacity: sendingEmail || !letterModal.fam.parent1_email ? 0.4 : 1 }}
                >
                  {sendingEmail ? "Sending…" : "📧 Send Email"}
                </button>
                <button
                  onClick={markAsSent}
                  disabled={markingSent}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: ACCENT, opacity: markingSent ? 0.7 : 1 }}
                >
                  {markingSent ? "Saving…" : "✅ Send & Mark Sent"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
