import { ApiResponse } from "@/types";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

const BASE_API_URL = process.env.NEXT_PUBLIC_LATTICE_API ?? "";

const axiosApi = axios.create({
    baseURL: BASE_API_URL,
    headers: {
        "Content-Type": "application/json",
    },
    validateStatus: () => true,
    withCredentials: true,
    timeout: 10000,
});

const MAX_GET_RETRIES = 3;

export const fetchApi = async <T>(
    config: AxiosRequestConfig,
): Promise<ApiResponse<T>> => {
    const isGet = (config.method ?? "GET").toUpperCase() === "GET";
    const maxAttempts = isGet ? MAX_GET_RETRIES : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await executeRequest<T>(config, null);

            if (
                response.status === 403 &&
                !response.success &&
                "error_code" in response &&
                response.error_code === 4003 &&
                typeof window !== "undefined"
            ) {
                window.location.href = "/unauthorized";
                return response;
            }

            if (
                response.status === 403 &&
                !response.success &&
                "error_code" in response &&
                response.error_code === 4004 &&
                typeof window !== "undefined"
            ) {
                window.location.href = "/pending";
                return response;
            }

            if (response.status === 401) {
                const refreshResult = await handle401Response<T>(config);
                if (refreshResult) return refreshResult;

                if (typeof window !== "undefined") {
                    window.location.href = "/login";
                }
                return response;
            }

            // For GET requests, retry on 5xx errors
            if (isGet && !response.success && response.status >= 500 && attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
                continue;
            }

            return response;
        } catch (err: unknown) {
            const status = err instanceof AxiosError ? (err.response?.status ?? 500) : 500;
            const message = err instanceof AxiosError ? err.message : "Request failed unexpectedly";

            // For GET requests, retry on network/5xx errors
            if (isGet && attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
                continue;
            }

            return {
                success: false,
                status,
                error: "request_failed",
                error_message: message ?? "Request failed unexpectedly",
                error_code: -1,
            };
        }
    }

    // Fallback — should not reach here, but satisfies TypeScript
    return {
        success: false,
        status: 500,
        error: "request_failed",
        error_message: "Request failed after retries",
        error_code: -1,
    };
};

// ─── Token refresh ──────────────────────────────────────────────────────────
// Two layers:
//   1. Reactive (401 handler): catches expired tokens on API calls, refreshes,
//      and retries the original request.
//   2. Proactive (activity-aware scheduler): refreshes ~60s before expiry IF
//      the user is actively using the app. If idle, defers until next activity.
//
// Both use the same doRefresh() with a shared singleton promise so concurrent
// callers never fire parallel /auth/refresh requests.

type RefreshResult = { token: string; expiresAt: string | null };

const MAX_REFRESH_ATTEMPTS = 2;

let refreshPromise: Promise<RefreshResult | null> | null = null;

const doRefresh = async (): Promise<RefreshResult | null> => {
    for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt++) {
        try {
            const refreshResponse = await axios.post(
                `${BASE_API_URL}/auth/refresh`,
                {},
                {
                    withCredentials: true,
                    validateStatus: () => true,
                    timeout: 10000,
                },
            );

            if (refreshResponse.status === 200 && refreshResponse.data?.success) {
                return {
                    token: refreshResponse.data.data.token as string,
                    expiresAt: (refreshResponse.data.data.expires_at as string) ?? null,
                };
            }

            // Definitive auth failure — don't retry
            if (refreshResponse.status === 401) {
                return null;
            }

            // Transient error (429, 500, etc.) — retry once after a brief pause
            if (attempt < MAX_REFRESH_ATTEMPTS) {
                await new Promise((r) => setTimeout(r, 1000));
                continue;
            }
        } catch {
            // Network error — retry once
            if (attempt < MAX_REFRESH_ATTEMPTS) {
                await new Promise((r) => setTimeout(r, 1000));
                continue;
            }
        }
    }
    return null;
};

