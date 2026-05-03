"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { DatabaseInstance, DatabaseEngine, Worker } from "@/types";
import {
  reqGetDatabaseInstances,
  reqCreateDatabaseInstance,
  reqDatabaseAction,
  reqDeleteDatabaseInstance,
} from "@/services/databases.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-modal";
import { canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import WorkerBadge from "@/components/ui/worker-badge";

export default function DatabasesPage() {
  const user = useUser();
  const showConfirm = useConfirm();
  const [databases, setDatabases] = useState<DatabaseInstance[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [filterEngine, setFilterEngine] = useState<"all" | DatabaseEngine>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "running" | "stopped" | "pending" | "error">("all");

  // Create form
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<DatabaseEngine>("postgres");
  const [engineVersion, setEngineVersion] = useState("");
  const [workerId, setWorkerId] = useState<number | "">("");
  const [port, setPort] = useState<number | "">("");
  const [databaseName, setDatabaseName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rootPassword, setRootPassword] = useState("");
  const [cpuLimit, setCpuLimit] = useState<number | "">("");
  const [memoryLimit, setMemoryLimit] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

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
      if (event.type === "db_status" || event.type === "db_health_status") {
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

  const onlineWorkers = useMemo(
    () => workers.filter((w) => w.status === "online"),
    [workers],
  );

  const filteredDatabases = useMemo(() => {
    return databases.filter((db) => {
      if (filterEngine !== "all" && db.engine !== filterEngine) return false;
      if (filterStatus !== "all" && db.status !== filterStatus) return false;
      return true;
    });
  }, [databases, filterEngine, filterStatus]);

  const resetForm = () => {
    setName("");
    setEngine("postgres");
    setEngineVersion("");
    setWorkerId("");
    setPort("");
    setDatabaseName("");
    setUsername("");
    setPassword("");
    setRootPassword("");
    setCpuLimit("");
    setMemoryLimit("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !databaseName.trim() || !username.trim() || !workerId) return;
    setSubmitting(true);
    try {
      const res = await reqCreateDatabaseInstance({
        name: name.trim(),
        engine,
        engine_version: engineVersion.trim() || undefined,
        worker_id: workerId as number,
        port: port ? (port as number) : undefined,
        database_name: databaseName.trim(),
        username: username.trim(),
        password: password.trim() || undefined,
        root_password: rootPassword.trim() || undefined,
        cpu_limit: cpuLimit ? (cpuLimit as number) : undefined,
        memory_limit: memoryLimit ? (memoryLimit as number) : undefined,
      });
      if (res.success) {
        toast.success(`Database "${name}" created`);
        setDatabases((prev) => [...prev, res.data]);
        setShowForm(false);
        resetForm();
      } else {
        toast.error(res.error_message || "Failed to create database");
      }
    } catch {
      toast.error("Failed to create database");
    } finally {
      setSubmitting(false);
    }
  };

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
          <Button
            onClick={() => {
              setShowForm(!showForm);
              if (showForm) resetForm();
            }}
          >
            {showForm ? "Cancel" : "New Database"}
          </Button>
        )}
      </div>

      <div className="py-6">
        {/* Create form */}
        {canEdit(user) && showForm && (
          <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input
                id="db-name"
                label="Name"
                placeholder="my-database"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="db-engine"
                  className="text-xs font-medium text-secondary uppercase tracking-wider"
                >
                  Engine
                </label>
                <select
                  id="db-engine"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as DatabaseEngine)}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
                >
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="mariadb">MariaDB</option>
                </select>
              </div>
              <Input
                id="db-engine-version"
                label="Engine Version"
                placeholder="e.g. 16, 8.0, 11"
                value={engineVersion}
                onChange={(e) => setEngineVersion(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="db-worker"
                  className="text-xs font-medium text-secondary uppercase tracking-wider"
                >
                  Worker
                </label>
                <select
                  id="db-worker"
                  value={workerId}
                  onChange={(e) =>
                    setWorkerId(e.target.value ? Number(e.target.value) : "")
                  }
                  required
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
                >
                  <option value="">Select a worker...</option>
                  {onlineWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                id="db-port"
                label="Port"
                type="number"
                placeholder="Auto-assign"
                value={port}
                onChange={(e) =>
                  setPort(e.target.value ? Number(e.target.value) : "")
                }
              />
              <Input
                id="db-database-name"
                label="Database Name"
                placeholder="app_production"
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                required
              />
              <Input
                id="db-username"
                label="Username"
                placeholder="db_user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <Input
                  id="db-password"
                  label="Password"
                  type="password"
                  placeholder="Leave blank to auto-generate"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-[11px] text-muted">
                  If left blank, a secure password will be auto-generated.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Input
                  id="db-root-password"
                  label="Root Password"
                  type="password"
                  placeholder="Leave blank to auto-generate"
                  value={rootPassword}
                  onChange={(e) => setRootPassword(e.target.value)}
                />
                <p className="text-[11px] text-muted">
                  For MySQL/MariaDB root access. Leave blank to auto-generate.
                </p>
              </div>
              <Input
                id="db-cpu-limit"
                label="CPU Limit"
                type="number"
                placeholder="e.g. 2"
                value={cpuLimit}
                onChange={(e) =>
                  setCpuLimit(e.target.value ? Number(e.target.value) : "")
                }
              />
              <Input
                id="db-memory-limit"
                label="Memory Limit (MB)"
                type="number"
                placeholder="e.g. 512"
                value={memoryLimit}
                onChange={(e) =>
                  setMemoryLimit(e.target.value ? Number(e.target.value) : "")
                }
              />
            </div>
            <Button
              type="submit"
              loading={submitting}
              disabled={
                submitting ||
                !name.trim() ||
                !databaseName.trim() ||
                !username.trim() ||
                !workerId
              }
            >
              {submitting ? "Creating..." : "Create Database"}
            </Button>
          </form>
        )}

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
                        <StatusBadge status={db.status} />
                      </td>
                      <td className="hidden lg:table-cell">
                        <StatusBadge status={db.health_status} />
                      </td>
                      {canEdit(user) && (
                        <td className="text-right space-x-1">
                          {db.status === "stopped" || db.status === "error" ? (
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
                            onClick={async () => {
                              const confirmed = await showConfirm({
                                title: `Delete database "${db.name}"`,
                                message: "This will permanently delete the database instance. This action cannot be undone.",
                                confirmLabel: "Delete",
                                variant: "danger",
                              });
                              if (!confirmed) return;
                              try {
                                const res = await reqDeleteDatabaseInstance(db.id);
                                if (res.success) {
                                  toast.success(`Database "${db.name}" deleted`);
                                  setDatabases((prev) => prev.filter((d) => d.id !== db.id));
                                } else {
                                  toast.error(res.error_message || "Failed to delete database");
                                }
                              } catch {
                                toast.error("Failed to delete database");
                              }
                            }}
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
