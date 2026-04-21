"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/logo";
import { useUser } from "@/store/hooks";

export default function PendingApprovalPage() {
  useEffect(() => {
    document.title = "Lattice - Pending Approval";
  }, []);

  const user = useUser();

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-6 p-8">
      <Logo size="md" />
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold text-primary mb-2">
          Account Pending Approval
        </h1>
        <p className="text-sm text-muted mb-4">
          Your account ({user?.email}) has been created but requires admin
          approval before you can access the dashboard.
        </p>
        <p className="text-xs text-dimmed">
          Please contact your administrator to approve your account.
        </p>
      </div>
      <button
        onClick={() => window.location.replace("/login")}
        className="btn btn-secondary mt-4"
      >
        Sign Out
      </button>
    </div>
  );
}
