"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faChevronDown,
  faDatabase,
  faServer,
  faMicrochip,
  faMemory,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import type { Worker, BackupDestination, DatabaseEngine } from "@/types";
import { reqCreateDatabaseInstance } from "@/services/databases.service";
import { reqGetWorkers } from "@/services/workers.service";
import { reqGetBackupDestinations } from "@/services/backup-destinations.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/loading";
import { canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import Link from "next/link";

// ── Engine definitions ───────────────────────────────────────────────────────

const ENGINE_OPTIONS: {
  value: DatabaseEngine;
  label: string;
  description: string;
  defaultVersion: string;
  versions: string[];
  defaultPort: number;
  color: string;
  icon: string;
}[] = [
  {
    value: "mysql",
    label: "MySQL",
    description: "The world's most popular open-source relational database",
    defaultVersion: "8",
    versions: ["8", "8.0", "8.4", "9.0"],
    defaultPort: 3306,
    color: "#00758f",
    icon: "M",
  },
  {
    value: "mariadb",
    label: "MariaDB",
    description: "Enhanced, drop-in replacement for MySQL with improved performance",
    defaultVersion: "11",
    versions: ["11", "11.4", "10.11", "10.6"],
    defaultPort: 3306,
    color: "#c0765a",
    icon: "Ma",
  },
  {
    value: "postgres",
    label: "PostgreSQL",
    description: "Advanced open-source database with extensibility and SQL compliance",
    defaultVersion: "16",
    versions: ["17", "16", "15", "14"],
    defaultPort: 5432,
    color: "#336791",
    icon: "Pg",
  },
];

// ── Resource presets ─────────────────────────────────────────────────────────

type ResourcePreset = {
  key: string;
  label: string;
  description: string;
  cpu: number;
  memory: number; // MB
};

const RESOURCE_PRESETS: ResourcePreset[] = [
  { key: "micro", label: "Micro", description: "Development & testing", cpu: 0.5, memory: 256 },
  { key: "small", label: "Small", description: "Low-traffic applications", cpu: 1, memory: 512 },
  { key: "medium", label: "Medium", description: "Production workloads", cpu: 2, memory: 1024 },
  { key: "large", label: "Large", description: "High-performance workloads", cpu: 4, memory: 4096 },
  { key: "custom", label: "Custom", description: "Set your own limits", cpu: 0, memory: 0 },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function NewDatabasePage() {
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (user && !canEdit(user)) {
      router.push("/databases");
    }
  }, [user, router]);

  const [loadingData, setLoadingData] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [backupDestinations, setBackupDestinations] = useState<BackupDestination[]>([]);

  // Step 1: Engine
  const [engine, setEngine] = useState<DatabaseEngine | null>(null);

  // Step 2: Configuration
  const [name, setName] = useState("");
  const [engineVersion, setEngineVersion] = useState("");
  const [workerId, setWorkerId] = useState<number | "">("");
  const [port, setPort] = useState<number | "">("");
  const [databaseName, setDatabaseName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Step 3: Resources
  const [resourcePreset, setResourcePreset] = useState("small");
  const [cpuLimit, setCpuLimit] = useState<number | "">(1);
  const [memoryLimit, setMemoryLimit] = useState<number | "">(512);

  // Step 4: Backup (optional)
  const [showBackupSection, setShowBackupSection] = useState(false);
  const [backupDestinationId, setBackupDestinationId] = useState<number | "">("");
  const [snapshotSchedule, setSnapshotSchedule] = useState("");
  const [retentionCount, setRetentionCount] = useState<number | "">("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Lattice - New Database";
  }, []);

  useEffect(() => {
    Promise.all([reqGetWorkers(), reqGetBackupDestinations()]).then(
      ([workersRes, destRes]) => {
        if (workersRes.success) setWorkers(workersRes.data ?? []);
        else toast.error("Failed to load workers");
        if (destRes.success) setBackupDestinations(destRes.data ?? []);
        else toast.error("Failed to load backup destinations");
        setLoadingData(false);
      },
    );
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
      const currentEngine = ENGINE_OPTIONS.find((e) => e.value === engine);
      setEngine(value);
      if (!engineVersion || engineVersion === currentEngine?.defaultVersion) {
        setEngineVersion(option.defaultVersion);
      }
      if (!port || port === currentEngine?.defaultPort) {
        setPort(option.defaultPort);
      }
    },
    [engine, engineVersion, port],
  );

  const handlePresetSelect = useCallback((preset: ResourcePreset) => {
    setResourcePreset(preset.key);
    if (preset.key !== "custom") {
      setCpuLimit(preset.cpu);
      setMemoryLimit(preset.memory);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!engine || !name.trim() || !databaseName.trim() || !username.trim() || !workerId) return;

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
    } catch {
      toast.error("Failed to create database");
    } finally {
      setSubmitting(false);
    }
  };

  if (user && !canEdit(user)) return null;
  if (loadingData) return <PageLoader />;

  const isFormValid = engine && name.trim() && databaseName.trim() && username.trim() && workerId;

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="breadcrumb mb-2">
          <Link href="/databases" className="breadcrumb-link flex items-center gap-1.5">
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 rotate-180" />
            Databases
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">New</span>
        </div>
        <h1 className="page-title text-xl">Create Database</h1>
        <p className="text-sm text-secondary mt-1">
          Deploy a new managed database instance on your infrastructure
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-8">
        {/* ── Step 1: Engine Selection ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-brand/15 text-brand text-xs font-bold">1</div>
            <h2 className="text-sm font-semibold text-primary">Choose your engine</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ENGINE_OPTIONS.map((opt) => {
              const selected = engine === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleEngineSelect(opt.value)}
                  className={`group relative rounded-xl border-2 p-6 text-left transition-all cursor-pointer ${
                    selected
                      ? "border-brand bg-brand/5 shadow-sm"
                      : "border-border-strong bg-surface hover:border-border-emphasis hover:bg-surface-elevated"
                  }`}
                >
                  {/* Engine icon */}
                  <div
                    className="flex items-center justify-center h-12 w-12 rounded-lg text-white text-sm font-bold mb-4"
                    style={{ backgroundColor: opt.color }}
                  >
                    {opt.icon}
                  </div>
                  <div className="text-base font-semibold text-primary">{opt.label}</div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">{opt.description}</p>
                  <div className="mt-3 text-[11px] text-secondary">
                    Default: v{opt.defaultVersion} &middot; Port {opt.defaultPort}
                  </div>

                  {/* Selected checkmark */}
                  {selected && (
                    <div className="absolute top-3 right-3 flex items-center justify-center h-5 w-5 rounded-full bg-brand text-white">
                      <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {engine && (
          <>
            {/* ── Step 2: Instance Configuration ────────────────────────────── */}
            <section>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-brand/15 text-brand text-xs font-bold">2</div>
                <h2 className="text-sm font-semibold text-primary">Configure your instance</h2>
              </div>
              <div className="card p-6 space-y-5">
                {/* Instance name + version row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Input
                    id="db-name"
                    label="Instance Name"
                    placeholder="my-database"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="db-version" className="text-xs font-medium text-secondary uppercase tracking-wider">
                      Version
                    </label>
                    <select
                      id="db-version"
                      value={engineVersion}
                      onChange={(e) => setEngineVersion(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                    >
                      {selectedEngine?.versions.map((v) => (
                        <option key={v} value={v}>
                          {selectedEngine.label} {v}
                          {v === selectedEngine.defaultVersion ? " (latest)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="db-worker" className="text-xs font-medium text-secondary uppercase tracking-wider">
                      Worker
                    </label>
                    <select
                      id="db-worker"
                      value={workerId}
                      onChange={(e) => setWorkerId(e.target.value ? Number(e.target.value) : "")}
                      required
                      className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                    >
                      <option value="">Select a worker...</option>
                      {onlineWorkers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    {onlineWorkers.length === 0 && (
                      <p className="text-[11px] text-destructive">No workers are online</p>
                    )}
                  </div>
                </div>

                {/* Database + credentials row */}
                <div className="border-t border-border-subtle pt-5">
                  <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">Database &amp; Credentials</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    <Input
                      id="db-password"
                      label="Password"
                      type="password"
                      placeholder="Auto-generated if blank"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                {/* Advanced: port */}
                <div className="border-t border-border-subtle pt-5">
                  <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">Network</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      id="db-port"
                      label="Host Port"
                      type="number"
                      placeholder={String(selectedEngine?.defaultPort)}
                      value={port}
                      onChange={(e) => setPort(e.target.value ? Number(e.target.value) : "")}
                    />
                    <div className="sm:col-span-2 flex items-end pb-2">
                      <p className="text-[11px] text-muted">
                        The port exposed on the worker host. Default: {selectedEngine?.defaultPort}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Step 3: Resources ──────────────────────────────────────────── */}
            <section>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-brand/15 text-brand text-xs font-bold">3</div>
                <h2 className="text-sm font-semibold text-primary">Choose resources</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {RESOURCE_PRESETS.map((preset) => {
                  const selected = resourcePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`relative rounded-xl border-2 p-4 text-left transition-all cursor-pointer ${
                        selected
                          ? "border-brand bg-brand/5 shadow-sm"
                          : "border-border-strong bg-surface hover:border-border-emphasis hover:bg-surface-elevated"
                      }`}
                    >
                      <div className="text-sm font-semibold text-primary">{preset.label}</div>
                      <p className="text-[11px] text-muted mt-1">{preset.description}</p>
                      {preset.key !== "custom" && (
                        <div className="mt-2.5 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-secondary">
                            <FontAwesomeIcon icon={faMicrochip} className="h-2.5 w-2.5 text-muted" />
                            {preset.cpu} {preset.cpu === 1 ? "core" : "cores"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-secondary">
                            <FontAwesomeIcon icon={faMemory} className="h-2.5 w-2.5 text-muted" />
                            {preset.memory >= 1024 ? `${preset.memory / 1024} GB` : `${preset.memory} MB`}
                          </div>
                        </div>
                      )}
                      {selected && (
                        <div className="absolute top-2 right-2 flex items-center justify-center h-4 w-4 rounded-full bg-brand text-white">
                          <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Custom resource inputs */}
              {resourcePreset === "custom" && (
                <div className="card p-5 mt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id="db-cpu-limit"
                      label="CPU Limit (cores)"
                      type="number"
                      placeholder="e.g. 2"
                      value={cpuLimit}
                      onChange={(e) => setCpuLimit(e.target.value ? Number(e.target.value) : "")}
                    />
                    <Input
                      id="db-memory-limit"
                      label="Memory Limit (MB)"
                      type="number"
                      placeholder="e.g. 1024"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(e.target.value ? Number(e.target.value) : "")}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Step 4: Backup & Scheduling (optional, collapsible) ─────── */}
            <section>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-surface-elevated text-muted text-xs font-bold border border-border-strong">4</div>
                <h2 className="text-sm font-semibold text-primary">Backup &amp; scheduling</h2>
                <span className="text-[11px] text-muted bg-surface-elevated border border-border-subtle rounded px-1.5 py-0.5">Optional</span>
              </div>
              <div className="card">
                <button
                  type="button"
                  onClick={() => setShowBackupSection(!showBackupSection)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer hover:bg-surface-elevated/50 transition-colors rounded-xl"
                >
                  <div>
                    <div className="text-sm text-primary">Configure automated snapshots</div>
                    <p className="text-[11px] text-muted mt-0.5">Set up scheduled backups to S3, Google Drive, or Samba</p>
                  </div>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`h-3.5 w-3.5 text-muted transition-transform ${showBackupSection ? "rotate-180" : ""}`}
                  />
                </button>
                {showBackupSection && (
                  <div className="px-6 pb-6 space-y-4 border-t border-border-subtle pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="db-backup-destination" className="text-xs font-medium text-secondary uppercase tracking-wider">
                          Backup Destination
                        </label>
                        <select
                          id="db-backup-destination"
                          value={backupDestinationId}
                          onChange={(e) => setBackupDestinationId(e.target.value ? Number(e.target.value) : "")}
                          className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                        >
                          <option value="">None</option>
                          {backupDestinations.map((bd) => (
                            <option key={bd.id} value={bd.id}>
                              {bd.name} ({bd.type.replace("_", " ")})
                            </option>
                          ))}
                        </select>
                        {backupDestinations.length === 0 && (
                          <p className="text-[11px] text-muted">
                            No destinations configured.{" "}
                            <Link href="/backup-destinations" className="text-info hover:underline">
                              Add one
                            </Link>
                          </p>
                        )}
                      </div>
                      <Input
                        id="db-retention-count"
                        label="Retention Count"
                        type="number"
                        placeholder="e.g. 7"
                        value={retentionCount}
                        onChange={(e) => setRetentionCount(e.target.value ? Number(e.target.value) : "")}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="db-schedule" className="text-xs font-medium text-secondary uppercase tracking-wider">
                        Schedule
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { label: "Daily at 2 AM", value: "0 2 * * *" },
                          { label: "Every 6 hours", value: "0 */6 * * *" },
                          { label: "Weekly (Sun 2 AM)", value: "0 2 * * 0" },
                        ].map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setSnapshotSchedule(preset.value)}
                            className={`rounded-lg border px-3 py-2 text-left text-xs transition-all cursor-pointer ${
                              snapshotSchedule === preset.value
                                ? "border-brand bg-brand/5 text-primary"
                                : "border-border-strong bg-surface-elevated text-secondary hover:border-border-emphasis"
                            }`}
                          >
                            <span className="font-medium">{preset.label}</span>
                            <span className="ml-2 text-muted font-mono">{preset.value}</span>
                          </button>
                        ))}
                        <div className="flex flex-col gap-1">
                          <input
                            id="db-schedule"
                            type="text"
                            placeholder="Custom cron: 0 2 * * *"
                            value={snapshotSchedule}
                            onChange={(e) => setSnapshotSchedule(e.target.value)}
                            className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary font-mono placeholder:text-muted focus:border-border-emphasis focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Submit ───────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                loading={submitting}
                disabled={submitting || !isFormValid || !canEdit(user)}
              >
                {submitting ? "Creating..." : "Create Database"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push("/databases")}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
