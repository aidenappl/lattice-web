"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faGauge,
  faServer,
  faLayerGroup,
  faCubes,
  faRocket,
  faNetworkWired,
  faBoxArchive,
  faClipboardList,
  faGear,
  faPlus,
  faArrowRight,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { SearchResults } from "@/types";
import { reqSearch } from "@/services/admin.service";

interface Command {
  group: string;
  label: string;
  hint: string;
  icon: IconDefinition;
  path: string;
}

/** Highlight matching substring in text. Returns JSX fragments. */
function Highlight({ text, query: q }: { text: string; query: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-info font-semibold">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

const NAV_COMMANDS: Command[] = [
  { group: "Navigation", label: "Dashboard", hint: "overview", icon: faGauge, path: "/" },
  { group: "Navigation", label: "Workers", hint: "infrastructure", icon: faServer, path: "/workers" },
  { group: "Navigation", label: "Stacks", hint: "infrastructure", icon: faLayerGroup, path: "/stacks" },
  { group: "Navigation", label: "Containers", hint: "infrastructure", icon: faCubes, path: "/containers" },
  { group: "Navigation", label: "Deployments", hint: "overview", icon: faRocket, path: "/deployments" },
  { group: "Navigation", label: "Networks", hint: "infrastructure", icon: faNetworkWired, path: "/networks" },
  { group: "Navigation", label: "Registries", hint: "infrastructure", icon: faBoxArchive, path: "/registries" },
  { group: "Navigation", label: "Audit Log", hint: "overview", icon: faClipboardList, path: "/audit-log" },
  { group: "Navigation", label: "Settings", hint: "workspace", icon: faGear, path: "/settings" },
];

const ACTION_COMMANDS: Command[] = [
  { group: "Actions", label: "Create new stack", hint: "action", icon: faPlus, path: "/stacks/new" },
  { group: "Actions", label: "View workers", hint: "action", icon: faArrowRight, path: "/workers" },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface ResultItem {
  group: string;
  label: string;
  hint: string;
  icon: IconDefinition;
  path: string;
}

function buildSearchItems(data: SearchResults): ResultItem[] {
  const items: ResultItem[] = [];

  for (const w of data.workers) {
    items.push({
      group: "Workers",
      label: w.name,
      hint: w.hostname,
      icon: faServer,
      path: `/workers/${w.id}`,
    });
  }

  for (const s of data.stacks) {
    items.push({
      group: "Stacks",
      label: s.name,
      hint: s.status,
      icon: faLayerGroup,
      path: `/stacks/${s.id}`,
    });
  }

  for (const c of data.containers) {
    items.push({
      group: "Containers",
      label: c.name,
      hint: `${c.image}:${c.tag}`,
      icon: faCubes,
      path: `/containers/${c.id}`,
    });
  }

  return items;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [searchResults, setSearchResults] = useState<ResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const allCommands = useMemo(() => [...NAV_COMMANDS, ...ACTION_COMMANDS], []);

  // Filter static commands by query
  const filteredCommands = useMemo(() => {
    if (!query) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint.toLowerCase().includes(q),
    );
  }, [query, allCommands]);

  // Combined list: search results first, then matching commands
  const items: ResultItem[] = useMemo(() => {
    if (!query) return allCommands;
    return [...searchResults, ...filteredCommands];
  }, [query, searchResults, filteredCommands, allCommands]);

  // Debounced API search
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await reqSearch(trimmed);
      if (controller.signal.aborted) return;

      if (res.success) {
        setSearchResults(buildSearchItems(res.data));
      } else {
        setSearchResults([]);
      }
      setSearching(false);
    }, 80);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const execute = useCallback(
    (item: ResultItem) => {
      router.push(item.path);
      onClose();
    },
    [router, onClose],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setSearchResults([]);
      setSearching(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Cleanup on close
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[selected]) execute(items[selected]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, items, selected, execute, onClose]);

  if (!open) return null;

  // Group items for rendering with section headers
  const grouped: { group: string; items: (ResultItem & { index: number })[] }[] = [];
  let currentGroup = "";
  items.forEach((item, i) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      grouped.push({ group: currentGroup, items: [] });
    }
    grouped[grouped.length - 1].items.push({ ...item, index: i });
  });

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <FontAwesomeIcon
            icon={searching ? faSpinner : faMagnifyingGlass}
            className={`h-3.5 w-3.5 text-muted shrink-0 ${searching ? "animate-spin" : ""}`}
          />
          <input
            ref={inputRef}
            autoFocus
            placeholder="Search containers, stacks, workers..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            className="flex-1 bg-transparent border-none outline-none text-primary text-[15px]"
          />
          <span className="kbd">esc</span>
        </div>

        <div className="cmdk-results">
          {items.length === 0 && !searching && (
            <div className="px-4 py-5 text-center text-[13px] text-muted">
              No matches for &ldquo;{query}&rdquo;
            </div>
          )}
          {grouped.map((section) => (
            <div key={section.group}>
              <div className="cmdk-group-label">{section.group}</div>
              {section.items.map((item) => (
                <div
                  key={item.path + item.index}
                  className={`cmdk-item ${item.index === selected ? "selected" : ""}`}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setSelected(item.index)}
                >
                  <FontAwesomeIcon
                    icon={item.icon}
                    className="h-3.5 w-3.5 text-muted shrink-0"
                  />
                  <span className="flex-1 text-[13px]">
                    <Highlight text={item.label} query={query} />
                  </span>
                  <span className="mono text-[10px] text-dimmed uppercase tracking-wider">
                    <Highlight text={item.hint} query={query} />
                  </span>
                  {item.index === selected && <span className="kbd text-[10px]">&crarr;</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="cmdk-footer">
          <span className="flex items-center gap-1">
            <span className="kbd">&uarr;</span>
            <span className="kbd">&darr;</span> navigate
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">&crarr;</span> select
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">esc</span> close
          </span>
          <span className="ml-auto">{items.length} results</span>
        </div>
      </div>
    </div>
  );
}
