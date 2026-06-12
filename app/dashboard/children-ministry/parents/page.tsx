"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MinistryShell from "@/components/layout/MinistryShell";

const supabase = createClient();

const ACCENT = "#F28C28";

type Parent = {
  id: string;
  parent1_first_name: string;
  parent1_last_name: string;
  parent1_phone: string | null;
  parent1_email: string | null;
  visit_date: string;
  status: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: "#eff6ff", text: "#1d4ed8" },
  contacted: { bg: "#fef3c7", text: "#92400e" },
  returning: { bg: "#f3e8ff", text: "#6b21a8" },
  converted: { bg: "#f0fdf4", text: "#166534" },
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ParentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<Parent[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        console.log("Dashboard client user unavailable:", error?.message ?? null);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const selectedChurchId = localStorage.getItem("selected_church_id");
      console.log("[Parents] init: selectedChurchId from localStorage:", selectedChurchId ?? "(none — will use logged-in church)");
      const res = await fetch("/api/children-ministry/parents", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(selectedChurchId ? { "x-selected-church-id": selectedChurchId } : {}),
        },
      });
      console.log("[Parents] fetch x-selected-church-id sent:", selectedChurchId ?? "(not sent)");
      if (res.ok) { const d = await res.json(); setParents(d.parents ?? []); }
      setLoading(false);
    }
    init();
  }, [router]);

  const filtered = parents.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${p.parent1_first_name} ${p.parent1_last_name}`.toLowerCase();
    const phone = (p.parent1_phone ?? "").replace(/\D/g, "");
    return name.includes(q) || phone.includes(q.replace(/\D/g, "")) || (p.parent1_phone ?? "").includes(q);
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400">Loading…</div>
    </div>
  );

  return (
    <MinistryShell type="childrens">
      <div className="px-8 py-10" style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}>
        <p className="text-orange-100 text-sm font-medium mb-1">Children's Ministry</p>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>👨‍👩‍👧 Parents</h1>
        <p className="text-orange-100 text-sm mt-1">{parents.length} registered {parents.length === 1 ? "family" : "families"}</p>
      </div>

      <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            autoFocus
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-300"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center border border-gray-100">
            <div className="text-5xl mb-4">👨‍👩‍👧</div>
            <p className="text-gray-500 font-semibold">
              {search ? "No parents match your search." : "No parents registered yet."}
            </p>
            {search && (
              <p className="text-xs text-gray-400 mt-1">Parents appear here after their first kiosk check-in.</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filtered.map(p => {
                const sc = STATUS_COLORS[p.status] ?? { bg: "#f3f4f6", text: "#6b7280" };
                return (
                  <div key={p.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">
                        {p.parent1_first_name} {p.parent1_last_name}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-0.5">
                        {p.parent1_phone && (
                          <span className="text-xs text-gray-400">{p.parent1_phone}</span>
                        )}
                        {p.parent1_email && (
                          <span className="text-xs text-gray-400">{p.parent1_email}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-full capitalize"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                      >
                        {p.status}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{fmtDate(p.visit_date)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </MinistryShell>
  );
}
