"use client";

import { useRef, useCallback, KeyboardEvent, useMemo, useEffect } from "react";
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

// ─── Shared typography for pixel-perfect overlay alignment ───────────────────

const SHARED_STYLES_BASE =
  "px-3 py-2 text-sm font-mono leading-5";

// ─── Syntax highlighting ─────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJSON(text: string): string {
  if (!text) return "";
  const escaped = escapeHtml(text);

  return (
    escaped
      // Keys
      .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="json-key">$1</span>:')
      // String values after colon
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
  const escaped = escapeHtml(text);

  return escaped
    .split("\n")
    .map((line) => {
      // Comments
      if (/^\s*#/.test(line)) {
        return `<span class="yaml-comment">${line}</span>`;
      }

      // Split line into key portion and value portion at the first colon
      const keyMatch = line.match(/^(\s*)([\w.-]+)(:)(.*)/);
      if (!keyMatch) {
        // No key — could be a list item or plain value
        return highlightYAMLValue(line);
      }

      const [, indent, key, colon, rest] = keyMatch;
      const keyHtml = `${indent}<span class="yaml-key">${key}</span><span class="yaml-colon">${colon}</span>`;
      // Highlight the value portion (after the colon) — safe since no HTML tags in it yet
      return keyHtml + highlightYAMLValue(rest);
    })
    .join("\n");
}

function highlightYAMLValue(text: string): string {
  // Double-quoted strings (on escaped HTML, quotes become &quot;)
  let result = text.replace(
    /&quot;((?:[^&]|&(?!quot;))*)&quot;/g,
    '<span class="yaml-string">&quot;$1&quot;</span>',
  );
  // Regular double-quoted strings (in case escapeHtml didn't convert them)
  result = result.replace(
    /"([^"\\]|\\.)*"/g,
    '<span class="yaml-string">$&</span>',
  );
  // Single-quoted strings
  result = result.replace(
    /'([^'\\]|\\.)*'/g,
    '<span class="yaml-string">$&</span>',
  );
  // Booleans & null
  result = result.replace(
    /\b(true|false|yes|no|null|~)\b/gi,
    '<span class="yaml-bool">$1</span>',
  );
  // Numbers (standalone)
  result = result.replace(
    /(?<=\s|^)(-?\d+(?:\.\d+)?)(?=\s|$)/g,
    '<span class="yaml-number">$1</span>',
  );
  return result;
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
  wordWrap?: boolean;
  onEnvVarClick?: () => void;
}

