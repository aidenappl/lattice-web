"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const showConfirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const handle = useCallback((confirmed: boolean) => {
    setState((prev) => {
      prev?.resolve(confirmed);
      return null;
    });
  }, []);

  // On open: remember focus, move focus to the confirm button.
  // On close: restore focus to the previously focused element.
  useEffect(() => {
    if (state) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      // Focus after paint so the button exists in the DOM.
      const id = window.requestAnimationFrame(() =>
        confirmButtonRef.current?.focus(),
      );
      return () => window.cancelAnimationFrame(id);
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus?.();
      previouslyFocused.current = null;
    }
  }, [state]);

  // Close on Escape + trap focus within the dialog
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handle(false);
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, handle]);

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={state.message ? "confirm-message" : undefined}
            className="bg-surface border border-border-strong rounded-xl p-5 sm:p-6 w-full max-w-sm mx-3 sm:mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-sm font-semibold text-primary">
              {state.title}
            </h3>
            {state.message && (
              <p
                id="confirm-message"
                className="text-xs text-secondary mt-2 mb-5 leading-relaxed"
              >
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
                ref={confirmButtonRef}
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
