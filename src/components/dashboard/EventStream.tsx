"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faPause, faPlay } from "@fortawesome/free-solid-svg-icons";
import type { LiveEvent } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { cn } from "@/lib/utils";

let eventIdCounter = 0;

const MAX_EVENTS = 200;

/**
 * Event kinds that can be hidden. Periodic syncs and log lines are most of the
 * traffic — on a 50-container fleet they buried every deploy and health change
 * under a wall of `{"container_name":…}` JSON — so they start hidden.
 */
type Kind = "heartbeat" | "sync" | "logs" | "other";
const KIND_LABELS: Record<Kind, string> = {
  heartbeat: "Worker heartbeats",
  sync: "Container syncs",
  logs: "Container log lines",
  other: "Everything else",
};
const DEFAULT_HIDDEN: Kind[] = ["sync", "logs"];

type StreamEvent = LiveEvent & { kind: Kind };

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function EventStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [hidden, setHidden] = useState<Set<Kind>>(() => new Set(DEFAULT_HIDDEN));
  const [paused, setPaused] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [workerNames, setWorkerNames] = useState<Record<number, string>>({});
  const [bufferedCount, setBufferedCount] = useState(0);
  const pausedRef = useRef(false);
  const buffered = useRef<StreamEvent[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);

  // Sources read "worker:3" otherwise; names are what everything else shows.
  useEffect(() => {
    reqGetWorkers().then((res) => {
      if (res.success)
        setWorkerNames(Object.fromEntries((res.data ?? []).map((w) => [w.id, w.name])));
    });
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterOpen]);

  const workerSource = useCallback(
    (id: number | undefined) =>
      id != null ? (workerNames[id] ?? `worker:${id}`) : "worker",
    [workerNames],
  );

  const handleEvent = useCallback(
    (event: AdminSocketEvent) => {
      const now = Date.now();
      let level: LiveEvent["level"] = "info";
      let source = "system";
      let msg = "";
      let kind: Kind = "other";
      const p = event.payload ?? {};

      switch (event.type) {
        case "worker_heartbeat": {
          kind = "heartbeat";
          source = workerSource(event.worker_id);
          const cpu = typeof p.cpu_percent === "number" ? p.cpu_percent.toFixed(1) : "?";
          const mem = typeof p.memory_used_mb === "number" ? Math.round(p.memory_used_mb) : "?";
          msg = `heartbeat · cpu ${cpu}% · mem ${mem} MB`;
          level = "ok";
          break;
        }
        case "worker_connected":
          source = workerSource(event.worker_id);
          msg = "connected";
          level = "ok";
          break;
        case "worker_disconnected":
          source = workerSource(event.worker_id);
          msg = "disconnected";
          level = "err";
          break;
        case "container_status": {
          source = str(p.container_name) ?? "container";
          msg = `${p.action ?? "status"} → ${p.status ?? "unknown"}`;
          level =
            p.status === "running" || p.status === "success"
              ? "ok"
              : p.status === "stopped" || p.status === "error" || p.status === "failed"
                ? "err"
                : "info";
          break;
        }
        case "container_health_status": {
          source = str(p.container_name) ?? "container";
          msg = `health → ${p.health_status ?? "unknown"}`;
          level = p.health_status === "healthy" ? "ok" : "warn";
          break;
        }
        case "container_sync": {
          kind = "sync";
          source = str(p.container_name) ?? "container";
          const state = str(p.state) ?? "unknown";
          const health = str(p.health_status);
          msg = `sync · ${state}${health && health !== "none" ? ` · ${health}` : ""}`;
          level = state === "running" ? "ok" : state === "exited" || state === "dead" ? "err" : "info";
          break;
        }
        case "container_logs": {
          kind = "logs";
          source = str(p.container_name) ?? "container";
          const line =
            str(p.message) ?? str(p.line) ?? str(p.log) ??
            (Array.isArray(p.lines) ? String(p.lines[p.lines.length - 1] ?? "") : undefined);
          msg = line ? line.slice(0, 160) : "log output";
          level = p.stream === "stderr" ? "warn" : "info";
          break;
        }
        case "deployment_progress": {
          source = `deploy #${p.deployment_id ?? "?"}`;
          msg = str(p.message) ?? `status → ${p.status ?? "?"}`;
          level = p.status === "failed" ? "err" : p.status === "deployed" ? "ok" : "info";
          break;
        }
        case "worker_crash": {
          source = workerSource(event.worker_id);
          msg = "crash detected";
          level = "err";
          break;
        }
        default: {
          source = event.type.replace(/_/g, " ");
          const name = str(p.container_name) ?? str(p.name);
          const status = str(p.status) ?? str(p.state);
          msg = [name, status].filter(Boolean).join(" · ") || "event";
        }
      }

      const ev: StreamEvent = { id: ++eventIdCounter, ts: now, level, source, msg, kind };
      if (pausedRef.current) {
        buffered.current = [ev, ...buffered.current].slice(0, MAX_EVENTS);
        setBufferedCount(buffered.current.length);
        return;
      }
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
    },
    [workerSource],
  );

  useAdminSocket(handleEvent);

  const togglePause = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    if (!next && buffered.current.length) {
      const flush = buffered.current;
      buffered.current = [];
      setBufferedCount(0);
      setEvents((prev) => [...flush, ...prev].slice(0, MAX_EVENTS));
    }
  };

  const toggleKind = (k: Kind) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const visible = events.filter((e) => !hidden.has(e.kind));

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span className={cn("pulse-dot", paused ? "pending" : "healthy")} />
        <span>Live event stream</span>
        <div className="panel-header-right">
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {paused
              ? `paused · ${bufferedCount} new`
              : `${visible.length} events`}
          </span>
          <div className="relative" ref={filterRef}>
            {/* Both header buttons used to be decoration with no handler. */}
            <button
              className={cn("icon-btn", hidden.size !== DEFAULT_HIDDEN.length && "text-info")}
              style={{ width: 22, height: 22 }}
              onClick={() => setFilterOpen((o) => !o)}
              aria-label="Filter events"
              aria-expanded={filterOpen}
              title="Filter events"
            >
              <FontAwesomeIcon icon={faFilter} style={{ width: 10, height: 10 }} />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg border border-border-strong bg-background-alt p-1 shadow-lg">
                {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                  <label
                    key={k}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-secondary hover:bg-surface cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="lt-checkbox"
                      checked={!hidden.has(k)}
                      onChange={() => toggleKind(k)}
                    />
                    {KIND_LABELS[k]}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            style={{ width: 22, height: 22 }}
            onClick={togglePause}
            aria-label={paused ? "Resume stream" : "Pause stream"}
            title={paused ? "Resume" : "Pause"}
          >
            <FontAwesomeIcon icon={paused ? faPlay : faPause} style={{ width: 10, height: 10 }} />
          </button>
        </div>
      </div>
      <div className="event-stream" style={{ flex: 1, overflowY: "auto" }}>
        {visible.length === 0 && (
          <div className="text-muted mono" style={{ padding: "16px", fontSize: 11 }}>
            {events.length === 0
              ? "Waiting for events..."
              : "Nothing matches the current filter"}
          </div>
        )}
        {visible.map((ev, i) => (
          <div key={ev.id} className={`event-line${i === 0 && !paused ? " new" : ""}`}>
            <span className="event-ts">
              {new Date(ev.ts).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span className="event-src" title={ev.source}>
              {ev.source}
            </span>
            <span className="event-msg" title={ev.msg}>
              <span
                className={
                  ev.level === "ok"
                    ? "log-level-ok"
                    : ev.level === "err"
                      ? "log-level-err"
                      : ev.level === "warn"
                        ? "log-level-warn"
                        : "log-level-info"
                }
                style={{ display: "inline-block", width: 36, fontSize: 10 }}
              >
                [{ev.level.toUpperCase()}]
              </span>{" "}
              {ev.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
