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
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { useAuth } from "@/store/hooks";
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
} from "@/hooks/useNotifications";

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API;

interface TopbarProps {
  onOpenPalette: () => void;
  onToggleMobileMenu?: () => void;
}

export function Topbar({ onOpenPalette, onToggleMobileMenu }: TopbarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const crumbs = useMemo(() => {
    if (pathname === "/") return [{ label: "Dashboard", path: "/" }];
    const parts = pathname.split("/").filter(Boolean);
    const out: { label: string; path: string }[] = [];
    parts.forEach((p, i) => {
      const path = "/" + parts.slice(0, i + 1).join("/");
      const label = p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " ");
      out.push({ label, path });
    });
    return out;
  }, [pathname]);

  return (
    <div className="topbar">
      {/* Mobile hamburger */}
      <button className="mobile-menu-btn" onClick={onToggleMobileMenu}>
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

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setNotificationsEnabled(next);
  };

  return (
    <button
      className="icon-btn"
      onClick={toggle}
      title={enabled ? "Notifications on" : "Notifications off"}
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
      <button className="icon-btn" onClick={() => setOpen(!open)} title="Theme">
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

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "?");

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
              await reqLogout();
              window.location.replace("/login");
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
