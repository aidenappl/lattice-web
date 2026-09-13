import type { Instrumentation } from "next";

// Server-side request errors — rendering, route handlers, server actions — go
// to Monitor. Node only: the edge runtime has no use for the SDK's timers.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { reportServerError } = await import("@/lib/monitor-server");
    reportServerError(error, request, context);
};
