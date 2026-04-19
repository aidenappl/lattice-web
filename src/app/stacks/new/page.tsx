"use client";

import { useEffect, useState, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Worker } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { reqImportCompose } from "@/services/stacks.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeEditor } from "@/components/ui/code-editor";

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

      <div className="max-w-xl">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6 space-y-5"
        >
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
              htmlFor="description"
              className="text-xs font-medium text-[#888888] uppercase tracking-wider"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50 resize-none"
            />
          </div>

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
              className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
            >
              <option value="">Select a worker...</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.hostname})
                </option>
              ))}
            </select>
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
              className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
            >
              <option value="rolling">Rolling</option>
              <option value="blue-green">Blue-Green</option>
              <option value="canary">Canary</option>
            </select>
          </div>

          {/* Compose YAML */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="compose"
              className="text-xs font-medium text-[#888888] uppercase tracking-wider"
            >
              Docker Compose YAML
            </label>
            {!composeYaml ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#3b82f6] bg-[#3b82f6]/5"
                    : "border-[#2a2a2a] bg-[#161616] hover:border-[#444444]"
                }`}
              >
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
                <svg
                  className="w-8 h-8 text-[#555555] mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm text-[#888888]">
                  Drop a{" "}
                  <span className="text-white font-medium">
                    docker-compose.yml
                  </span>{" "}
                  file here
                </p>
                <p className="text-xs text-[#555555] mt-1">
                  or click to browse — or paste below
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setComposeYaml(" ");
                  }}
                  className="mt-3 text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                >
                  Paste manually instead
                </button>
              </div>
            ) : (
              <div className="relative">
                <CodeEditor
                  rows={16}
                  language="yaml"
                  placeholder={`version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"`}
                  value={composeYaml.trim() === "" ? "" : composeYaml}
                  onChange={(v) => {
                    setComposeYaml(v);
                    if (!name && v) {
                      setName(extractStackName(v));
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setComposeYaml("")}
                  className="absolute top-2 right-2 text-xs text-[#555555] hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-[#f87171]">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitting || !name.trim() || !composeYaml.trim()}
            >
              {submitting ? "Creating..." : "Import Stack"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
