"use client";

import { useRef, useCallback, KeyboardEvent, useMemo, UIEvent } from "react";
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

// ─── JSON syntax highlighting ────────────────────────────────────────────────

function highlightJSON(text: string): string {
  if (!text) return "";
  // Escape HTML first
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return (
    escaped
      // Strings (keys and values) — must come first
      .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="json-key">$1</span>:')
      .replace(
        /:\s*("(?:[^"\\]|\\.)*")/g,
        ': <span class="json-string">$1</span>',
      )
      // Standalone strings (in arrays, etc.)
      .replace(
        /(?<=[\[,\s])("(?:[^"\\]|\\.)*")(?=[,\]\s])/g,
        '<span class="json-string">$1</span>',
      )
      // Numbers
      .replace(
        /(?<=:\s*|[\[,\s])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=[,\}\]\s])/g,
        '<span class="json-number">$1</span>',
      )
      // Booleans & null
      .replace(/\b(true|false|null)\b/g, '<span class="json-bool">$1</span>')
  );
}

function highlightYAML(text: string): string {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split("\n")
    .map((line) => {
      // Comments
      if (/^\s*#/.test(line)) {
        return `<span class="yaml-comment">${line}</span>`;
      }
      // Key: value
      return line.replace(
        /^(\s*)([\w.-]+)(:)/,
        '$1<span class="yaml-key">$2</span><span class="yaml-colon">$3</span>',
      );
    })
    .join("\n");
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  language?: "json" | "yaml" | "text";
  envVars?: Record<string, string>;
}

export function CodeEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
  className,
  language = "json",
  envVars,
}: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleScroll = useCallback((e: UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const highlighted = useMemo(() => {
    let html: string;
    if (language === "json") html = highlightJSON(value);
    else if (language === "yaml") html = highlightYAML(value);
    else
      html = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    if (envVars !== undefined) {
      html = html.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => {
        const defined = key in envVars && envVars[key].trim() !== "";
        const cls = defined ? "env-var-defined" : "env-var-missing";
        return `<span class="${cls}">${match}</span>`;
      });
    }

    return html;
  }, [value, language, envVars]);

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
    <div
      className={cn(
        "relative rounded-lg border border-border-strong bg-background-alt overflow-hidden focus-within:border-border-emphasis",
        className,
      )}
    >
      {/* Highlighted underlay */}
      <pre
        ref={preRef}
        aria-hidden
        className="absolute inset-0 px-3 py-2 text-sm font-mono whitespace-pre-wrap break-words overflow-hidden pointer-events-none m-0 [&_.json-key]:text-[#7aa2f7] [&_.json-string]:text-[#9ece6a] [&_.json-number]:text-[#ff9e64] [&_.json-bool]:text-[#ff9e64] [&_.yaml-key]:text-[#7aa2f7] [&_.yaml-colon]:text-muted [&_.yaml-comment]:text-muted [&_.env-var-defined]:text-healthy [&_.env-var-defined]:font-semibold [&_.env-var-missing]:text-failed [&_.env-var-missing]:font-semibold"
        dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
      />
      {/* Transparent textarea on top for editing */}
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className="relative w-full bg-transparent px-3 py-2 text-sm text-transparent caret-white placeholder:text-muted focus:outline-none font-mono resize-none selection:bg-[#264f78] selection:text-transparent"
      />
    </div>
  );
}
