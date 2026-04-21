"use client";

import { useState } from "react";
import type { Worker } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reqUpdateWorker } from "@/services/workers.service";

export interface WorkerEditFormProps {
  worker: Worker;
  onSaved: (updated: Worker) => void;
  onCancel: () => void;
}

export default function WorkerEditForm({ worker, onSaved, onCancel }: WorkerEditFormProps) {
  const [editName, setEditName] = useState(worker.name);
  const [editHostname, setEditHostname] = useState(worker.hostname);
  const [editLabels, setEditLabels] = useState(worker.labels ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await reqUpdateWorker(worker.id, {
      name: editName.trim(),
      hostname: editHostname.trim(),
      labels: editLabels.trim() || undefined,
    });
    if (res.success) {
      onSaved(res.data);
    }
    setSaving(false);
  };

  return (
    <div className="card p-5">
      <h2 className="text-sm font-medium text-primary mb-4">Edit Worker</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Input
          id="edit-name"
          label="Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <Input
          id="edit-hostname"
          label="Hostname"
          value={editHostname}
          onChange={(e) => setEditHostname(e.target.value)}
        />
        <Input
          id="edit-labels"
          label="Labels"
          placeholder="e.g. env=production,region=us-east"
          value={editLabels}
          onChange={(e) => setEditLabels(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !editName.trim() || !editHostname.trim()}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
