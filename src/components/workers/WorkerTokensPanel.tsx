"use client";

import { useMemo, useState } from "react";
import type { WorkerToken } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faCopy, faTrash } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { canEdit, timeAgo } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
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
  const [creating, setCreating] = useState(false);

  const user = useUser();
  const editable = canEdit(user);
  const showConfirm = useConfirm();
  const ids = useMemo(() => tokens.map((t) => t.id), [tokens]);
  const selection = useSelection(ids);
  const bulk = useBulkAction();

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) return;
    setCreating(true);
    const res = await reqCreateWorkerToken(workerId, newTokenName.trim());
    setCreating(false);
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
    } else {
      // Used to fail silently: the button just did nothing.
      toast.error(res.error_message || "Failed to create token");
    }
  };

  const handleDeleteToken = async (tokenId: number) => {
    const token = tokens.find((t) => t.id === tokenId);
    const ok = await showConfirm({
      title: "Delete token",
      message: `Delete token "${token?.name ?? tokenId}"? A runner still using it disconnects and cannot reconnect.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteWorkerToken(tokenId);
    if (res.success) {
      onTokenDeleted(tokenId);
    } else {
      toast.error(res.error_message || "Failed to delete token");
    }
  };

  const deleteSelected = async () => {
    const items = tokens.filter((t) => selection.isSelected(t.id));
    const res = await bulk.run({
      items,
      verb: "Delete",
      verbPast: "Deleted",
      noun: "token",
      name: (t) => t.name,
      action: (t) => reqDeleteWorkerToken(t.id),
      confirm: {
        message: "A runner still using one of these disconnects and cannot reconnect.",
        variant: "danger",
      },
    });
    if (res) {
      res.succeeded.forEach((t) => onTokenDeleted(t.id));
      selection.clear();
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon icon={faKey} className="h-3.5 w-3.5 text-muted" />
        <span>Tokens</span>
        <span className="badge badge-neutral ml-2">{tokens.length}</span>
        {editable && selection.count > 0 && (
          <button
            onClick={deleteSelected}
            disabled={!!bulk.running}
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-failed hover:underline cursor-pointer disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
            Delete {selection.count}
          </button>
        )}
      </div>
      <div className="p-4">
        {editable && (
          <form
            className="flex gap-2 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateToken();
            }}
          >
            <Input
              aria-label="New token name"
              placeholder="Token name"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              type="submit"
              loading={creating}
              disabled={!newTokenName.trim()}
            >
              Create
            </Button>
          </form>
        )}

        {createdToken && (
          <div className="mb-3 rounded-lg border border-[#22c55e]/30 bg-healthy/5 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-healthy font-medium uppercase tracking-wider">
                Copy now - shown only once
              </p>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(createdToken)
                    .then(() => toast.success("Token copied"))
                    .catch(() => toast.error("Could not copy"));
                }}
                aria-label="Copy token"
                className="text-xs text-secondary hover:text-primary cursor-pointer"
              >
                <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-primary font-mono break-all select-all">
              {createdToken}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          {tokens.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">No tokens</p>
          ) : (
            tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2"
              >
                {editable && (
                  <Checkbox
                    label={`Select ${token.name}`}
                    checked={selection.isSelected(token.id)}
                    onChange={(_, e) => selection.toggle(token.id, { shiftKey: e.shiftKey })}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-primary">{token.name}</p>
                  <p className="text-[10px] text-dimmed">
                    {token.last_used_at
                      ? `Used ${timeAgo(token.last_used_at)}`
                      : "Never used"}{" "}
                    · created {timeAgo(token.inserted_at)}
                  </p>
                </div>
                {editable && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteToken(token.id)}
                    aria-label={`Delete ${token.name}`}
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
