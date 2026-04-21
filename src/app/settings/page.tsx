"use client";

import { useEffect, useState } from "react";
import type { User, WebhookConfig } from "@/types";
import {
  reqGetUsers,
  reqCreateUser,
  reqUpdateUser,
  reqDeleteUser,
  reqUpdateAPI,
  reqUpdateWeb,
  reqRefreshVersions,
  reqGetWebhooks,
  reqCreateWebhook,
  reqUpdateWebhook,
  reqDeleteWebhook,
  reqTestWebhook,
} from "@/services/admin.service";
import { useUser } from "@/store/hooks";
import { isAdmin, formatDate, isNewerVersion } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faServer,
  faGlobe,
  faMicrochip,
  faCheck,
  faArrowUp,
} from "@fortawesome/free-solid-svg-icons";
import { APP_VERSION } from "@/lib/version";
import toast from "react-hot-toast";
import { RunnerUpgradePanel } from "@/components/layout/RunnerUpgradePanel";
import { useVersionCheck } from "@/hooks/useVersionCheck";

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API ?? "";

function waitForAPIRestart(toastId: string, onFail: () => void) {
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`${API_URL}/healthcheck`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        clearInterval(poll);
        toast.success("API restarted successfully.", { id: toastId });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      // still down
    }
    if (attempts >= 60) {
      clearInterval(poll);
      toast.error("API did not come back within 60 seconds.", { id: toastId });
      onFail();
    }
  }, 1000);
}

