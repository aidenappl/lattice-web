"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faRightFromBracket,
  faXmark,
  faBars,
  faSun,
  faMoon,
  faDesktop,
  faBell,
  faBellSlash,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "@/store/hooks";
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
} from "@/hooks/useNotifications";
import { APP_VERSION } from "@/lib/version";
import { Logo } from "@/components/ui/logo";
import { useTheme, type Theme } from "@/components/ThemeProvider";
const API_URL = process.env.NEXT_PUBLIC_LATTICE_API;

const navigation = [
  { name: "Dashboard", href: "/" },
  { name: "Workers", href: "/workers" },
  { name: "Stacks", href: "/stacks" },
  { name: "Containers", href: "/containers" },
  { name: "Deployments", href: "/deployments" },
  { name: "Networks", href: "/networks" },
  { name: "Registries", href: "/registries" },
  { name: "Audit Log", href: "/audit-log" },
  { name: "Settings", href: "/settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isNavActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
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
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size="sm" />
            <span className="font-semibold text-primary">
              Lattice
              <span className="ml-1.5 text-secondary font-normal">Admin</span>
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = isNavActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-surface-active text-primary"
                      : "text-secondary hover:text-primary hover:bg-surface-elevated",
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Notification toggle */}
          <NotificationToggle />

          {/* Theme toggle */}
          <ThemeToggle theme={theme} setTheme={setTheme} />

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-elevated cursor-pointer"
              aria-label="User menu"
              aria-expanded={menuOpen}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-border-strong text-xs font-medium text-primary">
                {initials}
              </div>
              <span className="hidden sm:block max-w-30 truncate text-sm font-medium text-primary">
                {user?.name ?? user?.email ?? "Account"}
              </span>
              <FontAwesomeIcon
                icon={faChevronDown}
                className="hidden sm:block h-4 w-4 text-secondary"
              />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border-strong bg-surface-alt p-1 shadow-lg">
                <div className="px-3 py-2 border-b border-border-strong mb-1">
                  <p className="text-sm font-medium text-primary truncate">
                    {user?.name || "User"}
                  </p>
                  <p className="text-xs text-secondary truncate">
                    {user?.email}
                  </p>
                </div>
                <button
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive-soft hover:bg-surface-active transition-colors cursor-pointer w-full"
                  onClick={async () => {
                    setMenuOpen(false);
                    const { reqLogout } = await import("@/services/auth.service");
                    await reqLogout();
                    window.location.replace("/login");
                  }}
                >
                  <FontAwesomeIcon
                    icon={faRightFromBracket}
                    className="h-4 w-4"
                  />
                  Sign Out
                </button>
                <div className="border-t border-border-subtle mt-1 pt-1 px-3 py-1.5">
                  <p className="text-[10px] text-muted font-mono">
                    {APP_VERSION}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-surface-elevated hover:text-primary transition-colors cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? (
              <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
            ) : (
              <FontAwesomeIcon icon={faBars} className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden border-t border-border-subtle bg-surface-alt">
          <nav className="flex flex-col p-2 gap-0.5">
            {navigation.map((item) => {
              const isActive = isNavActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-surface-active text-primary"
                      : "text-secondary hover:text-primary hover:bg-surface-elevated",
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────

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

  const options: {
    value: Theme;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: MonitorIcon },
  ];

  const ActiveIcon =
    theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-surface-elevated hover:text-primary transition-colors cursor-pointer"
        aria-label="Toggle theme"
      >
        <ActiveIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-border-strong bg-surface-alt p-1 shadow-lg z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                theme === opt.value
                  ? "bg-accent/15 text-accent"
                  : "text-secondary hover:bg-surface-active hover:text-primary",
              )}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </button>
          ))}
        </div>
      )}
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
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-surface-elevated hover:text-primary transition-colors cursor-pointer"
      aria-label={enabled ? "Disable notifications" : "Enable notifications"}
      title={enabled ? "Notifications on" : "Notifications off"}
    >
      <FontAwesomeIcon
        icon={enabled ? faBell : faBellSlash}
        className="h-4 w-4"
      />
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return <FontAwesomeIcon icon={faSun} className={className} />;
}

function MoonIcon({ className }: { className?: string }) {
  return <FontAwesomeIcon icon={faMoon} className={className} />;
}

function MonitorIcon({ className }: { className?: string }) {
  return <FontAwesomeIcon icon={faDesktop} className={className} />;
}
