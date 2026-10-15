"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
} from "@fortawesome/free-solid-svg-icons";
import { CodeEditor } from "./code-editor";

// Stack-level variables are stored and returned in plain text, so the tab
// used to print every DSN and password in full to anyone looking at the
// screen (or a screenshot of it). Values whose key looks sensitive are
// masked until revealed; they are still sent and saved unchanged.
const SENSITIVE_KEY =
  /(PASS|SECRET|TOKEN|KEY|DSN|CREDENTIAL|PRIVATE|AUTH|COOKIE|SESSION|SALT|CERT)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

interface EnvVarEditorProps {
  value: string; // stored as JSON string e.g. '{"KEY":"val"}'
  onChange: (value: string) => void;
  highlightVar?: string;
  onClearHighlight?: () => void;
  referencedVars?: Set<string>;
  /** Keys the API treats as secret: masked here and "***" for non-admins. */
  secretKeys?: Set<string>;
  /** Shows a lock toggle per row when given. */
  onToggleSecret?: (key: string) => void;
  /** Only admins may un-mark a secret (lattice-api returns 403 otherwise). */
  canUnmarkSecrets?: boolean;
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

export function EnvVarEditor({
  value,
  onChange,
  highlightVar,
  onClearHighlight,
  referencedVars,
  secretKeys,
  onToggleSecret,
  canUnmarkSecrets = true,
}: EnvVarEditorProps) {
  // Masked when declared secret, or when the name looks like one.
  const isMasked = (key: string) =>
    secretKeys?.has(key.trim()) || isSensitiveKey(key);
  const [jsonMode, setJsonMode] = useState(false);
  // Separate state for JSON mode draft (only committed on switch back)
  const [jsonDraft, setJsonDraft] = useState(value);
  const [jsonError, setJsonError] = useState("");
  // Track in-progress rows (with possibly empty keys) separately from the
  // serialised JSON so that blank rows aren't immediately discarded.
  const [localRows, setLocalRows] = useState<Row[]>(() => parseToRows(value));
  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const toggleReveal = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Sync localRows when the external value changes (e.g. after save/load)
  const lastExternalValue = useRef(value);
  if (value !== lastExternalValue.current) {
    lastExternalValue.current = value;
    setLocalRows(parseToRows(value));
  }

  const rows = localRows;

  // ── Highlight + scroll to var ───────────────────────────────────────────
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>();
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!highlightVar) return;
    // Switch to KV mode if in JSON mode so we can scroll to the row
    if (jsonMode) {
      if (isValidJson(jsonDraft)) {
        const committed = jsonDraft.trim() ? jsonDraft : "";
        onChange(committed);
        setLocalRows(parseToRows(committed));
        setJsonError("");
        setJsonMode(false);
      }
    }
    setActiveHighlight(highlightVar);
    // Scroll to the row after a brief delay for render
    requestAnimationFrame(() => {
      const el = rowRefs.current.get(highlightVar);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    // Auto-clear highlight after 2s
    const timer = setTimeout(() => {
      setActiveHighlight(undefined);
      onClearHighlight?.();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightVar]);

  // ── KV mode ──────────────────────────────────────────────────────────────

  const setRow = useCallback(
    (index: number, field: "key" | "value", v: string) => {
      const updated = rows.map((r, i) =>
        i === index ? { ...r, [field]: v } : r,
      );
      setLocalRows(updated);
      onChange(rowsToJson(updated));
    },
    [rows, onChange],
  );

  const addRow = useCallback(() => {
    const updated = [...rows, { key: "", value: "" }];
    setLocalRows(updated);
    // Don't call onChange here — the empty key would be stripped.
    // onChange will fire once the user types a key.
  }, [rows]);

  const removeRow = useCallback(
    (index: number) => {
      const updated = rows.filter((_, i) => i !== index);
      setLocalRows(updated);
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
    const committed = jsonDraft.trim() ? jsonDraft : "";
    onChange(committed);
    setLocalRows(parseToRows(committed));
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

  // ── Unused count ──────────────────────────────────────────────────────────

  const unusedCount = referencedVars
    ? rows.filter((r) => r.key.trim() && !referencedVars.has(r.key.trim()))
        .length
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">
            Key-value pairs injected into all containers during deploy.
            Container-level env vars override these.
          </p>
          {unusedCount > 0 && !jsonMode && (
            <span className="text-[10px] font-medium text-amber-400/70 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 shrink-0">
              {unusedCount} unused
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {!jsonMode && rows.some((r) => isMasked(r.key)) && (
            <button
              type="button"
              onClick={() => setRevealAll((v) => !v)}
              className="text-xs text-muted hover:text-secondary transition-colors"
            >
              {revealAll ? "Hide secrets" : "Reveal secrets"}
            </button>
          )}
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
                className="text-xs text-info hover:text-info transition-colors"
              >
                ← List view
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={switchToJson}
              className="text-xs text-info hover:text-info transition-colors"
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
            <p className="text-xs text-failed mt-1.5">{jsonError}</p>
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
            {rows.map((row, i) => {
              const isUnused =
                referencedVars &&
                row.key.trim() &&
                !referencedVars.has(row.key.trim());
              return (
                <div
                  key={i}
                  ref={(el) => {
                    if (el && row.key) rowRefs.current.set(row.key, el);
                  }}
                  className={`grid grid-cols-[1fr_1fr_auto] items-center border-b border-border-subtle last:border-b-0 transition-colors duration-500 ${
                    activeHighlight && row.key === activeHighlight
                      ? "bg-info/10 ring-1 ring-info/30"
                      : isUnused
                        ? "bg-amber-500/[0.04]"
                        : ""
                  }`}
                >
                  <div className="flex items-center border-r border-border-subtle">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => setRow(i, "key", e.target.value)}
                      placeholder="KEY"
                      spellCheck={false}
                      className={`bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted focus:outline-none flex-1 min-w-0 ${
                        isUnused ? "text-amber-400/70" : "text-primary"
                      }`}
                    />
                    {isUnused && (
                      <span
                        className="text-[9px] font-medium text-amber-400/60 uppercase tracking-wider pr-2 shrink-0"
                        title={`$\{${row.key}\} is not referenced in the compose YAML`}
                      >
                        unused
                      </span>
                    )}
                  </div>
                  <div className="flex items-center border-r border-border-subtle min-w-0">
                    <input
                      type={
                        isMasked(row.key) && !revealAll && !revealed.has(i)
                          ? "password"
                          : "text"
                      }
                      value={row.value}
                      onChange={(e) => setRow(i, "value", e.target.value)}
                      placeholder="value"
                      spellCheck={false}
                      autoComplete="off"
                      aria-label={`Value of ${row.key || "new variable"}`}
                      className={`bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted focus:outline-none flex-1 min-w-0 ${
                        isUnused ? "text-muted" : "text-secondary"
                      }`}
                    />
                    {isMasked(row.key) &&
                      !revealAll &&
                      row.value &&
                      row.value !== "***" && (
                        <button
                          type="button"
                          onClick={() => toggleReveal(i)}
                          className="px-2 text-dimmed hover:text-secondary transition-colors"
                          aria-label={`${revealed.has(i) ? "Hide" : "Reveal"} ${row.key}`}
                          title={revealed.has(i) ? "Hide" : "Reveal"}
                        >
                          <FontAwesomeIcon
                            icon={revealed.has(i) ? faEyeSlash : faEye}
                            className="h-3 w-3"
                          />
                        </button>
                      )}
                  </div>
                  <div className="flex items-center">
                    {onToggleSecret &&
                      row.key.trim() &&
                      (() => {
                        const secret = secretKeys?.has(row.key.trim()) ?? false;
                        const locked = secret && !canUnmarkSecrets;
                        return (
                          <button
                            type="button"
                            onClick={() => onToggleSecret(row.key.trim())}
                            disabled={locked}
                            className={`pl-3 pr-1 transition-colors disabled:cursor-not-allowed ${secret ? "text-pending" : "text-dimmed hover:text-secondary"}`}
                            aria-pressed={secret}
                            aria-label={`${secret ? "Unmark" : "Mark"} ${row.key} as secret`}
                            title={
                              locked
                                ? "Secret — only an admin can unmark it"
                                : secret
                                  ? "Secret: masked for non-admins. Click to unmark"
                                  : "Mark as secret (masked for non-admins)"
                            }
                          >
                            <FontAwesomeIcon
                              icon={secret ? faLock : faLockOpen}
                              className="h-3 w-3"
                            />
                          </button>
                        );
                      })()}
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="px-3 text-dimmed hover:text-failed transition-colors text-base leading-none"
                      aria-label={`Remove ${row.key || "variable"}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
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
