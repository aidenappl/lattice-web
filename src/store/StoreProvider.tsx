"use client";

import { Provider } from "react-redux";
import { makeStore, AppStore } from "./index";
import { setIsLoading, setIsLogged, setUser } from "./slices/authSlice";
import { useEffect, useState } from "react";
import { reqGetSelf } from "@/services/auth.service";
import { LoadingSpinner } from "@/components/ui/loading";

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
        if (path === "/unauthorized" || path === "/login") {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isReady) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a] gap-8">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3b82f6]">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-semibold text-white tracking-tight">
              Lattice
            </span>
            <span className="text-xs text-[#555555] font-medium">Admin</span>
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
