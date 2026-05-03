"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import type { BackupDestination, BackupDestinationType, Worker } from "@/types";
import {
  reqGetBackupDestinations,
  reqCreateBackupDestination,
  reqUpdateBackupDestination,
  reqDeleteBackupDestination,
  reqTestBackupDestination,
} from "@/services/backup-destinations.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";

const TYPE_LABELS: Record<BackupDestinationType, string> = {
  s3: "S3",
  google_drive: "Google Drive",
  samba: "Samba",
};

const TYPE_BADGE_CLASSES: Record<BackupDestinationType, string> = {
  s3: "bg-blue-500/15 text-blue-400",
  google_drive: "bg-green-500/15 text-green-400",
  samba: "bg-purple-500/15 text-purple-400",
};

function TypeBadge({ type }: { type: BackupDestinationType }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_BADGE_CLASSES[type] ?? "bg-gray-500/15 text-gray-400"}`}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

type ConfigField = {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
};

const configFieldsByType: Record<BackupDestinationType, ConfigField[]> = {
  s3: [
    { key: "bucket", label: "Bucket", required: true, placeholder: "my-backup-bucket" },
    { key: "region", label: "Region", required: true, placeholder: "us-east-1" },
    { key: "access_key_id", label: "Access Key ID", type: "password", required: true, placeholder: "AKIA..." },
    { key: "secret_access_key", label: "Secret Access Key", type: "password", required: true, placeholder: "secret" },
    { key: "endpoint", label: "Endpoint (optional)", placeholder: "https://s3.example.com" },
    { key: "path_prefix", label: "Path Prefix (optional)", placeholder: "backups/" },
  ],
  google_drive: [
    { key: "client_id", label: "Client ID", required: true, placeholder: "client-id" },
    { key: "client_secret", label: "Client Secret", type: "password", required: true, placeholder: "secret" },
    { key: "refresh_token", label: "Refresh Token", type: "password", required: true, placeholder: "token" },
    { key: "folder_id", label: "Folder ID (optional)", placeholder: "folder-id" },
  ],
  samba: [
    { key: "server", label: "Server", required: true, placeholder: "192.168.1.100" },
    { key: "share", label: "Share", required: true, placeholder: "backups" },
    { key: "username", label: "Username", required: true, placeholder: "user" },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "password" },
    { key: "path", label: "Path (optional)", placeholder: "/subfolder" },
  ],
};

export default function BackupDestinationsPage() {
  const user = useUser();
  const showConfirm = useConfirm();
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [type, setType] = useState<BackupDestinationType>("s3");
  const [config, setConfig] = useState<Record<string, string>>({});

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<BackupDestinationType>("s3");
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testWorkerSelecting, setTestWorkerSelecting] = useState<number | null>(null);

  // Listen for test result events via WebSocket
  const handleSocketEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type === "backup_dest_test_result" && event.payload) {
      const { backup_destination_id, success, error } = event.payload as {
        backup_destination_id?: number;
        success?: boolean;
        error?: string;
      };
      if (backup_destination_id === testingId) {
        setTestingId(null);
        if (success) {
          toast.success("Backup destination test successful");
        } else {
          toast.error("Test failed: " + (error ?? "unknown error"));
        }
      }
    }
  }, [testingId]);

  useAdminSocket(handleSocketEvent);

  const load = useCallback(async () => {
    const [destRes, workerRes] = await Promise.all([
      reqGetBackupDestinations(),
      reqGetWorkers(),
    ]);
    if (destRes.success) setDestinations(destRes.data ?? []);
    if (workerRes.success) setWorkers(workerRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Lattice - Backup Destinations";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getRequiredFields = (t: BackupDestinationType) =>
    configFieldsByType[t].filter((f) => f.required).map((f) => f.key);

  const isCreateValid = () => {
    if (!name.trim()) return false;
    return getRequiredFields(type).every((k) => config[k]?.trim());
  };

  const isEditValid = () => editName.trim() !== "";

  const resetForm = () => {
    setName("");
    setType("s3");
    setConfig({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Build config, omitting empty optional fields
    const cleanConfig: Record<string, string> = {};
    for (const field of configFieldsByType[type]) {
      const val = config[field.key]?.trim();
      if (val) cleanConfig[field.key] = val;
    }
    const res = await reqCreateBackupDestination({
      name: name.trim(),
      type,
      config: cleanConfig,
    });
    if (res.success) {
      toast.success("Backup destination created");
      setDestinations((prev) => [...prev, res.data]);
      setShowForm(false);
      resetForm();
    } else {
      toast.error(res.error_message || "Failed to create destination");
    }
    setSubmitting(false);
  };

  const startEdit = (dest: BackupDestination) => {
    setEditId(dest.id);
    setEditName(dest.name);
    setEditType(dest.type);
    // Pre-fill non-secret fields; secret fields stay blank (placeholder will show)
    const prefilled: Record<string, string> = {};
    for (const field of configFieldsByType[dest.type]) {
      if (field.type !== "password") {
        prefilled[field.key] = "";
      }
    }
    setEditConfig(prefilled);
  };

  const handleSaveEdit = async () => {
    if (editId === null) return;
    setEditSaving(true);
    // Build config, only include non-empty values
    const cleanConfig: Record<string, string> = {};
    for (const field of configFieldsByType[editType]) {
      const val = editConfig[field.key]?.trim();
      if (val) cleanConfig[field.key] = val;
    }
    const data: Parameters<typeof reqUpdateBackupDestination>[1] = {
      name: editName.trim(),
      type: editType,
    };
    if (Object.keys(cleanConfig).length > 0) {
      data.config = cleanConfig;
    }
    const res = await reqUpdateBackupDestination(editId, data);
    if (res.success) {
      toast.success("Backup destination updated");
      setDestinations((prev) =>
        prev.map((d) => (d.id === editId ? res.data : d)),
      );
      setEditId(null);
    } else {
      toast.error(res.error_message || "Failed to update destination");
    }
    setEditSaving(false);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirm({
      title: "Delete backup destination",
      message:
        "This backup destination will be permanently removed. Any backup schedules using it may be affected.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    const res = await reqDeleteBackupDestination(id);
    if (res.success) {
      toast.success("Backup destination deleted");
      setDestinations((prev) => prev.filter((d) => d.id !== id));
    } else {
      toast.error(res.error_message || "Failed to delete destination");
    }
  };

  const handleTest = async (destId: number, workerId: number) => {
    setTestingId(destId);
    setTestWorkerSelecting(null);
    const res = await reqTestBackupDestination(destId, workerId);
    if (!res.success) {
      setTestingId(null);
      toast.error("Failed to start test: " + (res.error_message ?? "unknown error"));
    }
    // If success, we wait for the WebSocket event
  };

  const onlineWorkers = useMemo(
    () => workers.filter((w) => w.status === "online"),
    [workers],
  );

  // --- Render config fields helper ---
  const renderConfigFields = (
    fields: ConfigField[],
    values: Record<string, string>,
    onChange: (key: string, value: string) => void,
    idPrefix: string,
    isEdit?: boolean,
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((field) => (
        <Input
          key={field.key}
          id={`${idPrefix}-${field.key}`}
          label={field.label}
          type={field.type ?? "text"}
          placeholder={
            isEdit && field.type === "password"
              ? "leave blank to keep existing"
              : field.placeholder
          }
          value={values[field.key] ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={!isEdit && field.required}
        />
      ))}
    </div>
  );

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Backup Destinations</div>
          <div className="page-subtitle">
            Manage backup storage destinations
          </div>
        </div>
        {canEdit(user) && (
          <Button
            onClick={() => {
              setShowForm(!showForm);
              if (showForm) resetForm();
            }}
          >
            {showForm ? "Cancel" : "Add Destination"}
          </Button>
        )}
      </div>

      <div className="py-6">
        {/* Create Form */}
        {canEdit(user) && showForm && (
          <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="dest-name"
                label="Name"
                placeholder="My Backup Destination"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="dest-type"
                  className="text-xs font-medium text-secondary uppercase tracking-wider"
                >
                  Type
                </label>
                <select
                  id="dest-type"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as BackupDestinationType);
                    setConfig({});
                  }}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
                >
                  <option value="s3">S3</option>
                  <option value="google_drive">Google Drive</option>
                  <option value="samba">Samba</option>
                </select>
              </div>
            </div>

            {renderConfigFields(
              configFieldsByType[type],
              config,
              (key, value) => setConfig((prev) => ({ ...prev, [key]: value })),
              "dest",
            )}

            <Button
              type="submit"
              loading={submitting}
              disabled={submitting || !isCreateValid()}
            >
              {submitting ? "Creating..." : "Create Destination"}
            </Button>
          </form>
        )}

        {/* Destinations List */}
        <div className="panel">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider hidden sm:table-cell">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider hidden md:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {destinations.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-sm text-muted"
                  >
                    No backup destinations configured
                  </td>
                </tr>
              ) : (
                destinations.map((dest) => (
                  <React.Fragment key={dest.id}>
                    <tr className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        {dest.name}
                      </td>
                      <td className="px-4 py-3 text-sm hidden sm:table-cell">
                        <TypeBadge type={dest.type} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted hidden md:table-cell">
                        {formatDate(dest.inserted_at)}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1 sm:space-x-2">
                        {canEdit(user) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(dest)}
                          >
                            Edit
                          </Button>
                        )}
                        {canEdit(user) && (
                          <span className="relative inline-block">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={testingId === dest.id}
                              onClick={() => {
                                if (onlineWorkers.length === 0) {
                                  toast.error("No online workers available to run test");
                                  return;
                                }
                                if (onlineWorkers.length === 1) {
                                  handleTest(dest.id, onlineWorkers[0].id);
                                } else {
                                  setTestWorkerSelecting(
                                    testWorkerSelecting === dest.id ? null : dest.id,
                                  );
                                }
                              }}
                            >
                              {testingId === dest.id ? "Testing..." : "Test"}
                            </Button>
                            {testWorkerSelecting === dest.id && (
                              <>
                                <div className="fixed inset-0 z-[5]" onClick={() => setTestWorkerSelecting(null)} />
                                <div className="absolute right-0 top-full mt-1 z-10 bg-surface-elevated border border-border-strong rounded-lg shadow-lg py-1 min-w-[160px]">
                                  <div className="px-3 py-1.5 text-xs font-medium text-secondary uppercase tracking-wider">
                                    Select Worker
                                  </div>
                                  {onlineWorkers.map((w) => (
                                    <button
                                      key={w.id}
                                      onClick={() => handleTest(dest.id, w.id)}
                                      className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-surface-active transition-colors cursor-pointer"
                                    >
                                      {w.name}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </span>
                        )}
                        {canEdit(user) && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(dest.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                    {canEdit(user) && editId === dest.id && (
                      <tr className="border-b border-border-subtle bg-background-alt">
                        <td colSpan={4} className="px-4 py-4">
                          <p className="text-[11px] text-muted mb-3">
                            Leave fields blank to keep their current values. Only filled fields will be updated.
                          </p>
                          <div className="space-y-4 mb-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <Input
                                id={`edit-name-${dest.id}`}
                                label="Name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                                  Type
                                </label>
                                <select
                                  value={editType}
                                  onChange={(e) => {
                                    setEditType(e.target.value as BackupDestinationType);
                                    setEditConfig({});
                                  }}
                                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                                >
                                  <option value="s3">S3</option>
                                  <option value="google_drive">Google Drive</option>
                                  <option value="samba">Samba</option>
                                </select>
                              </div>
                            </div>
                            {renderConfigFields(
                              configFieldsByType[editType],
                              editConfig,
                              (key, value) =>
                                setEditConfig((prev) => ({ ...prev, [key]: value })),
                              `edit-${dest.id}`,
                              true,
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              loading={editSaving}
                              onClick={handleSaveEdit}
                              disabled={editSaving || !isEditValid()}
                            >
                              {editSaving ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
