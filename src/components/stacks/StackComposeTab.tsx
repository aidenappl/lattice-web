"use client";

import { CodeEditor } from "@/components/ui/code-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface StackComposeTabProps {
  composeYaml: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onSync: () => void;
  savingCompose: boolean;
  syncingCompose: boolean;
  composeError: string;
  onDismissError: () => void;
  canEdit: boolean;
  parsedEnvVars: Record<string, string>;
}

export function StackComposeTab({
  composeYaml,
  onChange,
  onSave,
  onSync,
  savingCompose,
  syncingCompose,
  composeError,
  onDismissError,
  canEdit: userCanEdit,
  parsedEnvVars,
}: StackComposeTabProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-primary">Docker Compose</h2>
      </div>
      <p className="text-xs text-muted mb-3">
        Edit the compose YAML and save to replace all containers with the
        updated definition.
      </p>
      <CodeEditor
        rows={22}
        value={composeYaml}
        onChange={onChange}
        language="yaml"
        envVars={parsedEnvVars}
        placeholder={`version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"`}
      />
      {composeError && (
        <div className="mt-2">
          <Alert variant="error" onDismiss={onDismissError}>
            {composeError}
          </Alert>
        </div>
      )}
      {userCanEdit && (
        <div className="mt-3 flex justify-between items-center">
          <Button
            size="sm"
            variant="secondary"
            onClick={onSync}
            disabled={syncingCompose || savingCompose || !composeYaml.trim()}
            title="Re-read the stored compose YAML and patch existing containers without recreating them"
          >
            {syncingCompose ? "Syncing..." : "Sync Config"}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={savingCompose || syncingCompose || !composeYaml.trim()}
          >
            {savingCompose ? "Saving..." : "Save & Sync Containers"}
          </Button>
        </div>
      )}
    </div>
  );
}
