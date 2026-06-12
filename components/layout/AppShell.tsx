"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MASTER_ADMIN_EMAIL = "jim@gratefulconsultinggroup.com";
const supabase = createClient();

// Kept for backward compat — pages still pass navItems but the sidebar
// now uses the hardcoded 5-category structure defined below.
export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  isSection?: boolean;
}

interface AppShellProps {
  navItems: NavItem[];
  children: React.ReactNode;
}

type Category = {
  key: string;
  label: string;
  items: { label: string; href: string }[];
};

// ── Youth & Children sub-group item lists ────────────────────────────────────
const CM_ITEMS = [
  { label: "📋 Overview",           href: "/dashboard/children-ministry" },
  { label: "👥 Members & Visitors", href: "/dashboard/ministry/childrens/roster" },
  { label: "✅ Attendance",          href: "/dashboard/ministry/childrens/attendance" },
  { label: "🔄 Follow Up",          href: "/dashboard/ministry/childrens/followup" },
  { label: "📊 Shepherd Pipeline",  href: "/dashboard/ministry/childrens/pipeline" },
  { label: "📢 Communication",      href: "/dashboard/ministry/childrens/communication" },
  { label: "🎂 Birthdays",          href: "/dashboard/ministry/childrens/birthdays" },
  { label: "🙏 Prayer",             href: "/dashboard/ministry/childrens/prayer" },
  { label: "👫 Shepherd Groups",    href: "/dashboard/ministry/childrens/shepherd-groups" },
  { label: "🏆 Growth Challenge",   href: "/dashboard/ministry/childrens/growth-challenge" },
  { label: "🦋 Metamorphosis",      href: "/dashboard/ministry/childrens/metamorphosis" },
  { label: "⚙️ Settings",           href: "/dashboard/children-ministry/settings" },
];
const MS_ITEMS = [
  { label: "📋 Overview",           href: "/dashboard/ministry/middle-school" },
  { label: "👥 Members & Visitors", href: "/dashboard/middle-school-ministry/roster" },
  { label: "✅ Attendance",          href: "/dashboard/middle-school-ministry/attendance" },
  { label: "🔄 Follow Up",          href: "/dashboard/middle-school-ministry/followup" },
  { label: "📊 Shepherd Pipeline",  href: "/dashboard/ministry/middle-school/pipeline" },
  { label: "📢 Communication",      href: "/dashboard/ministry/middle-school/communication" },
  { label: "🎂 Birthdays",          href: "/dashboard/ministry/middle-school/birthdays" },
  { label: "🙏 Prayer",             href: "/dashboard/ministry/middle-school/prayer" },
  { label: "👤 Students",           href: "/dashboard/middle-school-ministry/students" },
  { label: "👪 Parents",            href: "/dashboard/middle-school-ministry/parents" },
  { label: "📋 Permission Forms",   href: "/dashboard/middle-school-ministry/permissions" },
  { label: "🏫 Check-In Setup",     href: "/dashboard/middle-school-ministry/checkin-setup" },
  { label: "⚡ Live Check-In",       href: "/dashboard/middle-school-ministry/live-checkin" },
  { label: "📊 Attendance Reports", href: "/dashboard/middle-school-ministry/attendance-report" },
];
const SH_ITEMS = [
  { label: "📋 Overview",           href: "/dashboard/ministry/high-school" },
  { label: "👥 Members & Visitors", href: "/dashboard/high-school-ministry/roster" },
  { label: "✅ Attendance",          href: "/dashboard/high-school-ministry/attendance" },
  { label: "🔄 Follow Up",          href: "/dashboard/high-school-ministry/followup" },
  { label: "📊 Shepherd Pipeline",  href: "/dashboard/ministry/high-school/pipeline" },
  { label: "📢 Communication",      href: "/dashboard/ministry/high-school/communication" },
  { label: "🎂 Birthdays",          href: "/dashboard/ministry/high-school/birthdays" },
  { label: "🙏 Prayer",             href: "/dashboard/ministry/high-school/prayer" },
  { label: "👤 Students",           href: "/dashboard/high-school-ministry/students" },
  { label: "👪 Parents",            href: "/dashboard/high-school-ministry/parents" },
  { label: "📋 Permission Forms",   href: "/dashboard/high-school-ministry/permissions" },
  { label: "🏫 Check-In Setup",     href: "/dashboard/high-school-ministry/checkin-setup" },
  { label: "⚡ Live Check-In",       href: "/dashboard/high-school-ministry/live-checkin" },
  { label: "📊 Attendance Reports", href: "/dashboard/high-school-ministry/attendance-report" },
];
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    key: "administration",
    label: "Administration",
    items: [
      { label: "👥 Members",           href: "/dashboard/members" },
      { label: "🏛️ Departments",       href: "/dashboard/departments" },
      { label: "👋 Visitors",          href: "/dashboard/visitors" },
      { label: "📅 Calendar",          href: "/dashboard/calendar" },
      { label: "✅ Attendance",         href: "/dashboard/attendance" },
      { label: "📰 Bulletin",          href: "/dashboard/bulletin" },
      { label: "📢 Communication Hub", href: "/dashboard/communication" },
    ],
  },
  {
    key: "pastoral",
    label: "Pastoral Ministry",
    items: [
      { label: "🚗 Visitation",                href: "/dashboard/visitation" },
      { label: "🎂 Birthdays & Anniversaries", href: "/dashboard/birthdays" },
      { label: "🐑 Shepherd Pipeline",         href: "/dashboard/shepherd" },
      { label: "🙏 Prayer",                    href: "/dashboard/prayer" },
    ],
  },
  {
    key: "church",
    label: "Church Ministry",
    items: [
      { label: "🎩 Ushers",           href: "/dashboard/ministry/ushers" },
      { label: "🎭 Drama",            href: "/dashboard/ministry/drama" },
      { label: "🎵 Music/Choir",      href: "/dashboard/ministry/music-choir" },
      { label: "✝️ Evangelism",       href: "/dashboard/evangelism" },
      { label: "📖 Bible Study Pods", href: "/dashboard/bible-study-pods" },
    ],
  },
  {
    key: "adult",
    label: "Adult Ministry",
    items: [
      { label: "🎉 Young Adults",    href: "/dashboard/ministry/young-adults" },
      { label: "👔 Men's Ministry",  href: "/dashboard/ministry/mens" },
      { label: "👗 Women's Ministry",href: "/dashboard/ministry/womens" },
      { label: "🌟 Senior Ministry", href: "/dashboard/ministry/seniors" },
    ],
  },
  {
    key: "youth",
    label: "Youth & Children",
    // Items here are used only for hasActive detection on the collapsed category header.
    // The actual rendered items come from CM_ITEMS / MS_ITEMS / SH_ITEMS.
    items: [
      { label: "", href: "/dashboard/children-ministry" },
      { label: "", href: "/dashboard/ministry/childrens" },
      { label: "", href: "/dashboard/ministry/middle-school" },
      { label: "", href: "/dashboard/ministry/high-school" },
      { label: "", href: "/dashboard/youth-ministry" },
      { label: "", href: "/dashboard/middle-school-ministry" },
      { label: "", href: "/dashboard/high-school-ministry" },
      { label: "", href: "/middle-school-kiosk" },
      { label: "", href: "/high-school-kiosk" },
    ],
  },
];

