"use client";

import { useState, useEffect, useCallback } from "react";
import { VersionInfo } from "@/types";
import { reqGetVersions } from "@/services/admin.service";
import { APP_VERSION } from "@/lib/version";

type VersionState = {
    info: VersionInfo | null;
    apiUpdateAvailable: boolean;
    webUpdateAvailable: boolean;
    runnerUpdatesAvailable: number;
    loading: boolean;
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useVersionCheck() {
    const [state, setState] = useState<VersionState>({
        info: null,
        apiUpdateAvailable: false,
        webUpdateAvailable: false,
        runnerUpdatesAvailable: 0,
        loading: true,
    });

    const check = useCallback(async () => {
        const res = await reqGetVersions();
        if (!res.success) {
            setState((prev) => ({ ...prev, loading: false }));
            return;
        }

        const info = res.data;

        // Web is outdated if its version differs from what GitHub says is latest
        const webUpdateAvailable =
            APP_VERSION !== "dev" &&
            info.web.latest !== "" &&
            APP_VERSION !== info.web.latest;

        // API is outdated if its running version differs from the latest GitHub release
        const apiUpdateAvailable =
            info.api.current !== "" &&
            info.api.latest !== "" &&
            info.api.current !== info.api.latest;

        setState({
            info,
            apiUpdateAvailable,
            webUpdateAvailable,
            runnerUpdatesAvailable: info.runner.outdated_count,
            loading: false,
        });
    }, []);

    useEffect(() => {
        check();
        const id = setInterval(check, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [check]);

    return { ...state, refresh: check };
}
