"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import type { Container, Registry } from "@/types";
import { reqUpdateContainer } from "@/services/stacks.service";
import { reqGetRegistries } from "@/services/registries.service";
import { CodeEditor } from "@/components/ui/code-editor";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-lg border border-border-strong bg-background-alt px-3 py-1.5 text-sm text-primary placeholder-[#444444] focus:border-[#3b82f6] focus:outline-none";

export interface ContainerEditFormProps {
  container: Container;
  onSave: () => void;
  onCancel: () => void;
}

export function ContainerEditForm({
  container,
  onSave,
  onCancel,
}: ContainerEditFormProps) {
  const [editName, setEditName] = useState(container.name);
  const [editImage, setEditImage] = useState(container.image);
  const [editTag, setEditTag] = useState(container.tag);
  const [editRestartPolicy, setEditRestartPolicy] = useState(
    container.restart_policy ?? "",
  );
  const [editCommand, setEditCommand] = useState(container.command ?? "");
  const [editEntrypoint, setEditEntrypoint] = useState(
    container.entrypoint ?? "",
  );
  const [editCpuLimit, setEditCpuLimit] = useState(
    container.cpu_limit != null ? String(container.cpu_limit) : "",
  );
  const [editMemoryLimit, setEditMemoryLimit] = useState(
    container.memory_limit != null ? String(container.memory_limit) : "",
  );
  const [editReplicas, setEditReplicas] = useState(String(container.replicas));
  const [editEnvVars, setEditEnvVars] = useState(container.env_vars ?? "");
  const [editPortMappings, setEditPortMappings] = useState(
    container.port_mappings ?? "",
  );
  const [editVolumes, setEditVolumes] = useState(container.volumes ?? "");
  const [editHealthCheck, setEditHealthCheck] = useState(
    container.health_check ?? "",
  );
  const [editRegistryId, setEditRegistryId] = useState(
    container.registry_id != null ? String(container.registry_id) : "",
  );
  const [editDependsOn, setEditDependsOn] = useState(container.depends_on ?? "");
  const [saving, setSaving] = useState(false);
  const [registries, setRegistries] = useState<Registry[]>([]);

  useEffect(() => {
    reqGetRegistries().then(res => { if (res.success) setRegistries(res.data ?? []); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const toastId = toast.loading("Saving container config\u2026");
    const res = await reqUpdateContainer(container.id, {
      name: editName || undefined,
      image: editImage || undefined,
      tag: editTag || undefined,
      restart_policy: editRestartPolicy || undefined,
      command: editCommand || null,
      entrypoint: editEntrypoint || null,
      cpu_limit: editCpuLimit ? Number(editCpuLimit) : null,
      memory_limit: editMemoryLimit ? Number(editMemoryLimit) : null,
      replicas: editReplicas ? Number(editReplicas) : undefined,
      env_vars: editEnvVars || null,
      port_mappings: editPortMappings || null,
      volumes: editVolumes || null,
      health_check: editHealthCheck || null,
      registry_id: editRegistryId ? Number(editRegistryId) : null,
      depends_on: editDependsOn || null,
    } as Partial<Container>);
    setSaving(false);
    if (res.success) {
      toast.success("Container config saved", { id: toastId });
      onSave();
    } else {
      toast.error(`Save failed: ${res.error_message ?? "unknown error"}`, {
        id: toastId,
      });
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faPenToSquare}
          className="h-3.5 w-3.5 text-muted"
        />
        <span>Edit Container</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Image
            </label>
            <input
              value={editImage}
              onChange={(e) => setEditImage(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Tag
            </label>
            <input
              value={editTag}
              onChange={(e) => setEditTag(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Restart Policy
            </label>
            <select
              value={editRestartPolicy}
              onChange={(e) => setEditRestartPolicy(e.target.value)}
              className={inputClass}
            >
              <option value="">none</option>
              <option value="always">always</option>
              <option value="unless-stopped">unless-stopped</option>
              <option value="on-failure">on-failure</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              CPU Limit (cores)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={editCpuLimit}
              onChange={(e) => setEditCpuLimit(e.target.value)}
              placeholder="e.g. 0.5"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Memory Limit (MB)
            </label>
            <input
              type="number"
              min="0"
              value={editMemoryLimit}
              onChange={(e) => setEditMemoryLimit(e.target.value)}
              placeholder="e.g. 512"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Replicas
            </label>
            <input
              type="number"
              min="1"
              value={editReplicas}
              onChange={(e) => setEditReplicas(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Command
            </label>
            <input
              value={editCommand}
              onChange={(e) => setEditCommand(e.target.value)}
              placeholder="e.g. npm start"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Entrypoint
            </label>
            <input
              value={editEntrypoint}
              onChange={(e) => setEditEntrypoint(e.target.value)}
              placeholder="e.g. /bin/sh"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Registry
            </label>
            <select
              value={editRegistryId}
              onChange={(e) => setEditRegistryId(e.target.value)}
              className={inputClass}
            >
              <option value="">None (no image watching)</option>
              {registries.map(r => (
                <option key={r.id} value={r.id}>{r.name} — {r.url}</option>
              ))}
            </select>
            <p className="text-[9px] text-muted mt-1">Link to a registry to enable automatic image update detection</p>
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Depends On
            </label>
            <input
              value={editDependsOn}
              onChange={(e) => setEditDependsOn(e.target.value)}
              placeholder='e.g. ["db", "redis"]'
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Environment Variables (JSON)
            </label>
            <CodeEditor
              rows={4}
              value={editEnvVars}
              onChange={setEditEnvVars}
              placeholder={'{"KEY": "value"}'}
              language="json"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Port Mappings (JSON)
            </label>
            <CodeEditor
              rows={4}
              value={editPortMappings}
              onChange={setEditPortMappings}
              placeholder={
                '[{"host_port": "8080", "container_port": "80"}]'
              }
              language="json"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Volumes (JSON)
            </label>
            <CodeEditor
              rows={4}
              value={editVolumes}
              onChange={setEditVolumes}
              placeholder={'[{"host": "/data", "container": "/app/data"}]'}
              language="json"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">
              Health Check (JSON)
            </label>
            <CodeEditor
              rows={4}
              value={editHealthCheck}
              onChange={setEditHealthCheck}
              placeholder={
                '{"test": ["CMD", "curl", "-f", "http://localhost"], "interval": "30s", "timeout": "10s", "retries": 3}'
              }
              language="json"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving\u2026" : "Save Changes"}
          </Button>
          <Button onClick={onCancel} variant="ghost" size="sm">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
