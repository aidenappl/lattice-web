"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { Stack, Container, Worker, StackImportPayload } from "@/types";
import {
  reqGetStacks,
  reqGetAllContainers,
  reqImportStackExport,
  reqDeployStack,
  reqRestartStack,
  reqStopStack,
  reqStartStack,
  reqDeleteStack,
  reqExportStack,
  reqUpdateStack,
} from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Modal } from "@/components/ui/modal";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import { useUser } from "@/store/hooks";
import { canEdit, cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCube,
  faHeart,
  faCircle,
  faRocket,
  faRotate,
  faStop,
  faPlay,
  faTrash,
  faDownload,
  faServer,
} from "@fortawesome/free-solid-svg-icons";
import WorkerBadge from "@/components/ui/worker-badge";

export default function StacksPage() {
  const user = useUser();
  const editable = canEdit(user);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterWorker, setFilterWorker] = useState("all");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  // Debounce socket-driven refreshes (many events arrive per deploy)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [sRes, cRes, wRes] = await Promise.all([
      reqGetStacks(),
      reqGetAllContainers(),
      reqGetWorkers(),
    ]);
    if (sRes.success) {
      setStacks(sRes.data ?? []);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    if (cRes.success) setContainers(cRes.data ?? []);
    if (wRes.success) setWorkers(wRes.data ?? []);
  }, []);

  // Use a ref for load to avoid stale closure in scheduleRefresh
  const loadRef = useRef(load);
  loadRef.current = load;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => loadRef.current(), 1500);
  }, []);

  useEffect(() => {
    document.title = "Lattice - Stacks";
  }, []);

  useEffect(() => {
    load().then(() => setLoading(false));
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "container_status" ||
        event.type === "container_sync" ||
        event.type === "deployment_progress"
      ) {
        scheduleRefresh();
      }
    },
    [scheduleRefresh],
  );
  useAdminSocket(handleSocketEvent);

  const workerMap = useMemo(
    () => new Map(workers.map((w) => [w.id, w])),
    [workers],
  );

  const containersByStack = useMemo(() => {
    const map = new Map<number, Container[]>();
    for (const c of containers) {
      const list = map.get(c.stack_id) ?? [];
      list.push(c);
      map.set(c.stack_id, list);
    }
    return map;
  }, [containers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stacks.filter((s) => {
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterWorker !== "all" && String(s.worker_id) !== filterWorker)
        return false;
      if (!q) return true;
      if (s.name.toLowerCase().includes(q)) return true;
      if (s.description?.toLowerCase().includes(q)) return true;
      return (containersByStack.get(s.id) ?? []).some((c) =>
        c.name.toLowerCase().includes(q),
      );
    });
  }, [stacks, search, filterStatus, filterWorker, containersByStack]);

  const visibleIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => filtered.filter((s) => selection.isSelected(s.id)),
    [filtered, selection],
  );

  const statuses = useMemo(
    () => Array.from(new Set(stacks.map((s) => s.status))).sort(),
    [stacks],
  );

  const afterBulk = (clear = false) => {
    if (clear) selection.clear();
    setTimeout(load, 1500);
  };

  // Export is a download per stack: the export format is one stack per file,
  // which is also what Import accepts back.
  const exportSelected = async () => {
    const res = await bulk.run({
      items: selected,
      verb: "Export",
      verbPast: "Exported",
      noun: "stack",
      name: (s) => s.name,
      action: async (s) => {
        const r = await reqExportStack(s.id);
        if (!r.success) return r;
        const blob = new Blob([JSON.stringify(r.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${s.name.replace(/[^a-z0-9-_]+/gi, "-")}.stack.json`;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true };
      },
    });
    if (res) selection.clear();
  };

  const moveSelected = async () => {
    const workerId = Number(moveTarget);
    if (!workerId) return;
    setMoveOpen(false);
    const res = await bulk.run({
      items: selected.filter((s) => s.worker_id !== workerId),
      verb: "Move",
      verbPast: "Moved",
      noun: "stack",
      name: (s) => s.name,
      action: (s) => reqUpdateStack(s.id, { worker_id: workerId }),
    });
    if (res) {
      toast("Redeploy the moved stacks to start them on the new worker.", {
        icon: "ℹ️",
      });
      afterBulk();
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Stacks</div>
          <div className="page-subtitle">
            {stacks.length} stack{stacks.length !== 1 ? "s" : ""} ·{" "}
            {containers.length} containers
          </div>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const data = JSON.parse(text) as StackImportPayload;
                  const res = await reqImportStackExport(data);
                  if (res.success) {
                    toast.success("Stack imported successfully");
                    load();
                  } else {
                    toast.error(res.error_message || "Import failed");
                  }
                } catch {
                  toast.error("Invalid JSON file");
                }
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              onClick={() => importRef.current?.click()}
              title="Import a stack exported from Lattice (.json)"
            >
              Import
            </Button>
            <Link href="/stacks/new" className="btn btn-primary">
              New Stack
            </Link>
          </div>
        )}
      </div>

      {stacks.length > 0 && (
        <div className="filters-bar">
          <input
            type="search"
            placeholder="Search stacks or containers…"
            aria-label="Search stacks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input !w-full sm:!w-64 !h-8 !text-sm"
          />
          <select
            aria-label="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="form-select !h-8 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by worker"
            value={filterWorker}
            onChange={(e) => setFilterWorker(e.target.value)}
            className="form-select !h-8 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All workers</option>
            {workers.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
          {editable && filtered.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-xs text-secondary cursor-pointer select-none whitespace-nowrap">
              <Checkbox
                label="Select all visible stacks"
                checked={selection.allSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAll}
                disabled={selection.empty}
              />
              Select all
            </label>
          )}
        </div>
      )}

      {editable && (
        <BulkActionBar
          count={selection.count}
          noun="stack"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Deploy",
              icon: faRocket,
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Deploy",
                    verbPast: "Deployed",
                    noun: "stack",
                    name: (s) => s.name,
                    action: (s) => reqDeployStack(s.id),
                    confirm: {
                      message:
                        "Each stack is redeployed with its own strategy. Deployments run in parallel, up to four at a time.",
                    },
                  })
                  .then((r) => r && afterBulk()),
            },
            {
              label: "Restart",
              icon: faRotate,
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Restart",
                    verbPast: "Restarted",
                    noun: "stack",
                    name: (s) => s.name,
                    action: (s) => reqRestartStack(s.id),
                    confirm: {
                      message: "Every container in each stack is restarted.",
                    },
                  })
                  .then((r) => r && afterBulk()),
            },
            {
              label: "Start",
              icon: faPlay,
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Start",
                    verbPast: "Started",
                    noun: "stack",
                    name: (s) => s.name,
                    action: (s) => reqStartStack(s.id),
                  })
                  .then((r) => r && afterBulk()),
            },
            {
              label: "Stop",
              icon: faStop,
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Stop",
                    verbPast: "Stopped",
                    noun: "stack",
                    name: (s) => s.name,
                    action: (s) => reqStopStack(s.id),
                    confirm: {
                      message:
                        "Every container in each stack is stopped. The services they run go down.",
                      variant: "danger",
                    },
                  })
                  .then((r) => r && afterBulk()),
            },
            {
              label: "Move",
              icon: faServer,
              title: "Assign the selected stacks to another worker",
              onClick: () => {
                setMoveTarget("");
                setMoveOpen(true);
              },
            },
            { label: "Export", icon: faDownload, onClick: exportSelected },
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
                    noun: "stack",
                    name: (s) => s.name,
                    action: (s) => reqDeleteStack(s.id),
                    confirm: {
                      message:
                        "Each stack and all of its containers are removed from the worker and from Lattice. Volumes are kept. This cannot be undone.",
                      variant: "danger",
                    },
                  })
                  .then((r) => r && afterBulk(true)),
            },
          ]}
        />
      )}

      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={`Move ${selection.count} stack${selection.count !== 1 ? "s" : ""} to another worker`}
        description="This only reassigns the stacks. They keep running where they are until you redeploy them."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!moveTarget} onClick={moveSelected}>
              Move
            </Button>
          </>
        }
      >
        <label className="form-label" htmlFor="move-worker">
          Target worker
        </label>
        <select
          id="move-worker"
          className="form-select"
          value={moveTarget}
          onChange={(e) => setMoveTarget(e.target.value)}
        >
          <option value="">Select a worker…</option>
          {workers.map((w) => (
            <option key={w.id} value={String(w.id)}>
              {w.name}
            </option>
          ))}
        </select>
      </Modal>

      <div className="py-6">
        {loadError && stacks.length === 0 ? (
          <LoadError
            title="Failed to load stacks"
            message="Could not reach lattice-api to load the stack list."
            onRetry={() => {
              setLoading(true);
              load().then(() => setLoading(false));
            }}
          />
        ) : stacks.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-sm text-secondary mb-4">
              No stacks yet. A stack is a Docker Compose application deployed to
              one worker.
            </p>
            {editable && (
              <Link href="/stacks/new" className="btn btn-primary">
                Create your first stack
              </Link>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-sm text-muted">No stacks match these filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
            {filtered.map((stack) => {
              const stackContainers = containersByStack.get(stack.id) ?? [];
              const running = stackContainers.filter(
                (c) => c.status === "running",
              ).length;
              const healthy = stackContainers.filter(
                (c) => c.health_status === "healthy",
              ).length;
              const unhealthy = stackContainers.filter(
                (c) => c.health_status === "unhealthy",
              ).length;
              const worker = stack.worker_id
                ? workerMap.get(stack.worker_id)
                : null;
              const isSel = selection.isSelected(stack.id);

              return (
                <div
                  key={stack.id}
                  className={cn(
                    "card p-5 hover:border-border-strong transition-colors group relative flex flex-col",
                    isSel && "!border-info/60 bg-info/5",
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {editable && (
                        <Checkbox
                          label={`Select ${stack.name}`}
                          checked={isSel}
                          onChange={(_, e) =>
                            selection.toggle(stack.id, { shiftKey: e.shiftKey })
                          }
                          className="relative z-10"
                        />
                      )}
                      <h3 className="text-sm font-semibold text-primary group-hover:text-brand transition-colors truncate">
                        {/* Stretched link: the whole card navigates, while the
                            checkbox above it stays a separate control. */}
                        <Link
                          href={`/stacks/${stack.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                        >
                          {stack.name}
                        </Link>
                      </h3>
                    </div>
                    <StatusBadge status={stack.status} />
                  </div>

                  {stack.description && (
                    <p className="text-xs text-secondary mb-3 line-clamp-2">
                      {stack.description}
                    </p>
                  )}

                  {/* Container images */}
                  {stackContainers.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {stackContainers.slice(0, 4).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-surface-alt border border-border-subtle px-2 py-0.5 text-[11px] text-secondary"
                        >
                          <FontAwesomeIcon
                            icon={faCube}
                            className="h-2.5 w-2.5 text-info"
                          />
                          <span className="truncate max-w-[140px]">
                            {c.name}
                          </span>
                          <FontAwesomeIcon
                            icon={faCircle}
                            className={`h-1.5 w-1.5 ${c.status === "running" ? "text-healthy" : c.status === "error" ? "text-failed" : "text-muted"}`}
                          />
                        </span>
                      ))}
                      {stackContainers.length > 4 && (
                        <span className="inline-flex items-center rounded-md bg-surface-alt border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                          +{stackContainers.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats + worker pinned to the bottom so cards in a row line up */}
                  <div className="mt-auto">
                    <div className="flex items-center gap-3 text-[11px] text-muted border-t border-border-subtle pt-3">
                      <span className="flex items-center gap-1.5">
                        <FontAwesomeIcon
                          icon={faCube}
                          className="h-3 w-3 text-info"
                        />
                        {running}/{stackContainers.length} running
                      </span>

                      {(healthy > 0 || unhealthy > 0) && (
                        <span className="flex items-center gap-1.5">
                          <FontAwesomeIcon
                            icon={faHeart}
                            className={`h-3 w-3 ${unhealthy > 0 ? "text-failed" : "text-healthy"}`}
                          />
                          {unhealthy > 0
                            ? `${unhealthy} unhealthy`
                            : `${healthy} healthy`}
                        </span>
                      )}

                      <span className="text-muted">
                        {stack.deployment_strategy}
                      </span>

                      {stack.auto_deploy && (
                        <span className="text-info">auto-deploy</span>
                      )}
                    </div>

                    {worker && (
                      <div className="mt-2">
                        <WorkerBadge
                          id={worker.id}
                          name={worker.name}
                          size="sm"
                          linkable={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
