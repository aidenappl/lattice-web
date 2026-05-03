"use client";

import { useEffect, useState, useRef, useMemo, useCallback, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faPlus,
  faCheck,
  faArrowsRotate,
  faRightLeft,
  faFlask,
  faFileCode,
} from "@fortawesome/free-solid-svg-icons";
import { Worker, Template } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import {
  reqImportCompose,
  reqUpdateStack,
  reqGetContainers,
  reqUpdateContainer,
} from "@/services/stacks.service";
import { reqGetTemplates } from "@/services/templates.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeEditor } from "@/components/ui/code-editor";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-modal";
import yaml from "js-yaml";

type EnvRow = { id: number; key: string; value: string };

const STRATEGY_OPTIONS = [
  {
    value: "rolling",
    label: "Rolling",
    description: "Update containers one at a time with automatic health checks between each.",
    detail: "Best for most workloads",
    color: "#3b82f6",
    icon: faArrowsRotate,
    bullets: ["Sequential updates", "Low resource overhead", "Brief per-container downtime"],
  },
  {
    value: "blue-green",
    label: "Blue / Green",
    description: "Spin up a parallel environment, verify health, then atomically swap traffic.",
    detail: "Zero-downtime deployments",
    color: "#22c55e",
    icon: faRightLeft,
    bullets: ["Zero downtime", "Instant rollback", "2× resources during deploy"],
  },
  {
    value: "canary",
    label: "Canary",
    description: "Deploy a single canary container, monitor for 30 s, then roll out if healthy.",
    detail: "Safest for critical services",
    color: "#f59e0b",
    icon: faFlask,
    bullets: ["Health-gated promotion", "Automatic rollback", "Minimal blast radius"],
  },
];

function extractStackName(yamlStr: string, filename?: string): string {
  if (filename) {
    const base = filename
      .replace(/\.(ya?ml)$/i, "")
      .replace(/docker-compose\.?/i, "")
      .trim();
    if (base) return base;
  }
  const match = yamlStr.match(/services:\s*\n\s+(\S+):/);
  if (match) return match[1];
  return "";
}

function extractEnvVarKeys(yamlStr: string): string[] {
  const matches = yamlStr.match(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(2, -1))));
}

