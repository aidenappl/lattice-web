"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import type { ApiToken } from "@/types";
import {
  reqGetApiTokens,
  reqCreateApiToken,
  reqDeleteApiToken,
} from "@/services/admin.service";
import { useUser } from "@/store/hooks";
import { canEdit, timeAgo } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey,
  faTrash,
  faCopy,
  faChevronDown,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

const EXPIRATION_OPTIONS = [
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "365d" },
  { label: "Never", value: "never" },
];

const MCP_CONFIG = `{
  "mcpServers": {
    "lattice": {
      "command": "npx",
      "args": ["-y", "lattice-mcp"],
      "env": {
        "LATTICE_API_URL": "<your-lattice-api-url>",
        "LATTICE_API_TOKEN": "<paste-token-here>"
      }
    }
  }
}`;

export default function AIManagementPage() {
  const user = useUser();
  const showConfirm = useConfirm();

  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenName, setTokenName] = useState("");
  const [expiresIn, setExpiresIn] = useState("90d");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    document.title = "Lattice - AI Management";
  }, []);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    const res = await reqGetApiTokens();
    if (res.success) {
      setTokens(res.data ?? []);
    } else {
      toast.error("Failed to load API tokens");
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!tokenName.trim()) return;
    setCreatedToken(null);
    setCreating(true);
    const res = await reqCreateApiToken({
      name: tokenName.trim(),
      expires_in: expiresIn,
    });
    if (res.success) {
      setCreatedToken(res.data.token);
      setTokens((prev) => [
        {
          id: res.data.id,
          user_id: res.data.user_id,
          name: res.data.name,
          scopes: res.data.scopes,
          expires_at: res.data.expires_at,
          last_used_at: res.data.last_used_at,
          active: res.data.active,
          updated_at: res.data.updated_at,
          inserted_at: res.data.inserted_at,
        },
        ...prev,
      ]);
      setTokenName("");
      toast.success("API token created");
    } else {
      toast.error(
        "error_message" in res ? res.error_message : "Failed to create token",
      );
    }
    setCreating(false);
  };

  const visibleIds = useMemo(() => tokens.map((t) => t.id), [tokens]);
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => tokens.filter((t) => selection.isSelected(t.id)),
    [tokens, selection],
  );

  // Rotate = mint a replacement with the same name, then revoke the old one.
  // The API has no in-place rotation, and doing it in this order means a
  // failure never leaves the caller with no working token.
  const handleRotate = async (token: ApiToken) => {
    const ok = await showConfirm({
      title: `Rotate "${token.name}"?`,
      message:
        "A new token is created and shown once; the old one stops working immediately after. Update every tool that uses it.",
      confirmLabel: "Rotate",
      variant: "warning",
    });
    if (!ok) return;
    const created = await reqCreateApiToken({
      name: token.name,
      expires_in: token.expires_at ? expiresIn : "never",
    });
    if (!created.success) {
      toast.error(created.error_message || "Failed to create the replacement token");
      return;
    }
    const removed = await reqDeleteApiToken(token.id);
    setCreatedToken(created.data.token);
    await loadTokens();
    if (removed.success) toast.success(`Rotated "${token.name}"`);
    else
      toast.error(
        `New token created, but the old one could not be revoked: ${removed.error_message}`,
      );
  };

  const handleDelete = async (token: ApiToken) => {
    const ok = await showConfirm({
      title: "Delete API token",
      message: `Delete token "${token.name}"? Any tools using this token will lose access immediately.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteApiToken(token.id);
    if (res.success) {
      setTokens((prev) => prev.filter((t) => t.id !== token.id));
      toast.success("Token deleted");
    } else {
      toast.error(
        "error_message" in res ? res.error_message : "Failed to delete token",
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return "Never";
    const date = new Date(expiresAt);
    if (date.getTime() < Date.now()) return "Expired";
    return date.toLocaleDateString();
  };

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">AI Management</div>
          <div className="page-subtitle">
            Create and manage API tokens for AI tools, MCP servers, and
            automation.
          </div>
        </div>
      </div>

      <div className="py-6 space-y-8">
        {canEdit(user) && (
          <BulkActionBar
            count={selection.count}
            noun="token"
            onClear={selection.clear}
            busy={bulk.running}
            actions={[
              {
                label: "Revoke",
                icon: faTrash,
                variant: "danger",
                onClick: () =>
                  bulk
                    .run({
                      items: selected,
                      verb: "Revoke",
                      verbPast: "Revoked",
                      noun: "token",
                      name: (t) => t.name,
                      action: (t) => reqDeleteApiToken(t.id),
                      confirm: {
                        message:
                          "Every MCP server, agent or script using these tokens loses access immediately.",
                        variant: "danger",
                      },
                    })
                    .then((r) => {
                      if (r) {
                        const gone = new Set(r.succeeded.map((t) => t.id));
                        setTokens((prev) => prev.filter((t) => !gone.has(t.id)));
                        selection.clear();
                      }
                    }),
              },
            ]}
          />
        )}

        {/* API Tokens Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FontAwesomeIcon
              icon={faKey}
              className="h-4 w-4 text-secondary"
            />
            <h2 className="text-sm font-semibold text-primary">API Tokens</h2>
            <span className="badge badge-neutral ml-1">{tokens.length}</span>
          </div>

          <div className="panel">
            {/* Create token form */}
            {canEdit(user) && (
              <div className="p-4 border-b border-border-subtle">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      aria-label="Token name"
                      placeholder="Token name (required) — e.g. the machine or agent using it"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tokenName.trim())
                          handleCreate();
                      }}
                    />
                  </div>
                  <select
                    aria-label="Token expiry"
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value)}
                    className="form-select !h-9 !w-auto !text-sm cursor-pointer"
                  >
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={handleCreate}
                    disabled={!tokenName.trim() || creating}
                    loading={creating}
                    title={!tokenName.trim() ? "Enter a token name first" : undefined}
                  >
                    Create Token
                  </Button>
                </div>

                {/* Created token display */}
                {createdToken && (
                  <div className="mt-3 rounded-lg border border-[#22c55e]/30 bg-healthy/5 p-3">
                    <p className="text-[10px] text-healthy mb-1 font-medium uppercase tracking-wider">
                      This token will only be shown once
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-primary font-mono break-all select-all flex-1">
                        {createdToken}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(createdToken)}
                      >
                        <FontAwesomeIcon
                          icon={faCopy}
                          className="h-3 w-3 mr-1.5"
                        />
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Token list */}
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted">
                Loading tokens...
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    {canEdit(user) && (
                      <th className="select-col">
                        <Checkbox
                          label="Select all tokens"
                          checked={selection.allSelected}
                          indeterminate={selection.someSelected}
                          onChange={selection.toggleAll}
                          disabled={selection.empty}
                        />
                      </th>
                    )}
                    <th>Name</th>
                    <th className="hidden sm:table-cell">Created</th>
                    <th className="hidden md:table-cell">Last used</th>
                    <th className="hidden md:table-cell">Expires</th>
                    {canEdit(user) && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit(user) ? 6 : 4}
                        className="px-4 py-12 text-center text-sm text-muted"
                      >
                        No API tokens created yet
                      </td>
                    </tr>
                  ) : (
                    tokens.map((token) => (
                      <tr
                        key={token.id}
                        className={`!cursor-default ${selection.isSelected(token.id) ? "is-selected" : ""}`}
                      >
                        {canEdit(user) && (
                          <td className="select-col">
                            <Checkbox
                              label={`Select ${token.name}`}
                              checked={selection.isSelected(token.id)}
                              onChange={(_, e) =>
                                selection.toggle(token.id, { shiftKey: e.shiftKey })
                              }
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm font-medium text-primary">
                          {token.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-secondary hidden sm:table-cell">
                          {timeAgo(token.inserted_at)}
                        </td>
                        <td className="px-4 py-3 text-sm text-secondary hidden md:table-cell">
                          {token.last_used_at
                            ? timeAgo(token.last_used_at)
                            : "Never"}
                        </td>
                        <td className="px-4 py-3 text-sm text-secondary hidden md:table-cell">
                          {formatExpiry(token.expires_at)}
                        </td>
                        {canEdit(user) && (
                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRotate(token)}
                              aria-label={`Rotate ${token.name}`}
                            >
                              Rotate
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(token)}
                              aria-label={`Delete ${token.name}`}
                            >
                              <FontAwesomeIcon
                                icon={faTrash}
                                className="h-3 w-3 mr-1.5"
                              />
                              Delete
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* MCP Setup Guide */}
        <div>
          <button
            onClick={() => setGuideOpen(!guideOpen)}
            className="flex items-center gap-2 mb-4 cursor-pointer group"
          >
            <FontAwesomeIcon
              icon={guideOpen ? faChevronDown : faChevronRight}
              className="h-3 w-3 text-secondary group-hover:text-primary transition-colors"
            />
            <h2 className="text-sm font-semibold text-primary group-hover:text-primary transition-colors">
              MCP Setup Guide
            </h2>
          </button>

          {guideOpen && (
            <div className="panel">
              <div className="p-4 space-y-4">
                <p className="text-sm text-secondary">
                  Add this to your <code className="text-xs font-mono bg-surface-elevated px-1.5 py-0.5 rounded">~/.mcp.json</code> to
                  connect Claude Code to your Lattice instance.
                </p>
                <div className="relative">
                  <pre className="rounded-lg bg-surface-elevated border border-border-subtle p-4 text-xs text-primary font-mono overflow-x-auto">
                    {MCP_CONFIG}
                  </pre>
                  <div className="absolute top-2 right-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(MCP_CONFIG)}
                    >
                      <FontAwesomeIcon
                        icon={faCopy}
                        className="h-3 w-3 mr-1.5"
                      />
                      Copy
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-secondary space-y-2">
                  <p>
                    Replace <code className="text-xs font-mono bg-surface-elevated px-1.5 py-0.5 rounded">&lt;your-lattice-api-url&gt;</code> with
                    your Lattice API URL and <code className="text-xs font-mono bg-surface-elevated px-1.5 py-0.5 rounded">&lt;paste-token-here&gt;</code> with
                    an API token created above.
                  </p>
                  <p>
                    The MCP server allows AI tools to query workers, stacks,
                    containers, deployments, and perform actions on your Lattice
                    infrastructure.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
