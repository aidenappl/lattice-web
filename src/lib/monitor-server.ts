import { Monitor } from "@aidenappleby/monitor-js";
import type { Instrumentation } from "next";
import { MONITOR_SERVICE } from "@/services/monitor.service";

let monitor: Monitor | null | undefined;

// Created on first use, from runtime env. The SDK must not install its own
// process-wide handlers here: an uncaughtException listener stops Node from
// exiting on a crash, and would leave a broken server running.
const getMonitor = (): Monitor | null => {
    if (monitor !== undefined) return monitor;
    const ingestUrl = process.env.MONITOR_INGEST_URL;
    const apiKey = process.env.MONITOR_API_KEY;
    monitor =
        ingestUrl && apiKey
            ? new Monitor({
                  service: MONITOR_SERVICE,
                  ingestUrl,
                  apiKey,
                  env: process.env.MONITOR_ENV ?? "production",
                  captureErrors: false,
                  captureUnhandledRejections: false,
              })
            : null;
    return monitor;
};

type OnRequestErrorArgs = Parameters<Instrumentation.onRequestError>;
type Reportable = { message?: unknown; stack?: unknown; digest?: unknown; name?: unknown };

export const reportServerError = (
    error: OnRequestErrorArgs[0],
    request: OnRequestErrorArgs[1],
    context: OnRequestErrorArgs[2],
): void => {
    const m = getMonitor();
    if (!m) return;
    const e = (typeof error === "object" && error !== null ? error : {}) as Reportable;
    m.error("server.request.error", {
        data: {
            message: typeof e.message === "string" ? e.message : String(error),
            error_type: typeof e.name === "string" ? e.name : undefined,
            stack: typeof e.stack === "string" ? e.stack : undefined,
            digest: typeof e.digest === "string" ? e.digest : undefined,
            method: request.method,
            path: request.path.split(/[?#]/)[0],
            route: context.routePath,
            route_type: context.routeType,
            router_kind: context.routerKind,
            render_source: context.renderSource,
        },
    });
};
