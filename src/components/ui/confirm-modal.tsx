"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Button } from "./button";

export type ConfirmVariant = "default" | "danger" | "warning";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<
  (opts: ConfirmOptions) => Promise<boolean>
>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const showConfirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const handle = (confirmed: boolean) => {
    state?.resolve(confirmed);
    setState(null);
  };

  const buttonVariant =
    state?.variant === "danger"
      ? "destructive"
      : state?.variant === "warning"
        ? "warning"
        : "primary";

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => handle(false)}
        >
          <div
            className="bg-surface border border-border-strong rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-primary">{state.title}</h3>
            {state.message && (
              <p className="text-xs text-secondary mt-2 mb-5 leading-relaxed">
                {state.message}
              </p>
            )}
            <div
              className={`flex gap-2 justify-end ${state.message ? "" : "mt-4"}`}
            >
              <Button variant="ghost" size="sm" onClick={() => handle(false)}>
                {state.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={buttonVariant}
                size="sm"
                onClick={() => handle(true)}
              >
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
