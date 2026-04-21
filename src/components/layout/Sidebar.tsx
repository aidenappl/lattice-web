"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGauge,
  faServer,
  faLayerGroup,
  faCubes,
  faRocket,
  faNetworkWired,
  faBoxArchive,
  faClipboardList,
  faGear,
  faChevronLeft,
  faChevronRight,
  faKey,
  faFileCode,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { useAuth } from "@/store/hooks";
import { Logo } from "@/components/ui/logo";
import { APP_VERSION } from "@/lib/version";

interface NavItem {
  path: string;
  label: string;
  icon: IconDefinition;
  badge?: number;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const SIDEBAR_GROUPS: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: faGauge },
      { path: "/deployments", label: "Deployments", icon: faRocket },
      { path: "/audit-log", label: "Audit Log", icon: faClipboardList },
    ],
  },
  {
    group: "Infrastructure",
    items: [
      { path: "/workers", label: "Workers", icon: faServer },
      { path: "/stacks", label: "Stacks", icon: faLayerGroup },
      { path: "/containers", label: "Containers", icon: faCubes },
      { path: "/networks", label: "Networks", icon: faNetworkWired },
      { path: "/registries", label: "Registries", icon: faBoxArchive },
    ],
  },
  {
    group: "Workspace",
    items: [
      { path: "/env-vars", label: "Env Variables", icon: faKey },
      { path: "/templates", label: "Templates", icon: faFileCode },
      { path: "/settings", label: "Settings", icon: faGear },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
}

export function Sidebar({ collapsed, onToggle, mobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggle]);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  return (
    <aside className={cn("sidebar", mobileOpen && "mobile-open")}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Logo size="sm" />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                Lattice
              </div>
              <div className="mono text-[10px] text-secondary -mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                Admin
              </div>
            </div>
            <button
              className="icon-btn"
              onClick={onToggle}
              title="Collapse (⌘B)"
              style={{ width: 24, height: 24 }}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
            </button>
          </>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="px-2.5 pt-3 pb-2">
          <button
            className="icon-btn w-full"
            onClick={onToggle}
            title="Expand (⌘B)"
            style={{ height: 28 }}
          >
            <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-1">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.group} className="sidebar-section">
            {!collapsed && (
              <div className="sidebar-section-label">{group.group}</div>
            )}
            {group.items.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn("nav-item", active && "active")}
                  title={collapsed ? item.label : undefined}
                  style={
                    collapsed
                      ? { padding: "8px 10px", justifyContent: "center" }
                      : undefined
                  }
                >
                  <FontAwesomeIcon
                    icon={item.icon}
                    className="h-3.5 w-3.5 shrink-0"
                    fixedWidth
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge !== undefined && (
                        <span
                          className="nav-badge"
                          style={{
                            background: "var(--pending-bg)",
                            color: "var(--pending)",
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="sidebar-footer">
          <div className="flex items-center gap-2.5">
            <div
              className="shrink-0 flex items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                width: 28,
                height: 28,
                background:
                  "linear-gradient(135deg, var(--brand), var(--violet))",
                color: "#000",
              }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate">
                {user?.name || user?.email || "User"}
              </div>
              <div className="mono text-[10px] text-secondary">
                {user?.role || "viewer"}
              </div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-border-subtle">
            <p className="mono text-[10px] text-muted">{APP_VERSION}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
