"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/layout/AppShell";

const supabase = createClient();
const DARK_GREEN = "#1A4A2E";

type Church = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  trial_ends_at: string | null;
  created_at: string;
};

type EffectiveStatus = "trial" | "expired_trial" | "active" | "suspended" | "none";
type SortKey = "default" | "name" | "trial_ending" | "days_left" | "created";

const STATUS_CONFIG: Record<EffectiveStatus, { label: string; bg: string; color: string }> = {
  trial:         { label: "Active Trial",  bg: "#dbeafe", color: "#1d4ed8" },
  expired_trial: { label: "Expired Trial", bg: "#fee2e2", color: "#dc2626" },
  active:        { label: "Paid / Active", bg: "#dcfce7", color: "#16a34a" },
  suspended:     { label: "Suspended",     bg: "#fee2e2", color: "#6b7280" },
  none:          { label: "Unknown",       bg: "#f9fafb", color: "#9ca3af" },
};

const TIER_MRR: Record<string, number> = {
  very_small: 97,
  small: 197,
  medium: 297,
  large: 497,
  enterprise: 997,
  paid: 197,
};

function getTierMRR(tier: string | null): number {
  if (!tier) return 197;
  return TIER_MRR[tier] ?? 197;
}

type Action = {
  key: string;
  label: string;
  destructive?: boolean;
  confirm?: boolean;
  href?: (churchId: string) => string;
  disabled?: boolean;
};

const ACTIONS: Action[] = [
  { key: "reset_trial_30",   label: "🔄 Reset Trial (30 days)" },
  { key: "extend_trial_7",   label: "⏩ Extend Trial +7 days" },
  { key: "extend_trial_30",  label: "⏩ Extend Trial +30 days" },
  { key: "mark_paid",        label: "✅ Mark Paid", confirm: true },
  { key: "suspend",          label: "🚫 Suspend", destructive: true, confirm: true },
  { key: "reactivate_trial", label: "↩️ Reactivate Trial" },
  { key: "open_dashboard",   label: "🏛️ Open Church Dashboard", href: (id) => `/dashboard?churchId=${id}` },
  { key: "login_as",         label: "🔑 Login as Church Admin", disabled: true },
];

