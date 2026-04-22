"use client";

import { useEffect, useState } from "react";
import type { DeployToken } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canEdit, isAdmin, timeAgo } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";
import {
  reqGetDeployTokens,
  reqCreateDeployToken,
  reqDeleteDeployToken,
} from "@/services/stacks.service";

export interface StackDeployTokensPanelProps {
  stackId: number;
}

export default function StackDeployTokensPanel({
  stackId,
}: StackDeployTokensPanelProps) {
  const [tokens, setTokens] = useState<DeployToken[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const user = useUser();
  const showConfirm = useConfirm();

  useEffect(() => {
    const load = async () => {
      const res = await reqGetDeployTokens(stackId);
      if (res.success) {
        setTokens(res.data ?? []);
      }
      setLoading(false);
    };
    load();
  }, [stackId]);

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) return;
    const res = await reqCreateDeployToken(stackId, newTokenName.trim());
    if (res.success) {
      setCreatedToken(res.data.token);
      setTokens((prev) => [
        {
          id: res.data.id,
          stack_id: res.data.stack_id,
          name: res.data.name,
          last_used_at: res.data.last_used_at,
          active: res.data.active,
          inserted_at: res.data.inserted_at,
          updated_at: res.data.updated_at,
        },
        ...prev,
      ]);
      setNewTokenName("");
    }
  };

  const handleDeleteToken = async (tokenId: number) => {
    const token = tokens.find((t) => t.id === tokenId);
    const ok = await showConfirm({
      title: "Delete deploy token",
      message: `Delete token "${token?.name ?? tokenId}"? CI/CD pipelines using this token will no longer be able to trigger deploys.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteDeployToken(tokenId);
    if (res.success) {
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      if (createdToken) setCreatedToken(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faKey}
          className="h-3.5 w-3.5 text-muted"
        />
        <span>Deploy Tokens</span>
        <span className="badge badge-neutral ml-2">{tokens.length}</span>
      </div>
      <div className="p-4">
        {isAdmin(user) && (
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Token name (e.g. GitHub Actions)"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleCreateToken}
              disabled={!newTokenName.trim()}
            >
              Create
            </Button>
          </div>
        )}

        {createdToken && (
          <div className="mb-3 rounded-lg border border-[#22c55e]/30 bg-healthy/5 p-3">
            <p className="text-[10px] text-healthy mb-1 font-medium uppercase tracking-wider">
              Copy now - shown only once
            </p>
            <p className="text-xs text-primary font-mono break-all select-all mb-2">
              {createdToken}
            </p>
            <p className="text-[10px] text-muted">
              Usage: <code className="text-xs">curl -X POST https://YOUR_API/api/deploy/{createdToken}</code>
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-muted py-4 text-center">Loading...</p>
        ) : (
          <div className="space-y-1.5">
            {tokens.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">
                No deploy tokens
              </p>
            ) : (
              tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-primary">{token.name}</p>
                    <p className="text-[10px] text-dimmed">
                      {token.last_used_at
                        ? `Used ${timeAgo(token.last_used_at)}`
                        : "Never used"}
                      {" · "}
                      Created {timeAgo(token.inserted_at)}
                    </p>
                  </div>
                  {isAdmin(user) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteToken(token.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tokens.length > 0 && (
          <div className="mt-3 rounded-lg bg-surface-elevated p-2.5 space-y-1.5">
            <p className="text-[10px] text-dimmed">
              <span className="text-secondary font-medium">Full stack:</span>{" "}
              <code className="text-[10px]">curl -X POST https://YOUR_API/api/deploy/TOKEN</code>
            </p>
            <p className="text-[10px] text-dimmed">
              <span className="text-secondary font-medium">Single container:</span>{" "}
              <code className="text-[10px]">curl -X POST &quot;https://YOUR_API/api/deploy/TOKEN?container=NAME&quot;</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
