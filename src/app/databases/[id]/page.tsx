"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faPlay,
  faStop,
  faRotateRight,
  faTrash,
  faCopy,
  faEye,
  faEyeSlash,
  faCamera,
  faClockRotateLeft,
  faTerminal,
  faCircleExclamation,
  faFloppyDisk,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import type {
  DatabaseInstance,
  DatabaseCredentials,
  DatabaseSnapshot,
  DatabaseInstanceEvent,
  DatabaseConsoleSession,
  BackupDestination,
  ContainerLog,
  LifecycleLog,
} from "@/types";
import {
  reqGetDatabaseInstance,
  reqDatabaseAction,
  reqRevealDatabaseCredentials,
  reqGetDatabaseEvents,
  reqGetDatabaseLogs,
  reqGetDatabaseLifecycleLogs,
  reqOpenDatabaseConsole,
  reqGetDatabaseSnapshots,
  reqCreateDatabaseSnapshot,
  reqRestoreDatabaseSnapshot,
  reqDeleteDatabaseSnapshot,
  reqUpdateDatabaseInstance,
  reqDeleteDatabaseInstance,
} from "@/services/databases.service";
import { reqGetBackupDestinations } from "@/services/backup-destinations.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Terminal } from "@/components/ui/terminal";
import {
  LogViewer,
  sortLogs,
  downloadLogsAsTxt,
  type LogLimit,
} from "@/components/ui/log-viewer";
import { formatDate, formatBytes, timeAgo, canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { usePoll } from "@/hooks/usePoll";
import { useConfirm } from "@/components/ui/confirm-modal";

const ENGINE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
};

/** Badge colour for an event whose row carries no status of its own. */
const EVENT_KIND_STATUS: Record<string, string> = {
  requested: "pending",
  accepted: "pending",
  transition: "active",
  health: "healthy",
  failed: "error",
  reconciled: "active",
  console_open: "active",
  reveal: "active",
};

/**
 * Folds worker lifecycle messages into the container log stream so provisioning
 * progress and container output read as one timeline. Lifecycle entries are
 * flagged so the viewer can distinguish them.
 */
function mergeLifecycleIntoLogs(
  logs: ContainerLog[],
  lifecycle: LifecycleLog[],
): ContainerLog[] {
  const asLogs: ContainerLog[] = lifecycle.map((l) => ({
    id: l.id,
    container_id: l.container_id,
    container_name: l.container_name,
    worker_id: l.worker_id,
    stream: "lifecycle",
    message: `[${l.event}] ${l.message}`,
    recorded_at: l.recorded_at,
  })) as unknown as ContainerLog[];
  return sortLogs([...logs, ...asLogs]);
}

type DatabaseTab = "overview" | "snapshots" | "logs" | "events" | "settings";

