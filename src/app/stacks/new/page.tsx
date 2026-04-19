"use client";

import { useEffect, useState, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Worker } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { reqImportCompose } from "@/services/stacks.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeEditor } from "@/components/ui/code-editor";
import { Alert } from "@/components/ui/alert";

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

export default function NewStackPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workerId, setWorkerId] = useState<string>("");
  const [strategy, setStrategy] = useState("rolling");
  const [composeYaml, setComposeYaml] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await reqGetWorkers();
      if (res.success) setWorkers(res.data ?? []);
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await reqImportCompose({
      name,
      description: description || undefined,
      worker_id: workerId ? Number(workerId) : undefined,
      deployment_strategy: strategy,
      compose_yaml: composeYaml,
    });
    if (res.success) {
      router.push(`/stacks/${res.data.id}`);
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
      if (!name) {
        setName(extractStackName(content, file.name));
      }
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

        {/* Compose YAML editor with drag/drop */}
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
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