/** Shared entry point — deduplicates concurrent refresh calls. */
function getRefreshPromise(): Promise<RefreshResult | null> {
    if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

const handle401Response = async <T>(
    originalConfig: AxiosRequestConfig,
): Promise<ApiResponse<T> | null> => {
    const result = await getRefreshPromise();
    if (result) {
        // Reschedule proactive refresh with the new expiry
        scheduleNextRefresh(result.expiresAt);

        return await executeRequest<T>(originalConfig, result.token);
    }
    return null;
};

// ─── Activity-aware proactive refresh ───────────────────────────────────────
// Tracks user activity and schedules token refresh relative to expiry.
// Active user → refresh 60s before expiry.
// Idle user   → skip refresh, defer until next interaction.
// Tab return  → check expiry immediately.

const ACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;  // 5 min — user considered "active"
const REFRESH_BEFORE_EXPIRY_MS = 60 * 1000;   // Refresh 60s before token expires
const DEFAULT_TOKEN_LIFETIME_MS = 14 * 60 * 1000; // Fallback if no expires_at
const ACTIVITY_DEBOUNCE_MS = 2000;             // Throttle activity events

let lastUserActivity = 0;
let tokenExpiresAt: number | null = null;
let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
let pendingRefreshOnActivity = false;
let activityListenersAttached = false;
let activityThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function isUserActive(): boolean {
    return Date.now() - lastUserActivity < ACTIVITY_THRESHOLD_MS;
}

function onUserActivity() {
    if (activityThrottleTimer) return;
    lastUserActivity = Date.now();
    activityThrottleTimer = setTimeout(() => {
        activityThrottleTimer = null;
    }, ACTIVITY_DEBOUNCE_MS);

    // If we skipped a refresh due to inactivity, do it now
    if (pendingRefreshOnActivity) {
        pendingRefreshOnActivity = false;
        performScheduledRefresh();
    }
}

function attachActivityListeners() {
    if (activityListenersAttached || typeof window === "undefined") return;
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onUserActivity, { passive: true }));
    activityListenersAttached = true;
}

function detachActivityListeners() {
    if (!activityListenersAttached || typeof window === "undefined") return;
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.removeEventListener(e, onUserActivity));
    activityListenersAttached = false;
}

function scheduleNextRefresh(expiresAt?: string | null) {
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = null;
    }

    if (expiresAt) {
        tokenExpiresAt = new Date(expiresAt).getTime();
    } else if (!tokenExpiresAt) {
        tokenExpiresAt = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
    }

    const msUntilExpiry = tokenExpiresAt - Date.now();
    const refreshIn = Math.max(5_000, msUntilExpiry - REFRESH_BEFORE_EXPIRY_MS);

    refreshTimeoutId = setTimeout(performScheduledRefresh, refreshIn);
}

async function performScheduledRefresh() {
    refreshTimeoutId = null;

    if (!isUserActive()) {
        // User is idle — defer until they interact again
        pendingRefreshOnActivity = true;
        return;
    }

    const result = await getRefreshPromise();
    if (result) {
        scheduleNextRefresh(result.expiresAt);
    }
    // If refresh failed, the reactive 401 handler catches it on next request
}

function onVisibilityChange() {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    lastUserActivity = Date.now();

    if (!tokenExpiresAt) return;
    const msUntilExpiry = tokenExpiresAt - Date.now();

    if (msUntilExpiry < REFRESH_BEFORE_EXPIRY_MS) {
        // Token is close to or past expiry — refresh now
        performScheduledRefresh();
    }
}

export function startProactiveRefresh() {
    lastUserActivity = Date.now();
    pendingRefreshOnActivity = false;
    attachActivityListeners();
    scheduleNextRefresh();

    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibilityChange);
    }
}

export function stopProactiveRefresh() {
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = null;
    }
    if (activityThrottleTimer) {
        clearTimeout(activityThrottleTimer);
        activityThrottleTimer = null;
    }
    pendingRefreshOnActivity = false;
    tokenExpiresAt = null;
    detachActivityListeners();
    if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
    }
}

// ─── CSRF ───────────────────────────────────────────────────────────────────

function getCSRFToken(): string {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/(?:^|;\s*)lattice-csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
}

const executeRequest = async <T>(
    config: AxiosRequestConfig,
    token: string | null,
): Promise<ApiResponse<T>> => {
    const method = (config.method ?? "GET").toUpperCase();
    const needsCsrf = method === "POST" || method === "PUT" || method === "DELETE";

    const requestConfig: AxiosRequestConfig = {
        ...config,
        headers: {
            ...config.headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(needsCsrf ? { "X-CSRF-Token": getCSRFToken() } : {}),
        },
    };

    const response: AxiosResponse = await axiosApi.request(requestConfig);

    if (response.data?.success) {
        return {
            success: true,
            status: response.status,
            message: response.data.message,
            data: response.data.data as T,
        };
    }

    return {
        success: false,
        status: response.status,
        error: response.data?.error ?? "unknown_error",
        error_message: response.data?.error_message ?? "An unexpected error occurred",
        error_code: response.data?.error_code ?? 0,
    };
};
