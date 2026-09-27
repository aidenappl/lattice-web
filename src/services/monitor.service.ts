import { Monitor } from "@aidenappleby/monitor-js";
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { RequestMeta } from "@/types";

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

/** The request path without its query string or fragment, which can carry tokens. */
const stripQuery = (url: string): string => {
    const i = url.search(/[?#]/);
    return i === -1 ? url : url.slice(0, i);
};

/** A response header by case-insensitive name ("" when absent). */
const headerValue = (headers: AxiosResponse["headers"] | undefined, name: string): string => {
    if (!headers) return "";
    for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === name && typeof v === "string") return v;
    }
    return "";
};

const durationSince = (meta: RequestMeta | undefined): number | undefined =>
    meta?.startTime ? Date.now() - meta.startTime : undefined;

/**
 * Reports every failed API call: method, path (never the query string),
 * status, the API's error, error_message and numeric error_code, the attempt
 * count and the X-Request-ID — never a body.
 *
 * This replaces monitor-js's attachAxiosMonitor (1.2.0), which cannot attach a
 * request id to network errors, drops the API's error_code, and reports every
 * retry attempt. A failure fetchApi is about to retry (per the retry flags it
 * puts on config.meta) is skipped, so a retried request reports once, with
 * `attempts`.
 */
export const attachMonitor = (instance: AxiosInstance): void => {
    if (!monitor) return;
    const m = monitor;

    const report = (response: AxiosResponse): void => {
        const status = response.status ?? 0;
        if (status < 400) return;
        const meta = response.config?.meta;
        if (status >= 500 && meta?.retryOnServerError) return;

        const body: unknown = response.data;
        const envelope = (typeof body === "object" && body !== null ? body : {}) as {
            error?: unknown;
            error_message?: unknown;
            error_code?: unknown;
        };
        m.emit(status >= 500 ? "api.request.server_error" : "api.request.client_error", status >= 500 ? "error" : "warn", {
            // The API echoes the id it used (ours, unless it rejected it).
            requestId: headerValue(response.headers, "x-request-id") || meta?.requestId,
            traceId: headerValue(response.headers, "x-trace-id") || undefined,
            data: {
                method: (response.config?.method ?? "").toUpperCase(),
                url: stripQuery(response.config?.url ?? ""),
                status_code: status,
                error: typeof envelope.error === "string" ? envelope.error : undefined,
                error_message: typeof envelope.error_message === "string" ? envelope.error_message : undefined,
                error_code: typeof envelope.error_code === "number" ? envelope.error_code : undefined,
                attempts: meta?.attempt ?? 1,
                duration_ms: durationSince(meta),
            },
        });
    };

    instance.interceptors.response.use(
        (response) => {
            report(response);
            return response;
        },
        (error: AxiosError) => {
            if (error.response) {
                // Only reachable if a caller overrides validateStatus.
                report(error.response);
                return Promise.reject(error);
            }
            // No response: timeout, DNS failure, CORS refusal, abort.
            const config: InternalAxiosRequestConfig | undefined = error.config;
            const meta = config?.meta;
            if (!meta?.retryOnNetworkError) {
                m.error("api.request.network_error", {
                    requestId: meta?.requestId,
                    data: {
                        method: (config?.method ?? "").toUpperCase(),
                        url: stripQuery(config?.url ?? ""),
                        error_code: error.code,
                        error_message: error.message,
                        attempts: meta?.attempt ?? 1,
                        duration_ms: durationSince(meta),
                    },
                });
            }
            return Promise.reject(error);
        },
    );
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
