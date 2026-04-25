"use client";

import { useState, useMemo, useCallback } from "react";
import yaml from "js-yaml";
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
  onSwitchToEnv?: () => void;
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
  onSwitchToEnv,
}: StackComposeTabProps) {
  const [wordWrap, setWordWrap] = useState(false);

  // Extract env var references from the YAML
  const envVarRefs = useMemo(() => {
    const refs = new Set<string>();
    const regex = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    let match;
    while ((match = regex.exec(composeYaml)) !== null) {
      refs.add(match[1]);
    }
    return refs;
  }, [composeYaml]);

  const definedCount = [...envVarRefs].filter(
    (k) => k in parsedEnvVars && parsedEnvVars[k].trim() !== ""
  ).length;
  const missingCount = envVarRefs.size - definedCount;

  const [formatError, setFormatError] = useState("");

  const handleFormat = useCallback(() => {
    if (!composeYaml.trim()) return;
    try {
      const docs = yaml.loadAll(composeYaml);
      const formatted = docs
        .map((doc) =>
          yaml.dump(doc, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
            quotingType: '"',
            forceQuotes: false,
          })
        )
        .join("---\n");
      onChange(formatted.trimEnd() + "\n");
      setFormatError("");
    } catch (err) {
      setFormatError(err instanceof Error ? err.message : "Invalid YAML");
    }
  }, [composeYaml, onChange]);

  const lineCount = composeYaml.split("\n").length;

  return (
    <div className="space-y-3">
      {/* Editor card */}
      <div className="card">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-sm font-medium text-primary">Docker Compose</h2>
            <span className="text-[10px] font-mono text-muted px-1.5 py-0.5 rounded bg-surface-elevated">
              YAML
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted font-mono hidden sm:inline">
              {lineCount} lines
            </span>
            <button
              onClick={handleFormat}
              disabled={!composeYaml.trim() || !userCanEdit}
              className="text-[10px] px-2 py-0.5 rounded transition-colors text-muted hover:text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:pointer-events-none"
              title="Auto-format YAML"
            >
              Format
            </button>
            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                wordWrap
                  ? "bg-info/10 text-info"
                  : "text-muted hover:text-primary hover:bg-surface-elevated"
              }`}
            >
              Wrap
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="p-0">
          <CodeEditor
            rows={20}
            maxRows={28}
            value={composeYaml}
            onChange={onChange}
            language="yaml"
            envVars={parsedEnvVars}
            wordWrap={wordWrap}
            onEnvVarClick={onSwitchToEnv}
            placeholder={`version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"`}
            className="border-0 rounded-none"
          />
        </div>

        {/* Footer bar */}
        {userCanEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-t border-border-subtle">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={onSync}
                disabled={syncingCompose || savingCompose || !composeYaml.trim()}
                title="Re-read the stored compose YAML and patch existing containers without recreating them"
              >
                {syncingCompose ? "Syncing..." : "Sync Config"}
              </Button>
            </div>
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

      {composeError && (
        <Alert variant="error" onDismiss={onDismissError}>
          {composeError}
        </Alert>
      )}

      {formatError && (
        <Alert variant="error" onDismiss={() => setFormatError("")}>
          Format failed: {formatError}
        </Alert>
      )}

      {/* Env var summary */}
      {envVarRefs.size > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-primary">
              Environment Variables ({envVarRefs.size})
            </h3>
            {onSwitchToEnv && (
              <button
                onClick={onSwitchToEnv}
                className="text-[10px] text-info hover:underline"
              >
                Edit in Environment tab
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...envVarRefs].sort().map((key) => {
              const defined = key in parsedEnvVars && parsedEnvVars[key].trim() !== "";
              return (
                <button
                  key={key}
                  onClick={onSwitchToEnv}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    defined
                      ? "bg-healthy/10 text-healthy hover:bg-healthy/20"
                      : "bg-failed/10 text-failed hover:bg-failed/20"
                  }`}
                >
                  ${key}
                </button>
              );
            })}
          </div>
          {missingCount > 0 && (
            <p className="text-[10px] text-failed mt-2">
              {missingCount} variable{missingCount > 1 ? "s" : ""} not defined
            </p>
          )}
        </div>
      )}
    </div>
  );
}
