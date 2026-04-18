"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

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
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
