"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { Stack, Container, Worker, StackImportPayload } from "@/types";
import { reqGetStacks, reqGetAllContainers, reqImportStackExport } from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube, faHeart, faCircle } from "@fortawesome/free-solid-svg-icons";
import WorkerBadge from "@/components/ui/worker-badge";

export default function StacksPage() {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [sRes, cRes, wRes] = await Promise.all([
      reqGetStacks(),
      reqGetAllContainers(),
      reqGetWorkers(),
    ]);
    if (sRes.success) setStacks(sRes.data ?? []);
    if (cRes.success) setContainers(cRes.data ?? []);
    if (wRes.success) setWorkers(wRes.data ?? []);
  }, []);

  useEffect(() => {
    document.title = "Lattice - Stacks";
  }, []);

  useEffect(() => {
    load().then(() => setLoading(false));
  }, [load]);

  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "container_status" ||
        event.type === "container_sync" ||
        event.type === "deployment_progress"
      ) {
        load();
      }
    },
    [load],
  );
  useAdminSocket(handleSocketEvent);

  const workerMap = useMemo(
    () => new Map(workers.map((w) => [w.id, w])),
    [workers],
  );

  const containersByStack = useMemo(() => {
    const map = new Map<number, Container[]>();
    for (const c of containers) {
      const list = map.get(c.stack_id) ?? [];
      list.push(c);
      map.set(c.stack_id, list);
    }
    return map;
  }, [containers]);

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Stacks</div>
          <div className="page-subtitle">Manage your container stacks</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              try {
                const data = JSON.parse(text) as StackImportPayload;
                const res = await reqImportStackExport(data);
                if (res.success) {
                  toast.success("Stack imported successfully");
                  load();
                } else {
                  toast.error(res.error_message || "Import failed");
                }
              } catch {
                toast.error("Invalid JSON file");
              }
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => importRef.current?.click()}>
            Import
          </Button>
          <Link href="/stacks/new" className="btn btn-primary">
            New Stack
          </Link>
        </div>
      </div>

      <div className="py-6">
        {stacks.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-sm text-muted">No stacks found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
            {stacks.map((stack) => {
              const stackContainers = containersByStack.get(stack.id) ?? [];
              const running = stackContainers.filter(
                (c) => c.status === "running",
              ).length;
              const healthy = stackContainers.filter(
                (c) => c.health_status === "healthy",
              ).length;
              const unhealthy = stackContainers.filter(
                (c) => c.health_status === "unhealthy",
              ).length;
              const worker = stack.worker_id
                ? workerMap.get(stack.worker_id)
                : null;

              return (
                <Link
                  key={stack.id}
                  href={`/stacks/${stack.id}`}
                  className="card p-5 hover:border-border-strong transition-colors group"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-primary group-hover:text-brand transition-colors">
                      {stack.name}
                    </h3>
                    <StatusBadge status={stack.status} />
                  </div>

                  {stack.description && (
                    <p className="text-xs text-secondary mb-3 line-clamp-2">
                      {stack.description}
                    </p>
                  )}

                  {/* Container images */}
                  {stackContainers.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {stackContainers.slice(0, 4).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-surface-alt border border-border-subtle px-2 py-0.5 text-[11px] text-secondary"
                        >
                          <FontAwesomeIcon
                            icon={faCube}
                            className="h-2.5 w-2.5 text-info"
                          />
                          <span className="truncate max-w-[140px]">
                            {c.name}
                          </span>
                          <FontAwesomeIcon
                            icon={faCircle}
                            className={`h-1.5 w-1.5 ${c.status === "running" ? "text-healthy" : c.status === "error" ? "text-failed" : "text-muted"}`}
                          />
                        </span>
                      ))}
                      {stackContainers.length > 4 && (
                        <span className="inline-flex items-center rounded-md bg-surface-alt border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                          +{stackContainers.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-3 text-[11px] text-muted border-t border-border-subtle pt-3">
                    <span className="flex items-center gap-1.5">
                      <FontAwesomeIcon
                        icon={faCube}
                        className="h-3 w-3 text-info"
                      />
                      {running}/{stackContainers.length} running
                    </span>

                    {(healthy > 0 || unhealthy > 0) && (
                      <span className="flex items-center gap-1.5">
                        <FontAwesomeIcon
                          icon={faHeart}
                          className={`h-3 w-3 ${unhealthy > 0 ? "text-failed" : "text-healthy"}`}
                        />
                        {unhealthy > 0
                          ? `${unhealthy} unhealthy`
                          : `${healthy} healthy`}
                      </span>
                    )}

                    <span className="flex items-center gap-1.5">
                      <span className="text-muted">
                        {stack.deployment_strategy}
                      </span>
                    </span>

                    {stack.auto_deploy && (
                      <span className="text-info">auto-deploy</span>
                    )}
                  </div>

                  {/* Worker assignment */}
                  {worker && (
                    <div className="mt-2">
                      <WorkerBadge
                        id={worker.id}
                        name={worker.name}
                        size="sm"
                        linkable={false}
                      />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
