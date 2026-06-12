"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const ACCENT = "#F28C28";

const PLACEHOLDERS = [
  { key: "{parent_name}", desc: "Parent's full name" },
  { key: "{child_name}", desc: "Child's first name" },
  { key: "{child_age}", desc: "Child's age" },
  { key: "{visit_date}", desc: "Date of first visit" },
  { key: "{church_name}", desc: "Church name" },
  { key: "{pastor_name}", desc: "Pastor's name" },
];

export default function LetterTemplatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
      const res = await fetch("/api/children-ministry/letter-template", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSubject(d.template.subject ?? "");
        setBodyHtml(d.template.body_html ?? "");
      }
      setLoading(false);
    }
    init();
  }, [router]);

  async function save() {
    if (!token || !subject.trim() || !bodyHtml.trim()) { setError("Subject and body are required."); return; }
    setSaving(true); setError(""); setSaved(false);
    const res = await fetch("/api/children-ministry/letter-template", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject, body_html: bodyHtml }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else { const d = await res.json(); setError(d.error ?? "Save failed."); }
  }

  function copyPlaceholder(key: string) {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  if (loading) return (
    <MinistryShell type="childrens">
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Loading…</div>
      </div>
    </MinistryShell>
  );

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm font-medium mb-1">Children's Ministry · Settings</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Letter Template</h1>
        <p className="text-orange-100 text-sm mt-1">Customize the welcome letter sent to new families</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Placeholders reference */}
          <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
            <h2 className="font-bold text-gray-800 mb-1" style={{ fontFamily: "Georgia, serif" }}>Available Placeholders</h2>
            <p className="text-xs text-gray-400 mb-4">Click a placeholder to copy it, then paste into your template.</p>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map(p => (
                <button
                  key={p.key}
                  onClick={() => copyPlaceholder(p.key)}
                  title={p.desc}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono transition-colors"
                  style={{
                    borderColor: copiedKey === p.key ? ACCENT : "#e5e7eb",
                    backgroundColor: copiedKey === p.key ? ACCENT + "11" : "white",
                    color: copiedKey === p.key ? ACCENT : "#374151",
                  }}
                >
                  {copiedKey === p.key ? "✓ Copied" : p.key}
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Subject Line</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Welcome to Children's Ministry, {parent_name}!"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-300"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Letter Body (HTML)</label>
              <textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                rows={20}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:border-orange-300 resize-y"
                placeholder="<p>Dear {parent_name},</p>"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm font-semibold text-green-600">✅ Template saved!</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => router.push("/dashboard/children-ministry")}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: ACCENT, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </MinistryShell>
  );
}
