"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Worker } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { reqCreateStack } from "@/services/stacks.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewStackPage() {
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workerId, setWorkerId] = useState<string>("");
  const [strategy, setStrategy] = useState("rolling");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    const res = await reqCreateStack({
      name,
      description: description || undefined,
      worker_id: workerId ? Number(workerId) : undefined,
      deployment_strategy: strategy,
      auto_deploy: autoDeploy,
    });

    if (res.success) {
      router.push(`/stacks/${res.data.id}`);
    } else {
      setError(res.error_message || "Failed to create stack");
    }
    setSubmitting(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Create Stack</h1>
        <p className="text-sm text-[#888888] mt-1">Define a new container stack</p>
      </div>

      <div className="max-w-xl">
        <form onSubmit={handleSubmit} className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6 space-y-5">
          <Input
            id="name"
            label="Name"
            placeholder="my-stack"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-xs font-medium text-[#888888] uppercase tracking-wider">
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
            <label htmlFor="worker" className="text-xs font-medium text-[#888888] uppercase tracking-wider">
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
            <label htmlFor="strategy" className="text-xs font-medium text-[#888888] uppercase tracking-wider">
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

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={autoDeploy}
              onClick={() => setAutoDeploy(!autoDeploy)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                autoDeploy ? "bg-[#3b82f6]" : "bg-[#2a2a2a]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  autoDeploy ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <label className="text-sm text-[#888888]">Auto Deploy</label>
          </div>

          {error && <p className="text-xs text-[#f87171]">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating..." : "Create Stack"}
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
