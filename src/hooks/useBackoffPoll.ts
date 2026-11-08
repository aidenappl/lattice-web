import { useEffect, useRef } from "react";

/**
 * Polls an async callback that reports success. Unlike usePoll, the next run
 * is scheduled only after the previous one settles (requests never overlap),
 * the delay doubles after each failure up to `maxMs` and resets to
 * `intervalMs` on success, and polling pauses while the tab is hidden —
 * resuming with an immediate run when it becomes visible again.
 */
export function useBackoffPoll(
    callback: () => Promise<boolean>,
    intervalMs: number,
    enabled: boolean = true,
    maxMs: number = 5 * 60_000,
) {
    const savedCallback = useRef(callback);

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let running = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let delay = intervalMs;

        const clear = () => {
            if (timer) clearTimeout(timer);
            timer = null;
        };

        const schedule = (ms: number) => {
            clear();
            if (cancelled || document.hidden) return;
            timer = setTimeout(run, ms);
        };

        const run = async () => {
            timer = null;
            if (cancelled || running || document.hidden) return;
            running = true;
            let ok = false;
            try {
                ok = await savedCallback.current();
            } catch {
                ok = false;
            }
            running = false;
            if (cancelled) return;
            delay = ok ? intervalMs : Math.min(delay * 2, maxMs);
            schedule(delay);
        };

        const onVisibility = () => {
            if (document.hidden) clear();
            else if (!running) schedule(0);
        };

        schedule(delay);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            cancelled = true;
            clear();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [intervalMs, maxMs, enabled]);
}
