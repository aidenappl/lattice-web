"use client";

import { useState, useCallback } from "react";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faFilter } from "@fortawesome/free-solid-svg-icons";
import type { LiveEvent } from "@/types";

let eventIdCounter = 0;

export function EventStream() {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  const handleEvent = useCallback((event: AdminSocketEvent) => {
    const now = Date.now();
    let level: LiveEvent["level"] = "info";
    let source = "system";
    let msg = "";

    switch (event.type) {
      case "worker_heartbeat": {
        const p = event.payload ?? {};
        source = `worker:${event.worker_id ?? "?"}`;
        const cpu = p.cpu_percent ?? "?";
        const mem = p.memory_used_mb ?? "?";
        msg = `heartbeat ok (cpu=${cpu}%, mem=${mem}MB)`;
        level = "ok";
        break;
      }
      case "worker_connected":
        source = `worker:${event.worker_id ?? "?"}`;
        msg = "connected";
        level = "ok";
        break;
      case "worker_disconnected":
        source = `worker:${event.worker_id ?? "?"}`;
        msg = "disconnected";
        level = "err";
        break;
      case "container_status": {
        const p = event.payload ?? {};
        source = (p.container_name as string) ?? "container";
        msg = `${p.action ?? "status"} → ${p.status ?? "unknown"}`;
        level =
          p.status === "running"
            ? "ok"
            : p.status === "stopped" || p.status === "error"
              ? "err"
              : "info";
        break;
      }
      case "container_health_status": {
        const p = event.payload ?? {};
        source = (p.container_name as string) ?? "container";
        msg = `health → ${p.health_status ?? "unknown"}`;
        level = p.health_status === "healthy" ? "ok" : "warn";
        break;
      }
      case "deployment_progress": {
        const p = event.payload ?? {};
        source = `deploy:${p.deployment_id ?? "?"}`;
        msg = (p.message as string) ?? `status → ${p.status ?? "?"}`;
        level =
          p.status === "failed"
            ? "err"
            : p.status === "deployed"
              ? "ok"
              : "info";
        break;
      }
      case "worker_crash": {
        source = `worker:${event.worker_id ?? "?"}`;
        msg = "crash detected";
        level = "err";
        break;
      }
      default:
        source = event.type;
        msg = JSON.stringify(event.payload ?? {}).slice(0, 100);
    }

    const id = ++eventIdCounter;
    setEvents((prev) =>
      [{ id, ts: now, level, source, msg }, ...prev].slice(0, 60),
    );
  }, []);

  useAdminSocket(handleEvent);

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span className="pulse-dot healthy" />
        <span>Live event stream</span>
        <div className="panel-header-right">
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-muted)" }}
          >
            {events.length} events
          </span>
          <button className="icon-btn" style={{ width: 22, height: 22 }}>
            <FontAwesomeIcon
              icon={faFilter}
              style={{ width: 10, height: 10 }}
            />
          </button>
          <button className="icon-btn" style={{ width: 22, height: 22 }}>
            <FontAwesomeIcon
              icon={faArrowDown}
              style={{ width: 10, height: 10 }}
            />
          </button>
        </div>
      </div>
      <div className="event-stream" style={{ flex: 1, overflow: "hidden" }}>
        {events.length === 0 && (
          <div
            className="text-muted mono"
            style={{ padding: "16px", fontSize: 11 }}
          >
            Waiting for events...
          </div>
        )}
        {events.slice(0, 22).map((ev, i) => (
          <div key={ev.id} className={`event-line${i === 0 ? " new" : ""}`}>
            <span className="event-ts">
              {new Date(ev.ts).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span className="event-src">{ev.source}</span>
            <span className="event-msg">
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
