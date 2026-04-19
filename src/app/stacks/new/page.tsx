"use client";

import { useEffect, useState, useRef, useMemo, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Worker } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import {
  reqImportCompose,
  reqUpdateStack,
  reqGetContainers,
  reqUpdateContainer,
} from "@/services/stacks.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeEditor } from "@/components/ui/code-editor";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-modal";

type EnvRow = { id: number; key: string; value: string };

function extractStackName(yaml: string, filename?: string): string {
  if (filename) {
    const base = filename
      .replace(/\.(ya?ml)$/i, "")
      .replace(/docker-compose\.?/i, "")
      .trim();
    if (base) return base;
  }
  const match = yaml.match(/services:\s*\n\s+(\S+):/);
  if (match) return match[1];
  return "";
}

function extractEnvVarKeys(yaml: string): string[] {
  const matches = yaml.match(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(2, -1))));
}

export default function NewStackPage() {
  const router = useRouter();
  const showConfirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const envIdCounter = useRef(0);

  const [workers, setWorkers] = useState<Worker[]>([]);
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
      // The import endpoint stores them verbatim from the compose file, but
      // HandleDeployStack merges stack env vars as base and container env vars
      // as override — so a container value of "${KEY}" would override the real
      // stack value and the literal string would reach Docker. We patch them
      // here so containers hold the resolved values before any deploy.
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

  // ── Env row handlers ────────────────────────────────────────────────────────

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Create Stack</h1>
        <p className="text-sm text-[#888888] mt-1">
          Import a Docker Compose file to create a new stack
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Stack info */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6">
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
                className="text-xs font-medium text-[#888888] uppercase tracking-wider"
              >
                Worker
              </label>
              <select
                id="worker"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none"
              >
                <option value="">Select a worker...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.hostname})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="description"
                className="text-xs font-medium text-[#888888] uppercase tracking-wider"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={2}
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="strategy"
                className="text-xs font-medium text-[#888888] uppercase tracking-wider"
              >
                Deployment Strategy
              </label>
              <select
                id="strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none"
              >
                <option value="rolling">Rolling</option>
                <option value="blue-green">Blue-Green</option>
                <option value="canary">Canary</option>
              </select>
            </div>
          </div>
        </div>

        {/* Compose YAML editor */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Docker Compose
              </h2>
              <p className="text-xs text-[#555555] mt-0.5">
                Paste or drop a docker-compose.yml file
              </p>
            </div>
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
                Browse file
              </Button>
              {composeYaml && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setComposeYaml("")}
                >
                  Clear
                </Button>
              )}
            </div>
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
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[#3b82f6]/10 border-2 border-dashed border-[#3b82f6]">
                <p className="text-sm text-[#3b82f6] font-medium">
                  Drop file here
                </p>
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
        </div>

        {/* Environment Variables */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Environment Variables
              </h2>
              <p className="text-xs text-[#555555] mt-0.5">
                Values for{" "}
                <code className="text-[#888888] font-mono">{"${VAR}"}</code>{" "}
                references in your compose file
              </p>
            </div>
            {referencedKeys.length > 0 && (
              <div className="flex items-center gap-3">
                {definedCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-[#22c55e]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shrink-0" />
                    {definedCount} defined
                  </span>
                )}
                {missingCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-[#ef4444]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444] shrink-0" />
                    {missingCount} missing
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
            {envRows.length > 0 ? (
              <>
                <div className="grid grid-cols-[1fr_1fr_auto] text-xs text-[#555555] uppercase tracking-wider px-3 py-2 border-b border-[#2a2a2a] bg-[#0d0d0d]">
                  <span>Key</span>
                  <span>Value</span>
                  <span />
                </div>
                {envRows.map((row) => {
                  const trimmedKey = row.key.trim();
                  const isReferenced = referencedKeys.includes(trimmedKey);
                  const isDefined =
                    trimmedKey !== "" && row.value.trim() !== "";
                  const keyColorClass = isReferenced
                    ? isDefined
                      ? "text-[#22c55e]"
                      : "text-[#ef4444]"
                    : "text-white";

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_1fr_auto] items-center border-b border-[#1a1a1a] last:border-b-0"
                    >
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) =>
                          updateEnvRow(row.id, "key", e.target.value)
                        }
                        placeholder="KEY"
                        spellCheck={false}
                        className={`bg-transparent px-3 py-2 text-sm font-mono placeholder:text-[#333333] focus:outline-none border-r border-[#1a1a1a] ${keyColorClass}`}
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) =>
                          updateEnvRow(row.id, "value", e.target.value)
                        }
                        placeholder="value"
                        spellCheck={false}
                        className="bg-transparent px-3 py-2 text-sm text-white font-mono placeholder:text-[#333333] focus:outline-none border-r border-[#1a1a1a]"
                      />
                      <button
                        type="button"
                        onClick={() => removeEnvRow(row.id)}
                        className="px-3 py-2 text-[#555555] hover:text-[#ef4444] transition-colors"
                        aria-label="Remove variable"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[#555555]">
                  No environment variables. Add one below, or reference{" "}
                  <code className="font-mono text-[#888888]">{"${VAR}"}</code>{" "}
                  in your compose file to auto-detect.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={addEnvRow}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#555555] hover:text-white transition-colors"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add variable
          </button>
        </div>

        {error && (
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}

        <div className="flex gap-3">
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
