"use client";

import { useState } from "react";
import type { DockerVolume, DockerNetwork } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHardDrive, faNetworkWired } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";
import {
  reqCreateVolume,
  reqDeleteVolume,
} from "@/services/volumes.service";
import {
  reqCreateNetwork,
  reqDeleteNetwork,
} from "@/services/networks.service";

export interface WorkerInfraPanelProps {
  workerId: number;
  volumes: DockerVolume[];
  networks: DockerNetwork[];
}

export default function WorkerInfraPanel({
  workerId,
  volumes,
  networks,
}: WorkerInfraPanelProps) {
  const [infraTab, setInfraTab] = useState<"volumes" | "networks">("volumes");
  const [newVolumeName, setNewVolumeName] = useState("");
  const [newNetworkName, setNewNetworkName] = useState("");

  const user = useUser();
  const showConfirm = useConfirm();

  return (
    <div className="panel">
      <div className="tabs-bar !px-4 !gap-0">
        <button
          className={`tab-item ${infraTab === "volumes" ? "active" : ""}`}
          onClick={() => setInfraTab("volumes")}
        >
          <FontAwesomeIcon icon={faHardDrive} className="h-3 w-3" />
          Volumes
          <span className="count">{volumes.length}</span>
        </button>
        <button
          className={`tab-item ${infraTab === "networks" ? "active" : ""}`}
          onClick={() => setInfraTab("networks")}
        >
          <FontAwesomeIcon icon={faNetworkWired} className="h-3 w-3" />
          Networks
          <span className="count">{networks.length}</span>
        </button>
      </div>
      <div className="p-4">
        {infraTab === "volumes" && (
          <>
            {canEdit(user) && (
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Volume name"
                  value={newVolumeName}
                  onChange={(e) => setNewVolumeName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!newVolumeName.trim()) return;
                    await reqCreateVolume(workerId, {
                      name: newVolumeName.trim(),
                    });
                    setNewVolumeName("");
                  }}
                  disabled={!newVolumeName.trim()}
                >
                  Create
                </Button>
              </div>
            )}
            <div className="space-y-1.5">
              {volumes.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">
                  No volumes
                </p>
              ) : (
                volumes.map((vol) => (
                  <div
                    key={vol.name}
                    className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-primary break-all">
                        {vol.name}
                      </p>
                      <p className="text-[10px] text-dimmed">
                        {vol.driver} / {vol.scope}
                      </p>
                    </div>
                    {canEdit(user) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          const ok = await showConfirm({
                            title: "Delete volume",
                            message: `Delete volume "${vol.name}"? Any data stored in this volume will be lost.`,
                            confirmLabel: "Delete",
                            variant: "danger",
                          });
                          if (!ok) return;
                          await reqDeleteVolume(workerId, vol.name, true);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
        {infraTab === "networks" && (
          <>
            {canEdit(user) && (
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Network name"
                  value={newNetworkName}
                  onChange={(e) => setNewNetworkName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!newNetworkName.trim()) return;
                    await reqCreateNetwork(workerId, {
                      name: newNetworkName.trim(),
                    });
                    setNewNetworkName("");
                  }}
                  disabled={!newNetworkName.trim()}
                >
                  Create
                </Button>
              </div>
            )}
            <div className="space-y-1.5">
              {networks.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">
                  No networks
                </p>
              ) : (
                networks.map((net) => {
                  const containerCount = net.containers
                    ? Object.keys(net.containers).length
                    : 0;
                  return (
                    <div
                      key={net.id}
                      className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-primary break-all">
                          {net.name}
                        </p>
                        <p className="text-[10px] text-dimmed">
                          {net.driver} / {net.scope}
                          {containerCount > 0 &&
                            ` \u00b7 ${containerCount} container${containerCount !== 1 ? "s" : ""}`}
                          {net.internal && " \u00b7 internal"}
                        </p>
                      </div>
                      {canEdit(user) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const ok = await showConfirm({
                              title: "Delete network",
                              message: `Delete network "${net.name}"? Containers connected to this network will be disconnected.`,
                              confirmLabel: "Delete",
                              variant: "danger",
                            });
                            if (!ok) return;
                            await reqDeleteNetwork(workerId, net.name);
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