export function CodeEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
  className,
  language = "json",
  envVars,
  wordWrap = false,
  onEnvVarClick,
}: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const syncScroll = useCallback(() => {
    if (preRef.current && ref.current) {
      preRef.current.scrollTop = ref.current.scrollTop;
      preRef.current.scrollLeft = ref.current.scrollLeft;
    }
  }, []);

  // Re-sync scroll whenever value changes (content reflow can shift positions)
  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const highlighted = useMemo(() => {
    let html: string;
    if (language === "json") html = highlightJSON(value);
    else if (language === "yaml") html = highlightYAML(value);
    else html = escapeHtml(value);

    if (envVars !== undefined) {
      html = html.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => {
        const defined = key in envVars && envVars[key].trim() !== "";
        const cls = defined ? "env-var-defined" : "env-var-missing";
        const clickable = onEnvVarClick ? " env-var-clickable" : "";
        return `<span class="${cls}${clickable}" data-envvar="${key}">${match}</span>`;
      });
    }

    return html;
  }, [value, language, envVars, onEnvVarClick]);

  // Insert text via execCommand to preserve the browser's native undo stack.
  // Falls back to direct value manipulation if execCommand is unavailable.
  const nativeInsert = useCallback(
    (ta: HTMLTextAreaElement, text: string) => {
      ta.focus();
      // execCommand('insertText') pushes onto the undo stack
      if (!document.execCommand("insertText", false, text)) {
        // Fallback: direct set (loses undo)
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = ta.value.slice(0, start) + text + ta.value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = start + text.length;
          ta.selectionEnd = start + text.length;
        });
      } else {
        // execCommand already updated the DOM; fire onChange to sync React state
        onChange(ta.value);
      }
    },
    [onChange],
  );

  const insert = useCallback(
    (ta: HTMLTextAreaElement, before: string, after: string = "") => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      if (start !== end && after) {
        const selected = ta.value.slice(start, end);
        const replacement = before + selected + after;
        // Select the range to replace, then insert
        ta.setSelectionRange(start, end);
        nativeInsert(ta, replacement);
        requestAnimationFrame(() => {
          ta.selectionStart = start + before.length;
          ta.selectionEnd = end + before.length;
        });
      } else {
        const replacement = before + after;
        ta.setSelectionRange(start, end);
        nativeInsert(ta, replacement);
        requestAnimationFrame(() => {
          ta.selectionStart = start + before.length;
          ta.selectionEnd = start + before.length;
        });
      }
    },
    [nativeInsert],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = ref.current;
      if (!ta) return;

      const { selectionStart: start, selectionEnd: end, value: val } = ta;
      const hasSelection = start !== end;

      // Tab / Shift+Tab — multi-line indent/dedent when selection spans lines
      if (e.key === "Tab") {
        e.preventDefault();
        const selText = val.slice(start, end);
        const multiLine = hasSelection && selText.includes("\n");

        if (multiLine) {
          // Find the full range of lines touched by the selection
          const blockStart = val.lastIndexOf("\n", start - 1) + 1;
          const blockEnd = val.indexOf("\n", end - 1);
          const blockEndFinal = blockEnd === -1 ? val.length : blockEnd;
          const block = val.slice(blockStart, blockEndFinal);
          const lines = block.split("\n");

          let newLines: string[];
          let startDelta = 0;
          let totalDelta = 0;

          if (e.shiftKey) {
            // Dedent each line
            newLines = lines.map((line, i) => {
              if (line.startsWith(TAB)) {
                if (i === 0) startDelta = -TAB.length;
                totalDelta -= TAB.length;
                return line.slice(TAB.length);
              }
              return line;
            });
          } else {
            // Indent each line
            newLines = lines.map((line, i) => {
              if (i === 0) startDelta = TAB.length;
              totalDelta += TAB.length;
              return TAB + line;
            });
          }

          const replacement = newLines.join("\n");
          ta.setSelectionRange(blockStart, blockEndFinal);
          nativeInsert(ta, replacement);
          requestAnimationFrame(() => {
            ta.selectionStart = Math.max(blockStart, start + startDelta);
            ta.selectionEnd = end + totalDelta;
          });
        } else if (e.shiftKey) {
          // Single line dedent
          const lineStart = val.lastIndexOf("\n", start - 1) + 1;
          const linePrefix = val.slice(lineStart, lineStart + TAB.length);
          if (linePrefix === TAB) {
            ta.setSelectionRange(lineStart, lineStart + TAB.length);
            nativeInsert(ta, "");
            requestAnimationFrame(() => {
              ta.selectionStart = Math.max(lineStart, start - TAB.length);
              ta.selectionEnd = Math.max(lineStart, end - TAB.length);
            });
          }
        } else {
          // Single cursor indent
          ta.setSelectionRange(start, end);
          nativeInsert(ta, TAB);
          requestAnimationFrame(() => {
            ta.selectionStart = start + TAB.length;
            ta.selectionEnd = start + TAB.length;
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
          const deeper = indent + TAB;
          insertion = "\n" + deeper + "\n" + indent;
          ta.setSelectionRange(start, end);
          nativeInsert(ta, insertion);
          requestAnimationFrame(() => {
            ta.selectionStart = start + 1 + deeper.length;
            ta.selectionEnd = start + 1 + deeper.length;
          });
        } else {
          const extra =
            charBefore === "{" ||
            charBefore === "[" ||
            (language === "yaml" && charBefore === ":")
              ? TAB
              : "";
          insertion = "\n" + indent + extra;
          ta.setSelectionRange(start, end);
          nativeInsert(ta, insertion);
          requestAnimationFrame(() => {
            ta.selectionStart = start + insertion.length;
            ta.selectionEnd = start + insertion.length;
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
          ta.setSelectionRange(start - 1, start + 1);
          nativeInsert(ta, "");
          requestAnimationFrame(() => {
            ta.selectionStart = start - 1;
            ta.selectionEnd = start - 1;
          });
          return;
        }
      }

      // Auto-close pairs / surround selection
      if (e.key in PAIRS) {
        const close = PAIRS[e.key];
        const isQuote = e.key === '"' || e.key === "'" || e.key === "`";

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
    [nativeInsert, insert, language],
  );

  const wrapClass = wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre";
  const sharedStyles = `${SHARED_STYLES_BASE} ${wrapClass}`;

  // Detect if the user clicked on an env var reference in the textarea
  const handleTextareaClick = useCallback(() => {
    if (!onEnvVarClick || !ref.current) return;
    const ta = ref.current;
    const pos = ta.selectionStart;
    // Check a window around the cursor for ${...} pattern
    const start = Math.max(0, pos - 50);
    const end = Math.min(ta.value.length, pos + 50);
    const snippet = ta.value.slice(start, end);
    const regex = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
    let match;
    while ((match = regex.exec(snippet)) !== null) {
      const absStart = start + match.index;
      const absEnd = absStart + match[0].length;
      if (pos >= absStart && pos <= absEnd) {
        onEnvVarClick();
        return;
      }
    }
  }, [onEnvVarClick]);

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
        className={`absolute inset-0 ${sharedStyles} overflow-hidden pointer-events-none m-0 [&_.json-key]:text-[#7aa2f7] [&_.json-string]:text-[#9ece6a] [&_.json-number]:text-[#ff9e64] [&_.json-bool]:text-[#ff9e64] [&_.yaml-key]:text-[#7aa2f7] [&_.yaml-colon]:text-muted [&_.yaml-comment]:text-muted [&_.yaml-string]:text-[#9ece6a] [&_.yaml-bool]:text-[#ff9e64] [&_.yaml-number]:text-[#ff9e64] [&_.env-var-defined]:text-healthy [&_.env-var-defined]:font-semibold [&_.env-var-missing]:text-failed [&_.env-var-missing]:font-semibold [&_.env-var-clickable]:underline [&_.env-var-clickable]:decoration-dotted`}
        style={{ tabSize: 2 }}
        dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
      />
      {/* Transparent textarea on top for editing */}
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onClick={handleTextareaClick}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        style={{ tabSize: 2 }}
        className={`relative w-full bg-transparent ${sharedStyles} text-transparent caret-white placeholder:text-muted focus:outline-none resize-none selection:bg-[#264f78] selection:text-[#e4e4e7]`}
      />
    </div>
  );
}