const STORAGE_KEY = "sw_sidebar_v2";

function loadCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveCollapsed(state: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch {}
}

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function readSelectedChurchFromStorage() {
  if (typeof window === "undefined") {
    return { id: null as string | null, name: null as string | null };
  }

  try {
    const id = localStorage.getItem("selected_church_id");
    const name = localStorage.getItem("selected_church_name");

    return {
      id: id && id.trim() ? id : null,
      name: name && name.trim() ? name : null,
    };
  } catch {
    return { id: null, name: null };
  }
}

export default function AppShell(props: AppShellProps) {
  const { children } = props;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [cmOpen, setCmOpen] = useState(false);
  const [msOpen, setMsOpen] = useState(false);
  const [shOpen, setShOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [impersonatingChurch, setImpersonatingChurch] = useState<string | null>(null);

  // Fetch the authenticated user's email once on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    const stored = loadCollapsed();
    const next: Record<string, boolean> = {};
    for (const cat of CATEGORIES) {
      const hasActive = cat.items.some(item => pathActive(pathname, item.href));
      // Active category is always forced open; others fall back to stored state (default: collapsed)
      next[cat.key] = hasActive ? false : (stored[cat.key] ?? true);
    }
    setCollapsed(next);
    setCmOpen(CM_ITEMS.some(item => pathActive(pathname, item.href)));
    setMsOpen(MS_ITEMS.some(item => pathActive(pathname, item.href)));
    setShOpen(SH_ITEMS.some(item => pathActive(pathname, item.href)));

    const selectedFromUrl = searchParams.get("churchId");
    const selectedFromStorage = readSelectedChurchFromStorage();

    // SECURITY/ACCURACY: only show the master-admin impersonation banner when
    // the stored selected church matches the churchId currently being viewed.
    // This prevents a stale browser value from saying "Viewing as Lighthouse"
    // while the server-rendered dashboard is actually ABC Church.
    if (
      selectedFromStorage.id &&
      selectedFromStorage.name &&
      (!selectedFromUrl || selectedFromStorage.id === selectedFromUrl)
    ) {
      setImpersonatingChurch(selectedFromStorage.name);
    } else {
      setImpersonatingChurch(null);
    }

    setMounted(true);
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== "selected_church_id" && event.key !== "selected_church_name") return;

      const selectedFromUrl = searchParams.get("churchId");
      const selectedFromStorage = readSelectedChurchFromStorage();

      if (
        selectedFromStorage.id &&
        selectedFromStorage.name &&
        (!selectedFromUrl || selectedFromStorage.id === selectedFromUrl)
      ) {
        setImpersonatingChurch(selectedFromStorage.name);
      } else {
        setImpersonatingChurch(null);
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [searchParams]);

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsed(next);
      return next;
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const isMasterAdmin =
    !!userEmail && userEmail.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

  function nestedItemStyle(active: boolean): React.CSSProperties {
    return {
      backgroundColor: active ? "#F28C28" : "transparent",
      color: active ? "#1A4A2E" : "rgba(255,255,255,0.70)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 12px 6px 28px",
      borderRadius: "8px",
      fontSize: "12px",
      fontWeight: active ? 600 : 400,
      textDecoration: "none",
      transition: "background-color 0.15s",
    };
  }

  function itemStyle(active: boolean): React.CSSProperties {
    return {
      backgroundColor: active ? "#F28C28" : "transparent",
      color: active ? "#1A4A2E" : "rgba(255,255,255,0.78)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "7px 12px 7px 18px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: active ? 600 : 400,
      textDecoration: "none",
      transition: "background-color 0.15s",
    };
  }

  function masterAdminItemStyle(active: boolean): React.CSSProperties {
    return {
      backgroundColor: active ? "#f59e0b" : "rgba(245,158,11,0.12)",
      color: active ? "#1A4A2E" : "#fcd34d",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "7px 12px 7px 18px",
      borderRadius: "8px",
      fontSize: "12px",
      fontWeight: 600,
      textDecoration: "none",
      transition: "background-color 0.15s",
    };
  }

  // Skeleton sidebar while waiting for client mount (avoids hydration mismatch)
  if (!mounted) {
    return (
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <aside style={{ width: 256, flexShrink: 0, backgroundColor: "#1A4A2E", display: "flex", flexDirection: "column" }}>
          <LogoBlock />
          <div style={{ flex: 1 }} />
        </aside>
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f9fafb" }}>{children}</main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside style={{ width: 256, flexShrink: 0, height: "100vh", overflowX: "hidden", backgroundColor: "#1A4A2E", display: "flex", flexDirection: "column" }}>
        <LogoBlock />

        <nav style={{ flex: 1, minHeight: 0, padding: "10px 8px 8px", overflowY: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>

          {/* Dashboard root link */}
          <Link
            href="/dashboard"
            style={{
              backgroundColor: pathname === "/dashboard" ? "#F28C28" : "transparent",
              color: pathname === "/dashboard" ? "#1A4A2E" : "rgba(255,255,255,0.85)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 12px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "background-color 0.15s",
              marginBottom: "10px",
            }}
          >
            🏠 Dashboard
          </Link>

          {/* 5 collapsible categories */}
          {CATEGORIES.map(cat => {
            const isCollapsed = collapsed[cat.key] ?? true;
            const hasActive = cat.items.some(item => pathActive(pathname, item.href));

            return (
              <div key={cat.key} style={{ marginBottom: "2px" }}>
                {/* Category header / toggle */}
                <button
                  onClick={() => toggle(cat.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px 5px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: hasActive && isCollapsed
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.38)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    transition: "color 0.15s",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    {cat.label}
                    {isCollapsed && hasActive && (
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        backgroundColor: "#F28C28", display: "inline-block", flexShrink: 0,
                      }} />
                    )}
                  </span>
                  {/* Chevron — right when collapsed, down when open */}
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    style={{
                      flexShrink: 0,
                      transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                      opacity: 0.55,
                    }}
                  >
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Collapsible items */}
                {cat.key === "youth" ? (
                  /* Youth & Children — three expandable sub-groups */
                  <div
                    style={{
                      overflow: "hidden",
                      maxHeight: isCollapsed ? "0px" : "1500px",
                      transition: "max-height 0.25s ease, opacity 0.15s ease",
                      opacity: isCollapsed ? 0 : 1,
                    }}
                  >
                    <div style={{ paddingBottom: "4px" }}>
                      {[
                        { label: "🧒 Children's Ministry", items: CM_ITEMS, open: cmOpen, setOpen: setCmOpen },
                        { label: "🎒 Middle School",        items: MS_ITEMS, open: msOpen, setOpen: setMsOpen },
                        { label: "🎓 Senior High",          items: SH_ITEMS, open: shOpen, setOpen: setShOpen },
                      ].map(group => {
                        const groupActive = group.items.some(item => pathActive(pathname, item.href));
                        return (
                          <div key={group.label}>
                            <button
                              onClick={() => group.setOpen(o => !o)}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "7px 12px 7px 18px",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: groupActive ? "#F28C28" : "rgba(255,255,255,0.78)",
                                fontSize: "13px",
                                fontWeight: groupActive ? 600 : 400,
                                borderRadius: "8px",
                                textAlign: "left",
                              }}
                            >
                              <span>{group.label}</span>
                              <svg
                                width="10" height="10" viewBox="0 0 10 10" fill="none"
                                style={{
                                  flexShrink: 0,
                                  transform: group.open ? "rotate(0deg)" : "rotate(-90deg)",
                                  transition: "transform 0.2s ease",
                                  opacity: 0.55,
                                }}
                              >
                                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <div
                              style={{
                                overflow: "hidden",
                                maxHeight: group.open ? `${group.items.length * 34}px` : "0px",
                                transition: "max-height 0.22s ease, opacity 0.15s ease",
                                opacity: group.open ? 1 : 0,
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: "1px", paddingBottom: "4px" }}>
                                {group.items.map(item => (
                                  <Link key={group.label + item.href} href={item.href} style={nestedItemStyle(pathActive(pathname, item.href))}>
                                    {item.label}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Standard flat items for all other categories */
                  <div
                    style={{
                      overflow: "hidden",
                      maxHeight: isCollapsed ? "0px" : `${cat.items.length * 36}px`,
                      transition: "max-height 0.22s ease, opacity 0.15s ease",
                      opacity: isCollapsed ? 0 : 1,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px", paddingBottom: "4px" }}>
                      {cat.items.map(item => (
                        <Link key={item.href} href={item.href} style={itemStyle(pathActive(pathname, item.href))}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Settings + Billing */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "8px", paddingTop: "4px", display: "flex", flexDirection: "column", gap: "1px" }}>
            <Link href="/dashboard/settings" style={itemStyle(pathActive(pathname, "/dashboard/settings"))}>
              ⚙️ Settings
            </Link>
            <Link href="/dashboard/billing" style={itemStyle(pathActive(pathname, "/dashboard/billing"))}>
              💳 Billing
            </Link>
          </div>

          {/* Master Admin — only visible to the master admin account */}
          {isMasterAdmin && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "6px", paddingTop: "6px", display: "flex", flexDirection: "column", gap: "1px" }}>
              <p style={{ padding: "4px 12px 2px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(252,211,77,0.5)", margin: 0 }}>
                Master Admin
              </p>
              <Link
                href="/dashboard/master-admin/subscriptions"
                style={masterAdminItemStyle(pathActive(pathname, "/dashboard/master-admin/subscriptions"))}
              >
                🔑 Subscription Management
              </Link>
            </div>
          )}

        </nav>

        {/* Sign Out — always visible to authenticated users */}
        <div style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px 8px 18px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.55)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              transition: "color 0.15s, background-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f9fafb" }}>
        {isMasterAdmin && impersonatingChurch && (
          <div
            style={{
              backgroundColor: "#1e3a5f",
              color: "white",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              fontSize: 13,
              fontWeight: 600,
              position: "sticky",
              top: 0,
              zIndex: 50,
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            <span>👁️ Viewing as <strong>{impersonatingChurch}</strong></span>
            <button
              onClick={() => {
                localStorage.removeItem("selected_church_id");
                localStorage.removeItem("selected_church_name");
                setImpersonatingChurch(null);
                router.push("/dashboard");
              }}
              style={{
                backgroundColor: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.3)",
                color: "white",
                borderRadius: 6,
                padding: "5px 16px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ← Return to Master Admin
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function LogoBlock() {
  return (
    <div style={{ padding: "16px", display: "flex", justifyContent: "center", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <img
        src="/shepherdwell-logo.png"
        alt="ShepherdWell"
        style={{ width: "140px", height: "140px", borderRadius: "50%", objectFit: "cover", objectPosition: "center", border: "2px solid rgba(240,192,64,0.4)" }}
      />
    </div>
  );
}
