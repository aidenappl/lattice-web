import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useConfirm, type ConfirmVariant } from "@/components/ui/confirm-modal";
import {
  runBulk,
  summarizeBulk,
  pluralize,
  type BulkOutcome,
} from "@/lib/bulk";

export interface BulkActionSpec<T> {
  items: T[];
  /** Present-tense verb for the confirm button and progress toast: "Stop". */
  verb: string;
  /** Past tense for the summary: "Stopped". */
  verbPast: string;
  noun: string;
  nounPlural?: string;
  name: (item: T) => string;
  action: (item: T) => Promise<BulkOutcome>;
  /** Omit to run without asking — only for harmless actions like "Test". */
  confirm?: {
    title?: string;
    message?: string;
    variant?: ConfirmVariant;
  };
  concurrency?: number;
}

/**
 * Confirm → run → summarise, for every bulk action on every list page.
 *
 * The confirm lists the affected items by name. "Delete 4 stacks?" invites a
 * reflexive yes; "Delete Forta, Keyring, Monitor and Ledger API?" gets read.
 */
export function useBulkAction() {
  const showConfirm = useConfirm();
  const [running, setRunning] = useState<string | null>(null);

  const run = useCallback(
    async <T>(spec: BulkActionSpec<T>) => {
      const { items, verb, verbPast, noun, nounPlural, name } = spec;
      if (items.length === 0) return null;

      if (spec.confirm) {
        const names = items.map(name);
        const listed =
          names.length <= 6
            ? names.join(", ")
            : `${names.slice(0, 6).join(", ")} and ${names.length - 6} more`;
        const ok = await showConfirm({
          title:
            spec.confirm.title ??
            `${verb} ${pluralize(items.length, noun, nounPlural)}?`,
          message: spec.confirm.message
            ? `${spec.confirm.message}\n\n${listed}`
            : listed,
          confirmLabel: `${verb} ${pluralize(items.length, noun, nounPlural)}`,
          variant: spec.confirm.variant ?? "warning",
        });
        if (!ok) return null;
      }

      setRunning(verb);
      const label = pluralize(items.length, noun, nounPlural);
      const toastId = toast.loading(`${verb}: 0 / ${label}…`);
      const result = await runBulk(items, spec.action, {
        concurrency: spec.concurrency,
        onProgress: (done, total) =>
          toast.loading(`${verb}: ${done} / ${total}…`, { id: toastId }),
      });
      const summary = summarizeBulk(result, verbPast, noun, name, nounPlural);
      if (summary.ok) toast.success(summary.message, { id: toastId });
      else toast.error(summary.message, { id: toastId, duration: 8000 });
      setRunning(null);
      return result;
    },
    [showConfirm],
  );

  return { run, running };
}
