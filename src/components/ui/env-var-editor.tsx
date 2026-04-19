"use client";

import { useState, useCallback } from "react";
import { CodeEditor } from "./code-editor";

interface EnvVarEditorProps {
  value: string; // stored as JSON string e.g. '{"KEY":"val"}'
  onChange: (value: string) => void;
}

type Row = { key: string; value: string };

function parseToRows(raw: string): Row[] {
  if (!raw.trim()) return [];
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || Array.isArray(obj) || obj === null)
      return [];
    return Object.entries(obj).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  } catch {
    return [];
  }
}

function rowsToJson(rows: Row[]): string {
  const obj: Record<string, string> = {};
  for (const { key, value } of rows) {
    if (key.trim()) obj[key.trim()] = value;
  }
  if (Object.keys(obj).length === 0) return "";
  return JSON.stringify(obj, null, 2);
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function isValidJson(raw: string): boolean {
  if (!raw.trim()) return true;
  try {
    const obj = JSON.parse(raw);
    return typeof obj === "object" && !Array.isArray(obj) && obj !== null;
  } catch {
    return false;
  }
}

export function EnvVarEditor({ value, onChange }: EnvVarEditorProps) {
  const [jsonMode, setJsonMode] = useState(false);
  // Separate state for JSON mode draft (only committed on switch back)
  const [jsonDraft, setJsonDraft] = useState(value);
  const [jsonError, setJsonError] = useState("");

  const rows = parseToRows(value);

  // ── KV mode ──────────────────────────────────────────────────────────────

  const setRow = useCallback(
    (index: number, field: "key" | "value", v: string) => {
      const updated = rows.map((r, i) =>
        i === index ? { ...r, [field]: v } : r,
      );
      onChange(rowsToJson(updated));
    },
    [rows, onChange],
  );

  const addRow = useCallback(() => {
    const updated = [...rows, { key: "", value: "" }];
    onChange(rowsToJson(updated));
  }, [rows, onChange]);

  const removeRow = useCallback(
    (index: number) => {
      const updated = rows.filter((_, i) => i !== index);
      onChange(rowsToJson(updated));
    },
    [rows, onChange],
  );

  // ── Mode switching ────────────────────────────────────────────────────────

  const switchToJson = () => {
    setJsonDraft(value ? formatJson(value) : "");
    setJsonError("");
    setJsonMode(true);
  };

  const switchToKv = () => {
    if (!isValidJson(jsonDraft)) {
      setJsonError("Invalid JSON — fix before switching back.");
      return;
    }
    onChange(jsonDraft.trim() ? jsonDraft : "");
    setJsonError("");
    setJsonMode(false);
  };

  const handleReformat = () => {
    const formatted = formatJson(jsonDraft);
    setJsonDraft(formatted);
    if (!isValidJson(formatted)) {
      setJsonError("Cannot reformat — invalid JSON.");
    } else {
      setJsonError("");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted">
          Key-value pairs injected into all containers during deploy.
          Container-level env vars override these.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {jsonMode ? (
            <>
              <button
                type="button"
                onClick={handleReformat}
                className="text-xs text-muted hover:text-secondary transition-colors"
              >
                Reformat
              </button>
              <button
                type="button"
                onClick={switchToKv}
                className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
              >
                ← List view
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={switchToJson}
              className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
            >
              JSON mode
            </button>
          )}
        </div>
      </div>

      {jsonMode ? (
        <div>
          <CodeEditor
            rows={8}
            value={jsonDraft}
            onChange={(v) => {
              setJsonDraft(v);
              setJsonError("");
            }}
            language="json"
            placeholder='{"NODE_ENV": "production", "LOG_LEVEL": "info"}'
          />
          {jsonError && (
            <p className="text-xs text-[#ef4444] mt-1.5">{jsonError}</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border-strong overflow-hidden">
          {rows.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_auto] text-xs text-muted uppercase tracking-wider px-3 py-2 border-b border-border-strong bg-background-alt">
              <span>Key</span>
              <span>Value</span>
              <span />
            </div>
          )}
          <div>
            {rows.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto] items-center border-b border-border-subtle last:border-b-0"
              >
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) => setRow(i, "key", e.target.value)}
                  placeholder="KEY"
                  spellCheck={false}
                  className="bg-transparent px-3 py-2 text-sm text-primary font-mono placeholder:text-muted focus:outline-none border-r border-border-subtle"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => setRow(i, "value", e.target.value)}
                  placeholder="value"
                  spellCheck={false}
                  className="bg-transparent px-3 py-2 text-sm text-secondary font-mono placeholder:text-muted focus:outline-none border-r border-border-subtle"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="px-3 text-dimmed hover:text-[#ef4444] transition-colors text-base leading-none"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="w-full px-3 py-2 text-xs text-dimmed hover:text-secondary hover:bg-background-alt transition-colors text-left"
          >
            + Add variable
          </button>
        </div>
      )}
    </div>
  );
}