function VersionCheckSection({ adminUser }: { adminUser: boolean }) {
  const { info, loading, refresh } = useVersionCheck();
  const [refreshing, setRefreshing] = useState(false);
  const [updatingAPI, setUpdatingAPI] = useState(false);
  const [updatingWeb, setUpdatingWeb] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const res = await reqRefreshVersions();
    if (res.success) {
      toast.success("Version cache refreshed from GitHub");
      await refresh();
    } else {
      toast.error("Failed to refresh versions");
    }
    setRefreshing(false);
  };

  const handleUpdateAPI = async () => {
    setUpdatingAPI(true);
    const toastId = toast.loading("Pulling latest API image and restarting...");
    try {
      const res = await reqUpdateAPI();
      if (!res.success && "error_message" in res) {
        toast.error(`API update failed: ${res.error_message}`, { id: toastId });
        setUpdatingAPI(false);
        return;
      }
    } catch {
      // Container already restarting — expected.
    }
    waitForAPIRestart(toastId, () => setUpdatingAPI(false));
  };

  const handleUpdateWeb = async () => {
    setUpdatingWeb(true);
    const res = await reqUpdateWeb();
    if (res.success) {
      const toastId = toast.loading(
        "Web container restarting — waiting for it to come back...",
      );
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch("/api/health", {
            signal: AbortSignal.timeout(2000),
          });
          if (r.ok) {
            clearInterval(poll);
            toast.success("Web updated successfully. Reloading...", {
              id: toastId,
            });
            setTimeout(() => window.location.reload(), 1500);
          }
        } catch {
          // still restarting
        }
        if (attempts >= 60) {
          clearInterval(poll);
          toast.error("Web did not come back within 60 seconds.", {
            id: toastId,
          });
          setUpdatingWeb(false);
        }
      }, 1000);
    } else {
      toast.error(
        `Failed to update web: ${"error_message" in res ? res.error_message : "Unknown error"}`,
      );
      setUpdatingWeb(false);
    }
  };

  const apiCurrent = info?.api.current ?? "—";
  const apiLatest = info?.api.latest ?? "";
  const webCurrent = APP_VERSION;
  const webLatest = info?.web.latest ?? "";
  const runnerLatest = info?.runner.latest ?? "";
  const outdatedRunners = info?.runner.outdated_count ?? 0;
  const totalRunners = info?.runner.workers.length ?? 0;

  const apiUpToDate = !apiLatest || !isNewerVersion(apiCurrent, apiLatest);
  const webUpToDate =
    webCurrent === "dev" || !webLatest || !isNewerVersion(webCurrent, webLatest);

  const lastChecked = info?.last_checked ? new Date(info.last_checked) : null;

  return (
    <div className="panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div>
          <h2 className="text-sm font-semibold text-primary">Version Check</h2>
          {lastChecked && lastChecked.getTime() > 0 && (
            <p className="text-xs text-muted mt-0.5">
              Last checked:{" "}
              {lastChecked.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        {adminUser && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            <FontAwesomeIcon
              icon={faRotate}
              className={`h-3 w-3 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Checking..." : "Check Now"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-muted">
          Loading version info...
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {/* API */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated">
                <FontAwesomeIcon
                  icon={faServer}
                  className="h-3.5 w-3.5 text-secondary"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">API</p>
                <p className="text-xs text-muted">Current: {apiCurrent}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {apiLatest && (
                <span className="text-xs text-muted">Latest: {apiLatest}</span>
              )}
              {apiUpToDate ? (
                <Badge variant="success">
                  <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
                  Up to date
                </Badge>
              ) : (
                adminUser && (
                  <Button
                    size="sm"
                    onClick={handleUpdateAPI}
                    disabled={updatingAPI}
                  >
                    <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3 mr-1" />
                    {updatingAPI ? "Updating..." : "Update API"}
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Web */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated">
                <FontAwesomeIcon
                  icon={faGlobe}
                  className="h-3.5 w-3.5 text-secondary"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Web</p>
                <p className="text-xs text-muted">Current: {webCurrent}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {webLatest && (
                <span className="text-xs text-muted">Latest: {webLatest}</span>
              )}
              {webUpToDate ? (
                <Badge variant="success">
                  <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
                  Up to date
                </Badge>
              ) : (
                adminUser && (
                  <Button
                    size="sm"
                    onClick={handleUpdateWeb}
                    disabled={updatingWeb}
                  >
                    <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3 mr-1" />
                    {updatingWeb ? "Updating..." : "Update Web"}
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Runners */}
          <div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated">
                  <FontAwesomeIcon
                    icon={faMicrochip}
                    className="h-3.5 w-3.5 text-secondary"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">Runners</p>
                  <p className="text-xs text-muted">
                    {totalRunners} worker{totalRunners !== 1 ? "s" : ""}{" "}
                    registered
                    {runnerLatest ? ` · latest ${runnerLatest}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {outdatedRunners === 0 ? (
                  <Badge variant="success">
                    <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
                    All up to date
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <FontAwesomeIcon icon={faArrowUp} className="h-2.5 w-2.5" />
                    {outdatedRunners} outdated
                  </Badge>
                )}
              </div>
            </div>

            {/* Worker list — always shown when data is loaded */}
            {info && info.runner.workers.length > 0 && (
              <div className="mx-4 mb-3 rounded-lg border border-border-subtle bg-surface-alt">
                <div className="px-3 divide-y divide-border-subtle">
                  <RunnerUpgradePanel
                    workers={info.runner.workers}
                    latestVersion={runnerLatest}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const WEBHOOK_EVENTS = [
  { value: "*", label: "All events" },
  { value: "container.status", label: "Container status change" },
  { value: "container.unhealthy", label: "Container unhealthy" },
  { value: "deployment.failed", label: "Deployment failed" },
  { value: "deployment.success", label: "Deployment success" },
  { value: "worker.disconnected", label: "Worker disconnected" },
  { value: "worker.crash", label: "Worker crash" },
];

function WebhookSection({ adminUser }: { adminUser: boolean }) {
  const showConfirm = useConfirm();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadWebhooks = async () => {
    const res = await reqGetWebhooks();
    if (res.success) setWebhooks(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const resetForm = () => {
    setName("");
    setUrl("");
    setSecret("");
    setSelectedEvents([]);
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  const handleEventToggle = (event: string) => {
    if (event === "*") {
      setSelectedEvents((prev) => prev.includes("*") ? [] : ["*"]);
      return;
    }
    setSelectedEvents((prev) => {
      const filtered = prev.filter((e) => e !== "*");
      return filtered.includes(event)
        ? filtered.filter((e) => e !== event)
        : [...filtered, event];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (editingId) {
      const res = await reqUpdateWebhook(editingId, {
        name,
        url,
        events: JSON.stringify(selectedEvents),
        secret: secret || undefined,
      });
      if (res.success) {
        toast.success("Webhook updated");
        await loadWebhooks();
        resetForm();
      } else {
        setError("error_message" in res ? res.error_message : "Failed to update webhook");
      }
    } else {
      const res = await reqCreateWebhook({
        name,
        url,
        events: selectedEvents,
        secret: secret || undefined,
      });
      if (res.success) {
        toast.success("Webhook created");
        await loadWebhooks();
        resetForm();
      } else {
        setError("error_message" in res ? res.error_message : "Failed to create webhook");
      }
    }
    setSubmitting(false);
  };

  const handleEdit = (wh: WebhookConfig) => {
    setEditingId(wh.id);
    setName(wh.name);
    setUrl(wh.url);
    setSecret("");
    try {
      setSelectedEvents(JSON.parse(wh.events));
    } catch {
      setSelectedEvents([]);
    }
    setShowForm(true);
  };

  const handleDelete = async (wh: WebhookConfig) => {
    const ok = await showConfirm({
      title: "Delete webhook",
      message: `Are you sure you want to delete the webhook "${wh.name}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteWebhook(wh.id);
    if (res.success) {
      toast.success("Webhook deleted");
      await loadWebhooks();
    } else {
      toast.error("error_message" in res ? res.error_message : "Failed to delete webhook");
    }
  };

  const handleTest = async (wh: WebhookConfig) => {
    const res = await reqTestWebhook(wh.id);
    if (res.success) {
      toast.success(`Test webhook sent to ${wh.url}`);
    } else {
      toast.error("error_message" in res ? res.error_message : "Failed to send test webhook");
    }
  };

  const handleToggleActive = async (wh: WebhookConfig) => {
    const res = await reqUpdateWebhook(wh.id, { active: !wh.active });
    if (res.success) {
      await loadWebhooks();
    } else {
      toast.error("error_message" in res ? res.error_message : "Failed to update webhook");
    }
  };

  const parseEvents = (eventsJson: string): string[] => {
    try {
      return JSON.parse(eventsJson);
    } catch {
      return [];
    }
  };

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-primary">Webhooks</h2>
        {adminUser && (
          <Button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? "Cancel" : "Add Webhook"}
          </Button>
        )}
      </div>

      {adminUser && showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="webhook-name"
              label="Name"
              placeholder="My Webhook"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              id="webhook-url"
              label="URL"
              type="url"
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <Input
              id="webhook-secret"
              label="Secret (optional)"
              type="password"
              placeholder="Signing secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-2">
              Events
            </label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((evt) => (
                <label
                  key={evt.value}
                  className="inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(evt.value)}
                    onChange={() => handleEventToggle(evt.value)}
                    className="rounded border-border-strong bg-surface-elevated text-primary focus:ring-1 focus:ring-[#444444]/50"
                  />
                  <span className="text-sm text-secondary">{evt.label}</span>
                </label>
              ))}
            </div>
          </div>
          {error && (
            <Alert variant="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            disabled={submitting || !name.trim() || !url.trim() || selectedEvents.length === 0}
          >
            {submitting
              ? editingId ? "Updating..." : "Creating..."
              : editingId ? "Update Webhook" : "Create Webhook"}
          </Button>
        </form>
      )}

      <div className="panel">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                URL
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Events
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  No webhooks configured
                </td>
              </tr>
            ) : (
              webhooks.map((wh) => (
                <tr
                  key={wh.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary">
                    {wh.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary truncate max-w-[200px]">
                    {wh.url}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {parseEvents(wh.events).map((evt) => (
                        <span
                          key={evt}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-surface-elevated text-secondary"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={wh.active ? "success" : "default"}>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${wh.active ? "bg-healthy" : "bg-[#888888]"}`}
                      />
                      {wh.active ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {adminUser && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleTest(wh)}
                          >
                            Test
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEdit(wh)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant={wh.active ? "destructive" : "secondary"}
                            size="sm"
                            onClick={() => handleToggleActive(wh)}
                          >
                            {wh.active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(wh)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const currentUser = useUser();
  const showConfirm = useConfirm();
  const admin = isAdmin(currentUser);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await reqGetUsers();
    if (res.success) setUsers(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Lattice - Settings";
  }, []);

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await reqCreateUser({
      email,
      name: name || undefined,
      password,
      role,
    });
    if (res.success) {
      setUsers((prev) => [...prev, res.data]);
      setShowForm(false);
      setEmail("");
      setName("");
      setPassword("");
      setRole("viewer");
    } else {
      setError(res.error_message || "Failed to create user");
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (u: User) => {
    const res = await reqUpdateUser(u.id, { active: !u.active });
    if (res.success) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? res.data : x)));
    }
  };

  const handleDeleteUser = async (u: User) => {
    const ok = await showConfirm({
      title: "Delete user",
      message: `Are you sure you want to permanently delete "${u.name || u.email}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteUser(u.id);
    if (res.success) {
      toast.success("User deleted");
      await load();
    } else {
      toast.error("error_message" in res ? res.error_message : "Failed to delete user");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Settings</div>
          <div className="page-subtitle">
            System configuration and user management
          </div>
        </div>
      </div>

      <div className="p-6">

      {/* Version Check */}
      <div className="mb-8">
        <VersionCheckSection adminUser={admin} />
      </div>

      {/* Users Section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-primary">Users</h2>
        {admin && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Create User"}
          </Button>
        )}
      </div>

      {/* Create User Form */}
      {admin && showForm && (
        <form
          onSubmit={handleCreate}
          className="card p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="user-email"
              label="Email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="user-name"
              label="Name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              id="user-password"
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="user-role"
                className="text-xs font-medium text-secondary uppercase tracking-wider"
              >
                Role
              </label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {error && (
            <Alert variant="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            disabled={submitting || !email.trim() || !password.trim()}
          >
            {submitting ? "Creating..." : "Create User"}
          </Button>
        </form>
      )}

      {/* Users Table */}
      <div className="panel">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Auth Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-primary">
                      {u.name || u.email}
                    </p>
                    {u.name && (
                      <p className="text-xs text-muted">{u.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary">
                    {u.auth_type}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={u.role === "admin" ? "warning" : "default"}
                    >
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.active ? "success" : "error"}>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${u.active ? "bg-healthy" : "bg-failed"}`}
                      />
                      {u.active ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {formatDate(u.inserted_at)}
                  </td>
                  <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                    {admin && (
                      <Button
                        variant={u.active ? "destructive" : "secondary"}
                        size="sm"
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                    {admin && currentUser?.id !== u.id && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteUser(u)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Webhooks Section */}
      <div className="mt-8 mb-8">
        <WebhookSection adminUser={admin} />
      </div>
      </div>
    </div>
  );
}
