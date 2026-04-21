"use client";

import { useState } from "react";
import type { WorkerToken } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canEdit, timeAgo } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";
import { reqCreateWorkerToken, reqDeleteWorkerToken } from "@/services/workers.service";

export interface WorkerTokensPanelProps {
  workerId: number;
  tokens: WorkerToken[];
  onTokenCreated: (token: WorkerToken) => void;
  onTokenDeleted: (tokenId: number) => void;
}

export default function WorkerTokensPanel({
  workerId,
  tokens,
  onTokenCreated,
  onTokenDeleted,
}: WorkerTokensPanelProps) {
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const user = useUser();
  const showConfirm = useConfirm();

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) return;
    const res = await reqCreateWorkerToken(workerId, newTokenName.trim());
    if (res.success) {
      setCreatedToken(res.data.token);
      onTokenCreated({
        id: res.data.id,
        worker_id: res.data.worker_id,
        name: res.data.name,
        last_used_at: res.data.last_used_at,
        active: res.data.active,
        inserted_at: res.data.inserted_at,
        updated_at: res.data.updated_at,
      });
      setNewTokenName("");
    }
  };

  const handleDeleteToken = async (tokenId: number) => {
    const token = tokens.find((t) => t.id === tokenId);
    const ok = await showConfirm({
      title: "Delete token",
      message: `Delete token "${token?.name ?? tokenId}"? The worker will no longer be able to authenticate with this token.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteWorkerToken(tokenId);
    if (res.success) {
      onTokenDeleted(tokenId);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faKey}
          className="h-3.5 w-3.5 text-muted"
        />
        <span>Tokens</span>
        <span className="badge badge-neutral ml-2">{tokens.length}</span>
      </div>
      <div className="p-4">
        {canEdit(user) && (
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Token name"
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
            <p className="text-xs text-primary font-mono break-all select-all">
              {createdToken}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          {tokens.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">
              No tokens
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
                  </p>
                </div>
                {canEdit(user) && (
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
      </div>
    </div>
  );
}
