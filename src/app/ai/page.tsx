"use client";

import { useEffect, useState } from "react";
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
      "command": "node",
      "args": ["/path/to/lattice-mcp/index.js"],
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
    if (res.success) setTokens(res.data ?? []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!tokenName.trim()) return;
    setCreating(true);
    const data: { name: string; expires_in?: string } = {
      name: tokenName.trim(),
    };
    if (expiresIn !== "never") data.expires_in = expiresIn;
    const res = await reqCreateApiToken(data);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
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
                      placeholder="Token name"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tokenName.trim())
                          handleCreate();
                      }}
                    />
                  </div>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value)}
                    className="h-9 rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider hidden sm:table-cell">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider hidden md:table-cell">
                      Last Used
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider hidden md:table-cell">
                      Expires
                    </th>
                    {canEdit(user) && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit(user) ? 5 : 4}
                        className="px-4 py-12 text-center text-sm text-muted"
                      >
                        No API tokens created yet
                      </td>
                    </tr>
                  ) : (
                    tokens.map((token) => (
                      <tr
                        key={token.id}
                        className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated transition-colors"
                      >
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
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(token)}
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