export default function DatabaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const user = useUser();
  const showConfirm = useConfirm();

  const [db, setDb] = useState<DatabaseInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DatabaseTab>("overview");

  // Observability: container output, worker-emitted lifecycle messages, and the
  // control plane's own transition history. These were all being recorded
  // already but had no read path addressed by database instance.
  const [logs, setLogs] = useState<ContainerLog[]>([]);
  const [lifecycleLogs, setLifecycleLogs] = useState<LifecycleLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLimit, setLogLimit] = useState<LogLimit>(500);
  const [events, setEvents] = useState<DatabaseInstanceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Console session, authorised server-side before the terminal opens.
  const [consoleSession, setConsoleSession] = useState<DatabaseConsoleSession | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Credentials
  const [credentials, setCredentials] = useState<DatabaseCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Snapshots
  const [snapshots, setSnapshots] = useState<DatabaseSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotActionLoading, setSnapshotActionLoading] = useState<Record<number, string>>({});
  const [takingSnapshot, setTakingSnapshot] = useState(false);

  // Settings
  const [backupDestinations, setBackupDestinations] = useState<BackupDestination[]>([]);
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    port: "",
    snapshot_schedule: "",
    retention_count: "",
    backup_destination_id: "",
    cpu_limit: "",
    memory_limit: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingDb, setDeletingDb] = useState(false);

  // Mounted ref
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── Data loading ────────────────────────────────────────────────────────────

  const loadDatabase = useCallback(async () => {
    const res = await reqGetDatabaseInstance(id);
    if (!mountedRef.current) return;
    if (res.success) {
      setDb(res.data);
    } else {
      toast.error(res.error_message || "Failed to load database");
    }
    setLoading(false);
  }, [id]);

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    const res = await reqGetDatabaseSnapshots(id);
    if (!mountedRef.current) return;
    if (res.success) setSnapshots(res.data ?? []);
    setSnapshotsLoading(false);
  }, [id]);

  const loadBackupDestinations = useCallback(async () => {
    const res = await reqGetBackupDestinations();
    if (!mountedRef.current) return;
    if (res.success) setBackupDestinations(res.data ?? []);
  }, []);

  // Initial load
  useEffect(() => {
    loadDatabase();
  }, [loadDatabase]);

  // Load snapshots when tab switches to snapshots
  useEffect(() => {
    if (activeTab === "snapshots") loadSnapshots();
  }, [activeTab, loadSnapshots]);

  // Load backup destinations for settings tab
  useEffect(() => {
    if (activeTab === "settings") loadBackupDestinations();
  }, [activeTab, loadBackupDestinations]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const [logRes, lifecycleRes] = await Promise.all([
      reqGetDatabaseLogs(id, { limit: logLimit }),
      reqGetDatabaseLifecycleLogs(id, { limit: 200 }),
    ]);
    if (!mountedRef.current) return;
    if (logRes.success) setLogs(sortLogs([...(logRes.data ?? [])]));
    if (lifecycleRes.success) setLifecycleLogs(lifecycleRes.data ?? []);
    setLogsLoading(false);
  }, [id, logLimit]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    const res = await reqGetDatabaseEvents(id, { limit: 200 });
    if (!mountedRef.current) return;
    if (res.success) setEvents(res.data ?? []);
    setEventsLoading(false);
  }, [id]);

  useEffect(() => {
    if (activeTab === "logs") loadLogs();
  }, [activeTab, loadLogs]);

  const mergedLogs = useMemo(
    () => mergeLifecycleIntoLogs(logs, lifecycleLogs),
    [logs, lifecycleLogs],
  );

  useEffect(() => {
    if (activeTab === "events") loadEvents();
  }, [activeTab, loadEvents]);

  // Sync settings form when db loads
  useEffect(() => {
    if (db) {
      setSettingsForm({
        name: db.name ?? "",
        port: db.port != null ? String(db.port) : "",
        snapshot_schedule: db.snapshot_schedule ?? "",
        retention_count: db.retention_count != null ? String(db.retention_count) : "",
        backup_destination_id: db.backup_destination_id != null ? String(db.backup_destination_id) : "",
        cpu_limit: db.cpu_limit != null ? String(db.cpu_limit) : "",
        memory_limit: db.memory_limit != null ? String(db.memory_limit) : "",
      });
    }
  }, [db]);

  // Set document title
  useEffect(() => {
    if (db) document.title = `Lattice - ${db.name}`;
  }, [db]);

  // Poll for status updates (10s)
  usePoll(loadDatabase, 10000);

  // ─── WebSocket ───────────────────────────────────────────────────────────────

  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      const payload = event.payload ?? {};
      const instanceId = payload["database_instance_id"] as number | undefined;

      if (instanceId !== id) return;

      if (
        event.type === "db_status" ||
        event.type === "db_health_status" ||
        event.type === "db_instance_changed"
      ) {
        loadDatabase();
      }

      // The worker finished destroying this instance while the page was open —
      // there is nothing left to show.
      if (event.type === "db_instance_deleted") {
        toast.success("Database deleted");
        router.push("/databases");
      }

      if (event.type === "db_snapshot_status" || event.type === "db_restore_status") {
        loadDatabase();
        if (activeTab === "snapshots") loadSnapshots();
      }
    },
    [id, loadDatabase, loadSnapshots, activeTab, router],
  );
  useAdminSocket(handleSocketEvent);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const runAction = async (action: "start" | "stop" | "restart" | "remove") => {
    if (!db) return;
    const label = action.charAt(0).toUpperCase() + action.slice(1);

    // Confirm destructive actions
    if (action === "stop") {
      const ok = await showConfirm({
        title: `Stop ${db.name}`,
        message: "Are you sure you want to stop this database? Active connections will be terminated.",
        confirmLabel: "Stop",
        variant: "danger",
      });
      if (!ok) return;
    }

    if (action === "remove") {
      const ok = await showConfirm({
        title: `Remove ${db.name}'s container`,
        message:
          "This destroys the container but keeps the data volume, so you can start the database again with its data intact. To destroy the data too, use Delete database in Settings.",
        confirmLabel: "Remove container",
        variant: "danger",
      });
      if (!ok) return;
    }

    setActionLoading(action);
    const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${db.name}...`);

    try {
      const res = await reqDatabaseAction(id, action);
      if (res.success) {
        toast.success(`${label} command sent to ${db.name}`, { id: toastId });
        // Deliberately stays on the page after a remove. Navigating away used
        // to read as "deleted" when the instance is still very much here —
        // stopped, with its data volume — which is exactly how a removed
        // container came to look like a ghost row in the list.
        setTimeout(loadDatabase, 2000);
      } else {
        toast.error(`${label} failed: ${res.error_message ?? "Unknown error"}`, { id: toastId });
      }
    } catch (err) {
      toast.error(`${label} error: ${String(err)}`, { id: toastId });
    }

    setActionLoading(null);
  };

  // ─── Credentials ─────────────────────────────────────────────────────────────

  const handleShowCredentials = async () => {
    if (credentials) {
      setShowPassword(!showPassword);
      return;
    }
    setCredentialsLoading(true);
    // Root is deliberately not requested here — the application user is what
    // you want for routine access, and every reveal is audited server-side.
    const res = await reqRevealDatabaseCredentials(id, false);
    if (res.success) {
      setCredentials(res.data);
      setShowPassword(true);
    } else {
      toast.error(res.error_message ?? "Failed to load credentials");
    }
    setCredentialsLoading(false);
  };

  // ─── Console ─────────────────────────────────────────────────────────────────

  const handleOpenConsole = async () => {
    setConsoleLoading(true);
    const res = await reqOpenDatabaseConsole(id);
    if (res.success) {
      setConsoleSession(res.data);
    } else {
      toast.error(res.error_message ?? "Failed to open console");
    }
    setConsoleLoading(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // ─── Snapshots ───────────────────────────────────────────────────────────────

  const handleTakeSnapshot = async () => {
    setTakingSnapshot(true);
    const toastId = toast.loading("Creating snapshot...");
    const res = await reqCreateDatabaseSnapshot(id);
    if (res.success) {
      toast.success("Snapshot created", { id: toastId });
      loadSnapshots();
    } else {
      toast.error(res.error_message ?? "Failed to create snapshot", { id: toastId });
    }
    setTakingSnapshot(false);
  };

  const handleRestoreSnapshot = async (snapshotId: number, filename: string) => {
    const ok = await showConfirm({
      title: "Restore snapshot",
      message: `Restore from "${filename}"? This will overwrite the current database with the snapshot data.`,
      confirmLabel: "Restore",
      variant: "danger",
    });
    if (!ok) return;

    setSnapshotActionLoading((prev) => ({ ...prev, [snapshotId]: "restore" }));
    const toastId = toast.loading("Restoring snapshot...");
    const res = await reqRestoreDatabaseSnapshot(id, snapshotId);
    if (res.success) {
      toast.success("Restore initiated", { id: toastId });
      loadDatabase();
    } else {
      toast.error(res.error_message ?? "Restore failed", { id: toastId });
    }
    setSnapshotActionLoading((prev) => {
      const next = { ...prev };
      delete next[snapshotId];
      return next;
    });
  };

  const handleDeleteSnapshot = async (snapshotId: number, filename: string) => {
    const ok = await showConfirm({
      title: "Delete snapshot",
      message: `Delete snapshot "${filename}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setSnapshotActionLoading((prev) => ({ ...prev, [snapshotId]: "delete" }));
    const toastId = toast.loading("Deleting snapshot...");
    const res = await reqDeleteDatabaseSnapshot(snapshotId);
    if (res.success) {
      toast.success("Snapshot deleted", { id: toastId });
      loadSnapshots();
    } else {
      toast.error(res.error_message ?? "Delete failed", { id: toastId });
    }
    setSnapshotActionLoading((prev) => {
      const next = { ...prev };
      delete next[snapshotId];
      return next;
    });
  };

  // ─── Settings ────────────────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    // A schedule with nowhere to write is silently unschedulable: the runner is
    // only told about instances that have a destination, so it would save, show
    // in this form, and never fire. The API rejects it too — this is just the
    // earlier, clearer half of the same guard.
    if (settingsForm.snapshot_schedule && !settingsForm.backup_destination_id) {
      toast.error("Choose a backup destination, or clear the snapshot schedule — a schedule with no destination never runs");
      return;
    }

    setSavingSettings(true);
    const data: Partial<{
      name: string;
      port: number | null;
      snapshot_schedule: string | null;
      retention_count: number | null;
      backup_destination_id: number | null;
      cpu_limit: number | null;
      memory_limit: number | null;
    }> = {
      name: settingsForm.name || undefined,
      port: settingsForm.port ? parseInt(settingsForm.port) : null,
      snapshot_schedule: settingsForm.snapshot_schedule || null,
      retention_count: settingsForm.retention_count ? parseInt(settingsForm.retention_count) : null,
      backup_destination_id: settingsForm.backup_destination_id ? parseInt(settingsForm.backup_destination_id) : null,
      cpu_limit: settingsForm.cpu_limit ? parseFloat(settingsForm.cpu_limit) : null,
      memory_limit: settingsForm.memory_limit ? parseInt(settingsForm.memory_limit) : null,
    };

    const res = await reqUpdateDatabaseInstance(id, data);
    if (res.success) {
      toast.success("Settings saved");
      setDb(res.data);
    } else {
      toast.error(res.error_message ?? "Failed to save settings");
    }
    setSavingSettings(false);
  };

  const handleDeleteDatabase = async () => {
    if (!db) return;

    const ok = await showConfirm({
      title: `Delete ${db.name}`,
      message:
        `This destroys the container and the data volume ${db.volume_name} on worker ${db.worker_id}. Every table and row in "${db.database_name}" goes with it and cannot be recovered — only existing snapshots, which are kept.`,
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingDb(true);
    let res = await reqDeleteDatabaseInstance(id);

    // 409 means the worker is offline, so nothing can actually be destroyed.
    // Deleting anyway is a real choice — it abandons a container and a full
    // volume on disk — so it is asked for explicitly rather than assumed.
    if (!res.success && res.status === 409) {
      const forceOk = await showConfirm({
        title: `Worker ${db.worker_id} is offline`,
        message:
          `The container and data volume cannot be destroyed while the worker is disconnected. Delete the record anyway? ${db.container_name} and ${db.volume_name} will be left on the worker and nothing in Lattice will point at them.`,
        confirmLabel: "Delete record anyway",
        variant: "danger",
      });
      if (!forceOk) {
        setDeletingDb(false);
        return;
      }
      res = await reqDeleteDatabaseInstance(id, true);
    }

    if (res.success) {
      toast.success(res.message ?? "Deleting database");
      router.push("/databases");
    } else {
      toast.error(res.error_message ?? "Failed to delete database");
      setDeletingDb(false);
    }
  };

  // ─── Derived values ──────────────────────────────────────────────────────────

  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.inserted_at).getTime() - new Date(a.inserted_at).getTime(),
      ),
    [snapshots],
  );

  const connectionString = useMemo(() => {
    if (!db) return "";
    if (credentials) return credentials.connection_string;
    const engineProto = db.engine === "postgres" ? "postgresql" : "mysql";
    return `${engineProto}://${db.username}:****@${db.container_name}:${db.port}/${db.database_name}`;
  }, [db, credentials]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;

  if (!db) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-muted">Database not found</p>
        <Link
          href="/databases"
          className="inline-flex items-center gap-1.5 text-sm text-info hover:underline mt-4"
        >
          <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 rotate-180" />
          Back to Databases
        </Link>
      </div>
    );
  }

  const isRunning = db.status === "running";
  const isStopped = db.status === "stopped" || db.status === "error";

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
          <span className="breadcrumb-current">{db.name}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title text-xl">{db.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated border border-border-subtle px-2 py-0.5 text-xs font-medium text-secondary">
                {ENGINE_LABELS[db.engine] ?? db.engine}
                {db.engine_version && (
                  <span className="text-muted">{db.engine_version}</span>
                )}
              </span>
              <StatusBadge status={db.status} />
              {db.health_status !== "none" && (
                <StatusBadge status={db.health_status} />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted flex-wrap">
              <span className="font-mono text-secondary">
                Port {db.port}
              </span>
              <span className="text-dimmed">·</span>
              <span>{db.database_name}</span>
            </div>
          </div>
          {canEdit(user) && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={isRunning || db.status === "pending" || !!actionLoading}
                loading={actionLoading === "start"}
                onClick={() => runAction("start")}
              >
                <FontAwesomeIcon icon={faPlay} className="h-3 w-3 mr-1.5" />
                Start
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!isRunning || !!actionLoading}
                loading={actionLoading === "stop"}
                onClick={() => runAction("stop")}
              >
                <FontAwesomeIcon icon={faStop} className="h-3 w-3 mr-1.5" />
                Stop
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!isRunning || !!actionLoading}
                loading={actionLoading === "restart"}
                onClick={() => runAction("restart")}
              >
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />
                Restart
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!isRunning || !!actionLoading}
                loading={consoleLoading}
                onClick={handleOpenConsole}
              >
                <FontAwesomeIcon icon={faTerminal} className="h-3 w-3 mr-1.5" />
                Console
              </Button>
              {/* Container-only teardown, distinct from Delete in Settings.
                  Stays enabled while stopped: removing the container of a
                  stopped database is legitimate, and the command is idempotent. */}
              <Button
                variant="destructive"
                size="sm"
                disabled={!!actionLoading || db.status === "deleting"}
                loading={actionLoading === "remove"}
                onClick={() => runAction("remove")}
              >
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3 mr-1.5" />
                Remove container
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Failure detail. An instance in error or degraded always carries a
          reason — surfacing it here is the difference between "it broke" and
          knowing what to do about it. */}
      {db.last_error && (db.status === "error" || db.status === "degraded") && (
        <div className="panel border-l-2 border-l-[#ef4444] p-4">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="h-4 w-4 text-[#ef4444] mt-0.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-primary">
                  {db.status === "degraded" ? "Database is impaired" : "Database failed"}
                </h3>
                <code className="font-mono text-[11px] text-secondary bg-surface-elevated px-1.5 py-0.5 rounded">
                  {db.last_error.code}
                </code>
                {db.last_error.retryable && (
                  <span className="text-[11px] text-muted">retryable</span>
                )}
              </div>
              <p className="text-sm text-secondary mt-1 break-words">
                {db.last_error.message}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[11px] text-muted">
                  {timeAgo(db.last_error.occurred_at)}
                </span>
                <button
                  onClick={() => setActiveTab("logs")}
                  className="text-[11px] text-info hover:underline"
                >
                  View logs
                </button>
                <button
                  onClick={() => setActiveTab("events")}
                  className="text-[11px] text-info hover:underline"
                >
                  View history
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="panel">
        <div className="tabs-bar !px-4 !gap-0" role="tablist">
          {(["overview", "snapshots", "logs", "events", "settings"] as DatabaseTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={activeTab === t}
              tabIndex={activeTab === t ? 0 : -1}
              onClick={() => setActiveTab(t)}
              className={`tab-item ${activeTab === t ? "active" : ""}`}
            >
              {t === "overview"
                ? "Overview"
                : t === "snapshots"
                  ? "Snapshots"
                  : t === "logs"
                    ? "Logs"
                    : t === "events"
                      ? "History"
                      : "Settings"}
            </button>
          ))}
        </div>

        {/* ─── Overview Tab ───────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="p-4 space-y-6">
            {/* Connection Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4 space-y-3">
                <h3 className="text-sm font-medium text-primary">Connection Info</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Host</dt>
                    <dd className="text-secondary font-mono">{credentials?.host ?? db.container_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Port</dt>
                    <dd className="text-secondary font-mono">{db.port}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Database</dt>
                    <dd className="text-secondary font-mono">{db.database_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Username</dt>
                    <dd className="text-secondary font-mono">{db.username}</dd>
                  </div>
                </dl>
              </div>

              {/* Credentials */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-primary">Credentials</h3>
                  <button
                    onClick={handleShowCredentials}
                    disabled={credentialsLoading}
                    className="inline-flex items-center gap-1.5 text-xs text-info hover:text-info transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {credentialsLoading ? (
                      <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                    ) : (
                      <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-3 w-3" />
                    )}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <dt className="text-muted">User Password</dt>
                    <dd className="text-secondary font-mono">
                      {showPassword && credentials ? credentials.password : "••••••••"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-muted">Root Password</dt>
                    <dd className="text-secondary font-mono">
                      {showPassword && credentials ? credentials.root_password : "••••••••"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Connection String */}
            <div className="card p-4 space-y-2">
              <h3 className="text-sm font-medium text-primary">Connection String</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-secondary overflow-x-auto">
                  {connectionString}
                </code>
                <button
                  onClick={() => {
                    if (credentials) {
                      copyToClipboard(credentials.connection_string, "Connection string");
                    } else {
                      copyToClipboard(connectionString, "Connection string (masked)");
                    }
                  }}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border-strong text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
                  title="Copy connection string"
                >
                  <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
                </button>
              </div>
              {!credentials && (
                <p className="text-xs text-muted">Click &quot;Show&quot; above to reveal the full connection string with password.</p>
              )}
            </div>

            {/* Container & Resource Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4 space-y-3">
                <h3 className="text-sm font-medium text-primary">Container</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Container Name</dt>
                    <dd className="text-secondary font-mono">{db.container_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Volume Name</dt>
                    <dd className="text-secondary font-mono">{db.volume_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Engine</dt>
                    <dd className="text-secondary">
                      {ENGINE_LABELS[db.engine] ?? db.engine} {db.engine_version}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="card p-4 space-y-3">
                <h3 className="text-sm font-medium text-primary">Resources &amp; Timing</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">CPU Limit</dt>
                    <dd className="text-secondary">
                      {db.cpu_limit != null ? `${db.cpu_limit} cores` : "No limit"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Memory Limit</dt>
                    <dd className="text-secondary">
                      {db.memory_limit != null ? `${db.memory_limit} MB` : "No limit"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Created</dt>
                    <dd className="text-secondary" title={formatDate(db.inserted_at)}>
                      {timeAgo(db.inserted_at)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Last Started</dt>
                    <dd className="text-secondary">
                      {db.started_at ? (
                        <span title={formatDate(db.started_at)}>{timeAgo(db.started_at)}</span>
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* ─── Snapshots Tab ──────────────────────────────────────────────── */}
        {activeTab === "snapshots" && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-primary">
                Snapshots
                {snapshots.length > 0 && (
                  <span className="ml-2 text-xs text-muted">({snapshots.length})</span>
                )}
              </h3>
              {canEdit(user) && (
                /* Without a backup destination the API rejects this outright, so
                   leaving the button live only turns a known-invalid state into
                   an error toast. The title says which precondition is missing. */
                <Button
                  variant="secondary"
                  size="sm"
                  loading={takingSnapshot}
                  disabled={!isRunning || takingSnapshot || !db.backup_destination_id}
                  title={
                    !db.backup_destination_id
                      ? "Configure a backup destination in Settings before taking a snapshot"
                      : !isRunning
                        ? "The database must be running to take a snapshot"
                        : undefined
                  }
                  onClick={handleTakeSnapshot}
                >
                  <FontAwesomeIcon icon={faCamera} className="h-3 w-3 mr-1.5" />
                  Take Snapshot
                </Button>
              )}
            </div>

            {!db.backup_destination_id && (
              <div className="rounded-lg border border-yellow-600/30 bg-yellow-600/5 px-4 py-3 text-sm text-yellow-400">
                No backup destination configured. Snapshots will only be stored locally.
                Configure a backup destination in the Settings tab to enable remote storage.
              </div>
            )}

            {snapshotsLoading && snapshots.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted">No snapshots yet</p>
                <p className="text-xs text-muted mt-1">
                  Take a manual snapshot or configure a schedule in Settings.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted uppercase tracking-wider">Filename</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted uppercase tracking-wider">Size</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted uppercase tracking-wider">Trigger</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted uppercase tracking-wider">Completed</th>
                      {canEdit(user) && (
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSnapshots.map((snap) => (
                      <tr
                        key={snap.id}
                        className="border-b border-border-subtle last:border-b-0 hover:bg-surface-elevated/50"
                      >
                        <td className="py-2 px-3 font-mono text-xs text-secondary max-w-[250px] truncate" title={snap.filename}>
                          {snap.filename}
                        </td>
                        <td className="py-2 px-3 text-secondary">
                          {snap.size_bytes != null ? formatBytes(snap.size_bytes) : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <StatusBadge status={snap.status} />
                          {snap.status === "failed" && snap.error_message && (
                            <p className="text-xs text-destructive mt-0.5 max-w-[200px] truncate" title={snap.error_message}>
                              {snap.error_message}
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                            snap.trigger_type === "manual"
                              ? "bg-blue-500/10 text-blue-400"
                              : "bg-purple-500/10 text-purple-400"
                          }`}>
                            {snap.trigger_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-secondary text-xs">
                          {snap.completed_at ? (
                            <span title={formatDate(snap.completed_at)}>{timeAgo(snap.completed_at)}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        {canEdit(user) && (
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {snap.status === "completed" && (
                                <button
                                  onClick={() => handleRestoreSnapshot(snap.id, snap.filename)}
                                  disabled={!!snapshotActionLoading[snap.id]}
                                  className="inline-flex items-center gap-1 text-xs text-info hover:text-info transition-colors cursor-pointer disabled:opacity-40"
                                  title="Restore from this snapshot"
                                >
                                  {snapshotActionLoading[snap.id] === "restore" ? (
                                    <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FontAwesomeIcon icon={faClockRotateLeft} className="h-3 w-3" />
                                  )}
                                  Restore
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteSnapshot(snap.id, snap.filename)}
                                disabled={!!snapshotActionLoading[snap.id]}
                                className="inline-flex items-center gap-1 text-xs text-destructive-soft hover:text-destructive-soft transition-colors cursor-pointer disabled:opacity-40"
                                title="Delete snapshot"
                              >
                                {snapshotActionLoading[snap.id] === "delete" ? (
                                  <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                                ) : (
                                  <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                                )}
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Logs Tab ───────────────────────────────────────────────────── */}
        {activeTab === "logs" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-primary">Container Logs</h3>
                <p className="text-[11px] text-muted mt-0.5">
                  <code className="font-mono text-secondary">{db.container_name}</code> on worker{" "}
                  {db.worker_id}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadLogs} loading={logsLoading}>
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />
                Refresh
              </Button>
            </div>
            <LogViewer
              logs={mergedLogs}
              logLimit={logLimit}
              onLimitChange={setLogLimit}
              onDownloadVisible={() => downloadLogsAsTxt(mergedLogs, `${db.name}-logs.txt`)}
              onDownloadLastRun={() => {
                // Everything since the container last started — the useful
                // window when diagnosing a database that came up wrong.
                const since = db.started_at ? new Date(db.started_at).getTime() : 0;
                downloadLogsAsTxt(
                  mergedLogs.filter((l) => new Date(l.recorded_at).getTime() >= since),
                  `${db.name}-last-run.txt`,
                );
              }}
              onDownloadAll={async () => {
                const res = await reqGetDatabaseLogs(id, { limit: 1000 });
                const all = res.success ? sortLogs([...(res.data ?? [])]) : logs;
                downloadLogsAsTxt(
                  mergeLifecycleIntoLogs(all, lifecycleLogs),
                  `${db.name}-logs-all.txt`,
                );
              }}
              loading={logsLoading}
            />
          </div>
        )}

        {/* ─── Events Tab ─────────────────────────────────────────────────── */}
        {activeTab === "events" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-primary">Lifecycle History</h3>
                <p className="text-[11px] text-muted mt-0.5">
                  Every state change, failure and access, newest first — this is what explains how
                  the instance reached its current state.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadEvents} loading={eventsLoading}>
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />
                Refresh
              </Button>
            </div>

            {events.length === 0 ? (
              <p className="text-sm text-muted py-6 text-center">
                {eventsLoading ? "Loading history…" : "No events recorded yet."}
              </p>
            ) : (
              <div className="divide-y divide-border-subtle">
                {events.map((ev) => (
                  <div key={ev.id} className="py-2.5 flex items-start gap-3">
                    <span className="shrink-0 mt-0.5">
                      <StatusBadge status={ev.status ?? EVENT_KIND_STATUS[ev.kind] ?? "none"} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-primary break-words">{ev.message}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {ev.kind}
                        {ev.code ? ` · ${ev.code}` : ""}
                        {ev.actor ? ` · ${ev.actor}` : ""} · {formatDate(ev.recorded_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Settings Tab ───────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="p-4 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-primary">General</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Name"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Database name"
                  disabled={!canEdit(user)}
                />
                <Input
                  label="Port"
                  type="number"
                  min={1}
                  max={65535}
                  value={settingsForm.port}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, port: e.target.value }))}
                  placeholder="5432"
                  disabled={!canEdit(user)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-primary">Backup &amp; Snapshot Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                    Snapshot Schedule
                  </label>
                  <Input
                    value={settingsForm.snapshot_schedule}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, snapshot_schedule: e.target.value }))}
                    placeholder="0 2 * * *"
                    disabled={!canEdit(user)}
                  />
                  <p className="text-xs text-muted">
                    Cron expression for automated snapshots (e.g. &quot;0 2 * * *&quot; for daily at 2 AM).
                  </p>
                </div>

                <Input
                  label="Retention Count"
                  type="number"
                  min={1}
                  value={settingsForm.retention_count}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, retention_count: e.target.value }))}
                  placeholder="7"
                  disabled={!canEdit(user)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                  Backup Destination
                </label>
                <select
                  value={settingsForm.backup_destination_id}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, backup_destination_id: e.target.value }))}
                  disabled={!canEdit(user)}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <option value="">None (local only)</option>
                  {backupDestinations.map((dest) => (
                    <option key={dest.id} value={String(dest.id)}>
                      {dest.name} ({dest.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-primary">Resource Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="CPU Limit (cores)"
                  type="number"
                  min={0}
                  step={0.25}
                  value={settingsForm.cpu_limit}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, cpu_limit: e.target.value }))}
                  placeholder="No limit"
                  disabled={!canEdit(user)}
                />
                <Input
                  label="Memory Limit (MB)"
                  type="number"
                  min={0}
                  step={64}
                  value={settingsForm.memory_limit}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, memory_limit: e.target.value }))}
                  placeholder="No limit"
                  disabled={!canEdit(user)}
                />
              </div>
            </div>

            {canEdit(user) && (
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  loading={savingSettings}
                  onClick={handleSaveSettings}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} className="h-3.5 w-3.5 mr-1.5" />
                  Save Settings
                </Button>
              </div>
            )}

            {/* Danger zone */}
            {canEdit(user) && (
              <div className="border-t border-border-subtle pt-6 mt-6">
                <h3 className="text-sm font-medium text-destructive-soft mb-2">Danger Zone</h3>
                <p className="text-xs text-muted mb-4">
                  Permanently delete this database. The container <span className="font-mono">{db.container_name}</span>{" "}
                  and its data volume <span className="font-mono">{db.volume_name}</span> are destroyed on worker{" "}
                  {db.worker_id}, and every table in <span className="font-mono">{db.database_name}</span> goes with
                  them. Snapshots are kept. To tear down the container but keep the data, use Remove container instead.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  loading={deletingDb}
                  onClick={handleDeleteDatabase}
                >
                  <FontAwesomeIcon icon={faTrash} className="h-3 w-3 mr-1.5" />
                  Delete Database
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive console. The session is authorised server-side first —
          the terminal only ever receives a container name, a worker and the
          command to run, never credentials. */}
      {consoleSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/70 font-mono">
                {ENGINE_LABELS[consoleSession.engine] ?? consoleSession.engine} ·{" "}
                {consoleSession.database_name} · {consoleSession.container_name}
              </p>
              <button
                onClick={() => setConsoleSession(null)}
                className="text-xs text-white/70 hover:text-white"
              >
                Close
              </button>
            </div>
            <Terminal
              containerId={`db-${db.id}`}
              containerName={consoleSession.container_name}
              workerId={consoleSession.worker_id}
              cmd={consoleSession.cmd}
              onClose={() => setConsoleSession(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