export default function NewStackPage() {
  const router = useRouter();
  const showConfirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const envIdCounter = useRef(0);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workerId, setWorkerId] = useState<string>("");
  const [strategy, setStrategy] = useState("rolling");
  const [composeYaml, setComposeYaml] = useState("");
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    document.title = "Lattice - Create Stack";
  }, []);

  useEffect(() => {
    reqGetWorkers().then((res) => {
      if (res.success) setWorkers(res.data ?? []);
    });
    reqGetTemplates().then((res) => {
      if (res.success) setTemplates(res.data ?? []);
    });
  }, []);

  // Auto-populate env rows from ${KEY} references detected in compose YAML
  useEffect(() => {
    const detectedKeys = extractEnvVarKeys(composeYaml);
    setEnvRows((prev) => {
      const existingKeys = new Set(prev.map((r) => r.key));
      const toAdd = detectedKeys.filter((k) => !existingKeys.has(k));
      if (toAdd.length === 0) return prev;
      return [
        ...prev,
        ...toAdd.map((k) => {
          envIdCounter.current += 1;
          return { id: envIdCounter.current, key: k, value: "" };
        }),
      ];
    });
  }, [composeYaml]);

  const envVarMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of envRows) {
      if (row.key.trim()) map[row.key.trim()] = row.value;
    }
    return map;
  }, [envRows]);

  const referencedKeys = useMemo(
    () => extractEnvVarKeys(composeYaml),
    [composeYaml],
  );

  const definedCount = referencedKeys.filter(
    (k) => k in envVarMap && envVarMap[k].trim() !== "",
  ).length;
  const missingCount = referencedKeys.length - definedCount;

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;
    const tmpl = templates.find((t) => String(t.id) === templateId);
    if (!tmpl) return;
    try {
      const config = JSON.parse(tmpl.config);
      const stackCfg = config.stack;
      if (stackCfg) {
        if (stackCfg.name && !name) setName(stackCfg.name);
        if (stackCfg.description) setDescription(stackCfg.description);
        if (stackCfg.deployment_strategy) setStrategy(stackCfg.deployment_strategy);
        if (stackCfg.compose_yaml) setComposeYaml(stackCfg.compose_yaml);
        if (stackCfg.env_vars) {
          try {
            const envObj: Record<string, string> = JSON.parse(stackCfg.env_vars);
            const rows: EnvRow[] = Object.entries(envObj).map(([key, value]) => {
              envIdCounter.current += 1;
              return { id: envIdCounter.current, key, value };
            });
            setEnvRows(rows);
          } catch {
            // env_vars not valid JSON, skip
          }
        }
      }
    } catch {
      // config not valid JSON
    }
  };

  const hasChanges =
    name.trim() !== "" ||
    description.trim() !== "" ||
    composeYaml.trim() !== "" ||
    envRows.some((r) => r.value.trim() !== "");

  const handleCancel = async () => {
    if (hasChanges) {
      const confirmed = await showConfirm({
        title: "Discard changes?",
        message:
          "You have unsaved changes that will be lost. Are you sure you want to leave?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        variant: "warning",
      });
      if (!confirmed) return;
    }
    router.back();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const missingKeys = referencedKeys.filter(
      (k) => !(k in envVarMap) || envVarMap[k].trim() === "",
    );
    if (missingKeys.length > 0) {
      setError(
        `The following environment variables are referenced but have no value: ${missingKeys.join(", ")}`,
      );
      return;
    }

    setSubmitting(true);
    const res = await reqImportCompose({
      name,
      description: description || undefined,
      worker_id: workerId ? Number(workerId) : undefined,
      deployment_strategy: strategy,
      compose_yaml: composeYaml,
    });
    if (res.success) {
      const stackId = res.data.id;

      // Save env vars to the stack record.
      if (Object.keys(envVarMap).length > 0) {
        await reqUpdateStack(stackId, {
          env_vars: JSON.stringify(envVarMap),
        });
      }

      // Resolve ${KEY} placeholders in each container's env_vars.
      if (Object.keys(envVarMap).length > 0) {
        const containersRes = await reqGetContainers(stackId);
        if (containersRes.success && containersRes.data) {
          const PLACEHOLDER = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
          for (const container of containersRes.data) {
            if (!container.env_vars) continue;
            let envObj: Record<string, string>;
            try {
              envObj = JSON.parse(container.env_vars);
            } catch {
              continue;
            }
            let changed = false;
            for (const [k, v] of Object.entries(envObj)) {
              const m = PLACEHOLDER.exec(v);
              if (m && m[1] in envVarMap && envVarMap[m[1]].trim() !== "") {
                envObj[k] = envVarMap[m[1]];
                changed = true;
              }
            }
            if (changed) {
              await reqUpdateContainer(container.id, {
                env_vars: JSON.stringify(envObj),
              });
            }
          }
        }
      }

      router.push(`/stacks/${stackId}`);
    } else {
      setError(res.error_message || "Failed to import compose file");
    }
    setSubmitting(false);
  };

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(ya?ml)$/i)) {
      setError("Please drop a .yml or .yaml file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setComposeYaml(content);
      if (!name) setName(extractStackName(content, file.name));
      setError("");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

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
      setComposeYaml(formatted.trimEnd() + "\n");
    } catch (err) {
      setError(err instanceof Error ? `Format failed: ${err.message}` : "Invalid YAML");
    }
  }, [composeYaml]);

  const updateEnvRow = (id: number, field: "key" | "value", val: string) => {
    setEnvRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
    );
  };

  const removeEnvRow = (id: number) => {
    setEnvRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addEnvRow = () => {
    envIdCounter.current += 1;
    setEnvRows((prev) => [
      ...prev,
      { id: envIdCounter.current, key: "", value: "" },
    ]);
  };

  const selectedStrategy = STRATEGY_OPTIONS.find((s) => s.value === strategy)!;

  return (
    <div className="py-6">
      <div className="mb-8">
        <h1 className="page-title text-xl">Create Stack</h1>
        <p className="text-sm text-secondary mt-1">
          Deploy a Docker Compose application to a worker
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
        {/* ── Step 1: Deployment Strategy ───────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white text-xs font-bold shrink-0">
              1
            </div>
            <div>
              <h2 className="text-sm font-semibold text-primary">Deployment Strategy</h2>
              <p className="text-xs text-muted">How containers are updated when you redeploy</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STRATEGY_OPTIONS.map((opt) => {
              const isSelected = strategy === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStrategy(opt.value)}
                  className={`relative flex flex-col gap-3 rounded-xl border-2 p-5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-border-strong bg-surface-elevated hover:border-border-emphasis hover:bg-surface-alt"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)]">
                      <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: opt.color + "22" }}
                  >
                    <FontAwesomeIcon
                      icon={opt.icon}
                      className="h-5 w-5"
                      style={{ color: opt.color }}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-primary">{opt.label}</p>
                    <p className="text-xs text-muted mt-0.5">{opt.detail}</p>
                  </div>

                  <p className="text-xs text-secondary leading-relaxed">{opt.description}</p>

                  <ul className="space-y-1">
                    {opt.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-1.5 text-xs text-muted">
                        <span
                          className="h-1 w-1 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
                        />
                        {b}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Step 2: Stack Setup ────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white text-xs font-bold shrink-0">
              2
            </div>
            <div>
              <h2 className="text-sm font-semibold text-primary">Stack Setup</h2>
              <p className="text-xs text-muted">Name your stack and assign it to a worker</p>
            </div>
          </div>

          <div className="card p-6 space-y-5">
            {/* Template selector */}
            {templates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="template"
                  className="text-xs font-medium text-secondary uppercase tracking-wider"
                >
                  Start from Template
                </label>
                <select
                  id="template"
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                >
                  <option value="">Blank stack…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.description ? ` — ${t.description}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted">
                  Select a template to pre-fill the form with a saved stack configuration.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="name"
                label="Name"
                placeholder="my-stack"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="worker"
                  className="text-xs font-medium text-secondary uppercase tracking-wider"
                >
                  Worker
                </label>
                <select
                  id="worker"
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                >
                  <option value="">Select a worker…</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.hostname})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="description"
                className="text-xs font-medium text-secondary uppercase tracking-wider"
              >
                Description{" "}
                <span className="text-muted normal-case font-normal">(optional)</span>
              </label>
              <textarea
                id="description"
                rows={2}
                placeholder="Brief description of what this stack does…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-border-emphasis focus:outline-none resize-none"
              />
            </div>

            {/* Selected strategy summary */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2">
              <FontAwesomeIcon
                icon={selectedStrategy.icon}
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: selectedStrategy.color }}
              />
              <p className="text-xs text-secondary">
                Using{" "}
                <span className="font-medium text-primary">{selectedStrategy.label}</span>{" "}
                deployment — {selectedStrategy.detail.toLowerCase()}.{" "}
                <button
                  type="button"
                  className="text-[var(--brand)] hover:underline"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                >
                  Change
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* ── Step 3: Docker Compose ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white text-xs font-bold shrink-0">
              3
            </div>
            <div>
              <h2 className="text-sm font-semibold text-primary">Docker Compose</h2>
              <p className="text-xs text-muted">Paste, type, or drag and drop a compose file</p>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yml,.yaml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FontAwesomeIcon icon={faFileCode} className="h-3.5 w-3.5 mr-1.5" />
                  Browse file
                </Button>
                {composeYaml && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleFormat}
                    >
                      Format
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setComposeYaml("")}
                    >
                      Clear
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted">
                Drag and drop a <code className="font-mono text-secondary">.yml</code> file anywhere
              </p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative rounded-lg transition-colors ${
                dragOver
                  ? "ring-2 ring-[#3b82f6] ring-offset-1 ring-offset-[#111111]"
                  : ""
              }`}
            >
              {dragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-info/10 border-2 border-dashed border-[#3b82f6]">
                  <p className="text-sm text-info font-medium">Drop file here</p>
                </div>
              )}
              <CodeEditor
                rows={20}
                language="yaml"
                envVars={envVarMap}
                placeholder={`services:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    restart: unless-stopped`}
                value={composeYaml}
                onChange={(v) => {
                  setComposeYaml(v);
                  if (!name && v) {
                    setName(extractStackName(v));
                  }
                }}
              />
            </div>

            <div className="mt-3 rounded-lg border border-border-subtle bg-surface-alt p-3">
              <p className="text-xs text-secondary font-medium mb-1">Image Update Watching</p>
              <p className="text-[11px] text-muted leading-relaxed">
                To enable automatic image update detection, link each container to a registry after
                creating the stack. Go to the stack detail page, edit each container, and select a
                registry from the dropdown. Enable &quot;Auto Deploy&quot; to trigger deployments
                automatically when new images are detected.
              </p>
            </div>
          </div>
        </div>

        {/* ── Step 4: Environment Variables ─────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white text-xs font-bold shrink-0">
              4
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-primary">Environment Variables</h2>
                {referencedKeys.length > 0 && (
                  <div className="flex items-center gap-3">
                    {definedCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-healthy">
                        <span className="h-1.5 w-1.5 rounded-full bg-healthy shrink-0" />
                        {definedCount} defined
                      </span>
                    )}
                    {missingCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-failed">
                        <span className="h-1.5 w-1.5 rounded-full bg-failed shrink-0" />
                        {missingCount} missing
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted">
                Values for{" "}
                <code className="text-secondary font-mono">{"${VAR}"}</code>{" "}
                references in your compose file — auto-detected as you type
              </p>
            </div>
          </div>

          <div className="card p-6">
            <div className="rounded-lg border border-border-strong overflow-hidden">
              {envRows.length > 0 ? (
                <>
                  <div className="grid grid-cols-[1fr_1fr_auto] text-xs text-muted uppercase tracking-wider px-3 py-2 border-b border-border-strong bg-background-alt">
                    <span>Key</span>
                    <span>Value</span>
                    <span />
                  </div>
                  {envRows.map((row) => {
                    const trimmedKey = row.key.trim();
                    const isReferenced = referencedKeys.includes(trimmedKey);
                    const isDefined = trimmedKey !== "" && row.value.trim() !== "";
                    const keyColorClass = isReferenced
                      ? isDefined
                        ? "text-healthy"
                        : "text-failed"
                      : "text-primary";

                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1fr_1fr_auto] items-center border-b border-border-subtle last:border-b-0"
                      >
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) => updateEnvRow(row.id, "key", e.target.value)}
                          placeholder="KEY"
                          spellCheck={false}
                          className={`bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted focus:outline-none border-r border-border-subtle ${keyColorClass}`}
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => updateEnvRow(row.id, "value", e.target.value)}
                          placeholder="value"
                          spellCheck={false}
                          className="bg-transparent px-3 py-2 text-sm text-primary font-mono placeholder:text-muted focus:outline-none border-r border-border-subtle"
                        />
                        <button
                          type="button"
                          onClick={() => removeEnvRow(row.id)}
                          className="px-3 py-2 text-muted hover:text-failed transition-colors"
                          aria-label="Remove variable"
                        >
                          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs text-muted">
                    No environment variables. Add one below, or reference{" "}
                    <code className="font-mono text-secondary">{"${VAR}"}</code>{" "}
                    in your compose file to auto-detect.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={addEnvRow}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
              Add variable
            </button>
          </div>
        </div>

        {error && (
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}

        <div className="flex gap-3 pb-6">
          <Button
            type="submit"
            disabled={submitting || !name.trim() || !composeYaml.trim()}
            loading={submitting}
          >
            Import Stack
          </Button>
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
