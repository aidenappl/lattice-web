"use client";

import { useEffect, useState } from "react";
import type { SMTPConfigData, NotificationPrefs, EventNotifConfig } from "@/services/admin.service";
import {
    reqGetSMTPConfig,
    reqUpdateSMTPConfig,
    reqGetNotificationPrefs,
    reqUpdateNotificationPrefs,
} from "@/services/admin.service";
import { useUser } from "@/store/hooks";
import { isAdmin } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faEnvelope,
    faDesktop,
    faEye,
    faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import {
    getDesktopNotificationsEnabled,
    setDesktopNotificationsEnabled,
    requestNotificationPermission,
    getNotificationPermission,
} from "@/hooks/useDesktopNotifications";
import toast from "react-hot-toast";

type NotifTab = "email" | "desktop";

// ─── Event type metadata ───────────────────────────────────────────────────

type EventMeta = {
    key: string;
    label: string;
    description: string;
    hasGrace?: boolean;
    graceLabel?: string;
    graceOptions?: { value: number; label: string }[];
    hasThreshold?: boolean;
    thresholdLabel?: string;
    thresholdOptions?: { value: number; label: string }[];
    hasCooldown?: boolean;
};

const EVENT_TYPES: EventMeta[] = [
    {
        key: "worker.disconnected",
        label: "Worker Disconnected",
        description: "A worker lost its WebSocket connection",
        hasGrace: true,
        graceLabel: "Grace period before alerting",
        graceOptions: [
            { value: 0, label: "Immediate" },
            { value: 15, label: "15 seconds" },
            { value: 30, label: "30 seconds" },
            { value: 60, label: "1 minute" },
            { value: 120, label: "2 minutes" },
            { value: 300, label: "5 minutes" },
        ],
        hasCooldown: true,
    },
    {
        key: "worker.crash",
        label: "Worker Crashed",
        description: "A worker process panicked and crashed",
        hasCooldown: true,
    },
    {
        key: "container.unhealthy",
        label: "Container Unhealthy",
        description: "A container is failing its health check",
        hasThreshold: true,
        thresholdLabel: "Consecutive failures before alerting",
        thresholdOptions: [
            { value: 1, label: "1 (first failure)" },
            { value: 2, label: "2 consecutive" },
            { value: 3, label: "3 consecutive" },
            { value: 5, label: "5 consecutive" },
            { value: 10, label: "10 consecutive" },
        ],
        hasCooldown: true,
    },
    {
        key: "deployment.failed",
        label: "Deployment Failed",
        description: "A stack deployment failed and was rolled back",
    },
    {
        key: "deployment.success",
        label: "Deployment Successful",
        description: "A stack deployment completed successfully",
    },
];

// ─── Toggle Component ──────────────────────────────────────────────────────

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                checked
                    ? "bg-healthy"
                    : "bg-surface-active border border-border-strong"
            }`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    checked ? "translate-x-6" : "translate-x-1"
                }`}
            />
        </button>
    );
}

// ─── Email Sub-Tab ─────────────────────────────────────────────────────────

