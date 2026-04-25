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

// Singleton promise to deduplicate concurrent refresh requests.
// Without this, multiple 401s fire parallel refresh calls — a race condition
// that can corrupt token state.
let refreshPromise: Promise<string | null> | null = null;

const MAX_REFRESH_ATTEMPTS = 2;

const doRefresh = async (): Promise<string | null> => {
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
                return refreshResponse.data.data.token as string;
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

const handle401Response = async <T>(
    originalConfig: AxiosRequestConfig,
): Promise<ApiResponse<T> | null> => {
    // Deduplicate: if a refresh is already in flight, wait for it
    if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
        });
    }

    const newToken = await refreshPromise;
    if (newToken) {
        // Only retry safe methods automatically; state-changing methods
        // could cause unintended side effects on retry
        const method = (originalConfig.method ?? "GET").toUpperCase();
        if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
            return await executeRequest<T>(originalConfig, newToken);
        }
        // For mutations, retry with the new token — the caller already
        // intends this action and the alternative is a hard redirect to /login
        return await executeRequest<T>(originalConfig, newToken);
    }
    return null;
};

// ─── Proactive token refresh ────────────────────────────────────────────────
// Keeps the session alive while the user is actively using the app.
// Complements the reactive 401-based refresh above.

const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const silentRefresh = async () => {
    try {
        await axios.post(
            `${BASE_API_URL}/auth/refresh`,
            {},
            { withCredentials: true, validateStatus: () => true, timeout: 10000 },
        );
    } catch {
        // Silently fail — the reactive 401 handler will catch it on the next request
    }
};

export function startProactiveRefresh() {
    if (refreshIntervalId) return;

    // Periodic background refresh
    refreshIntervalId = setInterval(silentRefresh, REFRESH_INTERVAL_MS);

    // Refresh when user returns to the tab after being away
    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibility);
    }
}

export function stopProactiveRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
    }
    if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
    }
}

function handleVisibility() {
    if (document.visibilityState === "visible") {
        silentRefresh();
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
