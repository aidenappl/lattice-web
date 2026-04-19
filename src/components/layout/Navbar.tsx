"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/hooks";
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
              <svg
                className="hidden sm:block h-4 w-4 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
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
                <a
                  href={`${API_URL}/auth/logout`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive-soft hover:bg-surface-active transition-colors cursor-pointer"
                  onClick={() => setMenuOpen(false)}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign Out
                </a>
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
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
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

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}
