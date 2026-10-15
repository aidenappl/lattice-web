"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faBars,
  faBell,
  faBellSlash,
  faSun,
  faMoon,
  faDesktop,
  faRightFromBracket,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { useAuth } from "@/store/hooks";
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
} from "@/hooks/useNotifications";

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API;

// Segment labels that don't title-case cleanly. Matching the sidebar matters:
// the crumb used to read "Ai" on the page the sidebar calls "AI Management".
const SEGMENT_LABELS: Record<string, string> = {
  ai: "AI Management",
  "env-vars": "Env Variables",
  "backup-destinations": "Backups",
  "audit-log": "Audit Log",
};

/**
 * Every detail page sets `document.title` to "Lattice - <name>" once it has
 * loaded its record. Watching the title lets the breadcrumb show that name
 * instead of the bare id ("Workers / 2") without each page having to push its
 * name somewhere else as well.
 */
function useDocumentTitle(): string {
  const [title, setTitle] = useState("");
  useEffect(() => {
    const read = () => setTitle(document.title);
    read();
    const el = document.querySelector("title");
    if (!el) return;
    const obs = new MutationObserver(read);
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return title;
}

interface TopbarProps {
  onOpenPalette: () => void;
  onToggleMobileMenu?: () => void;
}

export function Topbar({ onOpenPalette, onToggleMobileMenu }: TopbarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const docTitle = useDocumentTitle();
  // The title present when this route was entered still belongs to the previous
  // page ("Lattice - Stacks" while /stacks/21 loads), so it must not be used as
  // the new record's name.
  const [navTitle, setNavTitle] = useState({ path: "", title: "" });
  useEffect(() => {
    setNavTitle({ path: pathname, title: document.title });
  }, [pathname]);
  const titleIsFresh =
    navTitle.path === pathname && docTitle !== navTitle.title;

  const crumbs = useMemo(() => {
    if (pathname === "/") return [{ label: "Dashboard", path: "/" }];
    const parts = pathname.split("/").filter(Boolean);
    const entityName = docTitle
      .replace(/^Lattice - /, "")
      .replace(/ Metrics$/, "")
      .trim();
    const out: { label: string; path: string }[] = [];
    parts.forEach((p, i) => {
      const path = "/" + parts.slice(0, i + 1).join("/");
      let label =
        SEGMENT_LABELS[p] ??
        p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " ");
      if (/^\d+$/.test(p)) {
        // Only trust the title once the page has replaced the generic one.
        const generic =
          !titleIsFresh ||
          !entityName ||
          entityName === "Lattice" ||
          /^Lattice\b/.test(entityName);
        label = generic
          ? `#${p}`
          : entityName.startsWith("Deployment #")
            ? `#${p}`
            : entityName;
      }
      out.push({ label, path });
    });
    return out;
  }, [pathname, docTitle, titleIsFresh]);

  return (
    <div className="topbar">
      {/* Mobile hamburger */}
      <button
        className="mobile-menu-btn"
        onClick={onToggleMobileMenu}
        aria-label="Open navigation"
      >
        <FontAwesomeIcon icon={faBars} className="h-4 w-4" />
      </button>

      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/" className="breadcrumb-link">
          Lattice
        </Link>
        {crumbs.map((c, i) => (
          <span key={c.path} className="flex items-center gap-1.5">
            <span className="text-dimmed">/</span>
            {i === crumbs.length - 1 ? (
              <span className="breadcrumb-current">{c.label}</span>
            ) : (
              <Link href={c.path} className="breadcrumb-link">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </div>

      {/* Search / Command Palette trigger */}
      <button className="topbar-search" onClick={onOpenPalette}>
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="h-3 w-3 text-muted"
        />
        <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
          Jump to container, stack, worker...
        </span>
        <span className="kbd">&#8984;</span>
        <span className="kbd">K</span>
      </button>

      {/* Right actions */}
      <div className="flex items-center gap-1 ml-auto">
        <NotificationToggle />
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <UserMenu />
      </div>
    </div>
  );
}

function NotificationToggle() {
  const [enabled, setEnabled] = useState(getNotificationsEnabled);

  // The bell looks like an inbox but is a mute switch; clicking it used to flip
  // the setting with no feedback at all, so say what just happened.
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setNotificationsEnabled(next);
    toast(next ? "Desktop notifications on" : "Desktop notifications muted", {
      icon: next ? "🔔" : "🔕",
    });
  };

  return (
    <button
      className="icon-btn"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Mute desktop notifications" : "Unmute desktop notifications"}
      title={enabled ? "Notifications on — click to mute" : "Notifications muted — click to turn on"}
    >
      <FontAwesomeIcon
        icon={enabled ? faBell : faBellSlash}
        className="h-3.5 w-3.5"
      />
    </button>
  );
}

function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const icons = { light: faSun, dark: faMoon, system: faDesktop } as const;

  return (
    <div className="relative" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen(!open)}
        title={`Theme: ${theme}`}
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FontAwesomeIcon icon={icons[theme]} className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border-strong bg-background-alt p-1 shadow-lg z-50">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTheme(t);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer",
                theme === t
                  ? "bg-surface-alt text-primary"
                  : "text-secondary hover:bg-surface hover:text-primary",
              )}
            >
              <FontAwesomeIcon icon={icons[t]} className="h-3.5 w-3.5" />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen(!open)}
        title="Account"
        style={{ width: 32, height: 32 }}
      >
        <Avatar src={user?.profile_image_url} name={user?.name} email={user?.email} size={24} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border-strong bg-background-alt p-1 shadow-lg z-50">
          <div className="px-3 py-2 border-b border-border-subtle mb-1">
            <p className="text-sm font-medium text-primary truncate">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-secondary truncate">{user?.email}</p>
          </div>
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary hover:bg-surface hover:text-primary cursor-pointer w-full"
            onClick={() => setOpen(false)}
          >
            <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5" />
            Profile
          </Link>
          <button
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-failed hover:bg-surface cursor-pointer w-full"
            onClick={async () => {
              setOpen(false);
              const { reqLogout } = await import("@/services/auth.service");
              const res = await reqLogout();
              const { monitor } = await import("@/services/monitor.service");
              monitor?.clearUser();
              const { finishSignOut } = await import("@/lib/sso");
              finishSignOut(res.success ? res.data?.redirect_url : null);
            }}
          >
            <FontAwesomeIcon
              icon={faRightFromBracket}
              className="h-3.5 w-3.5"
            />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