function EmailTab() {
    const [config, setConfig] = useState<SMTPConfigData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [enabled, setEnabled] = useState(false);
    const [host, setHost] = useState("");
    const [port, setPort] = useState("587");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [fromEmail, setFromEmail] = useState("");
    const [fromName, setFromName] = useState("");
    const [recipients, setRecipients] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Per-event preferences
    const [eventPrefs, setEventPrefs] = useState<NotificationPrefs>({});
    const [prefsLoading, setPrefsLoading] = useState(true);
    const [prefsSaving, setPrefsSaving] = useState(false);

    const loadConfig = async () => {
        const res = await reqGetSMTPConfig();
        if (res.success && res.data) {
            const d = res.data;
            setConfig(d);
            setEnabled(d.enabled);
            setHost(d.host);
            setPort(d.port || "587");
            setUsername(d.username);
            setPassword(d.password);
            setFromEmail(d.from_email);
            setFromName(d.from_name);
            setRecipients(d.recipients);
        }
        setLoading(false);
    };

    const loadPrefs = async () => {
        const res = await reqGetNotificationPrefs();
        if (res.success && res.data) {
            setEventPrefs(res.data);
        }
        setPrefsLoading(false);
    };

    useEffect(() => {
        loadConfig();
        loadPrefs();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const data: Partial<SMTPConfigData> = {
            enabled,
            host,
            port,
            username,
            from_email: fromEmail,
            from_name: fromName,
            recipients,
        };
        if (password && !password.startsWith("••")) data.password = password;
        const res = await reqUpdateSMTPConfig(data);
        if (res.success) {
            toast.success("SMTP configuration saved");
            await loadConfig();
        } else {
            toast.error("Failed to save SMTP configuration");
        }
        setSaving(false);
    };

    const handleTest = async () => {
        setTesting(true);
        const data: Partial<SMTPConfigData> = {
            enabled: true,
            host,
            port,
            username,
            from_email: fromEmail,
            from_name: fromName,
            recipients,
        };
        if (password && !password.startsWith("••")) data.password = password;
        const saveRes = await reqUpdateSMTPConfig(data);
        if (!saveRes.success) {
            toast.error("Failed to save config before test");
            setTesting(false);
            return;
        }
        const { reqTestSMTP } = await import("@/services/admin.service");
        const testRes = await reqTestSMTP();
        if (testRes.success) {
            toast.success("Test email sent! Check your inbox.");
        } else {
            toast.error(
                "error_message" in testRes
                    ? testRes.error_message
                    : "Failed to send test email"
            );
        }
        await loadConfig();
        setTesting(false);
    };

    const updateEventPref = async (eventKey: string, patch: Partial<EventNotifConfig>) => {
        const prev = eventPrefs[eventKey] ?? { enabled: true };
        const updated = { ...prev, ...patch };
        setEventPrefs((p) => ({ ...p, [eventKey]: updated }));
        setPrefsSaving(true);
        const res = await reqUpdateNotificationPrefs({ [eventKey]: updated });
        if (!res.success) {
            setEventPrefs((p) => ({ ...p, [eventKey]: prev }));
            toast.error("Failed to save preference");
        }
        setPrefsSaving(false);
    };

    if (loading)
        return (
            <div className="p-8 text-center text-sm text-muted">
                Loading SMTP config...
            </div>
        );

    return (
        <div className="space-y-6">
            {/* Enable/disable toggle */}
            <div
                className={`rounded-lg border px-4 py-3 ${
                    enabled
                        ? "border-healthy/30 bg-healthy/5"
                        : "border-border bg-surface-elevated"
                }`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
                            <FontAwesomeIcon
                                icon={faEnvelope}
                                className="h-4 w-4 text-info"
                            />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-primary">
                                Email Notifications
                            </p>
                            <p className="text-xs text-muted">
                                Send alerts via SMTP on key events
                            </p>
                        </div>
                    </div>
                    <Toggle checked={enabled} onChange={setEnabled} />
                </div>
            </div>

            {enabled && (
                <>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div>
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">
                                SMTP Server
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Input
                                    id="smtp-host"
                                    label="Host"
                                    placeholder="smtp.example.com"
                                    value={host}
                                    onChange={(e) => setHost(e.target.value)}
                                />
                                <Input
                                    id="smtp-port"
                                    label="Port"
                                    placeholder="587"
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">
                                Authentication
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Input
                                    id="smtp-username"
                                    label="Username"
                                    placeholder="user@example.com"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                                <div className="relative">
                                    <Input
                                        id="smtp-password"
                                        label="Password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder={
                                            config?.password
                                                ? "Enter new password to change"
                                                : "SMTP password"
                                        }
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowPassword(!showPassword)
                                        }
                                        className="absolute right-3 top-[30px] text-muted hover:text-secondary transition-colors"
                                    >
                                        <FontAwesomeIcon
                                            icon={
                                                showPassword
                                                    ? faEyeSlash
                                                    : faEye
                                            }
                                            className="h-3.5 w-3.5"
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">
                                Sender
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Input
                                    id="smtp-from-email"
                                    label="From Email"
                                    type="email"
                                    placeholder="noreply@example.com"
                                    value={fromEmail}
                                    onChange={(e) =>
                                        setFromEmail(e.target.value)
                                    }
                                />
                                <Input
                                    id="smtp-from-name"
                                    label="From Name"
                                    placeholder="Lattice"
                                    value={fromName}
                                    onChange={(e) =>
                                        setFromName(e.target.value)
                                    }
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">
                                Recipients
                            </label>
                            <Input
                                id="smtp-recipients"
                                label="Email Addresses"
                                placeholder="admin@example.com, ops@example.com"
                                value={recipients}
                                onChange={(e) => setRecipients(e.target.value)}
                            />
                            <p className="text-[10px] text-muted mt-2">
                                Comma-separated list of email addresses to
                                receive notifications.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
                            <Button type="submit" disabled={saving}>
                                {saving ? "Saving..." : "Save Configuration"}
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={testing || !host.trim()}
                                onClick={handleTest}
                            >
                                {testing ? "Testing..." : "Save & Test"}
                            </Button>
                        </div>
                    </form>

                    {/* Per-event notification preferences */}
                    <div>
                        <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">
                            Event Notifications
                        </label>
                        <p className="text-xs text-muted mb-4">
                            Choose which events trigger email notifications.
                            Disabled events will still appear in the dashboard
                            and fire webhooks.
                        </p>
                        <div className="space-y-2">
                            {EVENT_TYPES.map((evt) => {
                                const cfg = eventPrefs[evt.key] ?? { enabled: true };
                                const isEnabled = cfg.enabled !== false;
                                return (
                                    <div
                                        key={evt.key}
                                        className={`rounded-lg border px-4 py-3 transition-colors ${
                                            isEnabled ? "border-border" : "border-border bg-surface-elevated/50 opacity-60"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-primary">
                                                    {evt.label}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {evt.description}
                                                </p>
                                            </div>
                                            <Toggle
                                                checked={isEnabled}
                                                onChange={(v) => updateEventPref(evt.key, { enabled: v })}
                                                disabled={prefsLoading}
                                            />
                                        </div>

                                        {isEnabled && (evt.hasGrace || evt.hasThreshold || evt.hasCooldown) && (
                                            <div className="mt-3 pt-3 border-t border-border-subtle grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {evt.hasGrace && evt.graceOptions && (
                                                    <div>
                                                        <label className="text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                                                            {evt.graceLabel}
                                                        </label>
                                                        <select
                                                            value={cfg.grace_seconds ?? 30}
                                                            onChange={(e) => updateEventPref(evt.key, { grace_seconds: parseInt(e.target.value) })}
                                                            className="w-full text-xs bg-surface-elevated border border-border-strong rounded px-2.5 py-1.5 text-primary focus:outline-none focus:border-info"
                                                        >
                                                            {evt.graceOptions.map((opt) => (
                                                                <option key={opt.value} value={opt.value}>
                                                                    {opt.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <p className="text-[10px] text-muted mt-1">
                                                            If the worker reconnects within this time, no alert is sent.
                                                        </p>
                                                    </div>
                                                )}

                                                {evt.hasThreshold && evt.thresholdOptions && (
                                                    <div>
                                                        <label className="text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                                                            {evt.thresholdLabel}
                                                        </label>
                                                        <select
                                                            value={cfg.threshold ?? 3}
                                                            onChange={(e) => updateEventPref(evt.key, { threshold: parseInt(e.target.value) })}
                                                            className="w-full text-xs bg-surface-elevated border border-border-strong rounded px-2.5 py-1.5 text-primary focus:outline-none focus:border-info"
                                                        >
                                                            {evt.thresholdOptions.map((opt) => (
                                                                <option key={opt.value} value={opt.value}>
                                                                    {opt.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <p className="text-[10px] text-muted mt-1">
                                                            Resets when the container becomes healthy again.
                                                        </p>
                                                    </div>
                                                )}

                                                {evt.hasCooldown && (
                                                    <div>
                                                        <label className="text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                                                            Cooldown
                                                        </label>
                                                        <select
                                                            value={cfg.cooldown_minutes ?? 5}
                                                            onChange={(e) => updateEventPref(evt.key, { cooldown_minutes: parseInt(e.target.value) })}
                                                            className="w-full text-xs bg-surface-elevated border border-border-strong rounded px-2.5 py-1.5 text-primary focus:outline-none focus:border-info"
                                                        >
                                                            <option value={0}>No cooldown</option>
                                                            <option value={1}>1 minute</option>
                                                            <option value={5}>5 minutes</option>
                                                            <option value={10}>10 minutes</option>
                                                            <option value={30}>30 minutes</option>
                                                            <option value={60}>1 hour</option>
                                                        </select>
                                                        <p className="text-[10px] text-muted mt-1">
                                                            Suppress repeat alerts for the same resource within this window.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Desktop Sub-Tab ───────────────────────────────────────────────────────

function DesktopTab() {
    const [enabled, setEnabled] = useState(false);
    const [permission, setPermission] =
        useState<NotificationPermission>("default");

    useEffect(() => {
        setEnabled(getDesktopNotificationsEnabled());
        setPermission(getNotificationPermission());
    }, []);

    const handleToggle = (next: boolean) => {
        if (next && permission !== "granted") {
            requestNotificationPermission().then((perm) => {
                setPermission(perm);
                if (perm === "granted") {
                    setDesktopNotificationsEnabled(true);
                    setEnabled(true);
                    toast.success("Desktop notifications enabled");
                } else {
                    toast.error("Notification permission denied by browser");
                }
            });
        } else {
            setDesktopNotificationsEnabled(next);
            setEnabled(next);
            toast.success(
                next
                    ? "Desktop notifications enabled"
                    : "Desktop notifications disabled"
            );
        }
    };

    const handleRequestPermission = () => {
        requestNotificationPermission().then((perm) => {
            setPermission(perm);
            if (perm === "granted") {
                toast.success("Browser permission granted");
            } else if (perm === "denied") {
                toast.error("Permission denied. Check browser settings.");
            }
        });
    };

    return (
        <div className="space-y-6">
            <div
                className={`rounded-lg border px-4 py-3 ${
                    enabled
                        ? "border-healthy/30 bg-healthy/5"
                        : "border-border bg-surface-elevated"
                }`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet/10">
                            <FontAwesomeIcon
                                icon={faDesktop}
                                className="h-4 w-4 text-violet"
                            />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-primary">
                                Desktop Notifications
                            </p>
                            <p className="text-xs text-muted">
                                Browser push notifications for deployment and
                                health events
                            </p>
                        </div>
                    </div>
                    <Toggle checked={enabled} onChange={handleToggle} />
                </div>
            </div>

            <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-primary">
                            Browser Permission
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                            Current status:{" "}
                            <span
                                className={
                                    permission === "granted"
                                        ? "text-healthy font-medium"
                                        : permission === "denied"
                                          ? "text-failed font-medium"
                                          : "text-warning font-medium"
                                }
                            >
                                {permission}
                            </span>
                        </p>
                    </div>
                    {permission !== "granted" && (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleRequestPermission}
                        >
                            Request Permission
                        </Button>
                    )}
                </div>

                {permission === "denied" && (
                    <Alert variant="warning">
                        Notification permission was denied. You may need to
                        reset it in your browser settings for this site.
                    </Alert>
                )}

                <div className="border-t border-border-subtle pt-4">
                    <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
                        Events that trigger notifications
                    </p>
                    <ul className="space-y-1.5 text-sm text-secondary">
                        <li>Deployment succeeded or failed</li>
                        <li>Container became unhealthy</li>
                        <li>Worker disconnected or crashed</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function NotificationsPage() {
    const user = useUser();
    const admin = isAdmin(user);
    const [tab, setTab] = useState<NotifTab>("email");

    useEffect(() => {
        document.title = "Lattice - Notifications";
    }, []);

    if (!admin) {
        return (
            <div>
                <div className="page-header">
                    <div className="flex-1">
                        <div className="page-title">Notifications</div>
                        <div className="page-subtitle">
                            Admin access required for email settings
                        </div>
                    </div>
                </div>
                <div className="py-6">
                    <div className="tabs-bar mb-6 !px-0">
                        <button className="tab-item active">
                            <FontAwesomeIcon
                                icon={faDesktop}
                                className="h-3 w-3"
                            />
                            Desktop
                        </button>
                    </div>
                    <DesktopTab />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div className="flex-1">
                    <div className="page-title">Notifications</div>
                    <div className="page-subtitle">
                        Configure email alerts and desktop notifications
                    </div>
                </div>
            </div>

            <div className="py-6">
                <div className="tabs-bar mb-6 !px-0">
                    <button
                        onClick={() => setTab("email")}
                        className={`tab-item ${tab === "email" ? "active" : ""}`}
                    >
                        <FontAwesomeIcon
                            icon={faEnvelope}
                            className="h-3 w-3"
                        />
                        Email
                    </button>
                    <button
                        onClick={() => setTab("desktop")}
                        className={`tab-item ${tab === "desktop" ? "active" : ""}`}
                    >
                        <FontAwesomeIcon
                            icon={faDesktop}
                            className="h-3 w-3"
                        />
                        Desktop
                    </button>
                </div>

                {tab === "email" && <EmailTab />}
                {tab === "desktop" && <DesktopTab />}
            </div>
        </div>
    );
}
