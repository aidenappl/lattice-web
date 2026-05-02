"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import type { Worker, BackupDestination, DatabaseEngine } from "@/types";
import { reqCreateDatabaseInstance } from "@/services/databases.service";
import { reqGetWorkers } from "@/services/workers.service";
import { reqGetBackupDestinations } from "@/services/backup-destinations.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";

const ENGINE_OPTIONS: {
  value: DatabaseEngine;
  label: string;
  description: string;
  defaultVersion: string;
  defaultPort: number;
}[] = [
  {
    value: "mysql",
    label: "MySQL",
    description: "The world's most popular open-source database",
    defaultVersion: "8",
    defaultPort: 3306,
  },
  {
    value: "mariadb",
    label: "MariaDB",
    description: "Enhanced, drop-in MySQL replacement",
    defaultVersion: "11",
    defaultPort: 3306,
  },
  {
    value: "postgres",
    label: "PostgreSQL",
    description: "Advanced open-source relational database",
    defaultVersion: "16",
    defaultPort: 5432,
  },
];

export default function NewDatabasePage() {
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (user && !canEdit(user)) {
      router.push("/databases");
    }
  }, [user, router]);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [backupDestinations, setBackupDestinations] = useState<BackupDestination[]>([]);

  // Engine selection
  const [engine, setEngine] = useState<DatabaseEngine | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [engineVersion, setEngineVersion] = useState("");
  const [workerId, setWorkerId] = useState<number | "">("");
  const [port, setPort] = useState<number | "">("");
  const [databaseName, setDatabaseName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cpuLimit, setCpuLimit] = useState<number | "">("");
  const [memoryLimit, setMemoryLimit] = useState<number | "">("");

  // Backup & scheduling
  const [showBackupSection, setShowBackupSection] = useState(false);
  const [backupDestinationId, setBackupDestinationId] = useState<number | "">("");
  const [snapshotSchedule, setSnapshotSchedule] = useState("");
  const [retentionCount, setRetentionCount] = useState<number | "">("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Lattice - New Database";
  }, []);

  useEffect(() => {
    reqGetWorkers().then((res) => {
      if (res.success) setWorkers(res.data ?? []);
      else toast.error("Failed to load workers");
    });
    reqGetBackupDestinations().then((res) => {
      if (res.success) setBackupDestinations(res.data ?? []);
      else toast.error("Failed to load backup destinations");
    });
  }, []);

  const onlineWorkers = useMemo(
    () => workers.filter((w) => w.status === "online"),
    [workers],
  );

  const selectedEngine = useMemo(
    () => ENGINE_OPTIONS.find((e) => e.value === engine),
    [engine],
  );

  const handleEngineSelect = useCallback(
    (value: DatabaseEngine) => {
      const option = ENGINE_OPTIONS.find((e) => e.value === value)!;
      setEngine(value);
      // Auto-fill defaults when switching engine
      if (!engineVersion || ENGINE_OPTIONS.some((e) => e.defaultVersion === engineVersion)) {
        setEngineVersion(option.defaultVersion);
      }
      if (!port || ENGINE_OPTIONS.some((e) => e.defaultPort === port)) {
        setPort(option.defaultPort);
      }
    },
    [engineVersion, port],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!engine || !name.trim() || !databaseName.trim() || !username.trim() || !workerId) return;

    setSubmitting(true);
    const res = await reqCreateDatabaseInstance({
      name: name.trim(),
      engine,
      engine_version: engineVersion.trim() || undefined,
      worker_id: workerId as number,
      port: port ? (port as number) : undefined,
      database_name: databaseName.trim(),
      username: username.trim(),
      password: password.trim() || undefined,
      cpu_limit: cpuLimit ? (cpuLimit as number) : undefined,
      memory_limit: memoryLimit ? (memoryLimit as number) : undefined,
      snapshot_schedule: snapshotSchedule.trim() || undefined,
      retention_count: retentionCount ? (retentionCount as number) : undefined,
      backup_destination_id: backupDestinationId ? (backupDestinationId as number) : undefined,
    });

    if (res.success) {
      toast.success(`Database "${name}" created`);
      router.push(`/databases/${res.data.id}`);
    } else {
      toast.error(res.error_message || "Failed to create database");
    }
    setSubmitting(false);
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="breadcrumb mb-2">
          <Link
            href="/databases"
            className="breadcrumb-link flex items-center gap-1.5"
          >
            <FontAwesomeIcon
              icon={faChevronRight}
              className="h-3 w-3 rotate-180"
            />
            Databases
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">New</span>
        </div>
        <h1 className="page-title text-xl">New Database</h1>
        <p className="text-sm text-secondary mt-1">
          Create a new managed database instance
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Engine selector */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-primary mb-4">
            Select Engine
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ENGINE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleEngineSelect(opt.value)}
                className={`relative rounded-lg border p-4 text-left transition-all cursor-pointer ${
                  engine === opt.value
                    ? "border-brand bg-brand/5 ring-1 ring-brand"
                    : "border-border-strong bg-surface-elevated hover:border-border-emphasis"
                }`}
              >
                <div className="text-sm font-semibold text-primary">
                  {opt.label}
                </div>
                <p className="text-xs text-muted mt-1">{opt.description}</p>
                {engine === opt.value && (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-brand" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Form fields — shown after engine selected */}
        {engine && (
          <>
            {/* Core configuration */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-primary mb-4">
                Configuration
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="db-name"
                  label="Name"
                  placeholder="my-database"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Input
                  id="db-engine-version"
                  label="Engine Version"
                  placeholder={selectedEngine?.defaultVersion}
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
                        {w.name} ({w.status})
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  id="db-port"
                  label="Port"
                  type="number"
                  placeholder={String(selectedEngine?.defaultPort)}
                  value={port}
                  onChange={(e) =>
                    setPort(e.target.value ? Number(e.target.value) : "")
                  }
                />
              </div>
            </div>

            {/* Credentials */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-primary mb-4">
                Credentials
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Input
                    id="db-password"
                    label="Password"
                    type="password"
                    placeholder="Leave blank to auto-generate"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-[11px] text-muted">
                    Leave blank to auto-generate a secure password
                  </p>
                </div>
              </div>
            </div>

            {/* Resource limits */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-primary mb-4">
                Resource Limits
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="db-cpu-limit"
                  label="CPU Limit (cores)"
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
            </div>

            {/* Backup & Scheduling — collapsible */}
            <div className="card">
              <button
                type="button"
                onClick={() => setShowBackupSection(!showBackupSection)}
                className="w-full flex items-center justify-between p-6 text-left cursor-pointer"
              >
                <h2 className="text-sm font-semibold text-primary">
                  Backup &amp; Scheduling
                </h2>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`h-3.5 w-3.5 text-muted transition-transform ${
                    showBackupSection ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showBackupSection && (
                <div className="px-6 pb-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="db-backup-destination"
                        className="text-xs font-medium text-secondary uppercase tracking-wider"
                      >
                        Backup Destination
                      </label>
                      <select
                        id="db-backup-destination"
                        value={backupDestinationId}
                        onChange={(e) =>
                          setBackupDestinationId(
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                        className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
                      >
                        <option value="">None</option>
                        {backupDestinations.map((bd) => (
                          <option key={bd.id} value={bd.id}>
                            {bd.name} ({bd.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      id="db-retention-count"
                      label="Retention Count"
                      type="number"
                      placeholder="e.g. 7"
                      value={retentionCount}
                      onChange={(e) =>
                        setRetentionCount(
                          e.target.value ? Number(e.target.value) : "",
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Input
                      id="db-snapshot-schedule"
                      label="Snapshot Schedule (cron)"
                      placeholder="0 2 * * *"
                      value={snapshotSchedule}
                      onChange={(e) => setSnapshotSchedule(e.target.value)}
                    />
                    <p className="text-[11px] text-muted">
                      Standard 5-field cron expression. Examples: &apos;0 2 * * *&apos; (daily at 2am), &apos;0 */6 * * *&apos; (every 6 hours)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={
                  submitting ||
                  !name.trim() ||
                  !databaseName.trim() ||
                  !username.trim() ||
                  !workerId ||
                  !canEdit(user)
                }
              >
                {submitting ? "Creating..." : "Create Database"}
              </Button>
              <Link
                href="/databases"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Cancel
              </Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
