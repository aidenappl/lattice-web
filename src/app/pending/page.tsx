"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { reqGetSelf } from "@/services/auth.service";
import { reqLogout } from "@/services/auth.service";

export default function PendingApprovalPage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    document.title = "Lattice - Pending Approval";
    reqGetSelf().then((res) => {
      if (res.success) {
        setEmail(res.data.email);
      }
    });
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-6 p-8">
      <Logo size="md" />
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold text-primary mb-2">
          Account Pending Approval
        </h1>
        <p className="text-sm text-muted mb-4">
          {email
            ? `Your account (${email}) has been created but requires admin approval before you can access the dashboard.`
            : "Your account has been created but requires admin approval before you can access the dashboard."}
        </p>
        <p className="text-xs text-dimmed">
          Please contact your administrator to approve your account.
        </p>
      </div>
      <button
        onClick={async () => {
          await reqLogout();
          window.location.replace("/login");
        }}
        className="btn btn-secondary mt-4"
      >
        Sign Out
      </button>
    </div>
  );
}
