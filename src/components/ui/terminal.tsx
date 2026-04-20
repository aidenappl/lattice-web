"use client";

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  useAdminSocket,
  sendAdminMessage,
  AdminSocketEvent,
} from "@/hooks/useAdminSocket";

type TerminalProps = {
  containerId: number;
  containerName: string;
  workerId: number;
  onClose: () => void;
};

export function Terminal({
  containerId,
  containerName,
  workerId,
  onClose,
}: TerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const commandIdRef = useRef<string>(`exec-${containerId}-${Date.now()}`);
  const startedRef = useRef(false);

  // Handle incoming exec output from WebSocket
  const handleEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type !== "exec_output") return;
    const p = event.payload ?? {};
    if (p.command_id !== commandIdRef.current) return;

    if (p.error) {
      xtermRef.current?.write(
        `\r\n\x1b[31mError: ${p.error as string}\x1b[0m\r\n`,
      );
      return;
    }

    if (p.closed) {
      xtermRef.current?.write("\r\n\x1b[33m[Session closed]\x1b[0m\r\n");
      return;
    }

    if (p.data) {
      const bytes = Uint8Array.from(atob(p.data as string), (c) =>
        c.charCodeAt(0),
      );
      xtermRef.current?.write(bytes);
    }
  }, []);

  useAdminSocket(handleEvent);

  useEffect(() => {
    if (!termRef.current || startedRef.current) return;
    startedRef.current = true;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#3b82f633",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitRef.current = fitAddon;

    // Send keystrokes to the runner
    term.onData((data: string) => {
      sendAdminMessage({
        type: "exec_input",
        command_id: commandIdRef.current,
        payload: {
          worker_id: workerId,
          data: btoa(data),
        },
      });
    });

    // Start exec session
    sendAdminMessage({
      type: "exec_start",
      command_id: commandIdRef.current,
      payload: {
        worker_id: workerId,
        container_name: containerName,
      },
    });

    // Send initial resize
    sendAdminMessage({
      type: "exec_resize",
      command_id: commandIdRef.current,
      payload: {
        worker_id: workerId,
        height: term.rows,
        width: term.cols,
      },
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
      sendAdminMessage({
        type: "exec_resize",
        command_id: commandIdRef.current,
        payload: {
          worker_id: workerId,
          height: term.rows,
          width: term.cols,
        },
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      sendAdminMessage({
        type: "exec_close",
        command_id: commandIdRef.current,
        payload: { worker_id: workerId },
      });
      term.dispose();
    };
  }, [containerName, workerId, containerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#0a0a0a] rounded-xl border border-border-subtle w-[90vw] max-w-4xl h-[70vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-primary">Terminal</span>
            <span className="text-xs text-muted font-mono">
              {containerName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-muted hover:text-primary transition-colors px-2 py-1 cursor-pointer"
          >
            Close
          </button>
        </div>
        <div ref={termRef} className="flex-1 p-1" />
      </div>
    </div>
  );
}
