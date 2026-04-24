import { useEffect } from "react";

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
            timer = setTimeout(() => {
                window.location.href = `${process.env.NEXT_PUBLIC_LATTICE_API}/auth/logout`;
            }, timeoutMs);
        };

        const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
        events.forEach((e) => window.addEventListener(e, reset));
        reset();

        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
        };
    }, [timeoutMs]);
}