const STATUS_FILTERS: { key: EffectiveStatus | "all"; label: string }[] = [
  { key: "all",          label: "All" },
  { key: "trial",        label: "Active Trial" },
  { key: "expired_trial",label: "Expired Trial" },
  { key: "active",       label: "Paid" },
  { key: "suspended",    label: "Suspended" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default",      label: "Default" },
  { key: "name",         label: "Church Name" },
  { key: "trial_ending", label: "Trial Ending Soon" },
  { key: "days_left",    label: "Days Left" },
  { key: "created",      label: "Created Date" },
];

function getEffectiveStatus(c: Church): EffectiveStatus {
  if (c.subscription_status === "active") return "active";
  if (c.subscription_status === "suspended") return "suspended";
  if (c.subscription_status === "trial") {
    if (!c.trial_ends_at) return "trial";
    return new Date(c.trial_ends_at) > new Date() ? "trial" : "expired_trial";
  }
  return "none";
}

function getDaysRemaining(c: Church): number | null {
  if (!c.trial_ends_at) return null;
  return Math.ceil((new Date(c.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function defaultSort(a: Church, b: Church): number {
  const sa = getEffectiveStatus(a);
  const sb = getEffectiveStatus(b);
  if (sa === "expired_trial" && sb !== "expired_trial") return -1;
  if (sb === "expired_trial" && sa !== "expired_trial") return 1;
  if (sa === "trial" && sb === "trial") {
    const da = getDaysRemaining(a) ?? Infinity;
    const db = getDaysRemaining(b) ?? Infinity;
    return da - db;
  }
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: EffectiveStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        padding: "3px 10px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: string;
  color: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        padding: "14px 18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const TH_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
  backgroundColor: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
};

const TD_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f4f6",
  fontSize: 13,
  verticalAlign: "middle",
};

export default function SubscriptionsPage() {
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EffectiveStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const [confirmSuspend, setConfirmSuspend] = useState<{ id: string; name: string } | null>(null);
  const [confirmMarkPaid, setConfirmMarkPaid] = useState<{ id: string; name: string } | null>(null);

  const [showAddChurch, setShowAddChurch] = useState(false);
  const [addForm, setAddForm] = useState({
    churchName: "", city: "", state: "", churchEmail: "", phone: "",
    ownerEmail: "", ownerPassword: "", subscriptionStatus: "trial" as "trial" | "active",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  async function load(t: string) {
    setPageError("");
    setAccessDenied(false);
    const res = await fetch("/api/master-admin/subscriptions", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.status === 403) {
      setAccessDenied(true);
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setPageError((d as { error?: string }).error ?? "Failed to load. Please try again.");
      return;
    }
    const d = await res.json();
    setChurches(d.churches ?? []);
  }

  useEffect(() => {
    async function init() {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (!user || authErr) {
        setPageError("Not authenticated.");
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setPageError("No session found.");
        setLoading(false);
        return;
      }
      const t = session.access_token;
      setToken(t);
      await load(t);
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doAction(churchId: string, action: string) {
    if (!token) return;
    setActionLoading(churchId);
    setActionError("");
    setOpenMenu(null);

    const res = await fetch("/api/master-admin/subscriptions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ churchId, action }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setActionError((d as { error?: string }).error ?? "Action failed. Please try again.");
    } else {
      const d = await res.json();
      setChurches((prev) =>
        prev.map((c) => (c.id === churchId ? (d as { church: Church }).church : c)),
      );
    }
    setActionLoading(null);
  }

  async function createChurch() {
    if (!token) return;
    if (!addForm.churchName.trim()) { setAddError("Church name is required."); return; }
    if (!addForm.ownerEmail.trim()) { setAddError("Owner email is required."); return; }
    if (addForm.ownerPassword.length < 8) { setAddError("Password must be at least 8 characters."); return; }

    setAddLoading(true);
    setAddError("");

    const res = await fetch("/api/master-admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(addForm),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAddError((d as { error?: string }).error ?? "Failed to create church.");
      setAddLoading(false);
      return;
    }

    const d = await res.json();
    setChurches((prev) => [d.church, ...prev]);
    setShowAddChurch(false);
    setAddForm({ churchName: "", city: "", state: "", churchEmail: "", phone: "", ownerEmail: "", ownerPassword: "", subscriptionStatus: "trial" });
    setAddError("");
    setAddLoading(false);
  }

  // Summary stats — computed over all churches regardless of filter
  const now = new Date();
  const activeTrialCount = churches.filter(
    (c) => c.subscription_status === "trial" && c.trial_ends_at && new Date(c.trial_ends_at) > now,
  ).length;
  const paidCount = churches.filter((c) => c.subscription_status === "active").length;
  const expiredCount = churches.filter(
    (c) =>
      c.subscription_status === "trial" &&
      (!c.trial_ends_at || new Date(c.trial_ends_at) <= now),
  ).length;
  const suspendedCount = churches.filter((c) => c.subscription_status === "suspended").length;
  const expiringIn7Count = churches.filter((c) => {
    const days = getDaysRemaining(c);
    return c.subscription_status === "trial" && days !== null && days >= 0 && days <= 7;
  }).length;
  const estimatedMRR = churches
    .filter((c) => c.subscription_status === "active")
    .reduce((sum, c) => sum + getTierMRR(c.subscription_tier), 0);

  // Filtered + sorted view
  const displayed = useMemo(() => {
    const filtered = churches.filter((c) => {
      if (statusFilter !== "all" && getEffectiveStatus(c) !== statusFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [c.name, c.city, c.state, c.email, c.phone, c.subscription_status, c.subscription_tier]
        .some((v) => v?.toLowerCase().includes(q));
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "trial_ending":
        case "days_left": {
          const da = getDaysRemaining(a) ?? Infinity;
          const db = getDaysRemaining(b) ?? Infinity;
          return da - db;
        }
        default:
          return defaultSort(a, b);
      }
    });
  }, [churches, search, statusFilter, sortKey]);

  // Access denied state
  if (!loading && accessDenied) {
    return (
      <AppShell navItems={[]}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 26,
              fontWeight: 700,
              color: "#111827",
              margin: "0 0 10px",
              textAlign: "center",
            }}
          >
            Access Denied
          </h1>
          <p className="text-gray-500 text-sm text-center max-w-sm">
            You do not have permission to view this page. This area is restricted to master
            administrators only.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell navItems={[]}>
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${DARK_GREEN} 0%, #2D6B42 100%)`,
          padding: "32px 40px",
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest mb-1.5"
          style={{ color: "#86efac" }}
        >
          Master Admin
        </p>
        <h1
          style={{
            color: "white",
            fontSize: 32,
            fontWeight: 700,
            fontFamily: "Georgia, serif",
            margin: "0 0 8px",
          }}
        >
          Subscription Management
        </h1>
        <p style={{ color: "#bbf7d0", fontSize: 14, margin: 0 }}>
          Manage subscriptions, trials, billing status, and church access across the Shepherd Well
          platform.
        </p>
      </div>

      <div className="min-h-screen bg-gray-50" style={{ padding: "28px 32px" }}>
        {/* Summary cards */}
        {!loading && !pageError && !accessDenied && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <SummaryCard label="Total Churches"    value={churches.length}  icon="🏛️" color="#374151" />
            <SummaryCard label="Active Trials"     value={activeTrialCount} icon="⏳" color="#1d4ed8" />
            <SummaryCard label="Expired Trials"    value={expiredCount}     icon="⚠️" color="#dc2626" />
            <SummaryCard label="Paid Churches"     value={paidCount}        icon="✅" color="#16a34a" />
            <SummaryCard label="Suspended"         value={suspendedCount}   icon="🚫" color="#9ca3af" />
            <SummaryCard label="Expiring ≤ 7 Days" value={expiringIn7Count} icon="🔔" color="#d97706" />
            <SummaryCard
              label="Est. MRR"
              value={"$" + estimatedMRR.toLocaleString()}
              icon="💰"
              color="#15803d"
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        )}

        {/* Page error */}
        {pageError && !loading && (
          <div
            className="rounded-xl border border-red-300 bg-red-50 text-red-700 font-medium"
            style={{ padding: "14px 20px" }}
          >
            {pageError}
          </div>
        )}

        {/* Action error (dismissible) */}
        {actionError && (
          <div
            className="rounded-xl flex items-center justify-between"
            style={{
              backgroundColor: "#fff7ed",
              border: "1px solid #fdba74",
              padding: "10px 16px",
              color: "#c2410c",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <span>{actionError}</span>
            <button
              onClick={() => setActionError("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#c2410c",
                fontWeight: 700,
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Search + Filter + Sort */}
        {!loading && !pageError && !accessDenied && (
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search church, city, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-800"
                style={{ padding: "10px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              />
              <button
                onClick={() => { setAddError(""); setShowAddChurch(true); }}
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  border: "none",
                  backgroundColor: DARK_GREEN,
                  color: "white",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                + Add Church
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter pills */}
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 9999,
                      fontSize: 12,
                      fontWeight: 600,
                      border: "1px solid",
                      cursor: "pointer",
                      transition: "all 0.1s",
                      borderColor: statusFilter === f.key ? DARK_GREEN : "#d1d5db",
                      backgroundColor: statusFilter === f.key ? DARK_GREEN : "white",
                      color: statusFilter === f.key ? "white" : "#6b7280",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort pills */}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500, whiteSpace: "nowrap" }}>
                  Sort:
                </span>
                <div className="flex flex-wrap gap-1">
                  {SORT_OPTIONS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSortKey(s.key)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 500,
                        border: "1px solid",
                        cursor: "pointer",
                        transition: "all 0.1s",
                        borderColor: sortKey === s.key ? DARK_GREEN : "#d1d5db",
                        backgroundColor: sortKey === s.key ? "#f0fdf4" : "white",
                        color: sortKey === s.key ? "#14532d" : "#6b7280",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && !pageError && !accessDenied && (
          <div
            className="bg-white rounded-2xl border border-gray-200"
            style={{ overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}
          >
            {openMenu && (
              <div
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
                onClick={() => setOpenMenu(null)}
              />
            )}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "Church",
                      "City / State",
                      "Email",
                      "Phone",
                      "Status",
                      "Tier",
                      "Trial Ends",
                      "Days Left",
                      "Health",
                      "Created",
                      "Actions",
                    ].map((h) => (
                      <th key={h} style={TH_STYLE}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {displayed.length === 0 && (
                    <tr>
                      <td
                        colSpan={11}
                        className="text-center text-gray-400"
                        style={{ ...TD_STYLE, padding: 48 }}
                      >
                        {churches.length === 0
                          ? "No churches found."
                          : "No churches match your search or filter."}
                      </td>
                    </tr>
                  )}

                  {displayed.map((church) => {
                    const status = getEffectiveStatus(church);
                    const days = getDaysRemaining(church);
                    const isActing = actionLoading === church.id;
                    const menuOpen = openMenu === church.id;

                    return (
                      <tr
                        key={church.id}
                        style={{
                          backgroundColor: isActing ? "#fafafa" : "white",
                          transition: "background-color 0.1s",
                        }}
                      >
                        {/* Church name */}
                        <td
                          style={{
                            ...TD_STYLE,
                            fontWeight: 700,
                            color: "#111827",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {church.name}
                        </td>

                        {/* City / State */}
                        <td style={{ ...TD_STYLE, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {[church.city, church.state].filter(Boolean).join(", ") || "—"}
                        </td>

                        {/* Email */}
                        <td style={{ ...TD_STYLE, color: "#6b7280" }}>
                          {church.email ? (
                            <a
                              href={`mailto:${church.email}`}
                              style={{ color: "#2563eb", textDecoration: "none" }}
                            >
                              {church.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Phone */}
                        <td style={{ ...TD_STYLE, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {church.phone || "—"}
                        </td>

                        {/* Status */}
                        <td style={TD_STYLE}>
                          <StatusBadge status={status} />
                        </td>

                        {/* Tier */}
                        <td style={{ ...TD_STYLE, color: "#6b7280" }}>
                          {church.subscription_tier || "—"}
                        </td>

                        {/* Trial ends */}
                        <td style={{ ...TD_STYLE, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {fmtDate(church.trial_ends_at)}
                        </td>

                        {/* Days remaining */}
                        <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>
                          {days === null ? (
                            <span style={{ color: "#9ca3af" }}>—</span>
                          ) : days === 0 ? (
                            <span style={{ color: "#f59e0b", fontWeight: 700 }}>0d</span>
                          ) : days < 0 ? (
                            <span style={{ color: "#dc2626", fontWeight: 700 }}>{days}d</span>
                          ) : (
                            <span
                              style={{
                                color: days <= 7 ? "#f59e0b" : "#16a34a",
                                fontWeight: 600,
                              }}
                            >
                              {days}d
                            </span>
                          )}
                        </td>

                        {/* Health */}
                        <td style={{ ...TD_STYLE, whiteSpace: "nowrap", color: "#9ca3af" }}>
                          ⚪ Unknown
                        </td>

                        {/* Created */}
                        <td style={{ ...TD_STYLE, color: "#9ca3af", whiteSpace: "nowrap" }}>
                          {fmtDate(church.created_at)}
                        </td>

                        {/* Actions */}
                        <td style={{ ...TD_STYLE, position: "relative" }}>
                          {isActing ? (
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>Working…</span>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button
                                onClick={() => {
                                  localStorage.setItem("selected_church_id", church.id);
                                  localStorage.setItem("selected_church_name", church.name);
                                  window.location.href = `/dashboard?churchId=${church.id}`;
                                }}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #1A4A2E",
                                  backgroundColor: "#1A4A2E",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "white",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                👁️ View Church
                              </button>

                            <div style={{ position: "relative" }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenu(menuOpen ? null : church.id);
                                }}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  backgroundColor: menuOpen ? "#f3f4f6" : "white",
                                  cursor: "pointer",
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: "#374151",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Actions ▾
                              </button>

                              {menuOpen && (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "calc(100% + 4px)",
                                    zIndex: 20,
                                    backgroundColor: "white",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 10,
                                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                    minWidth: 230,
                                    overflow: "hidden",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {ACTIONS.map((action, i) => (
                                    <div key={action.key}>
                                      {/* Divider before external actions */}
                                      {i === 6 && (
                                        <div
                                          style={{
                                            height: 1,
                                            backgroundColor: "#e5e7eb",
                                            margin: "2px 0",
                                          }}
                                        />
                                      )}

                                      {action.href ? (
                                        <a
                                          href={action.href(church.id)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={() => setOpenMenu(null)}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "10px 16px",
                                            fontSize: 13,
                                            color: "#374151",
                                            textDecoration: "none",
                                            backgroundColor: "white",
                                            boxSizing: "border-box",
                                            width: "100%",
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = "#f9fafb";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = "white";
                                          }}
                                        >
                                          {action.label}
                                        </a>
                                      ) : action.disabled ? (
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "10px 16px",
                                            fontSize: 13,
                                            color: "#d1d5db",
                                            cursor: "not-allowed",
                                          }}
                                        >
                                          {action.label}
                                          <span
                                            style={{
                                              marginLeft: "auto",
                                              fontSize: 10,
                                              backgroundColor: "#f3f4f6",
                                              color: "#9ca3af",
                                              padding: "1px 6px",
                                              borderRadius: 4,
                                              fontWeight: 600,
                                            }}
                                          >
                                            Soon
                                          </span>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setOpenMenu(null);
                                            if (action.key === "suspend") {
                                              setConfirmSuspend({
                                                id: church.id,
                                                name: church.name,
                                              });
                                            } else if (action.key === "mark_paid") {
                                              setConfirmMarkPaid({
                                                id: church.id,
                                                name: church.name,
                                              });
                                            } else {
                                              doAction(church.id, action.key);
                                            }
                                          }}
                                          style={{
                                            width: "100%",
                                            padding: "10px 16px",
                                            textAlign: "left",
                                            fontSize: 13,
                                            border: "none",
                                            backgroundColor: "white",
                                            cursor: "pointer",
                                            color: action.destructive ? "#dc2626" : "#374151",
                                            fontWeight: action.destructive ? 600 : 400,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = "#f9fafb";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = "white";
                                          }}
                                        >
                                          {action.label}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div
              className="flex items-center text-xs text-gray-400"
              style={{ padding: "10px 14px", borderTop: "1px solid #f3f4f6" }}
            >
              Showing{" "}
              <strong className="text-gray-600 mx-1">{displayed.length}</strong> of{" "}
              <strong className="text-gray-600 mx-1">{churches.length}</strong>{" "}
              {churches.length === 1 ? "church" : "churches"}
            </div>
          </div>
        )}
      </div>

      {/* Add Church Modal */}
      {showAddChurch && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 50, padding: 16 }}
          onClick={() => !addLoading && setShowAddChurch(false)}
        >
          <div
            className="bg-white rounded-2xl w-full"
            style={{ maxWidth: 520, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏛️</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
              Add New Church
            </h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
              Creates the church record, owner account, departments, and default check-in setup.
            </p>

            {addError && (
              <div style={{ backgroundColor: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 16 }}>
                {addError}
              </div>
            )}

            {/* Church info */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Church</p>

            <input
              placeholder="Church name *"
              value={addForm.churchName}
              onChange={(e) => setAddForm(f => ({ ...f, churchName: e.target.value }))}
              disabled={addLoading}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <input
                placeholder="City"
                value={addForm.city}
                onChange={(e) => setAddForm(f => ({ ...f, city: e.target.value }))}
                disabled={addLoading}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14 }}
              />
              <input
                placeholder="State"
                value={addForm.state}
                onChange={(e) => setAddForm(f => ({ ...f, state: e.target.value }))}
                disabled={addLoading}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <input
                placeholder="Church email"
                type="email"
                value={addForm.churchEmail}
                onChange={(e) => setAddForm(f => ({ ...f, churchEmail: e.target.value }))}
                disabled={addLoading}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14 }}
              />
              <input
                placeholder="Church phone"
                type="tel"
                value={addForm.phone}
                onChange={(e) => setAddForm(f => ({ ...f, phone: e.target.value }))}
                disabled={addLoading}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14 }}
              />
            </div>

            {/* Owner account */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Owner Account</p>

            <input
              placeholder="Owner email *"
              type="email"
              value={addForm.ownerEmail}
              onChange={(e) => setAddForm(f => ({ ...f, ownerEmail: e.target.value }))}
              disabled={addLoading}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }}
            />
            <input
              placeholder="Temporary password * (min 8 chars)"
              type="text"
              value={addForm.ownerPassword}
              onChange={(e) => setAddForm(f => ({ ...f, ownerPassword: e.target.value }))}
              disabled={addLoading}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, marginBottom: 20, boxSizing: "border-box", fontFamily: "monospace" }}
            />

            {/* Subscription */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Subscription</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
              {(["trial", "active"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAddForm(f => ({ ...f, subscriptionStatus: s }))}
                  disabled={addLoading}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 10,
                    border: "1px solid",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    borderColor: addForm.subscriptionStatus === s ? DARK_GREEN : "#d1d5db",
                    backgroundColor: addForm.subscriptionStatus === s ? "#f0fdf4" : "white",
                    color: addForm.subscriptionStatus === s ? "#14532d" : "#6b7280",
                  }}
                >
                  {s === "trial" ? "⏳ Trial (30 days)" : "✅ Paid / Active"}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddChurch(false)}
                disabled={addLoading}
                style={{ flex: 1, padding: 11, borderRadius: 12, border: "1px solid #e5e7eb", backgroundColor: "white", fontWeight: 500, fontSize: 14, color: "#374151", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={createChurch}
                disabled={addLoading}
                style={{ flex: 2, padding: 11, borderRadius: 12, border: "none", backgroundColor: DARK_GREEN, color: "white", fontWeight: 700, fontSize: 14, cursor: addLoading ? "not-allowed" : "pointer", opacity: addLoading ? 0.7 : 1 }}
              >
                {addLoading ? "Creating…" : "Create Church →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Confirmation Modal */}
      {confirmSuspend && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.50)", zIndex: 50, padding: 16 }}
          onClick={() => setConfirmSuspend(null)}
        >
          <div
            className="bg-white rounded-2xl w-full"
            style={{ maxWidth: 420, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>🚫</div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 20,
                fontWeight: 700,
                color: "#111827",
                margin: "0 0 10px",
              }}
            >
              Suspend Church?
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              This will suspend{" "}
              <strong className="text-gray-900">{confirmSuspend.name}</strong>. Their access will
              be restricted immediately. You can reactivate them at any time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSuspend(null)}
                className="flex-1 rounded-xl border border-gray-200 bg-white font-medium text-gray-700 cursor-pointer"
                style={{ padding: "11px", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  doAction(confirmSuspend.id, "suspend");
                  setConfirmSuspend(null);
                }}
                className="flex-1 rounded-xl border-none text-white font-bold cursor-pointer"
                style={{ padding: "11px", backgroundColor: "#dc2626", fontSize: 14 }}
              >
                Yes, Suspend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Confirmation Modal */}
      {confirmMarkPaid && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.50)", zIndex: 50, padding: 16 }}
          onClick={() => setConfirmMarkPaid(null)}
        >
          <div
            className="bg-white rounded-2xl w-full"
            style={{ maxWidth: 420, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 20,
                fontWeight: 700,
                color: "#111827",
                margin: "0 0 10px",
              }}
            >
              Mark as Paid?
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              This will mark{" "}
              <strong className="text-gray-900">{confirmMarkPaid.name}</strong> as a paid
              subscriber and set their status to{" "}
              <strong className="text-gray-900">Paid / Active</strong>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmMarkPaid(null)}
                className="flex-1 rounded-xl border border-gray-200 bg-white font-medium text-gray-700 cursor-pointer"
                style={{ padding: "11px", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  doAction(confirmMarkPaid.id, "mark_paid");
                  setConfirmMarkPaid(null);
                }}
                className="flex-1 rounded-xl border-none text-white font-bold cursor-pointer"
                style={{ padding: "11px", backgroundColor: "#16a34a", fontSize: 14 }}
              >
                Yes, Mark Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
