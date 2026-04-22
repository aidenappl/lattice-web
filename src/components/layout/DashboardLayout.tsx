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
import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

const publicPaths = ["/login", "/unauthorized", "/pending"];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const isPublic = publicPaths.includes(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useNotifications();
  useDesktopNotifications();

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("lattice-sidebar-collapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("lattice-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  // Global ⌘K handler + Escape to close mobile sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape" && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileSidebarOpen]);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <VersionCheckProvider>
      <div className={cn("app-grid", sidebarCollapsed && "sidebar-collapsed")}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          mobileOpen={mobileSidebarOpen}
        />
        <div
          className={cn("sidebar-overlay", mobileSidebarOpen && "open")}
          onClick={() => setMobileSidebarOpen(false)}
        />
        <div className="app-main">
          <Topbar
            onOpenPalette={() => setPaletteOpen(true)}
            onToggleMobileMenu={toggleMobileSidebar}
          />
          <UpdateBanner />
          <ConfirmProvider>
            <div className="app-content">{children}</div>
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
