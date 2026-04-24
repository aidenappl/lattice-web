"use client";

import type { Worker } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faServer } from "@fortawesome/free-solid-svg-icons";
import { formatDate, timeAgo } from "@/lib/utils";

export interface WorkerInfoPanelProps {
  worker: Worker;
}

export default function WorkerInfoPanel({ worker }: WorkerInfoPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faServer}
          className="h-3.5 w-3.5 text-muted"
        />
        <span>Worker Info</span>
      </div>
      <div className="p-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-2 sm:gap-y-3 text-sm">
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              Hostname
            </dt>
            <dd className="text-secondary mt-0.5">
              {worker.hostname ? (
                <a
                  href={`http://${worker.hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline font-mono break-all"
                >
                  {worker.hostname}
                </a>
              ) : (
                <span>Not set</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              IP Address
            </dt>
            <dd className="text-secondary font-mono mt-0.5">
              {worker.ip_address ?? "Unknown"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              OS / Arch
            </dt>
            <dd className="text-secondary mt-0.5">
              {worker.os ?? "Unknown"} / {worker.arch ?? "Unknown"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              Docker
            </dt>
            <dd className="text-secondary font-mono mt-0.5">
              {worker.docker_version ?? "Unknown"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              Runner
            </dt>
            <dd className="text-secondary font-mono mt-0.5">
              {worker.runner_version ?? "Unknown"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              Last Heartbeat
            </dt>
            <dd className="text-secondary mt-0.5">
              {worker.last_heartbeat_at
                ? timeAgo(worker.last_heartbeat_at)
                : "Never"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              Labels
            </dt>
            <dd className="text-secondary mt-0.5">
              {worker.labels ?? "None"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
              Created
            </dt>
            <dd className="text-secondary mt-0.5">
              {formatDate(worker.inserted_at)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
