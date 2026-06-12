"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG } from "@/lib/ministry-config";

const supabase = createClient();

const ACCENT = "#F28C28";


type ContactMember = {
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null;
  phone_call_done: boolean; phone_call_date: string | null; phone_call_note: string | null;
  two_on_one_done: boolean; two_on_one_date: string | null; two_on_one_note: string | null;
  letter_done: boolean; letter_date: string | null; letter_note: string | null;
  letter_generated_at: string | null;
};

type ContactModal = { member: ContactMember; type: 'phone_call' | 'two_on_one' | 'letter' } | null;

type RosterMember = { id: string; first_name: string; last_name: string };

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ShepherdGroupDetailPage({ params }: { params: Promise<{ type: string; groupId: string }> }) {
  const { type, groupId } = use(params);
  const router = useRouter();
  const cfg = MINISTRY_CONFIG[type];

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [group, setGroup] = useState<any>(null);
  const [contacts, setContacts] = useState<ContactMember[]>([]);
  const [summary, setSummary] = useState({ calls_done: 0, visits_done: 0, letters_done: 0, total: 0 });
  const [rosterMembers, setRosterMembers] = useState<RosterMember[]>([]);

  // Edit group volunteer
  const [editVol, setEditVol] = useState({ name: "", email: "", phone: "", leadership_kid_id: "" });
  const [savingVol, setSavingVol] = useState(false);

  // Add member
  const [addMemberId, setAddMemberId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [addError, setAddError] = useState("");

  // Contact modal
  const [contactModal, setContactModal] = useState<ContactModal>(null);
  const [contactDate, setContactDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactNote, setContactNote] = useState("");
  const [loggingContact, setLoggingContact] = useState(false);

  async function loadGroup(t: string) {
    const [groupRes, contactsRes] = await Promise.all([
      apiFetch(`/api/ministry/${type}/shepherd-groups`, { headers: { Authorization: `Bearer ${t}` } }),
      apiFetch(`/api/ministry/${type}/shepherd-groups/${groupId}/contacts`, { headers: { Authorization: `Bearer ${t}` } }),
    ]);
    const groupsData = await groupRes.json();
    const contactsData = await contactsRes.json();
    const found = (groupsData.groups ?? []).find((g: any) => g.id === groupId) ?? null;
    setGroup(found);
    if (found) setEditVol({ name: found.volunteer_name, email: found.volunteer_email ?? "", phone: found.volunteer_phone ?? "", leadership_kid_id: found.leadership_kid_id ?? "" });
    setContacts(contactsData.members ?? []);
    setSummary(contactsData.summary ?? { calls_done: 0, visits_done: 0, letters_done: 0, total: 0 });
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

      const [_, rosterRes] = await Promise.all([
        loadGroup(t),
        apiFetch(`/api/ministry/${type}/roster`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const rData = await rosterRes.json();
      setRosterMembers((rData.roster ?? []).map((r: any) => ({ id: r.member_id, first_name: r.member?.first_name ?? "?", last_name: r.member?.last_name ?? "?" })));
      setLoading(false);
    }
    init();
  }, [type, groupId, router]);

  async function saveVolunteer() {
    if (!token) return;
    setSavingVol(true);
    await apiFetch(`/api/ministry/${type}/shepherd-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ volunteer_name: editVol.name, volunteer_email: editVol.email, volunteer_phone: editVol.phone, leadership_kid_id: editVol.leadership_kid_id }),
    });
    setSavingVol(false);
    if (token) await loadGroup(token);
  }

  async function addMember() {
    if (!addMemberId || !token) return;
    setAddingMember(true); setAddError("");
    const res = await apiFetch(`/api/ministry/${type}/shepherd-groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ member_id: addMemberId }),
    });
    if (!res.ok) { const d = await res.json(); setAddError(d.error ?? "Error"); setAddingMember(false); return; }
    setAddingMember(false); setAddMemberId("");
    if (token) await loadGroup(token);
  }

  async function removeMember(memberId: string) {
    if (!token || !confirm("Remove from group?")) return;
    await apiFetch(`/api/ministry/${type}/shepherd-groups/${groupId}/members/${memberId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (token) await loadGroup(token);
  }

  function openContact(member: ContactMember, type: 'phone_call' | 'two_on_one' | 'letter') {
    const existing = member[`${type}_date` as keyof ContactMember] as string | null;
    const existingNote = member[`${type}_note` as keyof ContactMember] as string | null;
    setContactDate(existing ?? new Date().toISOString().slice(0, 10));
    setContactNote(existingNote ?? "");
    setContactModal({ member, type });
  }

  async function logContact() {
    if (!contactModal || !token) return;
    setLoggingContact(true);
    const res = await apiFetch(`/api/ministry/${type}/shepherd-groups/${groupId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ member_id: contactModal.member.id, contact_type: contactModal.type, date: contactDate, note: contactNote }),
    });
    setLoggingContact(false);
    if (res.ok) { setContactModal(null); if (token) await loadGroup(token); }
  }

  const contactTypeLabel: Record<string, string> = { phone_call: "📞 Phone Call", two_on_one: "🤝 Two-on-One", letter: "✉️ Letter" };

  function ContactCell({ member, contactType }: { member: ContactMember; contactType: 'phone_call' | 'two_on_one' | 'letter' }) {
    const done = member[`${contactType}_done` as keyof ContactMember] as boolean;
    const date = member[`${contactType}_date` as keyof ContactMember] as string | null;
    return (
      <button onClick={() => openContact(member, contactType)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 w-full text-left transition-colors">
        {done ? (
          <>
            <span className="text-green-500 text-base flex-shrink-0">✅</span>
            <span className="text-xs text-gray-400">{fmt(date)}</span>
          </>
        ) : <span className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />}
      </button>
    );
  }

  if (!cfg) return <MinistryShell type={type}><div className="p-8 text-gray-500">Ministry not found.</div></MinistryShell>;
  if (loading) return <MinistryShell type={type}><div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Loading…</div></div></MinistryShell>;
  if (!group) return <MinistryShell type={type}><div className="p-8 text-gray-500">Group not found.</div></MinistryShell>;

  const groupMemberIds = new Set((group.members ?? []).map((m: any) => m.id));
  const unassigned = rosterMembers.filter(m => !groupMemberIds.has(m.id));

  return (
    <MinistryShell type={type}>
      <div className="px-8 py-8" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <Link href={`/dashboard/ministry/${type}/shepherd-groups`} className="text-orange-200 text-xs mb-1 block hover:text-white">← Shepherd Groups</Link>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>{group.volunteer_name}'s Group</h1>
        <p className="text-orange-100 text-sm mt-1">{cfg.name} · {group.member_count}/5 members</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Volunteer info */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-4" style={{ fontFamily: "Georgia, serif" }}>Volunteer</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input value={editVol.name} onChange={e => setEditVol(v => ({ ...v, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={editVol.email} onChange={e => setEditVol(v => ({ ...v, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={editVol.phone} onChange={e => setEditVol(v => ({ ...v, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">👑 Captain</label>
                <select value={editVol.leadership_kid_id} onChange={e => setEditVol(v => ({ ...v, leadership_kid_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">— No captain —</option>
                  {(group.members ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <button onClick={saveVolunteer} disabled={savingVol} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>
                {savingVol ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {/* Members */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-4" style={{ fontFamily: "Georgia, serif" }}>Members ({group.member_count}/5)</h2>
            <div className="space-y-2 mb-4">
              {(group.members ?? []).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {m.id === group.leadership_kid_id && <span className="text-sm">👑</span>}
                    <span className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</span>
                  </div>
                  <button onClick={() => removeMember(m.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                </div>
              ))}
              {group.member_count === 0 && <p className="text-xs text-gray-400">No members yet.</p>}
            </div>
            {group.member_count < 5 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Add Member</label>
                <div className="flex gap-2">
                  <select value={addMemberId} onChange={e => setAddMemberId(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">— Select —</option>
                    {unassigned.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                  </select>
                  <button onClick={addMember} disabled={!addMemberId || addingMember} className="px-3 py-2 rounded-lg text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                    {addingMember ? "…" : "Add"}
                  </button>
                </div>
                {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
              </div>
            )}
          </div>

          {/* Monthly summary */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-gray-800 mb-4" style={{ fontFamily: "Georgia, serif" }}>This Month</h2>
            <div className="space-y-3">
              {[
                { label: "📞 Phone Calls", done: summary.calls_done },
                { label: "🤝 Two-on-Ones", done: summary.visits_done },
                { label: "✉️ Letters", done: summary.letters_done },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{s.label}</span>
                    <span className="font-bold text-gray-900">{s.done}/{summary.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: summary.total > 0 ? `${(s.done / summary.total) * 100}%` : '0%', backgroundColor: ACCENT }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contact checklist */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-800" style={{ fontFamily: "Georgia, serif" }}>Monthly Contact Checklist</h2>
            <div className="flex gap-2">
              {contacts.map(m => (
                <Link
                  key={m.id}
                  href={`/dashboard/letters/shepherd/${m.id}?ministry_type=${type}&group_id=${groupId}`}
                  target="_blank"
                  className="sr-only"
                />
              ))}
              <button
                onClick={() => contacts.forEach(m => window.open(`/dashboard/letters/shepherd/${m.id}?ministry_type=${type}&group_id=${groupId}`, '_blank'))}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-200 transition-colors"
              >
                🖨️ Print All Letters
              </button>
            </div>
          </div>
          {contacts.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No members in this group yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">📞 Call</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">🤝 Two-on-One</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">✉️ Letter</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contacts.map(member => (
                  <tr key={member.id} className="border-b border-gray-50 hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {member.id === group.leadership_kid_id && <span className="text-sm">👑</span>}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.first_name} {member.last_name}</p>
                          {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><ContactCell member={member} contactType="phone_call" /></td>
                    <td className="px-4 py-3"><ContactCell member={member} contactType="two_on_one" /></td>
                    <td className="px-4 py-3"><ContactCell member={member} contactType="letter" /></td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/letters/shepherd/${member.id}?ministry_type=${type}&group_id=${groupId}`}
                        target="_blank"
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-orange-200 transition-colors whitespace-nowrap"
                      >
                        🖨️ Letter
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Log Contact Modal */}
      {contactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setContactModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>
                {contactTypeLabel[contactModal.type]}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{contactModal.member.first_name} {contactModal.member.last_name}</p>
            </div>
            <div className="p-6 space-y-4">
              {contactModal.member[`${contactModal.type}_done` as keyof ContactMember] && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-green-700">Already logged on {fmt(contactModal.member[`${contactModal.type}_date` as keyof ContactMember] as string | null)} — update below.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                <input type="date" value={contactDate} onChange={e => setContactDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea value={contactNote} onChange={e => setContactNote(e.target.value)} rows={3} placeholder="How did it go?" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setContactModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={logContact} disabled={loggingContact} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}>
                  {loggingContact ? "Saving…" : "✅ Mark Done"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}
