"use client";

import { useEffect, useState } from "react";
import type { User } from "@/types";
import type { SSOConfigData } from "@/services/admin.service";
import {
  reqGetSSOConfig,
  reqUpdateSSOConfig,
  reqGetUsers,
  reqCreateUser,
  reqUpdateUser,
  reqDeleteUser,
} from "@/services/admin.service";
import { useUser } from "@/store/hooks";
import { isAdmin, formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEyeSlash,
  faShieldHalved,
  faKey,
  faUserPlus,
  faArrowUpRightFromSquare,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

// ─── Provider presets ────────────────────────────────────────────────────────

interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
  color: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string;
  userIdentifier: string;
  comingSoon?: boolean;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "google", name: "Google", icon: "G", color: "#4285F4",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scopes: "openid email profile", userIdentifier: "email", comingSoon: true,
  },
  {
    id: "github", name: "GitHub", icon: "", color: "#333",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    scopes: "user:email", userIdentifier: "email", comingSoon: true,
  },
  {
    id: "microsoft", name: "Microsoft", icon: "", color: "#00A4EF",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfoUrl: "https://graph.microsoft.com/v1.0/me",
    scopes: "openid email profile", userIdentifier: "email", comingSoon: true,
  },
  {
    id: "custom", name: "Custom OAuth2", icon: "", color: "#6366f1",
    authorizeUrl: "", tokenUrl: "", userinfoUrl: "",
    scopes: "openid email profile", userIdentifier: "email",
  },
];

// ─── Sub-tab types ───────────────────────────────────────────────────────────

type AuthTab = "sso" | "users";

// ─── Users Sub-Tab ───────────────────────────────────────────────────────────

