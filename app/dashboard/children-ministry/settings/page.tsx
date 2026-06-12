"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();
const ACCENT = "#F28C28";

const ALL_GRADES = [
  { value: "Nursery",     label: "Nursery" },
  { value: "Toddlers",    label: "Toddlers" },
  { value: "Pre-K",       label: "Pre-K" },
  { value: "Kindergarten",label: "Kindergarten" },
  { value: "1st",         label: "1st Grade" },
  { value: "2nd",         label: "2nd Grade" },
  { value: "3rd",         label: "3rd Grade" },
  { value: "4th",         label: "4th Grade" },
  { value: "5th",         label: "5th Grade" },
  { value: "6th",         label: "6th Grade" },
];

const DEFAULT_GRADES = ["3rd", "4th", "5th", "6th"];

export default function ChildrenMinistrySettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sidebarLabel, setSidebarLabel] = useState("Children's Ministry");
  const [gradeLevels, setGradeLevels] = useState<string[]>(DEFAULT_GRADES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user || authError) {
        return;
      }
      const res = await apiFetch("/api/children-ministry/config", {
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json();
        if (d.config) {
         setSidebarLabel(d.config.sidebar_label ?? "Children's Ministry");
          setGradeLevels(d.config.grade_levels ?? DEFAULT_GRADES);
        }
      }
      setLoading(false);
    }
    init();
  }, [router]);

  function toggleGrade(value: string) {
    setGradeLevels((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value],
    );
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    const res = await apiFetch("/api/children-ministry/config", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sidebarLabel, gradeLevels }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "Failed to save");
    }
  }

  if (loading) {
    return (
      <MinistryShell type="childrens">
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-400">Loading…</div>
        </div>
      </MinistryShell>
    );
  }

  return (
    <MinistryShell type="childrens">
      {/* Hero */}
      <div
        className="px-8 py-10"
        style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}
      >
        <p className="text-orange-100 text-sm mb-1">Children&apos;s Ministry</p>
        <h1
          className="text-3xl font-bold text-white"
          style={{ fontFamily: "Georgia, serif" }}
        >
          ⚙️ Settings
        </h1>
        <p className="text-orange-100 text-sm mt-1">
          Configure how Children&apos;s Ministry appears in your dashboard
        </p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="max-w-xl">
          <div className="bg-white rounded-2xl shadow p-6 border border-gray-100">
            <h2
              className="text-lg font-bold text-gray-800 mb-6"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Ministry Configuration
            </h2>

            {/* Sidebar Label */}
            <div className="mb-7">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Sidebar Label
              </label>
              <input
                value={sidebarLabel}
                onChange={(e) => setSidebarLabel(e.target.value)}
                placeholder="e.g. Nursery–6th Grade"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                This label appears under Children&apos;s Ministry in the sidebar.
              </p>
            </div>

            {/* Grade Checkboxes */}
            <div className="mb-7">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                Grade Levels Covered
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_GRADES.map((g) => {
                  const checked = gradeLevels.includes(g.value);
                  return (
                    <label
                      key={g.value}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                        checked
                          ? "bg-orange-50 border-orange-300"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGrade(g.value)}
                        className="rounded accent-orange-500"
                      />
                      <span className="text-sm text-gray-700">{g.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: ACCENT, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">✓ Saved</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </MinistryShell>
  );
}
