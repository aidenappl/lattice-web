"use client";

import { Provider } from "react-redux";
import { makeStore, AppStore } from "./index";
import { setIsLoading, setIsLogged, setUser } from "./slices/authSlice";
import { useEffect, useState } from "react";
import { reqGetSelf } from "@/services/auth.service";
import { startProactiveRefresh, stopProactiveRefresh } from "@/services/api.service";
import { hasLoggedInCookie, monitor, reportError, sessionFailureLevel } from "@/services/monitor.service";
import { LoadingSpinner } from "@/components/ui/loading";
import { Logo } from "@/components/ui/logo";

interface StoreProviderProps {
  children: React.ReactNode;
}

let store: AppStore | null = null;

export const getStore = () => {
  if (!store) {
    store = makeStore();
  }
  return store;
};

type BootError = { status: number; message: string; requestId?: string };

function AppInitializer({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [bootError, setBootError] = useState<BootError | null>(null);
  // Bumped by Retry to re-run the bootstrap.
  const [attempt, setAttempt] = useState(0);
  const storeInstance = getStore();

  useEffect(() => {
    const initialize = async () => {
      // Skip auth check on public pages to prevent redirect loops
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path === "/unauthorized" || path === "/login" || path === "/pending") {
          setIsReady(true);
          return;
        }
      }

      try {
        const authRes = await reqGetSelf();
        if (authRes.success && !authRes.data) {
          // A 2xx with no user (empty or non-JSON body, e.g. a proxy page).
          monitor?.emit("session.bootstrap.failed", "error", {
            data: { status_code: authRes.status, error: "empty_self_response" },
          });
          setBootError({
            status: authRes.status,
            message: "The API returned an unexpected response.",
          });
          return;
        }
        if (authRes.success) {
          storeInstance.dispatch(setIsLogged(true));
          storeInstance.dispatch(setUser(authRes.data));
          monitor?.setUser(String(authRes.data.id));
          storeInstance.dispatch(setIsLoading(false));
          // Only local-password sessions carry a Lattice JWT to refresh. An
          // SSO session is refreshed server-side against the identity
          // provider on each request, so there is nothing to schedule.
          if (authRes.data.auth_type !== "sso") startProactiveRefresh();
          if (authRes.data.role === "pending") {
            window.location.href = "/pending";
            return;
          }
        } else if (!authRes.success && authRes.error_code === 4003) {
          // Grant revoked — fetchApi already redirecting to /unauthorized
          return;
        } else if (authRes.status !== 401 && authRes.status !== 403) {
          // Not a sign-out: the API is down, timed out, or answered with
          // something unexpected. Sending the user to /login here showed a
          // sign-in form that couldn't work; say what happened and offer a
          // retry instead.
          monitor?.emit("session.bootstrap.failed", sessionFailureLevel(authRes.status), {
            requestId: authRes.request_id,
            data: {
              status_code: authRes.status,
              error: authRes.error,
              error_code: authRes.error_code,
              error_message: authRes.error_message,
            },
          });
          setBootError({
            // fetchApi reports a request that never got a response (network
            // error, timeout, CORS) as status 500 with error_code -1.
            status: authRes.error_code === -1 ? 0 : authRes.status,
            message: authRes.error_message || "The API returned an unexpected response.",
            requestId: authRes.request_id,
          });
          return;
        } else {
          // 401/403 is a signed-out visitor or an ended session — expected,
          // so info, and not reported at all when the browser never held the
          // logged-in marker (a first visit). Other 4xx warn; 5xx errors.
          const signedOut = authRes.status === 401 && !hasLoggedInCookie();
          if (!signedOut) {
            monitor?.emit("session.bootstrap.failed", sessionFailureLevel(authRes.status), {
              requestId: authRes.request_id,
              data: {
                status_code: authRes.status,
                error: authRes.error,
                error_code: authRes.error_code,
                error_message: authRes.error_message,
              },
            });
          }
          storeInstance.dispatch(setIsLoading(false));
          window.location.href = "/login";
          return;
        }
      } catch (err) {
        reportError("session.bootstrap.failed", err);
        setBootError({
          status: 0,
          message: err instanceof Error ? err.message : "Request failed unexpectedly",
        });
        return;
      }

      setIsReady(true);
    };

    initialize();

    return () => {
      stopProactiveRefresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => {
    setBootError(null);
    setAttempt((n) => n + 1);
  };

  if (bootError) {
    return (
      <div
        role="alert"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-6 px-6 text-center"
      >
        <div className="flex items-center gap-3.5">
          <Logo size="md" />
          <div className="flex flex-col leading-none text-left">
            <span className="text-xl font-semibold text-primary tracking-tight">
              Lattice
            </span>
            <span className="text-xs text-muted font-medium">Admin</span>
          </div>
        </div>
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium text-primary">
            Can&apos;t reach the Lattice API
          </p>
          <p className="text-sm text-secondary">{bootError.message}</p>
          <p className="mono text-xs text-muted">
            {bootError.status > 0 ? `HTTP ${bootError.status}` : "No response"}
            {bootError.requestId ? ` · request ${bootError.requestId}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={retry} className="btn btn-primary">
            Retry
          </button>
          <a href="/login" className="btn btn-secondary">
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-8">
        <div className="flex items-center gap-3.5">
          <Logo size="md" />
          <div className="flex flex-col leading-none">
            <span className="text-xl font-semibold text-primary tracking-tight">
              Lattice
            </span>
            <span className="text-xs text-muted font-medium">Admin</span>
          </div>
        </div>
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return <>{children}</>;
}

const StoreProvider = ({ children }: StoreProviderProps) => {
  const storeInstance = getStore();

  return (
    <Provider store={storeInstance}>
      <AppInitializer>{children}</AppInitializer>
    </Provider>
  );
};

export default StoreProvider;
