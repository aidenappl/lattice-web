"use client";

import { useEffect } from "react";
import { reportError } from "@/services/monitor.service";

// Replaces the root layout when the layout itself fails, so it renders its own
// document and cannot rely on the app's stylesheet.
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        reportError("client.error.global", error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0a0a0a",
                    color: "#ededed",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                }}
            >
                <main style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
                        This page couldn&apos;t load
                    </h1>
                    <p style={{ fontSize: 14, lineHeight: 1.5, color: "#8a8a8a", margin: "0 0 24px" }}>
                        The error has been reported. Try again, or reload the page if it keeps happening.
                    </p>
                    {error.digest && (
                        <p style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#5c5c5c", margin: "0 0 24px" }}>
                            Reference: {error.digest}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={reset}
                        style={{
                            height: 40,
                            padding: "0 20px",
                            borderRadius: 8,
                            border: "1px solid #2a2a2a",
                            background: "#161616",
                            color: "#ffffff",
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>
                </main>
            </body>
        </html>
    );
}
