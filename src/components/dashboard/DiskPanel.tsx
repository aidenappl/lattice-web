"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHardDrive } from "@fortawesome/free-solid-svg-icons";
import { Meter } from "@/components/ui/sparkline";
import { reqGetHealth } from "@/services/admin.service";
import { CONTROL_PLANE_DISK_LABELS, diskFree, formatFree, sampleFree, type DiskFree } from "@/lib/disk";
import type { ControlPlaneDiskSample, WorkerMetricsSummary } from "@/types";

// lattice-api samples the control-plane host every minute (APL-121).
const HEALTH_REFRESH_MS = 60_000;

function DiskRow({ name, title, href, free, unavailable }: {
  name: string;
  title?: string;
  href?: string;
  free: DiskFree | null;
  unavailable?: string;
}) {
  const label = href ? (
    <Link href={href} className="hover:text-primary hover:underline">{name}</Link>
  ) : name;
  return (
    <div className="flex items-center gap-3 text-[11px] min-w-0" title={title}>
      <span className={`status-dot ${free?.low ? "failed" : free ? "healthy" : "off"}`} />
      <span className="mono flex-1 min-w-0 truncate">{label}</span>
      {free ? (
        <>
          <span className={`mono text-[10px] text-right shrink-0 ${free.low ? "text-destructive font-medium" : "text-muted"}`}>
            {free.low ? "Low: " : ""}
            {formatFree(free)}
          </span>
          {/* The text says it all at phone width; the bar would squeeze the name. */}
          <span className="hidden sm:block shrink-0">
            <Meter value={100 - free.freePct} width={56} tone={free.low ? "bad" : undefined} />
          </span>
        </>
      ) : (
        <span className="mono text-[10px] text-dimmed shrink-0" title={unavailable}>
          {unavailable ? "unavailable" : "no data"}
        </span>
      )}
    </div>
  );
}

/** Free disk on the control-plane host (root fs, compose dir, MariaDB data) and on every worker. */
export function DiskPanel({ workerMetrics }: { workerMetrics: WorkerMetricsSummary[] | null }) {
  const [samples, setSamples] = useState<ControlPlaneDiskSample[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      reqGetHealth().then((res) => {
        if (alive && res.success) setSamples(res.data.control_plane_disk ?? []);
      });
    load();
    const timer = setInterval(load, HEALTH_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const workers = [...(workerMetrics ?? [])].sort((a, b) => a.worker_name.localeCompare(b.worker_name));

  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon icon={faHardDrive} style={{ width: 12, color: "var(--text-muted)" }} />
        <span>Disk</span>
        <span className="muted">· free space</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 p-4">
        <section className="min-w-0">
          <h3 className="mono text-[10px] uppercase tracking-[0.08em] text-dimmed mb-2">Control plane</h3>
          <div className="flex flex-col gap-2">
            {samples === null && <div className="text-muted mono text-[11px]">Loading…</div>}
            {samples !== null && samples.length === 0 && (
              <div className="text-muted mono text-[11px]">No samples yet (needs lattice-api with APL-121).</div>
            )}
            {samples?.map((s) => (
              <DiskRow
                key={s.label}
                name={CONTROL_PLANE_DISK_LABELS[s.label] ?? s.label}
                title={s.path}
                free={sampleFree(s)}
                unavailable={s.error}
              />
            ))}
          </div>
        </section>
        <section className="min-w-0">
          <h3 className="mono text-[10px] uppercase tracking-[0.08em] text-dimmed mb-2">Workers</h3>
          <div className="flex flex-col gap-2 max-h-[168px] overflow-y-auto">
            {workers.length === 0 && <div className="text-muted mono text-[11px]">No worker metrics available.</div>}
            {workers.map((w) => (
              <DiskRow
                key={w.worker_id}
                name={w.worker_name}
                href={`/workers/${w.worker_id}`}
                free={diskFree(w.disk_used, w.disk_total)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
