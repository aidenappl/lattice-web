"use client";

import { useEffect, useState } from "react";
import { EnvVarEditor } from "@/components/ui/env-var-editor";
import { Button } from "@/components/ui/button";
import { reqGetGlobalEnvVars } from "@/services/admin.service";
import type { GlobalEnvVar } from "@/types";

interface StackEnvTabProps {
  envVars: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
}

export function StackEnvTab({
  envVars,
  onChange,
  onSave,
  saving,
  canEdit: userCanEdit,
}: StackEnvTabProps) {
  const [globalVars, setGlobalVars] = useState<GlobalEnvVar[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);

  useEffect(() => {
    reqGetGlobalEnvVars().then((res) => {
      if (res.success) setGlobalVars(res.data ?? []);
      setGlobalLoading(false);
    });
  }, []);

  return (
    <div className="card p-5">
      {/* Global Variables Section */}
      <div className="mb-4">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Inherited Global Variables
        </h3>
        {globalLoading ? (
          <div className="rounded-lg border border-border-subtle p-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-3.5 w-3.5 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
              Loading global variables...
            </div>
          </div>
        ) : globalVars.length > 0 ? (
          <>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <table className="w-full">
                <tbody className="divide-y divide-border-subtle">
                  {globalVars.map((gv) => (
                    <tr key={gv.id}>
                      <td className="px-3 py-1.5 text-xs font-mono text-secondary w-1/3">
                        {gv.key}
                      </td>
                      <td className="px-3 py-1.5 text-xs font-mono text-muted">
                        {gv.is_secret ? "\u2022\u2022\u2022\u2022\u2022" : gv.value}
                      </td>
                      <td className="px-3 py-1.5 text-[10px] text-dimmed">global</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted mt-1">
              These are overridden by stack-level variables with the same key.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-border-subtle p-3">
            <p className="text-xs text-muted">No global variables configured</p>
          </div>
        )}
      </div>

      <h2 className="text-sm font-medium text-primary mb-4">
        Stack Environment Variables
      </h2>
      <EnvVarEditor value={envVars} onChange={onChange} />
      {userCanEdit && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
