"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { Logo } from "@/components/ui/logo";

export default function UnauthorizedPage() {
  useEffect(() => {
    document.title = "Lattice - Unauthorized";
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border-subtle bg-surface p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3.5 mb-8">
            <Logo size="md" />
            <div className="h-8 w-px bg-[#333333]" />
            <span className="text-lg font-semibold text-primary tracking-tight">
              Lattice
            </span>
          </div>

          {/* Lock Icon */}
          <div className="flex justify-center mb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ef4444]/10 ring-1 ring-[#ef4444]/20">
              <FontAwesomeIcon
                icon={faLock}
                className="h-7 w-7 text-[#ef4444]"
                aria-hidden="true"
              />
            </div>
          </div>

          <h1 className="text-center text-xl font-semibold text-primary mb-2">
            Unauthorized
          </h1>

          <p className="text-center text-sm text-secondary mb-8 leading-relaxed">
            You don&apos;t have access to Lattice. Your access may have been
            revoked or you haven&apos;t been granted access yet.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-lg bg-[#3b82f6] px-4 text-sm font-medium text-primary transition-colors hover:bg-[#2563eb] cursor-pointer"
            >
              Back to Sign In
            </Link>
            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-secondary transition-colors hover:bg-surface-elevated hover:border-border-strong hover:text-primary cursor-pointer"
            >
              Sign in with a different account
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-muted">
            If you believe this is a mistake, contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
