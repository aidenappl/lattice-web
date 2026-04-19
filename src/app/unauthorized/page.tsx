"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function UnauthorizedPage() {
  useEffect(() => {
    document.title = "Lattice - Unauthorized";
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3.5 mb-8">
            <Logo size="md" />
            <div className="h-8 w-px bg-[#333333]" />
            <span className="text-lg font-semibold text-white tracking-tight">
              Lattice
            </span>
          </div>

          {/* Lock Icon */}
          <div className="flex justify-center mb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ef4444]/10 ring-1 ring-[#ef4444]/20">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7 text-[#ef4444]"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                <circle cx="12" cy="16.5" r="1.5" />
              </svg>
            </div>
          </div>

          <h1 className="text-center text-xl font-semibold text-white mb-2">
            Unauthorized
          </h1>

          <p className="text-center text-sm text-[#888888] mb-8 leading-relaxed">
            You don&apos;t have access to Lattice. Your access may have been
            revoked or you haven&apos;t been granted access yet.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-lg bg-[#3b82f6] px-4 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] cursor-pointer"
            >
              Back to Sign In
            </Link>
            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 text-sm font-medium text-[#888888] transition-colors hover:bg-[#161616] hover:border-[#333333] hover:text-white cursor-pointer"
            >
              Sign in with a different account
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-[#555555]">
            If you believe this is a mistake, contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
