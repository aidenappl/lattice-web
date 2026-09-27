/**
 * Per-request bookkeeping carried on the axios config. `fetchApi` sets the
 * attempt and retry flags; the request interceptor in api.service.ts adds the
 * request id and start time; the Monitor reporter in monitor.service.ts reads
 * all of it. Axios deep-merges unknown config keys, so `meta` survives from
 * the caller's config to `response.config` / `error.config`.
 */
export type RequestMeta = {
    /** The X-Request-ID sent with this request. */
    requestId?: string;
    /** Date.now() when the request left the request interceptor. */
    startTime?: number;
    /** 1-based attempt number within fetchApi's retry loop. */
    attempt?: number;
    /** fetchApi will retry this request if it fails without a response. */
    retryOnNetworkError?: boolean;
    /** fetchApi will retry this request if it gets a 5xx response. */
    retryOnServerError?: boolean;
};

declare module "axios" {
    interface AxiosRequestConfig {
        meta?: RequestMeta;
    }
}
