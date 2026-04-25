"use client";

import { Provider } from "react-redux";
import { makeStore, AppStore } from "./index";
import { setIsLoading, setIsLogged, setUser } from "./slices/authSlice";
import { useEffect, useState } from "react";
import { reqGetSelf } from "@/services/auth.service";
import { startProactiveRefresh, stopProactiveRefresh } from "@/services/api.service";
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

function AppInitializer({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
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
        if (authRes.success) {
          storeInstance.dispatch(setIsLogged(true));
          storeInstance.dispatch(setUser(authRes.data));
          storeInstance.dispatch(setIsLoading(false));
          startProactiveRefresh();
          if (authRes.data.role === "pending") {
            window.location.href = "/pending";
            return;
          }
        } else if (!authRes.success && authRes.error_code === 4003) {
          // Grant revoked — fetchApi already redirecting to /unauthorized
          return;
        } else {
          storeInstance.dispatch(setIsLoading(false));
          window.location.href = "/login";
          return;
        }
      } catch {
        storeInstance.dispatch(setIsLoading(false));
        window.location.href = "/login";
        return;
      }

      setIsReady(true);
    };

    initialize();

    return () => {
      stopProactiveRefresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
