"use client";

import { ReactNode, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { UpdateBanner } from "./UpdateBanner";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "react-hot-toast";
import { ConfirmProvider } from "@/components/ui/confirm-modal";
import { VersionCheckProvider } from "@/hooks/useVersionCheck";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

const publicPaths = ["/login", "/unauthorized"];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const isPublic = publicPaths.includes(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useNotifications();

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("lattice-sidebar-collapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("lattice-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  // Global ⌘K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <VersionCheckProvider>
      <div className={cn("app-grid", sidebarCollapsed && "sidebar-collapsed")}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className="app-main">
          <Topbar onOpenPalette={() => setPaletteOpen(true)} />
          <UpdateBanner />
          <ConfirmProvider>
            <div className="app-content">
              {children}
            </div>
          </ConfirmProvider>
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface)",
            color: "var(--foreground)",
            border: "1px solid var(--border-strong)",
            borderRadius: "8px",
            fontSize: "13px",
          },
          success: {
            iconTheme: { primary: "#22c55e", secondary: "var(--surface)" },
          },
          error: {
            iconTheme: { primary: "#ef4444", secondary: "var(--surface)" },
          },
          loading: {
            iconTheme: { primary: "#3b82f6", secondary: "var(--surface)" },
          },
        }}
      />
    </VersionCheckProvider>
  );
}
