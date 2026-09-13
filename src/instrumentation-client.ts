import { monitor } from "@/services/monitor.service";

// Importing the service creates the browser Monitor before the app hydrates, so
// an error thrown during hydration is captured too.
monitor?.info("client.page.load", { data: { path: window.location.pathname } });

const pathOf = (url: string): string => {
    try {
        return new URL(url, window.location.href).pathname;
    } catch {
        return url.split(/[?#]/)[0];
    }
};

export function onRouterTransitionStart(
    url: string,
    navigationType: "push" | "replace" | "traverse",
): void {
    monitor?.info("client.navigation", {
        data: { path: pathOf(url), from: window.location.pathname, navigation_type: navigationType },
    });
}
