"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { UpdateBanner } from "./UpdateBanner";
import { Toaster } from "react-hot-toast";
import { ConfirmProvider } from "@/components/ui/confirm-modal";

interface DashboardLayoutProps {
  children: ReactNode;
}

const publicPaths = ["/login", "/unauthorized"];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const isPublic = publicPaths.includes(pathname);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <UpdateBanner />
      <ConfirmProvider>
        <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto w-full">
          {children}
        </main>
      </ConfirmProvider>
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
    </div>
  );
}
