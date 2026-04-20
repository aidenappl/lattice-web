"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  ReactElement,
} from "react";
import { VersionInfo } from "@/types";
import { reqGetVersions } from "@/services/admin.service";
import { APP_VERSION } from "@/lib/version";

type VersionState = {
  info: VersionInfo | null;
  apiUpdateAvailable: boolean;
  webUpdateAvailable: boolean;
  runnerUpdatesAvailable: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

const VersionCheckContext = createContext<VersionState | null>(null);

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function VersionCheckProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [state, setState] = useState({
    info: null as VersionInfo | null,
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

    const webUpdateAvailable =
      APP_VERSION !== "dev" &&
      info.web.latest !== "" &&
      APP_VERSION !== info.web.latest;

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

  return (
    <VersionCheckContext.Provider value={{ ...state, refresh: check }}>
      {children}
    </VersionCheckContext.Provider>
  );
}

export function useVersionCheck() {
  const ctx = useContext(VersionCheckContext);
  if (!ctx)
    throw new Error("useVersionCheck must be used inside VersionCheckProvider");
  return ctx;
}
