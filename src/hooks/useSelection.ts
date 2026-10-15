import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Row selection for a list with bulk actions.
 *
 * `visibleIds` is the list as currently rendered — after search and filters.
 * The selection is always reported as the intersection of what was ticked and
 * what is visible, so a bulk action can never touch a row the user cannot see:
 * tick five containers, narrow the filter to two, press Stop, and two stop.
 * The hidden ticks are kept rather than dropped, so clearing the filter brings
 * them back exactly as they were.
 *
 * Shift-click selects the range between the last clicked row and this one,
 * the way every file manager does.
 */
export function useSelection<K extends string | number>(visibleIds: K[]) {
  const [ticked, setTicked] = useState<Set<K>>(() => new Set());
  const anchor = useRef<K | null>(null);

  const selectedIds = useMemo(
    () => visibleIds.filter((id) => ticked.has(id)),
    [visibleIds, ticked],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const isSelected = useCallback((id: K) => selectedSet.has(id), [selectedSet]);

  const toggle = useCallback(
    (id: K, opts?: { shiftKey?: boolean }) => {
      setTicked((prev) => {
        const next = new Set(prev);
        const turnOn = !prev.has(id);
        const from = anchor.current;
        if (opts?.shiftKey && from !== null && from !== id) {
          const a = visibleIds.indexOf(from);
          const b = visibleIds.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) {
              if (turnOn) next.add(visibleIds[i]);
              else next.delete(visibleIds[i]);
            }
            return next;
          }
        }
        if (turnOn) next.add(id);
        else next.delete(id);
        return next;
      });
      anchor.current = id;
    },
    [visibleIds],
  );

  const allSelected =
    visibleIds.length > 0 && selectedIds.length === visibleIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setTicked((prev) => {
      const next = new Set(prev);
      const everyVisible = visibleIds.every((id) => prev.has(id));
      for (const id of visibleIds) {
        if (everyVisible) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  const clear = useCallback(() => {
    setTicked(new Set());
    anchor.current = null;
  }, []);

  return {
    selectedIds,
    count: selectedIds.length,
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected,
    /** Nothing visible to select — disable the select-all checkbox. */
    empty: visibleIds.length === 0,
  };
}

export type Selection<K extends string | number> = ReturnType<
  typeof useSelection<K>
>;
