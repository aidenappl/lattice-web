"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Template, Worker } from "@/types";
import {
  reqGetTemplates,
  reqDeleteTemplate,
  reqCreateTemplate,
} from "@/services/templates.service";
import { reqImportStackExport, reqUpdateStack } from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import type { StackImportPayload } from "@/types";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PageLoader } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import { useUser } from "@/store/hooks";
import { canEdit, formatDate, timeAgo } from "@/lib/utils";
import { faTrash, faDownload } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { reportCaught } from "@/services/monitor.service";

function parseConfig(t: Template): StackImportPayload | null {
  try {
    return JSON.parse(t.config) as StackImportPayload;
  } catch {
    return null;
  }
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]+/gi, "-")}.template.json`;
  a.click();
  URL.revokeObjectURL(url);
}

type Editor = {
  mode: "create" | "edit";
  source?: Template;
  name: string;
  description: string;
  config: string;
};

export default function TemplatesPage() {
  const router = useRouter();
  const user = useUser();
  const editable = canEdit(user);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<Template | null>(null);
  const [using, setUsing] = useState<Template | null>(null);
  const [useName, setUseName] = useState("");
  const [useWorker, setUseWorker] = useState("");
  const [useBusy, setUseBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showConfirm = useConfirm();

  useEffect(() => {
    document.title = "Lattice - Templates";
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    const [res, wRes] = await Promise.all([reqGetTemplates(), reqGetWorkers()]);
    if (res.success) {
      setTemplates(res.data ?? []);
    } else {
      setLoadError(true);
      toast.error(res.error_message || "Failed to load templates");
    }
    if (wRes.success) setWorkers(wRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [templates, search]);
  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => filtered.filter((t) => selection.isSelected(t.id)),
    [filtered, selection],
  );

  const handleDelete = async (t: Template) => {
    const ok = await showConfirm({
      title: "Delete template",
      message: `Delete "${t.name}"? Stacks already created from it are not affected.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteTemplate(t.id);
    if (res.success) {
      toast.success("Template deleted");
      await load();
    } else {
      toast.error(res.error_message || "Failed to delete template");
    }
  };

  // "Use" used to create the stack straight away under the template's original
  // stack name — which usually still exists, so it failed — and with no worker.
  // Now it asks for both first.
  const openUse = (t: Template) => {
    const cfg = parseConfig(t);
    setUseName(cfg ? `${cfg.stack.name}-copy` : t.name);
    setUseWorker("");
    setUsing(t);
  };

  const handleUse = async () => {
    if (!using) return;
    const cfg = parseConfig(using);
    if (!cfg) {
      toast.error("This template's configuration is not valid JSON");
      return;
    }
    setUseBusy(true);
    try {
      const res = await reqImportStackExport({
        ...cfg,
        stack: { ...cfg.stack, name: useName.trim() },
      });
      if (!res.success) {
        toast.error(res.error_message || "Failed to create stack from template");
        return;
      }
      const id = res.data?.id;
      if (id && useWorker) {
        const upd = await reqUpdateStack(id, { worker_id: Number(useWorker) });
        if (!upd.success)
          toast.error(`Stack created, but assigning the worker failed: ${upd.error_message}`);
      }
      toast.success(`Created stack "${useName.trim()}"`);
      router.push(id ? `/stacks/${id}` : "/stacks");
    } catch (err) {
      reportCaught("templates.create_stack", err, { template_id: using.id });
      toast.error("Failed to create stack from template");
    } finally {
      setUseBusy(false);
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    try {
      JSON.parse(editor.config);
    } catch {
      toast.error("Configuration must be valid JSON");
      return;
    }
    setEditorBusy(true);
    const res = await reqCreateTemplate({
      name: editor.name.trim(),
      description: editor.description.trim() || undefined,
      config: editor.config,
    });
    if (!res.success) {
      toast.error(res.error_message || "Failed to save template");
      setEditorBusy(false);
      return;
    }
    // lattice-api has no template update; an edit is saved as a new template
    // and the original retired, so the list never shows both.
    if (editor.mode === "edit" && editor.source) {
      const del = await reqDeleteTemplate(editor.source.id);
      if (!del.success)
        toast.error(`Saved, but the old version could not be removed: ${del.error_message}`);
    }
    toast.success(editor.mode === "edit" ? "Template updated" : "Template created");
    setEditor(null);
    setEditorBusy(false);
    load();
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    let parsed:
      | StackImportPayload
      | { name: string; description?: string; config: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error("Invalid JSON file");
      return;
    }
    // Accept both a downloaded template ({name, config}) and a raw stack export.
    if ("config" in parsed && typeof parsed.config === "string") {
      setEditor({
        mode: "create",
        name: parsed.name,
        description: parsed.description ?? "",
        config: parsed.config,
      });
    } else if ("stack" in parsed) {
      setEditor({
        mode: "create",
        name: parsed.stack.name,
        description: parsed.stack.description ?? "",
        config: JSON.stringify(parsed, null, 2),
      });
    } else {
      toast.error("Not a Lattice template or stack export");
    }
  };

  if (loading) return <PageLoader />;

  const viewingCfg = viewing ? parseConfig(viewing) : null;

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Templates</div>
          <div className="page-subtitle">
            Reusable stack configurations. Save one from any stack&apos;s detail
            page, or import a stack export.
          </div>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <Button
              onClick={() =>
                setEditor({
                  mode: "create",
                  name: "",
                  description: "",
                  config: JSON.stringify(
                    {
                      stack: {
                        name: "my-stack",
                        description: null,
                        deployment_strategy: "rolling",
                        auto_deploy: false,
                        env_vars: null,
                        compose_yaml: null,
                        placement_constraints: null,
                      },
                      containers: [],
                      networks: [],
                    },
                    null,
                    2,
                  ),
                })
              }
            >
              New Template
            </Button>
          </div>
        )}
      </div>

      {templates.length > 0 && (
        <div className="filters-bar">
          <input
            type="search"
            aria-label="Search templates"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input !w-full sm:!w-64 !h-8 !text-sm"
          />
        </div>
      )}

      {editable && (
        <BulkActionBar
          count={selection.count}
          noun="template"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Download",
              icon: faDownload,
              onClick: () => {
                selected.forEach((t) =>
                  download(
                    t.name,
                    JSON.stringify(
                      { name: t.name, description: t.description, config: t.config },
                      null,
                      2,
                    ),
                  ),
                );
                selection.clear();
              },
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
                    noun: "template",
                    name: (t) => t.name,
                    action: (t) => reqDeleteTemplate(t.id),
                    confirm: {
                      message: "Stacks already created from them are not affected.",
                      variant: "danger",
                    },
                  })
                  .then((r) => {
                    if (r) {
                      selection.clear();
                      load();
                    }
                  }),
            },
          ]}
        />
      )}

      {/* View */}
      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ""}
        description={viewing?.description ?? undefined}
        widthClass="max-w-3xl"
        footer={
          <Button variant="ghost" size="sm" onClick={() => setViewing(null)}>
            Close
          </Button>
        }
      >
        {viewingCfg ? (
          <div className="space-y-3 text-xs">
            <p className="text-secondary">
              {viewingCfg.containers.length} container
              {viewingCfg.containers.length !== 1 ? "s" : ""} ·{" "}
              {viewingCfg.stack.deployment_strategy} ·{" "}
              {viewingCfg.containers.map((c) => `${c.image}:${c.tag}`).join(", ") || "no images"}
            </p>
            <pre className="terminal-panel p-3 max-h-[50vh] whitespace-pre-wrap">
              {viewingCfg.stack.compose_yaml ?? JSON.stringify(viewingCfg, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-failed">This template&apos;s configuration is not valid JSON.</p>
        )}
      </Modal>

      {/* Use */}
      <Modal
        open={using !== null}
        onClose={() => !useBusy && setUsing(null)}
        title={`Create a stack from "${using?.name ?? ""}"`}
        description="The stack is created stopped. Deploy it from its page once you've checked the config."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setUsing(null)} disabled={useBusy}>
              Cancel
            </Button>
            <Button size="sm" loading={useBusy} disabled={!useName.trim()} onClick={handleUse}>
              Create stack
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="form-label" htmlFor="use-name">
              Stack name
            </label>
            <input
              id="use-name"
              className="form-input"
              value={useName}
              onChange={(e) => setUseName(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="use-worker">
              Worker
            </label>
            <select
              id="use-worker"
              className="form-select"
              value={useWorker}
              onChange={(e) => setUseWorker(e.target.value)}
            >
              <option value="">Assign later</option>
              {workers.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Create / edit */}
      <Modal
        open={editor !== null}
        onClose={() => !editorBusy && setEditor(null)}
        title={editor?.mode === "edit" ? `Edit "${editor.source?.name}"` : "New template"}
        description="The configuration is a Lattice stack export: the stack, its containers and networks."
        widthClass="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditor(null)} disabled={editorBusy}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={editorBusy}
              disabled={!editor?.name.trim() || !editor?.config.trim()}
              onClick={saveEditor}
            >
              Save
            </Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label" htmlFor="tpl-name">
                  Name
                </label>
                <input
                  id="tpl-name"
                  className="form-input"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="tpl-desc">
                  Description
                </label>
                <input
                  id="tpl-desc"
                  className="form-input"
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="form-label" htmlFor="tpl-config">
                Configuration (JSON)
              </label>
              <textarea
                id="tpl-config"
                className="form-textarea font-mono text-xs h-72"
                spellCheck={false}
                value={editor.config}
                onChange={(e) => setEditor({ ...editor, config: e.target.value })}
              />
            </div>
          </div>
        )}
      </Modal>

      <div className="py-6">
        {loadError && templates.length === 0 ? (
          <LoadError
            title="Failed to load templates"
            message="Could not reach lattice-api to load stack templates."
            onRetry={() => {
              setLoading(true);
              load();
            }}
          />
        ) : (
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  {editable && (
                    <th className="select-col">
                      <Checkbox
                        label="Select all visible templates"
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        disabled={selection.empty}
                      />
                    </th>
                  )}
                  <th>Name</th>
                  <th>Description</th>
                  <th className="hidden md:table-cell">Containers</th>
                  <th className="hidden md:table-cell">Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-sm text-muted !py-12">
                      {templates.length === 0
                        ? "No templates yet. Save a stack as a template from its detail page, or import one."
                        : "No templates match this search"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const cfg = parseConfig(t);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setViewing(t)}
                        className={selection.isSelected(t.id) ? "is-selected" : ""}
                      >
                        {editable && (
                          <td className="select-col">
                            <Checkbox
                              label={`Select ${t.name}`}
                              checked={selection.isSelected(t.id)}
                              onChange={(_, e) =>
                                selection.toggle(t.id, { shiftKey: e.shiftKey })
                              }
                            />
                          </td>
                        )}
                        <td className="font-medium text-primary">{t.name}</td>
                        <td className="text-secondary">{t.description || "—"}</td>
                        <td className="text-muted hidden md:table-cell">
                          {cfg ? cfg.containers.length : "—"}
                        </td>
                        <td
                          className="text-muted hidden md:table-cell whitespace-nowrap"
                          title={formatDate(t.inserted_at)}
                        >
                          {timeAgo(t.inserted_at)}
                        </td>
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {editable && (
                              <Button variant="primary" size="sm" onClick={() => openUse(t)} aria-label={`Use ${t.name}`}>
                                Use
                              </Button>
                            )}
                            {editable && (
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Edit ${t.name}`}
                                onClick={() =>
                                  setEditor({
                                    mode: "edit",
                                    source: t,
                                    name: t.name,
                                    description: t.description ?? "",
                                    config: cfg ? JSON.stringify(cfg, null, 2) : t.config,
                                  })
                                }
                              >
                                Edit
                              </Button>
                            )}
                            {editable && (
                              <Button
                                variant="destructive"
                                size="sm"
                                aria-label={`Delete ${t.name}`}
                                onClick={() => handleDelete(t)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
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
