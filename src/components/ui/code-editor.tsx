"use client";

import { useRef, useCallback, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const PAIRS: Record<string, string> = {
  "{": "}",
  "[": "]",
  "(": ")",
  '"': '"',
  "'": "'",
  "`": "`",
};

const CLOSE_CHARS = new Set(Object.values(PAIRS));

const TAB = "  ";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  language?: "json" | "yaml" | "text";
}

export function CodeEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
  className,
  language = "json",
}: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = useCallback(
    (ta: HTMLTextAreaElement, before: string, after: string = "") => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;

      if (start !== end && after) {
        // Surround selection
        const selected = val.slice(start, end);
        const next =
          val.slice(0, start) + before + selected + after + val.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = start + before.length;
          ta.selectionEnd = end + before.length;
          ta.focus();
        });
      } else {
        // Insert pair at cursor
        const next = val.slice(0, start) + before + after + val.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = start + before.length;
          ta.selectionEnd = start + before.length;
          ta.focus();
        });
      }
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = ref.current;
      if (!ta) return;

      const { selectionStart: start, selectionEnd: end, value: val } = ta;
      const hasSelection = start !== end;

      // Tab / Shift+Tab
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          // Dedent current line
          const lineStart = val.lastIndexOf("\n", start - 1) + 1;
          const linePrefix = val.slice(lineStart, lineStart + TAB.length);
          if (linePrefix === TAB) {
            const next =
              val.slice(0, lineStart) + val.slice(lineStart + TAB.length);
            onChange(next);
            requestAnimationFrame(() => {
              ta.selectionStart = Math.max(lineStart, start - TAB.length);
              ta.selectionEnd = Math.max(lineStart, end - TAB.length);
              ta.focus();
            });
          }
        } else {
          // Indent
          const next = val.slice(0, start) + TAB + val.slice(end);
          onChange(next);
          requestAnimationFrame(() => {
            ta.selectionStart = start + TAB.length;
            ta.selectionEnd = start + TAB.length;
            ta.focus();
          });
        }
        return;
      }

      // Enter — auto-indent
      if (e.key === "Enter") {
        e.preventDefault();
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const line = val.slice(lineStart, start);
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        const charBefore = val[start - 1];
        const charAfter = val[start];

        let insertion: string;
        if (
          charBefore &&
          charBefore in PAIRS &&
          charAfter === PAIRS[charBefore]
        ) {
          // Cursor between pair e.g. {|} → expand to 3 lines
          const deeper = indent + TAB;
          insertion = "\n" + deeper + "\n" + indent;
          const next = val.slice(0, start) + insertion + val.slice(end);
          onChange(next);
          requestAnimationFrame(() => {
            ta.selectionStart = start + 1 + deeper.length;
            ta.selectionEnd = start + 1 + deeper.length;
            ta.focus();
          });
        } else {
          // Auto-indent: match current line indent, add extra after { [ :
          const extra =
            charBefore === "{" ||
            charBefore === "[" ||
            (language === "yaml" && charBefore === ":")
              ? TAB
              : "";
          insertion = "\n" + indent + extra;
          const next = val.slice(0, start) + insertion + val.slice(end);
          onChange(next);
          requestAnimationFrame(() => {
            ta.selectionStart = start + insertion.length;
            ta.selectionEnd = start + insertion.length;
            ta.focus();
          });
        }
        return;
      }

      // Backspace — remove matching pair if empty
      if (e.key === "Backspace" && !hasSelection) {
        const charBefore = val[start - 1];
        const charAfter = val[start];
        if (
          charBefore &&
          charBefore in PAIRS &&
          charAfter === PAIRS[charBefore]
        ) {
          e.preventDefault();
          const next = val.slice(0, start - 1) + val.slice(start + 1);
          onChange(next);
          requestAnimationFrame(() => {
            ta.selectionStart = start - 1;
            ta.selectionEnd = start - 1;
            ta.focus();
          });
          return;
        }
      }

      // Auto-close pairs / surround selection
      if (e.key in PAIRS) {
        const close = PAIRS[e.key];
        const isQuote = e.key === '"' || e.key === "'" || e.key === "`";

        // Skip over closing char if already there
        if (isQuote && !hasSelection && val[start] === e.key) {
          e.preventDefault();
          requestAnimationFrame(() => {
            ta.selectionStart = start + 1;
            ta.selectionEnd = start + 1;
            ta.focus();
          });
          return;
        }

        if (hasSelection || !isQuote || !/\w/.test(val[start - 1] ?? "")) {
          e.preventDefault();
          insert(ta, e.key, close);
          return;
        }
      }

      // Skip over closing bracket/paren if typed
      if (CLOSE_CHARS.has(e.key) && val[start] === e.key && !hasSelection) {
        e.preventDefault();
        requestAnimationFrame(() => {
          ta.selectionStart = start + 1;
          ta.selectionEnd = start + 1;
          ta.focus();
        });
        return;
      }
    },
    [onChange, insert, language],
  );

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        "w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none font-mono resize-none",
        className,
      )}
    />
  );
}
