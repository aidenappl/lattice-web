import { useEffect } from "react";
import { reqLogout } from "@/services/auth.service";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Logs the user out after a period of inactivity.
 * Listens for mouse, keyboard, scroll, and touch events to reset the timer.
 */
export function useIdleTimeout(timeoutMs = IDLE_TIMEOUT_MS) {
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                // Use POST to properly invalidate the server-side session,
                // then redirect to login page.
                await reqLogout().catch(() => {});
                window.location.replace("/login");
            }, timeoutMs);
        };

        const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;
        events.forEach((e) => window.addEventListener(e, reset));
        reset();

        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
        };
    }, [timeoutMs]);
}
