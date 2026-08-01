"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
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
  const [filterStatus, setFilterStatus] = useState<"all" | "running" | "stopped" | "pending" | "error">("all");

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
    } catch {
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
    return databases.filter((db) => {
      if (filterEngine !== "all" && db.engine !== filterEngine) return false;
      if (filterStatus !== "all" && db.status !== filterStatus) return false;
      return true;
    });
  }, [databases, filterEngine, filterStatus]);

  const handleAction = async (db: DatabaseInstance, action: "start" | "stop" | "restart") => {
    if (action === "stop" || action === "restart") {
      const confirmed = await showConfirm({
        title: `${action.charAt(0).toUpperCase() + action.slice(1)} database "${db.name}"`,
        message: "This will stop the database container. Any active connections will be terminated.",
        confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
        variant: "danger",
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
    } catch {
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
      message: `This destroys the container and the data volume ${db.volume_name} on worker ${db.worker_id}. Every table in "${db.database_name}" goes with it and cannot be recovered — only existing snapshots, which are kept.`,
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      let res = await reqDeleteDatabaseInstance(db.id);

      // 409: the worker is offline, so nothing can actually be destroyed.
      if (!res.success && res.status === 409) {
        const forceOk = await showConfirm({
          title: `Worker ${db.worker_id} is offline`,
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
    } catch {
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
        {canEdit(user) && (
          <Button onClick={() => router.push("/databases/new")}>
            New Database
          </Button>
        )}
      </div>

      <div className="py-6">
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <select
              value={filterEngine}
              onChange={(e) =>
                setFilterEngine(e.target.value as "all" | DatabaseEngine)
              }
              aria-label="Filter by engine"
              className="h-9 rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
            >
              <option value="all">All Engines</option>
              <option value="mysql">MySQL</option>
              <option value="mariadb">MariaDB</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(
                  e.target.value as "all" | "running" | "stopped" | "pending" | "error",
                )
              }
              aria-label="Filter by status"
              className="h-9 rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
            >
              <option value="all">All Statuses</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="pending">Pending</option>
              <option value="error">Error</option>
            </select>
          </div>
          <span className="text-xs text-muted ml-auto">
            {filteredDatabases.length} database{filteredDatabases.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Databases table */}
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
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
                    colSpan={canEdit(user) ? 8 : 7}
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
                    <tr key={db.id}>
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
                      {canEdit(user) && (
                        <td className="text-right space-x-1">
                          {db.status === "stopped" || db.status === "error" || db.status === "degraded" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(db, "start")}
                            >
                              Start
                            </Button>
                          ) : db.status === "running" ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleAction(db, "stop")}
                            >
                              Stop
                            </Button>
                          ) : null}
                          {db.status === "running" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(db, "restart")}
                            >
                              Restart
                            </Button>
                          )}
                          <Link href={`/databases/${db.id}`}>
                            <Button variant="secondary" size="sm">
                              View
                            </Button>
                          </Link>
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
