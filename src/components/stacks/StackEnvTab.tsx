"use client";

import { EnvVarEditor } from "@/components/ui/env-var-editor";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="card p-5">
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
