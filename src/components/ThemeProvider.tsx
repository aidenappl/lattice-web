"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "dark",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const COOKIE_NAME = "forta-appearance";
const LS_KEY = "lattice-appearance";
const VALID: Theme[] = ["light", "dark", "system"];

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(name + "="));
  return match?.split("=")[1];
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;domain=.appleby.cloud;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

function getStoredTheme(): Theme {
  if (typeof document === "undefined") return "system";
  // Cookie is source of truth if present
  const cookie = getCookie(COOKIE_NAME) as Theme | undefined;
  if (cookie && VALID.includes(cookie)) return cookie;
  // Fall back to localStorage
  try {
    const ls = localStorage.getItem(LS_KEY) as Theme | null;
    if (ls && VALID.includes(ls)) return ls;
  } catch {
    // ignore
  }
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  // Write defaults on first mount if absent
  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setCookie(COOKIE_NAME, theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync from cookie whenever the tab becomes visible (e.g. user returns from forta-web)
  // and poll every 2s as a fallback for same-tab cross-origin cookie changes.
  useEffect(() => {
    const syncFromCookie = () => {
      const cookie = getCookie(COOKIE_NAME) as Theme | undefined;
      if (cookie && VALID.includes(cookie) && cookie !== theme) {
        setThemeState(cookie);
      }
    };

    document.addEventListener("visibilitychange", syncFromCookie);
    const interval = setInterval(syncFromCookie, 2000);
    return () => {
      document.removeEventListener("visibilitychange", syncFromCookie);
      clearInterval(interval);
    };
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const resolve = () => {
      const r = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };

    resolve();
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    setCookie(COOKIE_NAME, t);
    try {
      localStorage.setItem(LS_KEY, t);
    } catch {
      // ignore
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
