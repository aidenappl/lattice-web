"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Button } from "./button";
import { Modal } from "./modal";

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

/**
 * ConfirmProvider supplies the promise-based `useConfirm()` dialog.
 *
 * The overlay, focus trap, Escape handling and focus restoration all moved into
 * `Modal` so other dialogs get them too — this component is now only the
 * promise plumbing and the confirm/cancel buttons.
 *
 * ⚠️ Escape, the backdrop and Cancel all resolve FALSE. A dismissal is never
 * agreement: a dialog that reads a stray backdrop click as a confirm is a dialog
 * that deletes things by accident.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

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

  const buttonVariant =
    state?.variant === "danger"
      ? "destructive"
      : state?.variant === "warning"
        ? "warning"
        : "primary";

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      <Modal
        open={state !== null}
        onClose={() => handle(false)}
        title={state?.title ?? ""}
        description={state?.message}
        // Focus lands on Confirm rather than Cancel: it is the action the user
        // came here to take, and Escape is always available to back out.
        initialFocusRef={confirmButtonRef}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => handle(false)}>
              {state?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              ref={confirmButtonRef}
              variant={buttonVariant}
              size="sm"
              onClick={() => handle(true)}
            >
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
