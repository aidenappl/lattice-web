import { useEffect, useRef } from "react";

/**
 * Runs a callback on a fixed interval. Automatically cleans up on unmount
 * or when `enabled` flips to false.
 */
export function usePoll(
    callback: () => void,
    intervalMs: number,
    enabled: boolean = true,
) {
    const savedCallback = useRef(callback);

    // Keep the latest callback in a ref so the interval doesn't go stale
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!enabled) return;
        const id = setInterval(() => savedCallback.current(), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, enabled]);
}
