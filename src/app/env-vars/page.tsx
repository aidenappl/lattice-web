"use client";

import { useEffect, useState } from "react";
import type { GlobalEnvVar } from "@/types";
import {
  reqGetGlobalEnvVars,
  reqCreateGlobalEnvVar,
  reqUpdateGlobalEnvVar,
  reqDeleteGlobalEnvVar,
} from "@/services/admin.service";
import { useUser } from "@/store/hooks";
import { isAdmin, formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PageLoader, LoadingSpinner } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faLock } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

export default function EnvVarsPage() {
  const user = useUser();
  const admin = isAdmin(user);
  const showConfirm = useConfirm();

  const [envVars, setEnvVars] = useState<GlobalEnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    document.title = "Lattice - Environment Variables";
  }, []);

  const loadEnvVars = async (isReload = false) => {
    if (isReload) setReloading(true);
    const res = await reqGetGlobalEnvVars();
    if (res.success) setEnvVars(res.data ?? []);
    setLoading(false);
    setReloading(false);
  };

  useEffect(() => {
    loadEnvVars();
  }, []);

  const resetForm = () => {
    setKey("");
    setValue("");
    setIsSecret(false);
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (editingId) {
      const res = await reqUpdateGlobalEnvVar(editingId, {
        value: value || undefined,
        is_secret: isSecret,
      });
      if (res.success) {
        toast.success("Variable updated");
        await loadEnvVars(true);
        resetForm();
      } else {
        setError("error_message" in res ? res.error_message : "Failed to update");
      }
    } else {
      const res = await reqCreateGlobalEnvVar({ key, value, is_secret: isSecret });
      if (res.success) {
        toast.success("Variable created");
        await loadEnvVars(true);
        resetForm();
      } else {
        setError("error_message" in res ? res.error_message : "Failed to create");
      }
    }
    setSubmitting(false);
  };

  const handleEdit = (ev: GlobalEnvVar) => {
    setEditingId(ev.id);
    setKey(ev.key);
    setValue(ev.is_secret ? "" : ev.value);
    setIsSecret(ev.is_secret);
    setShowForm(true);
  };

  const handleDelete = async (ev: GlobalEnvVar) => {
    const ok = await showConfirm({
      title: "Delete variable",
      message: `Delete "${ev.key}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingId(ev.id);
    const res = await reqDeleteGlobalEnvVar(ev.id);
    if (res.success) {
      toast.success("Variable deleted");
      await loadEnvVars(true);
    }
    setDeletingId(null);
  };

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Environment Variables</div>
          <div className="page-subtitle">
            Global variables inherited by all stacks and containers
          </div>
        </div>
        {admin && (
          <Button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? "Cancel" : "Add Variable"}
          </Button>
        )}
      </div>

      <div className="p-6">
        {admin && showForm && (
          <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!editingId && (
                <Input
                  id="env-key"
                  label="Key"
                  placeholder="MY_VARIABLE"
                  value={key}
                  onChange={(e) =>
                    setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))
                  }
                  required
                />
              )}
              <Input
                id="env-value"
                label={editingId ? "New Value" : "Value"}
                type={isSecret ? "password" : "text"}
                placeholder={
                  editingId && isSecret ? "Enter new value" : "Value"
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required={!editingId}
              />
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(e) => setIsSecret(e.target.checked)}
                className="rounded border-border-strong bg-surface-elevated"
              />
              <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-secondary" />
              <span className="text-sm text-secondary">Mark as secret</span>
            </label>
            {error && (
              <Alert variant="error" onDismiss={() => setError("")}>
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              disabled={
                submitting || (!editingId && (!key.trim() || !value.trim()))
              }
            >
              {submitting
                ? editingId
                  ? "Updating..."
                  : "Creating..."
                : editingId
                  ? "Update Variable"
                  : "Create Variable"}
            </Button>
          </form>
        )}

        <div className="panel relative">
          {reloading && (
            <div className="absolute top-3 right-3 z-10">
              <LoadingSpinner size="sm" />
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Type</th>
                <th>Updated</th>
                {admin && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {envVars.length === 0 ? (
                <tr>
                  <td
                    colSpan={admin ? 5 : 4}
                    className="text-center text-sm text-muted !py-12"
                  >
                    No global environment variables configured
                  </td>
                </tr>
              ) : (
                envVars.map((ev) => {
                  const isRevealed = revealedIds.has(ev.id);
                  const displayValue = ev.is_secret
                    ? isRevealed && ev.value !== "***"
                      ? ev.value
                      : "***"
                    : ev.value;
                  return (
                    <tr key={ev.id}>
                      <td className="font-mono font-medium text-primary">
                        {ev.key}
                      </td>
                      <td className="text-secondary">
                        <div className="flex items-center gap-2">
                          <span className="font-mono truncate max-w-[300px]">
                            {displayValue}
                          </span>
                          {ev.is_secret && ev.value !== "***" && (
                            <button
                              onClick={() => toggleReveal(ev.id)}
                              className="text-muted hover:text-secondary transition-colors"
                            >
                              <FontAwesomeIcon
                                icon={isRevealed ? faEyeSlash : faEye}
                                className="h-3.5 w-3.5"
                              />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {ev.is_secret ? (
                          <Badge variant="warning">
                            <FontAwesomeIcon
                              icon={faLock}
                              className="h-2.5 w-2.5"
                            />
                            secret
                          </Badge>
                        ) : (
                          <Badge variant="default">plain</Badge>
                        )}
                      </td>
                      <td className="text-muted">
                        {formatDate(ev.updated_at)}
                      </td>
                      {admin && (
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleEdit(ev)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(ev)}
                              disabled={deletingId === ev.id}
                            >
                              {deletingId === ev.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
