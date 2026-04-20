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
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface Command {
  group: string;
  label: string;
  hint: string;
  icon: IconDefinition;
  path: string;
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

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands = useMemo(() => [...NAV_COMMANDS, ...ACTION_COMMANDS], []);

  const filtered = useMemo(() => {
    if (!query) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint.toLowerCase().includes(q),
    );
  }, [query, allCommands]);

  const execute = useCallback(
    (cmd: Command) => {
      router.push(cmd.path);
      onClose();
    },
    [router, onClose],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selected]) execute(filtered[selected]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, execute, onClose]);

  // Global ⌘K listener is handled by the parent

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="h-3.5 w-3.5 text-muted shrink-0"
          />
          <input
            ref={inputRef}
            autoFocus
            placeholder="Type to search, or a command..."
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
          {filtered.length === 0 && (
            <div className="px-4 py-5 text-center text-[13px] text-muted">
              No matches for &ldquo;{query}&rdquo;
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.label + i}
              className={`cmdk-item ${i === selected ? "selected" : ""}`}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setSelected(i)}
            >
              <FontAwesomeIcon
                icon={cmd.icon}
                className="h-3.5 w-3.5 text-muted shrink-0"
              />
              <span className="flex-1 text-[13px]">{cmd.label}</span>
              <span className="mono text-[10px] text-dimmed uppercase tracking-wider">
                {cmd.hint}
              </span>
              {i === selected && <span className="kbd text-[10px]">&crarr;</span>}
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
          <span className="ml-auto">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}
