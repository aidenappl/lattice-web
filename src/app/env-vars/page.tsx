"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobalEnvVar } from "@/types";
import {
  reqGetGlobalEnvVars,
  reqCreateGlobalEnvVar,
  reqUpdateGlobalEnvVar,
  reqDeleteGlobalEnvVar,
} from "@/services/admin.service";
import { useUser } from "@/store/hooks";
import { isAdmin, formatDate, timeAgo } from "@/lib/utils";
import { parseDotEnv, toDotEnv, normaliseEnvKey } from "@/lib/dotenv";
import { runBulk } from "@/lib/bulk";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PageLoader, LoadingSpinner } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faTrash,
  faFileImport,
  faFileExport,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

const MASK = "***";

export default function EnvVarsPage() {
  const user = useUser();
  const admin = isAdmin(user);
  const showConfirm = useConfirm();

  const [envVars, setEnvVars] = useState<GlobalEnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GlobalEnvVar | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSecret, setImportSecret] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Lattice - Environment Variables";
  }, []);

  const loadEnvVars = useCallback(async (isReload = false) => {
    if (isReload) setReloading(true);
    setLoadError(false);
    const res = await reqGetGlobalEnvVars();
    if (res.success) {
      setEnvVars(res.data ?? []);
    } else {
      setLoadError(true);
      toast.error(res.error_message || "Failed to load environment variables");
    }
    setLoading(false);
    setReloading(false);
  }, []);

  useEffect(() => {
    loadEnvVars();
  }, [loadEnvVars]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return envVars;
    return envVars.filter(
      (ev) =>
        ev.key.toLowerCase().includes(q) ||
        (!ev.is_secret && ev.value.toLowerCase().includes(q)),
    );
  }, [envVars, search]);

  const visibleIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => filtered.filter((e) => selection.isSelected(e.id)),
    [filtered, selection],
  );

  const resetForm = () => {
    setKey("");
    setValue("");
    setIsSecret(false);
    setEditing(null);
    setShowForm(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (editing) {
      const renamed = key !== editing.key;
      if (renamed) {
        // The API has no rename: create the new key, then delete the old one.
        // That needs the value, which for a masked secret only the user has.
        const carried =
          value || (editing.value !== MASK ? editing.value : "");
        if (!carried) {
          setError(
            "Renaming a secret needs its value. Enter it in Value, or reveal the secret first.",
          );
          setSubmitting(false);
          return;
        }
        const created = await reqCreateGlobalEnvVar({
          key,
          value: carried,
          is_secret: isSecret,
        });
        if (!created.success) {
          setError(created.error_message || "Failed to create the renamed variable");
          setSubmitting(false);
          return;
        }
        const removed = await reqDeleteGlobalEnvVar(editing.id);
        if (!removed.success) {
          toast.error(
            `${key} was created, but ${editing.key} could not be removed: ${removed.error_message}`,
          );
        } else {
          toast.success(`Renamed ${editing.key} → ${key}`);
        }
        await loadEnvVars(true);
        resetForm();
        setSubmitting(false);
        return;
      }
      const res = await reqUpdateGlobalEnvVar(editing.id, {
        value: value || undefined,
        is_secret: isSecret,
      });
      if (res.success) {
        toast.success(`${editing.key} updated`);
        await loadEnvVars(true);
        resetForm();
      } else {
        setError(res.error_message || "Failed to update");
      }
    } else {
      const res = await reqCreateGlobalEnvVar({ key, value, is_secret: isSecret });
      if (res.success) {
        toast.success(`${key} created`);
        await loadEnvVars(true);
        resetForm();
      } else {
        setError(res.error_message || "Failed to create");
      }
    }
    setSubmitting(false);
  };

  const handleEdit = (ev: GlobalEnvVar) => {
    setEditing(ev);
    setKey(ev.key);
    setValue(ev.is_secret ? "" : ev.value);
    setIsSecret(ev.is_secret);
    setError("");
    setShowForm(true);
    requestAnimationFrame(() => keyInputRef.current?.focus());
  };

  const handleDelete = async (ev: GlobalEnvVar) => {
    const ok = await showConfirm({
      title: "Delete variable",
      message: `Delete "${ev.key}"? Stacks that reference \${${ev.key}} will get an empty value on their next deploy.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingId(ev.id);
    const res = await reqDeleteGlobalEnvVar(ev.id);
    if (res.success) {
      toast.success(`${ev.key} deleted`);
      await loadEnvVars(true);
    } else {
      // Used to fail silently, leaving the row in place with no explanation.
      toast.error(res.error_message || `Failed to delete ${ev.key}`);
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

  const importPreview = useMemo(() => parseDotEnv(importText), [importText]);
  const existingByKey = useMemo(
    () => new Map(envVars.map((e) => [e.key, e])),
    [envVars],
  );
  const importNew = importPreview.entries.filter(
    (e) => !existingByKey.has(e.key),
  );
  const importExisting = importPreview.entries.filter((e) =>
    existingByKey.has(e.key),
  );

  const runImport = async () => {
    setImporting(true);
    const toCreate = importNew;
    const toUpdate = importOverwrite ? importExisting : [];
    const result = await runBulk(
      [...toCreate, ...toUpdate],
      (entry) => {
        const existing = existingByKey.get(entry.key);
        return existing
          ? reqUpdateGlobalEnvVar(existing.id, {
              value: entry.value,
              is_secret: importSecret || existing.is_secret,
            })
          : reqCreateGlobalEnvVar({
              key: entry.key,
              value: entry.value,
              is_secret: importSecret,
            });
      },
    );
    setImporting(false);
    const skipped = importOverwrite ? 0 : importExisting.length;
    if (result.failed.length === 0) {
      toast.success(
        `Imported ${result.succeeded.length} variable${result.succeeded.length !== 1 ? "s" : ""}${skipped ? ` · skipped ${skipped} existing` : ""}`,
      );
      setImportOpen(false);
      setImportText("");
    } else {
      toast.error(
        `Imported ${result.succeeded.length}, failed ${result.failed.length}: ${result.failed
          .slice(0, 3)
          .map((f) => `${f.item.key} (${f.error})`)
          .join(", ")}`,
        { duration: 8000 },
      );
    }
    loadEnvVars(true);
  };

  const exportVars = (vars: GlobalEnvVar[]) => {
    const masked = vars.filter((v) => v.value === MASK).length;
    const blob = new Blob(
      [
        toDotEnv(
          vars
            .filter((v) => v.value !== MASK)
            .map((v) => ({ key: v.key, value: v.value })),
        ),
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lattice-global.env";
    a.click();
    URL.revokeObjectURL(url);
    if (masked)
      toast(`${masked} masked secret${masked !== 1 ? "s were" : " was"} left out`, {
        icon: "🔒",
      });
  };

  if (loading) return <PageLoader />;

  const renaming = editing !== null && key !== editing.key;

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Environment Variables</div>
          <div className="page-subtitle">
            Global variables available to every stack as{" "}
            <code className="font-mono text-xs">${"{KEY}"}</code>. A stack-level
            variable with the same key wins.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {envVars.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => exportVars(envVars)}
              title="Download all variables as a .env file"
            >
              <FontAwesomeIcon icon={faFileExport} className="h-3 w-3 mr-1.5" />
              Export
            </Button>
          )}
          {admin && (
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FontAwesomeIcon icon={faFileImport} className="h-3 w-3 mr-1.5" />
              Import .env
            </Button>
          )}
          {admin && (
            <Button
              variant={showForm ? "secondary" : "primary"}
              onClick={() => {
                if (showForm) resetForm();
                else {
                  setShowForm(true);
                  requestAnimationFrame(() => keyInputRef.current?.focus());
                }
              }}
            >
              {showForm ? "Cancel" : "Add Variable"}
            </Button>
          )}
        </div>
      </div>

      {envVars.length > 0 && (
        <div className="filters-bar">
          <input
            type="search"
            aria-label="Search variables"
            placeholder="Search keys or plain values…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input !w-full sm:!w-72 !h-8 !text-sm"
          />
          <span className="ml-auto text-xs text-muted whitespace-nowrap">
            {envVars.length} variable{envVars.length !== 1 ? "s" : ""} ·{" "}
            {envVars.filter((v) => v.is_secret).length} secret
          </span>
        </div>
      )}

      {admin && (
        <BulkActionBar
          count={selection.count}
          noun="variable"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Mark secret",
              icon: faLock,
              onClick: () =>
                bulk
                  .run({
                    items: selected.filter((v) => !v.is_secret),
                    verb: "Mark secret",
                    verbPast: "Marked secret",
                    noun: "variable",
                    name: (v) => v.key,
                    action: (v) => reqUpdateGlobalEnvVar(v.id, { is_secret: true }),
                  })
                  .then((r) => r && loadEnvVars(true)),
            },
            {
              label: "Mark plain",
              icon: faLockOpen,
              onClick: () =>
                bulk
                  .run({
                    items: selected.filter((v) => v.is_secret),
                    verb: "Mark plain",
                    verbPast: "Marked plain",
                    noun: "variable",
                    name: (v) => v.key,
                    action: (v) => reqUpdateGlobalEnvVar(v.id, { is_secret: false }),
                    confirm: {
                      message:
                        "Their values become visible in this list and in every stack's Environment tab.",
                    },
                  })
                  .then((r) => r && loadEnvVars(true)),
            },
            {
              label: "Export",
              icon: faFileExport,
              onClick: () => exportVars(selected),
            },
            {
              label: "Delete",
              icon: faTrash,
              variant: "danger",
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Delete",
                    verbPast: "Deleted",
                    noun: "variable",
                    name: (v) => v.key,
                    action: (v) => reqDeleteGlobalEnvVar(v.id),
                    confirm: {
                      message:
                        "Stacks that reference these keys get an empty value on their next deploy.",
                      variant: "danger",
                    },
                  })
                  .then((r) => {
                    if (r) {
                      selection.clear();
                      loadEnvVars(true);
                    }
                  }),
            },
          ]}
        />
      )}

      <Modal
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        title="Import variables from .env"
        description="Paste KEY=VALUE lines. Comments, blank lines, quotes and `export` are handled; keys are upper-cased."
        widthClass="max-w-xl"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={importing}
              disabled={
                importNew.length + (importOverwrite ? importExisting.length : 0) === 0
              }
              onClick={runImport}
            >
              Import{" "}
              {importNew.length + (importOverwrite ? importExisting.length : 0)}
            </Button>
          </>
        }
      >
        <textarea
          aria-label=".env contents"
          className="form-textarea font-mono text-xs h-48"
          placeholder={"# paste a .env file\nDATABASE_URL=postgres://…\nLOG_LEVEL=info"}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          spellCheck={false}
        />
        <div className="mt-3 space-y-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-secondary">
            <Checkbox
              label="Mark imported variables as secret"
              checked={importSecret}
              onChange={setImportSecret}
            />
            Mark all as secret
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-secondary">
            <Checkbox
              label="Overwrite existing keys"
              checked={importOverwrite}
              onChange={setImportOverwrite}
            />
            Overwrite the {importExisting.length} key
            {importExisting.length !== 1 ? "s" : ""} that already exist
          </label>
          {importText.trim() && (
            <p className="text-muted">
              {importNew.length} new · {importExisting.length} existing
              {importPreview.invalidLines.length > 0 && (
                <span className="text-pending">
                  {" "}
                  · ignoring line{importPreview.invalidLines.length !== 1 ? "s" : ""}{" "}
                  {importPreview.invalidLines.slice(0, 8).join(", ")}
                </span>
              )}
            </p>
          )}
        </div>
      </Modal>

      <div className="py-6">
        {admin && showForm && (
          <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4">
            {editing && (
              <p className="text-xs text-secondary">
                Editing <span className="font-mono text-primary">{editing.key}</span>
                {editing.is_secret && " · leave Value empty to keep the current secret"}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                ref={keyInputRef}
                id="env-key"
                label={renaming ? "Key (renaming)" : "Key"}
                placeholder="MY_VARIABLE"
                value={key}
                onChange={(e) => setKey(normaliseEnvKey(e.target.value))}
                required
              />
              <Input
                id="env-value"
                label={editing ? "New value" : "Value"}
                type={isSecret ? "password" : "text"}
                placeholder={
                  editing && editing.is_secret ? "Unchanged" : "Value"
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required={!editing}
              />
            </div>
            {/* Its own row: as an inline label it sat on the same line as the
                submit button, which overlapped it. */}
            <div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <Checkbox
                  label="Mark as secret"
                  checked={isSecret}
                  onChange={setIsSecret}
                />
                <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-secondary" />
                <span className="text-sm text-secondary">Mark as secret</span>
              </label>
            </div>
            {error && (
              <Alert variant="error" onDismiss={() => setError("")}>
                {error}
              </Alert>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={
                  submitting || !key.trim() || (!editing && !value.trim())
                }
              >
                {submitting
                  ? "Saving…"
                  : renaming
                    ? `Rename to ${key}`
                    : editing
                      ? "Update variable"
                      : "Create variable"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {loadError && envVars.length === 0 ? (
          <LoadError
            title="Failed to load environment variables"
            message="Could not reach lattice-api to load global environment variables."
            onRetry={() => {
              setLoading(true);
              loadEnvVars();
            }}
            retrying={reloading}
          />
        ) : (
          <div className="panel relative">
            {reloading && (
              <div className="absolute top-3 right-3 z-10">
                <LoadingSpinner size="sm" />
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  {admin && (
                    <th className="select-col">
                      <Checkbox
                        label="Select all visible variables"
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        disabled={selection.empty}
                      />
                    </th>
                  )}
                  <th>Key</th>
                  <th>Value</th>
                  <th className="hidden sm:table-cell">Type</th>
                  <th className="hidden md:table-cell">Updated</th>
                  {admin && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={admin ? 6 : 4}
                      className="text-center text-sm text-muted !py-12"
                    >
                      {envVars.length === 0
                        ? "No global environment variables configured"
                        : "No variables match this search"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((ev) => {
                    const isRevealed = revealedIds.has(ev.id);
                    const displayValue = ev.is_secret
                      ? isRevealed && ev.value !== MASK
                        ? ev.value
                        : "••••••••"
                      : ev.value;
                    return (
                      <tr
                        key={ev.id}
                        className={`!cursor-default ${selection.isSelected(ev.id) ? "is-selected" : ""}`}
                      >
                        {admin && (
                          <td className="select-col">
                            <Checkbox
                              label={`Select ${ev.key}`}
                              checked={selection.isSelected(ev.id)}
                              onChange={(_, e) =>
                                selection.toggle(ev.id, { shiftKey: e.shiftKey })
                              }
                            />
                          </td>
                        )}
                        <td className="font-mono font-medium text-primary">
                          {ev.key}
                        </td>
                        <td className="text-secondary">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono truncate max-w-[300px]"
                              title={!ev.is_secret || isRevealed ? ev.value : undefined}
                            >
                              {displayValue}
                            </span>
                            {ev.is_secret && ev.value !== MASK && (
                              <button
                                onClick={() => toggleReveal(ev.id)}
                                aria-label={`${isRevealed ? "Hide" : "Reveal"} ${ev.key}`}
                                title={isRevealed ? "Hide" : "Reveal"}
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
                        <td className="hidden sm:table-cell">
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
                        <td
                          className="text-muted hidden md:table-cell whitespace-nowrap"
                          title={formatDate(ev.updated_at)}
                        >
                          {timeAgo(ev.updated_at)}
                        </td>
                        {admin && (
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleEdit(ev)}
                                aria-label={`Edit ${ev.key}`}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(ev)}
                                disabled={deletingId === ev.id}
                                aria-label={`Delete ${ev.key}`}
                              >
                                {deletingId === ev.id ? "Deleting…" : "Delete"}
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
        )}
      </div>
    </div>
  );
}
