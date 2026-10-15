"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { reportCaught } from "@/services/monitor.service";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faPlay,
  faStop,
  faRotate,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import type { DatabaseInstance, DatabaseEngine, Worker } from "@/types";
import {
  reqGetDatabaseInstances,
  reqDatabaseAction,
  reqDeleteDatabaseInstance,
} from "@/services/databases.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-modal";
import { canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import WorkerBadge from "@/components/ui/worker-badge";

export default function DatabasesPage() {
  const router = useRouter();
  const user = useUser();
  const showConfirm = useConfirm();
  const [databases, setDatabases] = useState<DatabaseInstance[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterEngine, setFilterEngine] = useState<"all" | DatabaseEngine>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const editable = canEdit(user);

  const load = useCallback(async () => {
    try {
      const [dbRes, wRes] = await Promise.all([
        reqGetDatabaseInstances(),
        reqGetWorkers(),
      ]);
      if (dbRes.success) setDatabases(dbRes.data ?? []);
      else toast.error("Failed to load databases");
      if (wRes.success) setWorkers(wRes.data ?? []);
      else toast.error("Failed to load workers");
    } catch (err) {
      reportCaught("databases.load", err);
      toast.error("Failed to load data");
    }
  }, []);

  useEffect(() => {
    document.title = "Lattice - Databases";
  }, []);

  useEffect(() => {
    load().then(() => setLoading(false));
  }, [load]);

  // Real-time updates
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "db_status" ||
        event.type === "db_health_status" ||
        event.type === "db_instance_changed" ||
        event.type === "db_instance_deleted"
      ) {
        load();
      }
    },
    [load],
  );
  useAdminSocket(handleSocketEvent);

  const workerMap = useMemo(
    () => new Map(workers.map((w) => [w.id, w])),
    [workers],
  );

  const filteredDatabases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return databases.filter((db) => {
      if (filterEngine !== "all" && db.engine !== filterEngine) return false;
      if (filterStatus !== "all" && db.status !== filterStatus) return false;
      if (
        q &&
        !db.name.toLowerCase().includes(q) &&
        !(db.database_name ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [databases, filterEngine, filterStatus, search]);

  const statuses = useMemo(
    () => Array.from(new Set(databases.map((d) => d.status))).sort(),
    [databases],
  );
  const visibleIds = useMemo(
    () => filteredDatabases.map((d) => d.id),
    [filteredDatabases],
  );
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => filteredDatabases.filter((d) => selection.isSelected(d.id)),
    [filteredDatabases, selection],
  );
  const workerName = (id: number) => workerMap.get(id)?.name ?? `worker ${id}`;

  const bulkAction = (
    action: "start" | "stop" | "restart",
    eligible: (d: DatabaseInstance) => boolean,
  ) => {
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    const items = selected.filter(eligible);
    if (items.length === 0) {
      toast(`None of the selected databases can be ${action}ed right now`);
      return;
    }
    bulk
      .run({
        items,
        verb,
        verbPast: action === "stop" ? "Stopped" : `${verb}ed`,
        noun: "database",
        name: (d) => d.name,
        action: (d) => reqDatabaseAction(d.id, action),
        confirm:
          action === "start"
            ? undefined
            : {
                message:
                  action === "stop"
                    ? "Each database container stops and its open connections are dropped. Data is kept."
                    : "Each database container restarts; open connections are dropped for a few seconds.",
                variant: action === "stop" ? "danger" : "warning",
              },
      })
      .then((r) => r && load());
  };

  const handleAction = async (db: DatabaseInstance, action: "start" | "stop" | "restart") => {
    if (action === "stop" || action === "restart") {
      const confirmed = await showConfirm({
        title: `${action.charAt(0).toUpperCase() + action.slice(1)} database "${db.name}"`,
        message:
          action === "stop"
            ? "The database container stops and every open connection is dropped. Data is kept."
            : "The database container restarts. Open connections are dropped for a few seconds.",
        confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
        variant: action === "stop" ? "danger" : "warning",
      });
      if (!confirmed) return;
    }
    try {
      const res = await reqDatabaseAction(db.id, action);
      if (res.success) {
        toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} command sent to "${db.name}"`);
        load();
      } else {
        toast.error(res.error_message || `Failed to ${action} database`);
      }
    } catch (err) {
      reportCaught("databases.action", err, { action });
      toast.error(`Failed to ${action} database`);
    }
  };

  // Delete destroys the container and the data volume on the worker, and the
  // record is only retired once the worker confirms — so the row is reloaded
  // rather than dropped optimistically. Dropping it hid failed teardowns, which
  // then reappeared on the next load with nothing explaining why.
  const handleDelete = async (db: DatabaseInstance) => {
    const confirmed = await showConfirm({
      title: `Delete database "${db.name}"`,
      message: `This destroys the container and the data volume ${db.volume_name} on ${workerName(db.worker_id)}. Every table in "${db.database_name}" goes with it and cannot be recovered — only existing snapshots, which are kept.`,
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      let res = await reqDeleteDatabaseInstance(db.id);

      // 409: the worker is offline, so nothing can actually be destroyed.
      if (!res.success && res.status === 409) {
        const forceOk = await showConfirm({
          title: `${workerName(db.worker_id)} is offline`,
          message: `The container and data volume cannot be destroyed while the worker is disconnected. Delete the record anyway? ${db.container_name} and ${db.volume_name} will be left on the worker and nothing in Lattice will point at them.`,
          confirmLabel: "Delete record anyway",
          variant: "danger",
        });
        if (!forceOk) return;
        res = await reqDeleteDatabaseInstance(db.id, { force: true });
      }

      if (res.success) {
        toast.success(res.message ?? `Deleting database "${db.name}"`);
        load();
      } else {
        toast.error(res.error_message || "Failed to delete database");
      }
    } catch (err) {
      reportCaught("databases.delete", err);
      toast.error("Failed to delete database");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Databases</div>
          <div className="page-subtitle">Manage your database instances</div>
        </div>
        {editable && (
          <Button onClick={() => router.push("/databases/new")}>
            New Database
          </Button>
        )}
      </div>

      {/* Same filter bar as every other list page — this one used to have its
          own taller, differently-styled selects. */}
      <div className="filters-bar">
        <input
          type="search"
          aria-label="Search databases"
          placeholder="Search by name or schema…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input !w-full sm:!w-64 !h-8 !text-sm"
        />
        <select
          value={filterEngine}
          onChange={(e) =>
            setFilterEngine(e.target.value as "all" | DatabaseEngine)
          }
          aria-label="Filter by engine"
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All engines</option>
          <option value="mysql">MySQL</option>
          <option value="mariadb">MariaDB</option>
          <option value="postgres">PostgreSQL</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted ml-auto whitespace-nowrap">
          {filteredDatabases.length} database
          {filteredDatabases.length !== 1 ? "s" : ""}
        </span>
      </div>

      {editable && (
        <BulkActionBar
          count={selection.count}
          noun="database"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Start",
              icon: faPlay,
              onClick: () =>
                bulkAction("start", (d) =>
                  ["stopped", "error", "degraded"].includes(d.status),
                ),
            },
            {
              label: "Stop",
              icon: faStop,
              onClick: () => bulkAction("stop", (d) => d.status === "running"),
            },
            {
              label: "Restart",
              icon: faRotate,
              onClick: () =>
                bulkAction("restart", (d) => d.status === "running"),
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
                    verbPast: "Started deleting",
                    noun: "database",
                    name: (d) => `${d.name} (${workerName(d.worker_id)})`,
                    action: (d) => reqDeleteDatabaseInstance(d.id),
                    confirm: {
                      title: `Permanently delete ${selected.length} database${selected.length !== 1 ? "s" : ""}?`,
                      message:
                        "Each database's container AND data volume are destroyed. Existing snapshots are kept; nothing else can be recovered. Databases with deletion protection, or on an offline worker, are skipped and listed as failures.",
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

      <div className="py-6">

        {/* Databases table */}
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                {editable && (
                  <th className="select-col">
                    <Checkbox
                      label="Select all visible databases"
                      checked={selection.allSelected}
                      indeterminate={selection.someSelected}
                      onChange={selection.toggleAll}
                      disabled={selection.empty}
                    />
                  </th>
                )}
                <th>Name</th>
                <th className="hidden sm:table-cell">Engine</th>
                <th className="hidden lg:table-cell">Version</th>
                <th className="hidden md:table-cell">Worker</th>
                <th className="hidden sm:table-cell">Port</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Health</th>
                {canEdit(user) && (
                  <th className="text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredDatabases.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 9 : 7}
                    className="text-center text-sm text-muted !py-12"
                  >
                    {databases.length === 0
                      ? "No databases found"
                      : "No databases match the current filters"}
                  </td>
                </tr>
              ) : (
                filteredDatabases.map((db) => {
                  const worker = workerMap.get(db.worker_id);
                  return (
                    <tr
                      key={db.id}
                      onClick={() => router.push(`/databases/${db.id}`)}
                      className={selection.isSelected(db.id) ? "is-selected" : ""}
                    >
                      {editable && (
                        <td className="select-col">
                          <Checkbox
                            label={`Select ${db.name}`}
                            checked={selection.isSelected(db.id)}
                            onChange={(_, e) =>
                              selection.toggle(db.id, { shiftKey: e.shiftKey })
                            }
                          />
                        </td>
                      )}
                      <td>
                        <Link
                          href={`/databases/${db.id}`}
                          className="text-primary font-medium hover:text-brand transition-colors"
                        >
                          {db.name}
                        </Link>
                      </td>
                      <td className="text-secondary hidden sm:table-cell">
                        {db.engine === "postgres"
                          ? "PostgreSQL"
                          : db.engine === "mysql"
                            ? "MySQL"
                            : "MariaDB"}
                      </td>
                      <td className="mono text-secondary hidden lg:table-cell">
                        {db.engine_version || "-"}
                      </td>
                      <td className="hidden md:table-cell">
                        {worker ? (
                          <WorkerBadge
                            id={worker.id}
                            name={worker.name}
                            size="sm"
                          />
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="mono text-secondary hidden sm:table-cell">
                        {db.port}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={db.status} />
                          {db.last_error && (
                            <span
                              title={`${db.last_error.code}: ${db.last_error.message}`}
                              className="text-[#ef4444] cursor-help"
                            >
                              <FontAwesomeIcon icon={faCircleExclamation} className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell">
                        <StatusBadge status={db.health_status} />
                      </td>
                      {editable && (
                        <td
                          className="text-right whitespace-nowrap space-x-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Stop is disruptive, not destructive: it used to be
                              styled exactly like Delete, one button apart. */}
                          {db.status === "stopped" || db.status === "error" || db.status === "degraded" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAction(db, "start")}
                            >
                              Start
                            </Button>
                          ) : db.status === "running" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAction(db, "stop")}
                            >
                              Stop
                            </Button>
                          ) : null}
                          {db.status === "running" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAction(db, "restart")}
                            >
                              Restart
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(db)}
                          >
                            Delete
                          </Button>
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
