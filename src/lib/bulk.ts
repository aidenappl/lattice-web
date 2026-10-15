/**
 * Bulk operations: run one API call per selected item and report the outcome.
 *
 * The API has no batch endpoints, so a bulk action is N ordinary requests. They
 * run with a small concurrency cap rather than all at once: each lifecycle call
 * becomes a command to a worker, and firing fifty at one runner in the same
 * instant buys nothing but a burst of timeouts.
 *
 * A failure never stops the batch. Every item is attempted and the result says
 * exactly which ones failed and why, because "3 of 8 failed" with no names is a
 * puzzle the operator then has to solve by clicking through every row.
 */

export interface BulkFailure<T> {
  item: T;
  error: string;
}

export interface BulkResult<T> {
  succeeded: T[];
  failed: BulkFailure<T>[];
}

/** The shape every `req*` service function resolves to. */
export type BulkOutcome =
  | { success: true }
  | { success: false; error_message?: string; error?: string };

export const DEFAULT_BULK_CONCURRENCY = 4;

export async function runBulk<T>(
  items: T[],
  action: (item: T) => Promise<BulkOutcome>,
  opts: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<BulkResult<T>> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_BULK_CONCURRENCY);
  const succeeded: T[] = [];
  const failed: BulkFailure<T>[] = [];
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        const res = await action(item);
        if (res.success) {
          succeeded.push(item);
        } else {
          failed.push({
            item,
            error: res.error_message || res.error || "Request failed",
          });
        }
      } catch (err) {
        failed.push({
          item,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      done++;
      opts.onProgress?.(done, items.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  // Keep the caller's order: results arrive in completion order, which is
  // meaningless to someone reading the summary.
  const order = new Map(items.map((item, i) => [item, i]));
  succeeded.sort((a, b) => order.get(a)! - order.get(b)!);
  failed.sort((a, b) => order.get(a.item)! - order.get(b.item)!);

  return { succeeded, failed };
}

/** "1 container" / "3 containers". */
export function pluralize(
  count: number,
  noun: string,
  plural?: string,
): string {
  return `${count} ${count === 1 ? noun : (plural ?? `${noun}s`)}`;
}

/**
 * One-line summary for a toast. Names up to three failures so the message is
 * actionable without becoming a wall of text.
 */
export function summarizeBulk<T>(
  result: BulkResult<T>,
  verbPast: string,
  noun: string,
  name: (item: T) => string,
  plural?: string,
): { ok: boolean; message: string } {
  const total = result.succeeded.length + result.failed.length;
  if (result.failed.length === 0) {
    return {
      ok: true,
      message: `${verbPast} ${pluralize(total, noun, plural)}`,
    };
  }
  const shown = result.failed
    .slice(0, 3)
    .map((f) => `${name(f.item)}: ${f.error}`)
    .join("; ");
  const more =
    result.failed.length > 3 ? ` (+${result.failed.length - 3} more)` : "";
  const head =
    result.succeeded.length === 0
      ? `Failed for all ${pluralize(total, noun, plural)}`
      : `${verbPast} ${result.succeeded.length} of ${pluralize(total, noun, plural)}`;
  return { ok: false, message: `${head} — ${shown}${more}` };
}
