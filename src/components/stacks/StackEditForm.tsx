"use client";

import { useState } from "react";
import { Stack, Worker } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StackEditFormProps {
  stack: Stack;
  workers: Worker[];
  onSave: (data: {
    name: string;
    description: string;
    worker_id: string;
    strategy: string;
    auto_deploy: boolean;
    placement_constraints: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export function StackEditForm({
  stack,
  workers,
  onSave,
  onCancel,
}: StackEditFormProps) {
  const [editStackName, setEditStackName] = useState(stack.name);
  const [editStackDescription, setEditStackDescription] = useState(
    stack.description ?? "",
  );
  const [editStackWorkerId, setEditStackWorkerId] = useState(
    stack.worker_id?.toString() ?? "",
  );
  const [editStackStrategy, setEditStackStrategy] = useState(
    stack.deployment_strategy,
  );
  const [editStackAutoDeploy, setEditStackAutoDeploy] = useState(
    stack.auto_deploy,
  );
  const [editPlacementConstraints, setEditPlacementConstraints] = useState(stack.placement_constraints ?? "");
  const [savingStack, setSavingStack] = useState(false);

  const handleSave = async () => {
    setSavingStack(true);
    await onSave({
      name: editStackName.trim(),
      description: editStackDescription.trim(),
      worker_id: editStackWorkerId,
      strategy: editStackStrategy,
      auto_deploy: editStackAutoDeploy,
      placement_constraints: editPlacementConstraints.trim(),
    });
    setSavingStack(false);
  };

  return (
    <div className="card p-5 mb-5">
      <h2 className="text-sm font-medium text-primary mb-4">Edit Stack</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            id="edit-stack-name"
            label="Name"
            value={editStackName}
            onChange={(e) => setEditStackName(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-secondary uppercase tracking-wider">
              Worker
            </label>
            <select
              value={editStackWorkerId}
              onChange={(e) => setEditStackWorkerId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
            >
              <option value="">Unassigned</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.hostname})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-secondary uppercase tracking-wider">
            Description
          </label>
          <textarea
            rows={2}
            value={editStackDescription}
            onChange={(e) => setEditStackDescription(e.target.value)}
            placeholder="Optional description..."
            className="w-full rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-border-emphasis focus:outline-none resize-none"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-secondary uppercase tracking-wider">
              Deployment Strategy
            </label>
            <select
              value={editStackStrategy}
              onChange={(e) => setEditStackStrategy(e.target.value as Stack["deployment_strategy"])}
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
            >
              <option value="rolling">Rolling</option>
              <option value="blue-green">Blue-Green</option>
              <option value="canary">Canary</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-secondary uppercase tracking-wider">
              Auto Deploy
            </label>
            <div className="flex items-center h-9 gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={editStackAutoDeploy}
                onClick={() => setEditStackAutoDeploy(!editStackAutoDeploy)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${editStackAutoDeploy ? "bg-info" : "bg-border-strong"}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editStackAutoDeploy ? "translate-x-4" : "translate-x-0"}`}
                />
              </button>
              <span className="text-sm text-secondary">
                {editStackAutoDeploy ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="text-[10px] text-muted mt-1">
              Watches registries for new image versions. Each container must have a registry linked (set via container edit) for updates to be detected. Configure a webhook for &quot;image.updated&quot; to receive notifications.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-secondary uppercase tracking-wider">
            Placement Constraints
          </label>
          <input
            value={editPlacementConstraints}
            onChange={(e) => setEditPlacementConstraints(e.target.value)}
            placeholder='e.g. {"env":"production","gpu":"true"}'
            className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary placeholder:text-muted focus:border-border-emphasis focus:outline-none font-mono"
          />
          <p className="text-[10px] text-muted">JSON key-value pairs that the target worker&apos;s labels must match</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={savingStack || !editStackName.trim()}
          >
            {savingStack ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
