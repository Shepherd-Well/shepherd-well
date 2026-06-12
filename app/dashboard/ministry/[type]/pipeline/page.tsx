"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import MinistryShell from "@/components/layout/MinistryShell";
import { MINISTRY_CONFIG, STAGE_COLORS } from "@/lib/ministry-config";

const supabase = createClient();
const ACCENT = "#F28C28";

type PipelineMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  pipeline_stage: string | null;
  weeks_attending: number;
  last_contact_date: string | null;
};

type StageData = {
  id: string | null;
  stage_key: string;
  name: string;
  description: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
  is_default: boolean;
};

type MoveModal = { member: PipelineMember } | null;

const STAGE_ICONS: Record<string, string> = {
  Visitor: "🚪",
  Regular: "🎒",
  Engaged: "💚",
  "Growing in God's Word": "📖",
  "Faith Decision": "✝️",
  Baptism: "💧",
  "Discipleship Step": "👣",
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function stageIcon(stageName: string) {
  return STAGE_ICONS[stageName] ?? "•";
}

function stageColorAt(stage: StageData, idx: number): string {
  return stage.color ?? STAGE_COLORS[Math.min(idx, STAGE_COLORS.length - 1)];
}

function defaultsFromConfig(type: string): StageData[] {
  const cfg = MINISTRY_CONFIG[type];
  if (!cfg) return [];
  return (cfg.pipelineStages ?? cfg.stages ?? []).map((name, idx) => ({
    id: null,
    stage_key: name,
    name,
    description: cfg.stageDescriptions?.[name] ?? null,
    color: STAGE_COLORS[Math.min(idx, STAGE_COLORS.length - 1)],
    display_order: idx,
    is_active: true,
    is_default: true,
  }));
}

export default function PipelinePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const cfg = MINISTRY_CONFIG[type];

  const isYouth = type === "middle-school" || type === "high-school";
  const isYoungAdults = type === "young-adults";
  const isMens = type === "mens";
  const isWomens = type === "womens";
  const isSeniors = type === "seniors";

  const memberWord =
    isYouth ? "youth" :
    isYoungAdults ? "young adults" :
    isMens ? "men" :
    isWomens ? "women" :
    isSeniors ? "senior adults" :
    "children";

  const memberWordSingular =
    isYouth ? "youth" :
    isYoungAdults ? "young adult" :
    isMens ? "man" :
    isWomens ? "woman" :
    isSeniors ? "senior adult" :
    "child";

  // Gendered possessive pronoun for the About body copy
  const memberPossessive = isMens ? "his" : isWomens ? "her" : "their";

  const memberWordCapitalized = memberWord.charAt(0).toUpperCase() + memberWord.slice(1);

  const totalMetricLabel =
    isYouth ? "Total Youth" :
    isYoungAdults ? "Total Young Adults" :
    isMens ? "Total Men" :
    isWomens ? "Total Women" :
    isSeniors ? "Total Senior Adults" :
    "Total Children";

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<PipelineMember[]>([]);
  const [total, setTotal] = useState(0);
  const [moveModal, setMoveModal] = useState<MoveModal>(null);
  const [selectedStage, setSelectedStage] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moving, setMoving] = useState(false);

  // All stages (active + inactive) from API or config defaults
  const [stages, setStages] = useState<StageData[]>(() => defaultsFromConfig(type));

  // Customize modal
  const [customizing, setCustomizing] = useState(false);
  const [editStages, setEditStages] = useState<StageData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const activeStages = stages.filter((s) => s.is_active);

  async function loadStages(t: string) {
    try {
      const res = await apiFetch(`/api/ministry/${type}/pipeline/stages`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stages)) {
          setStages(data.stages);
          return;
        }
      }
    } catch {
      // fall through
    }
    setStages(defaultsFromConfig(type));
  }

  async function loadMembers(t: string) {
    const res = await apiFetch(`/api/ministry/${type}/pipeline`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
    setTotal(data.total ?? 0);
  }

  useEffect(() => {
    async function init() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const t = session.access_token;
      setToken(t);
      await Promise.all([loadStages(t), loadMembers(t)]);
      setLoading(false);
    }
    init();
  }, [type]);

  function openMove(member: PipelineMember) {
    setMoveModal({ member });
    setSelectedStage(member.pipeline_stage ?? activeStages[0]?.name ?? "");
    setMoveNote("");
  }

  async function moveStage() {
    if (!moveModal || !token || !selectedStage) return;
    setMoving(true);
    await apiFetch(`/api/ministry/${type}/pipeline/${moveModal.member.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pipeline_stage: selectedStage, note: moveNote }),
    });
    setMoving(false);
    setMoveModal(null);
    await loadMembers(token);
  }

  function openCustomize() {
    // Start with current stages; add any config defaults that are missing as inactive
    const allDefaults = defaultsFromConfig(type);
    const current = [...stages];
    for (const def of allDefaults) {
      if (!current.some((s) => s.stage_key === def.stage_key)) {
        current.push({ ...def, is_active: false });
      }
    }
    setEditStages(current.sort((a, b) => a.display_order - b.display_order));
    setSaveError("");
    setCustomizing(true);
  }

  function restoreDefaults() {
    setEditStages(defaultsFromConfig(type));
  }

  function addStep() {
    setEditStages((prev) => {
      const order = prev.length;
      return [
        ...prev,
        {
          id: null,
          stage_key: `new-step-${Date.now()}`,
          name: "New Step",
          description: "Describe this step",
          color: "#64748b",
          display_order: order,
          is_active: true,
          is_default: false,
        },
      ];
    });
  }

  function moveEditStage(idx: number, dir: -1 | 1) {
    setEditStages((prev) => {
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, display_order: i }));
    });
  }

  async function saveCustomization() {
    if (!token) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await apiFetch(`/api/ministry/${type}/pipeline/stages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stages: editStages.map((s, idx) => ({
            stage_key: s.stage_key,
            name: s.name,
            description: s.description,
            color: s.color,
            display_order: idx,
            is_active: s.is_active,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error ?? "Failed to save. Please try again.");
        setSaving(false);
        return;
      }
      await loadStages(token);
      setCustomizing(false);
    } catch {
      setSaveError("Network error. Please try again.");
    }
    setSaving(false);
  }

  if (!cfg) {
    return (
      <MinistryShell type={type}>
        <div className="p-8 text-gray-500">Ministry not found.</div>
      </MinistryShell>
    );
  }

  if (loading) {
    return (
      <MinistryShell type={type}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-400">Loading…</div>
        </div>
      </MinistryShell>
    );
  }

  // Build board columns
  const stageGroups: Record<string, PipelineMember[]> = {};
  for (const s of activeStages) stageGroups[s.name] = [];
  stageGroups.Unassigned = [];

  for (const member of members) {
    const matched = member.pipeline_stage
      ? activeStages.find((s) => s.name.toLowerCase() === member.pipeline_stage!.toLowerCase())
      : undefined;
    stageGroups[matched?.name ?? "Unassigned"].push(member);
  }

  const columns = activeStages.map((stage, idx) => ({
    stage,
    members: stageGroups[stage.name] ?? [],
    color: stageColorAt(stage, idx),
    icon: stageIcon(stage.name),
  }));

  const unassigned = stageGroups.Unassigned ?? [];

  function countStage(name: string) {
    return members.filter((m) => m.pipeline_stage?.toLowerCase() === name.toLowerCase()).length;
  }
  const faithDecisionCount = countStage("Faith Decision");
  const baptismCount = countStage("Baptism");
  const discipleshipCount = countStage("Discipleship Step");
  const activeCount = members.filter((m) => m.pipeline_stage).length;

  return (
    <MinistryShell type={type}>
      {/* ── Header ── */}
      <div
        className="px-8 py-8"
        style={{ background: `linear-gradient(135deg, #c2570a 0%, ${ACCENT} 100%)` }}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <Link
              href={`/dashboard/ministry/${type}`}
              className="text-orange-100 text-xs mb-1 block hover:text-white"
            >
              ← {cfg.name}
            </Link>
            <h1
              className="text-4xl font-bold text-white"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Shepherd Pipeline
            </h1>
            <p className="text-orange-100 text-sm mt-2">
              {`Helping every ${memberWordSingular} take their next step toward Christ.`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCustomize}
            className="hidden md:flex items-center gap-3 px-5 py-3 rounded-xl border border-white/30 bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-colors"
          >
            ⚙️ Customize Pipeline
          </button>
        </div>
      </div>

      <div
        className="p-6 space-y-5"
        style={{ backgroundColor: "#f9fafb", minHeight: "calc(100vh - 160px)" }}
      >
        {/* ── About + Metrics ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_2fr] gap-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  ℹ️
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">About the Pipeline</h2>
                  <p className="text-sm text-gray-500">
                    {`This is a guide, not a box. Every ${memberWordSingular}’s journey is unique.`}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-6">
                {type !== "childrens"
                  ? `The Shepherd Pipeline helps ministry leaders understand where each ${memberWordSingular} is spiritually, pray intentionally, and encourage ${memberPossessive} next step with wisdom and care.`
                  : "The Shepherd Pipeline helps ministry leaders see where children are spiritually, pray intentionally, and encourage their next step with care."}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Metric label={totalMetricLabel} value={total} icon="👥" />
              <Metric label="Active in Pipeline" value={activeCount} icon="🌱" />
              <Metric label="Faith Decisions" value={faithDecisionCount} icon="✝️" />
              <Metric label="Baptism" value={baptismCount} icon="💧" />
              <Metric label="Next Steps" value={discipleshipCount} icon="👣" />
            </div>
          </div>
        </div>

        {/* ── Pipeline Board ── */}
        <div className="overflow-x-auto">
          <div
            className="flex gap-4 pb-4"
            style={{
              minWidth: `${(columns.length + (unassigned.length > 0 ? 1 : 0)) * 245}px`,
            }}
          >
            {columns.map((column, idx) => (
              <div
                key={column.stage.stage_key}
                className="flex-shrink-0 rounded-2xl border bg-white shadow-sm overflow-hidden"
                style={{
                  width: "232px",
                  borderColor: `${column.color}33`,
                  background: `linear-gradient(180deg, ${column.color}0f 0%, #ffffff 42%)`,
                }}
              >
                <div className="p-4 text-center border-b border-gray-100">
                  <div
                    className="mx-auto -mt-1 mb-2 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black shadow-sm"
                    style={{ backgroundColor: column.color }}
                  >
                    {idx + 1}
                  </div>
                  <div className="text-4xl mb-2">{column.icon}</div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">
                    {column.stage.name}
                  </h3>
                  <p className="text-xs text-gray-600 mt-2 leading-5 min-h-[48px]">
                    {column.stage.description ?? ""}
                  </p>
                  <div className="text-sm font-bold mt-3" style={{ color: column.color }}>
                    {column.members.length}{" "}
                    {column.members.length === 1 ? memberWordSingular : memberWord}
                  </div>
                </div>
                <div className="p-3 space-y-3 max-h-[calc(100vh-430px)] overflow-y-auto">
                  {column.members.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 py-6 text-center">
                      <p className="text-xs text-gray-300">No {memberWord}</p>
                    </div>
                  ) : (
                    column.members.map((member) => (
                      <ChildPipelineCard
                        key={member.id}
                        member={member}
                        color={column.color}
                        onMove={() => openMove(member)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}

            {unassigned.length > 0 && (
              <div
                className="flex-shrink-0 rounded-2xl border bg-white shadow-sm overflow-hidden"
                style={{ width: "232px" }}
              >
                <div className="p-4 text-center border-b border-gray-100">
                  <div className="text-3xl mb-2">❔</div>
                  <h3 className="text-base font-black text-gray-500">Unassigned</h3>
                  <p className="text-xs text-gray-500 mt-2">
                    {`${memberWordCapitalized} who need a pipeline stage.`}
                  </p>
                  <div className="text-sm font-bold mt-3 text-gray-400">
                    {unassigned.length} {memberWord}
                  </div>
                </div>
                <div className="p-3 space-y-3 max-h-[calc(100vh-430px)] overflow-y-auto">
                  {unassigned.map((member) => (
                    <ChildPipelineCard
                      key={member.id}
                      member={member}
                      color="#9ca3af"
                      onMove={() => openMove(member)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Make It Your Own ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-blue-900 font-black flex items-center gap-2">
              🛠️ Make It Your Own
            </h3>
            <p className="text-sm text-blue-800 mt-1">
              {`Every church is unique. Customize stage names, descriptions, colors, and what moves a ${memberWordSingular} from one stage to the next.`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCustomize}
            className="px-5 py-3 bg-white border border-blue-200 rounded-xl text-sm font-bold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            Customize Pipeline
          </button>
        </div>
      </div>

      {/* ── Move Stage Modal ── */}
      {moveModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => setMoveModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100">
              <h2
                className="text-lg font-bold text-gray-900"
                style={{ fontFamily: "Georgia, serif" }}
              >
                Move {moveModal.member.first_name} {moveModal.member.last_name}
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Current: <strong>{moveModal.member.pipeline_stage ?? "Unassigned"}</strong>
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Select new stage
                </label>
                <div className="space-y-2">
                  {activeStages.map((stage, idx) => {
                    const color = stageColorAt(stage, idx);
                    const isSelected = selectedStage === stage.name;
                    return (
                      <button
                        key={stage.stage_key}
                        type="button"
                        onClick={() => setSelectedStage(stage.name)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all text-left"
                        style={{
                          borderColor: isSelected ? color : "#e5e7eb",
                          backgroundColor: isSelected ? color + "11" : "white",
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                          style={{ backgroundColor: color + "22" }}
                        >
                          {stageIcon(stage.name)}
                        </div>
                        <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                        {isSelected && (
                          <span className="ml-auto text-xs font-bold" style={{ color }}>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Note (optional)
                </label>
                <input
                  value={moveNote}
                  onChange={(e) => setMoveNote(e.target.value)}
                  placeholder="Reason for stage change…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={moveStage}
                  disabled={moving || !selectedStage}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {moving ? "Moving…" : "Move"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Customize Pipeline Modal ── */}
      {customizing && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => setCustomizing(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
              <div>
                <h2
                  className="text-lg font-bold text-gray-900"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  Customize Pipeline
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Edit stage names, descriptions, and colors. Drag the arrows to reorder.
                </p>
              </div>
              <button
                type="button"
                onClick={restoreDefaults}
                className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Restore Default Stages
              </button>
            </div>

            {/* Stage list */}
            <div className="overflow-y-auto flex-1 p-6 space-y-3">
              {editStages.map((stage, idx) => (
                <div
                  key={stage.stage_key}
                  className="rounded-xl border p-4 transition-opacity"
                  style={{
                    borderColor: stage.is_active ? "#e5e7eb" : "#f3f4f6",
                    opacity: stage.is_active ? 1 : 0.55,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => moveEditStage(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none px-1 py-0.5"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEditStage(idx, 1)}
                        disabled={idx === editStages.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none px-1 py-0.5"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Color swatch */}
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color ?? "#6b7280" }}
                    />

                    {/* Name */}
                    <input
                      type="text"
                      value={stage.name}
                      onChange={(e) =>
                        setEditStages((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s)),
                        )
                      }
                      placeholder="Stage name"
                      className="flex-1 text-sm font-bold text-gray-900 border-b border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent min-w-0"
                    />

                    {/* Color picker + Active toggle */}
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <input
                        type="color"
                        value={stage.color ?? "#6b7280"}
                        onChange={(e) =>
                          setEditStages((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, color: e.target.value } : s)),
                          )
                        }
                        className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5 bg-transparent"
                        title="Choose color"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={stage.is_active}
                          onChange={(e) =>
                            setEditStages((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, is_active: e.target.checked } : s,
                              ),
                            )
                          }
                          className="accent-orange-500"
                        />
                        Active
                      </label>
                    </div>
                  </div>

                  {/* Description */}
                  <input
                    type="text"
                    value={stage.description ?? ""}
                    onChange={(e) =>
                      setEditStages((prev) =>
                        prev.map((s, i) =>
                          i === idx ? { ...s, description: e.target.value } : s,
                        ),
                      )
                    }
                    placeholder="Short description (shown on board)…"
                    className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg px-3 py-2 focus:border-orange-300 focus:outline-none bg-gray-50"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={addStep}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
              >
                + Add Pipeline Step
              </button>
            </div>

            {saveError && (
              <p className="px-6 pb-2 text-sm text-red-500 text-center">{saveError}</p>
            )}

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setCustomizing(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustomization}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity"
                style={{ backgroundColor: ACCENT, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MinistryShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="text-2xl">{icon}</div>
      <div className="text-2xl font-black text-gray-900 mt-1">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function ChildPipelineCard({
  member,
  color,
  onMove,
}: {
  member: PipelineMember;
  color: string;
  onMove: () => void;
}) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm p-3 border border-gray-100 hover:shadow-md transition-all cursor-pointer group"
      onClick={onMove}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-gray-900 truncate">
            {member.first_name} {member.last_name}
          </p>
          <div className="mt-2 space-y-1">
            {member.weeks_attending > 0 && (
              <p className="text-xs text-gray-500">
                📅 Visits/Weeks: {member.weeks_attending}
              </p>
            )}
            {member.last_contact_date && (
              <p className="text-xs text-gray-500">
                Last touch: {fmtDate(member.last_contact_date)}
              </p>
            )}
          </div>
        </div>
        <span className="text-gray-300 group-hover:text-orange-400 transition-colors">⇄</span>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
        <Link
          href={`/dashboard/members/${member.id}/edit`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          View profile →
        </Link>
        <span className="text-xs text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
          Move
        </span>
      </div>
    </div>
  );
}