function UsersTab({ admin }: { admin: boolean }) {
  const currentUser = useUser();
  const showConfirm = useConfirm();
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

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await reqCreateUser({ email, name: name || undefined, password, role });
    if (res.success) {
      setUsers((prev) => [...prev, res.data]);
      setShowForm(false);
      setEmail(""); setName(""); setPassword(""); setRole("viewer");
    } else {
      setError(res.error_message || "Failed to create user");
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (u: User) => {
    const res = await reqUpdateUser(u.id, { active: !u.active });
    if (res.success) setUsers((prev) => prev.map((x) => (x.id === u.id ? res.data : x)));
  };

  const handleDeleteUser = async (u: User) => {
    const ok = await showConfirm({
      title: "Delete user",
      message: `Permanently delete "${u.name || u.email}"? This cannot be undone.`,
      confirmLabel: "Delete", variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteUser(u.id);
    if (res.success) { toast.success("User deleted"); await load(); }
    else toast.error("Failed to delete user");
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted">Loading users...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{users.length} user{users.length !== 1 ? "s" : ""} registered</p>
        {admin && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Create User"}
          </Button>
        )}
      </div>

      {admin && showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="user-email" label="Email" type="email" placeholder="user@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input id="user-name" label="Name" placeholder="John Doe"
              value={name} onChange={(e) => setName(e.target.value)} />
            <Input id="user-password" label="Password" type="password" placeholder="Min 8 characters"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-secondary uppercase tracking-wider">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
          <Button type="submit" disabled={submitting || !email.trim() || !password.trim()}>
            {submitting ? "Creating..." : "Create User"}
          </Button>
        </form>
      )}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Auth</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              {admin && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={admin ? 6 : 5} className="text-center text-sm text-muted !py-12">No users found</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <p className="text-sm font-medium text-primary">{u.name || u.email}</p>
                    {u.name && <p className="text-xs text-muted">{u.email}</p>}
                  </td>
                  <td className="text-secondary">{u.auth_type}</td>
                  <td>
                    {admin ? (
                      <select
                        value={u.role}
                        onChange={async (e) => {
                          const res = await reqUpdateUser(u.id, { role: e.target.value });
                          if (res.success) {
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? res.data : x)));
                            toast.success(`Role updated to ${e.target.value}`);
                          } else {
                            toast.error("Failed to update role");
                          }
                        }}
                        className="bg-surface-elevated border border-border-strong text-foreground px-2 py-1 rounded-md text-xs cursor-pointer"
                      >
                        <option value="pending">Pending</option>
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <Badge variant={u.role === "admin" ? "warning" : u.role === "pending" ? "error" : "default"}>
                        {u.role}
                      </Badge>
                    )}
                  </td>
                  <td>
                    <Badge variant={u.active ? "success" : "error"}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.active ? "bg-healthy" : "bg-failed"}`} />
                      {u.active ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="text-muted">{formatDate(u.inserted_at)}</td>
                  {admin && (
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {u.role === "pending" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const res = await reqUpdateUser(u.id, { role: "viewer" });
                              if (res.success) {
                                setUsers((prev) => prev.map((x) => (x.id === u.id ? res.data : x)));
                                toast.success(`${u.name || u.email} approved`);
                              } else {
                                toast.error("Failed to approve user");
                              }
                            }}
                          >
                            Approve
                          </Button>
                        )}
                        <Button variant={u.active ? "destructive" : "secondary"} size="sm"
                          onClick={() => handleToggleActive(u)}>
                          {u.active ? "Deactivate" : "Activate"}
                        </Button>
                        {currentUser?.id !== u.id && (
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(u)}>Delete</Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SSO Sub-Tab ─────────────────────────────────────────────────────────────

function SSOTab() {
  const [config, setConfig] = useState<SSOConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [userinfoUrl, setUserinfoUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [logoutUrl, setLogoutUrl] = useState("");
  const [scopes, setScopes] = useState("");
  const [userIdentifier, setUserIdentifier] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [autoProvision, setAutoProvision] = useState(true);
  const [postLoginUrl, setPostLoginUrl] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const loadConfig = async () => {
    const res = await reqGetSSOConfig();
    if (res.success && res.data) {
      const d = res.data;
      setConfig(d); setEnabled(d.enabled); setClientId(d.client_id);
      setClientSecret(d.client_secret); setAuthorizeUrl(d.authorize_url);
      setTokenUrl(d.token_url); setUserinfoUrl(d.userinfo_url);
      setRedirectUrl(d.redirect_url); setLogoutUrl(d.logout_url);
      setScopes(d.scopes); setUserIdentifier(d.user_identifier);
      setButtonLabel(d.button_label); setAutoProvision(d.auto_provision);
      setPostLoginUrl(d.post_login_url || "");
      if (d.authorize_url) setSelectedProvider("custom");
    }
    setLoading(false);
  };

  useEffect(() => { loadConfig(); }, []);

  const applyPreset = (p: ProviderPreset) => {
    setSelectedProvider(p.id);
    if (p.authorizeUrl) setAuthorizeUrl(p.authorizeUrl);
    if (p.tokenUrl) setTokenUrl(p.tokenUrl);
    if (p.userinfoUrl) setUserinfoUrl(p.userinfoUrl);
    if (p.scopes) setScopes(p.scopes);
    if (p.userIdentifier) setUserIdentifier(p.userIdentifier);
    setButtonLabel(`Sign in with ${p.name}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const data: Partial<SSOConfigData> = {
      enabled, client_id: clientId, authorize_url: authorizeUrl,
      token_url: tokenUrl, userinfo_url: userinfoUrl, redirect_url: redirectUrl,
      logout_url: logoutUrl, scopes, user_identifier: userIdentifier,
      button_label: buttonLabel, auto_provision: autoProvision,
      post_login_url: postLoginUrl,
    };
    if (clientSecret && !clientSecret.startsWith("••")) data.client_secret = clientSecret;
    const res = await reqUpdateSSOConfig(data);
    if (res.success) { toast.success("SSO configuration saved"); await loadConfig(); }
    else toast.error("Failed to save SSO configuration");
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted">Loading SSO config...</div>;

  return (
    <div className="space-y-6">
      {/* Auth Methods */}
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
              <FontAwesomeIcon icon={faKey} className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Internal</p>
              <p className="text-xs text-muted">Email and password</p>
            </div>
          </div>
          <span className="text-xs font-medium text-healthy bg-healthy/10 px-2.5 py-1 rounded-full">Active</span>
        </div>

        <div className={`rounded-lg border px-4 py-3 ${enabled ? "border-healthy/30 bg-healthy/5" : "border-border bg-surface-elevated"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet/10">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4 text-violet" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Single Sign-On</p>
                <p className="text-xs text-muted">OAuth2 / OpenID Connect</p>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-healthy" : "bg-surface-active border border-border-strong"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Provider picker */}
      {enabled && (
        <div>
          <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">Provider</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PROVIDER_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => !p.comingSoon && applyPreset(p)} disabled={p.comingSoon}
                className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  p.comingSoon ? "border-border opacity-40 cursor-not-allowed"
                  : selectedProvider === p.id ? "border-info bg-info/5 cursor-pointer"
                  : "border-border hover:border-border-strong hover:bg-surface-elevated cursor-pointer"
                }`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold"
                  style={{ background: p.comingSoon ? "var(--surface-active)" : p.color }}>
                  {p.icon || p.name[0]}
                </div>
                <span className="text-xs font-medium text-primary">{p.name}</span>
                {p.comingSoon && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-medium text-muted bg-surface-alt px-1.5 py-0.5 rounded">Soon</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* OAuth config form */}
      {enabled && (
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">Client Credentials</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="sso-client-id" label="Client ID" placeholder="your-client-id"
                value={clientId} onChange={(e) => setClientId(e.target.value)} />
              <div className="relative">
                <Input id="sso-client-secret" label="Client Secret" type={showSecret ? "text" : "password"}
                  placeholder={config?.client_secret ? "Enter new secret to change" : "your-client-secret"}
                  value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
                <button type="button" onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-[30px] text-muted hover:text-secondary transition-colors">
                  <FontAwesomeIcon icon={showSecret ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">Endpoints</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="sso-authorize-url" label="Authorization URL" type="url" placeholder="https://idp.example.com/authorize"
                value={authorizeUrl} onChange={(e) => setAuthorizeUrl(e.target.value)} />
              <Input id="sso-token-url" label="Token URL" type="url" placeholder="https://idp.example.com/token"
                value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} />
              <Input id="sso-userinfo-url" label="UserInfo URL" type="url" placeholder="https://idp.example.com/userinfo"
                value={userinfoUrl} onChange={(e) => setUserinfoUrl(e.target.value)} />
              <Input id="sso-redirect-url" label="Redirect URL" placeholder="https://lattice-api.example.com/auth/sso/callback"
                value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} />
              <Input id="sso-logout-url" label="Logout URL (optional)" type="url" placeholder="https://idp.example.com/logout"
                value={logoutUrl} onChange={(e) => setLogoutUrl(e.target.value)} />
              <Input id="sso-post-login-url" label="Post-Login Redirect URL" type="url"
                placeholder="https://lattice.example.com"
                value={postLoginUrl} onChange={(e) => setPostLoginUrl(e.target.value)} />
            </div>
            <p className="text-[10px] text-muted mt-2">The Post-Login Redirect URL is the frontend URL where users are sent after SSO authentication completes.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary uppercase tracking-wider block mb-3">Behavior</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input id="sso-scopes" label="Scopes" placeholder="openid email profile"
                value={scopes} onChange={(e) => setScopes(e.target.value)} />
              <Input id="sso-user-identifier" label="User Identifier" placeholder="email"
                value={userIdentifier} onChange={(e) => setUserIdentifier(e.target.value)} />
              <Input id="sso-button-label" label="Button Label" placeholder="Sign in with SSO"
                value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-4 py-3">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4 text-muted" />
              <div>
                <p className="text-sm font-medium text-primary">Auto-provision Users</p>
                <p className="text-xs text-muted">Create account (pending approval) on first SSO login</p>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={autoProvision} onClick={() => setAutoProvision(!autoProvision)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoProvision ? "bg-healthy" : "bg-surface-active border border-border-strong"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoProvision ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Configuration"}</Button>
            <p className="text-xs text-muted">Changes take effect immediately.</p>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AuthenticationPage() {
  const user = useUser();
  const admin = isAdmin(user);
  const [tab, setTab] = useState<AuthTab>("sso");

  useEffect(() => {
    document.title = "Lattice - Authentication";
  }, []);

  if (!admin) {
    return (
      <div>
        <div className="page-header">
          <div className="flex-1">
            <div className="page-title">Authentication</div>
            <div className="page-subtitle">Admin access required</div>
          </div>
        </div>
        <div className="p-6">
          <Alert variant="warning">You need admin privileges to manage authentication settings.</Alert>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Authentication</div>
          <div className="page-subtitle">Configure sign-in methods and manage users</div>
        </div>
      </div>

      <div className="p-6">
        {/* Sub-tabs */}
        <div className="tabs-bar mb-6 !px-0">
          <button onClick={() => setTab("sso")} className={`tab-item ${tab === "sso" ? "active" : ""}`}>
            <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
            Authentication
          </button>
          <button onClick={() => setTab("users")} className={`tab-item ${tab === "users" ? "active" : ""}`}>
            <FontAwesomeIcon icon={faUsers} className="h-3 w-3" />
            Users
          </button>
        </div>

        {tab === "sso" && <SSOTab />}
        {tab === "users" && <UsersTab admin={admin} />}
      </div>
    </div>
  );
}
