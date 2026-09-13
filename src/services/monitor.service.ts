import { Monitor, attachAxiosMonitor } from "@aidenappleby/monitor-js";

export const MONITOR_SERVICE = "lattice-web";

/**
 * Browser telemetry. Events go to this app's own /api/monitor route, which adds
 * the ingest key server-side: a key compiled into the bundle is readable by
 * anyone who loads the page. null during server rendering.
 */
export const monitor: Monitor | null =
    typeof window !== "undefined"
        ? new Monitor({
              service: MONITOR_SERVICE,
              ingestUrl: "/api/monitor",
              apiKey: "",
              env: process.env.NODE_ENV === "production" ? "production" : "development",
              ignoreErrors: [
                  // Thrown by browser extensions, not by this app.
                  /(chrome|moz|safari(-web)?)-extension:\/\//,
                  // A benign layout notification some browsers surface as an error.
                  /ResizeObserver loop/,
              ],
          })
        : null;

/**
 * Reports every failed API call: method, path (never the query string),
 * status, the API's error message and its X-Request-ID — never a body.
 */
export const attachMonitor = (instance: Parameters<typeof attachAxiosMonitor>[0]): void => {
    if (!monitor) return;
    attachAxiosMonitor(instance, monitor);
};

type Reportable = { message?: unknown; stack?: unknown; digest?: unknown; name?: unknown };

/** Reports an error caught by an error boundary or a handler. */
export const reportError = (
    name: string,
    error: unknown,
    data: Record<string, unknown> = {},
): void => {
    if (!monitor) return;
    const e = (typeof error === "object" && error !== null ? error : {}) as Reportable;
    monitor.error(name, {
        data: {
            ...data,
            message: typeof e.message === "string" ? e.message : String(error),
            error_type: typeof e.name === "string" ? e.name : undefined,
            stack: typeof e.stack === "string" ? e.stack : undefined,
            digest: typeof e.digest === "string" ? e.digest : undefined,
            path: window.location.pathname,
        },
    });
};
