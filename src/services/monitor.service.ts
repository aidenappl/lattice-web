import { Monitor, newRequestId, type EmitOptions, type LogLevel } from "@aidenappleby/monitor-js";
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { RequestMeta } from "@/types";
import { APP_VERSION } from "@/lib/version";

export const MONITOR_SERVICE = "lattice-web";

/**
 * The build this bundle came from: CI passes the release tag (vX.Y.Z) or the
 * short commit SHA as NEXT_PUBLIC_APP_VERSION; "dev" for a local build.
 */
export const RELEASE = APP_VERSION;

/** The request path without its query string or fragment, which can carry tokens. */
const stripQuery = (url: string): string => {
    const i = url.search(/[?#]/);
    return i === -1 ? url : url.slice(0, i);
};

// First path segments whose second segment is a record id ([id] in src/app).
const DYNAMIC_ROOTS = new Set(["automations", "containers", "databases", "deployments", "stacks", "workers"]);
// A number, a UUID, or a long hex id.
const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;

/**
 * The route template of a pathname: /stacks/42/ → /stacks/[id]. Groups events
 * by page rather than by record, and keeps ids out of the grouping key.
 */
export const normaliseRoute = (pathname: string): string => {
    const segments = stripQuery(pathname).split("/");
    const out = segments.map((seg, i) => {
        if (seg === "") return seg;
        if (i === 2 && DYNAMIC_ROOTS.has(segments[1]) && seg !== "new") return "[id]";
        return ID_SEGMENT.test(seg) ? "[id]" : seg;
    });
    const route = out.join("/").replace(/\/+$/, "");
    return route === "" ? "/" : route;
};

/** Fields merged into every browser event. An event's own data wins. */
const eventContext = (): Record<string, unknown> =>
    typeof window === "undefined"
        ? { release: RELEASE }
        : { release: RELEASE, route: normaliseRoute(window.location.pathname) };

/**
 * Monitor with `route` and `release` on every event, including the SDK's own
 * uncaught-error and unhandled-rejection events (they go through emit too).
 */
class LatticeMonitor extends Monitor {
    override emit(name: string, level: LogLevel, opts: EmitOptions = {}): void {
        super.emit(name, level, { ...opts, data: { ...eventContext(), ...opts.data } });
    }
}

/** An X-Request-ID lattice-api accepts. crypto.randomUUID needs a secure context. */
export const newClientRequestId = (): string =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : newRequestId();

/**
 * Browser telemetry. Events go to this app's own /api/monitor route, which adds
 * the ingest key server-side: a key compiled into the bundle is readable by
 * anyone who loads the page. null during server rendering.
 */
export const monitor: Monitor | null =
    typeof window !== "undefined"
        ? new LatticeMonitor({
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

/**
 * Reports an exception a handler caught and recovered from (it showed a toast,
 * fell back to a default, …). `feature` names the place, e.g. "databases.load".
 *
 * Only for exceptions: fetchApi never throws, and a failed API call (`!res.success`)
 * is already reported by the axios reporter above.
 */
export const reportCaught = (feature: string, error: unknown, data: Record<string, unknown> = {}): void =>
    reportError("client.error.caught", error, { ...data, feature });

const lastEmitted = new Map<string, { at: number; suppressed: number }>();

/**
 * A token bucket of one per key: returns the number of calls suppressed since
 * the last one allowed, or null while `intervalMs` has not yet passed.
 */
export const rateLimit = (key: string, intervalMs: number, now: number = Date.now()): number | null => {
    const entry = lastEmitted.get(key);
    if (entry && now - entry.at < intervalMs) {
        entry.suppressed++;
        return null;
    }
    const suppressed = entry?.suppressed ?? 0;
    lastEmitted.set(key, { at: now, suppressed: 0 });
    return suppressed;
};

/** Mirrors a condition the app otherwise only logs to the console. */
export const reportWarn = (name: string, data: Record<string, unknown> = {}): void => {
    monitor?.warn(name, { data });
};

/**
 * Like reportWarn, but at most once per `intervalMs` for the same key, with
 * the number of occurrences dropped in between as `suppressed`.
 */
export const reportWarnRateLimited = (
    name: string,
    data: Record<string, unknown> = {},
    key: string = name,
    intervalMs = 60_000,
): void => {
    if (!monitor) return;
    const suppressed = rateLimit(key, intervalMs);
    if (suppressed === null) return;
    monitor.warn(name, { data: suppressed > 0 ? { ...data, suppressed } : data });
};

export type FetchFailure = {
    /** Where the call is made from, e.g. "login.sso_config". */
    feature: string;
    method?: string;
    url: string;
    /** The X-Request-ID sent, if any. */
    requestId?: string;
    /** The response, when there was one. */
    response?: Response;
    /** The thrown error, when there was no response. */
    error?: unknown;
    /** Polls: how many attempts were made before giving up. */
    attempts?: number;
};

/**
 * Reports a failed raw fetch() — the few calls that deliberately bypass
 * fetchApi (its 401 refresh and redirects would be wrong for them). Error for
 * a network failure or 5xx, warn for anything else.
 */
export const reportFetchFailure = (f: FetchFailure): void => {
    if (!monitor) return;
    const status = f.response?.status;
    const e = (typeof f.error === "object" && f.error !== null ? f.error : {}) as Reportable;
    const level: LogLevel = status === undefined || status >= 500 ? "error" : "warn";
    monitor.emit("fetch.failed", level, {
        requestId: f.response?.headers.get("x-request-id") || f.requestId,
        data: {
            feature: f.feature,
            method: (f.method ?? "GET").toUpperCase(),
            url: stripQuery(f.url),
            status_code: status,
            error_type: f.error !== undefined && typeof e.name === "string" ? e.name : undefined,
            error_message:
                f.error === undefined ? undefined : typeof e.message === "string" ? e.message : String(f.error),
            attempts: f.attempts,
        },
    });
};

/**
 * The level for a failed session check (/auth/refresh, the bootstrap
 * /auth/self): 401/403 is the expected "not signed in / session over" case,
 * so info; other 4xx is a warning; 5xx or no response is an error.
 */
export const sessionFailureLevel = (status: number | undefined): LogLevel => {
    if (status === undefined || status >= 500) return "error";
    if (status === 401 || status === 403) return "info";
    return "warn";
};

/**
 * Whether the browser holds the API's client-readable `lattice-logged-in`
 * marker cookie, set at login alongside the httpOnly token cookies.
 */
export const hasLoggedInCookie = (): boolean =>
    typeof document !== "undefined" &&
    document.cookie.split(";").some((c) => c.trim().startsWith("lattice-logged-in="));
