"use client";

import { useRef, useCallback, KeyboardEvent, useMemo, useEffect } from "react";
import yaml from "js-yaml";
import { cn } from "@/lib/utils";

// ─── Constants ──────────────────────────────────────────────────────────────

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

const SHARED_STYLES =
  "px-3 py-2 text-sm font-mono leading-5";
const LINE_HEIGHT_PX = 20; // must match leading-5 (1.25rem)
const PADDING_Y_PX = 8;    // must match py-2 (0.5rem)

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Syntax highlighting ─────────────────────────────────────────────────────

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
      const keyMatch = line.match(/^(\s*(?:-\s+)?)([\w.-]+)(:)(.*)/);
      if (!keyMatch) {
        // No key — could be a list item or plain value
        return highlightYAMLValue(line);
      }

      const [, indent, key, colon, rest] = keyMatch;
      const keyHtml = `${indent}<span class="yaml-key">${key}</span><span class="yaml-colon">${colon}</span>`;
      // Highlight the value portion (after the colon)
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

// ─── Whitespace visualization ────────────────────────────────────────────────

function renderWhitespace(html: string): string {
  return html
    .split("\n")
    .map((line) => {
      // Split by HTML tags — only process text nodes
      const parts = line.split(/(<[^>]*>)/);
      return parts
        .map((part) => {
          if (part.startsWith("<")) return part; // HTML tag — leave alone
          return part
            .replace(/\t/g, '<span class="ws-tab">\u2192\u00A0</span>')
            .replace(/ /g, '<span class="ws-dot">\u00B7</span>');
        })
        .join("");
    })
    .join("\n");
}

// ─── Validation ─────────────────────────────────────────────────────────────

interface LineError {
  line: number;
  message: string;
  severity?: "error" | "warning";
}

function validateJSON(text: string): LineError[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const errors: LineError[] = [];
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    // Tabs
    if (/\t/.test(line)) {
      errors.push({ line: i, message: "Use spaces instead of tabs" });
    }

    // Trailing whitespace
    if (line.trimEnd() !== line && line.trim()) {
      errors.push({ line: i, message: "Trailing whitespace", severity: "warning" });
    }

    const stripped = line.trim();

    // Comments — JSON does not support comments
    if (stripped.startsWith("//") || stripped.startsWith("/*")) {
      errors.push({ line: i, message: "JSON does not support comments" });
    }

    // Single-quoted strings (should be double-quoted in JSON)
    const withoutDoubleQuotes = line.replace(/"(?:[^"\\]|\\.)*"/g, "");
    if (/'[^']*'/.test(withoutDoubleQuotes)) {
      errors.push({ line: i, message: "Use double quotes instead of single quotes" });
    }
  });

  // Trailing commas: comma followed by closing bracket on a later line
  lines.forEach((line, i) => {
    const stripped = line.replace(/"(?:[^"\\]|\\.)*"/g, "").trimEnd();
    if (!stripped.endsWith(",")) return;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (next[0] === "}" || next[0] === "]") {
        errors.push({ line: i, message: "Trailing comma before closing bracket" });
      }
      break;
    }
  });

  // Overall parse check — locate the error line
  try {
    JSON.parse(text);
  } catch (e) {
    if (e instanceof SyntaxError) {
      const posMatch = e.message.match(/position\s+(\d+)/i);
      const colMatch = e.message.match(/column\s+(\d+)/i);
      const lineMatch = e.message.match(/line\s+(\d+)/i);
      let errorLine = lines.length - 1;

      if (lineMatch) {
        errorLine = Math.max(0, parseInt(lineMatch[1]) - 1);
      } else if (posMatch) {
        const pos = parseInt(posMatch[1]);
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
          count += lines[i].length + 1;
          if (count > pos) { errorLine = i; break; }
        }
      } else if (colMatch) {
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim()) { errorLine = i; break; }
        }
      }

      const msg = e.message.replace(/\s+at position \d+.*$/i, "").replace(/\s+in JSON.*$/i, "");
      if (!errors.some((err) => err.line === errorLine && err.severity !== "warning")) {
        errors.push({ line: errorLine, message: msg });
      }
    }
  }

  return errors;
}

function validateYAML(text: string): LineError[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const errors: LineError[] = [];
  const lines = text.split("\n");

  // Detect the base indent unit from the first indented line
  let indentUnit = 2;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.match(/^( +)/)?.[1]?.length ?? 0;
    if (indent > 0) { indentUnit = indent; break; }
  }

  lines.forEach((line, i) => {
    // Blank lines with whitespace
    if (!line.trim()) {
      if (line.length > 0) {
        errors.push({ line: i, message: "Blank line contains whitespace", severity: "warning" });
      }
      return;
    }

    // Comments — check for trailing whitespace only
    if (line.trim().startsWith("#")) {
      if (line.trimEnd() !== line) {
        errors.push({ line: i, message: "Trailing whitespace", severity: "warning" });
      }
      return;
    }

    // Tabs
    if (/\t/.test(line)) {
      errors.push({ line: i, message: "YAML forbids tab characters — use spaces" });
      return; // Skip other checks for this line
    }

    // Trailing whitespace
    if (line.trimEnd() !== line) {
      errors.push({ line: i, message: "Trailing whitespace", severity: "warning" });
    }

    // Indentation must be a multiple of the detected unit
    const indent = line.match(/^( *)/)?.[1]?.length ?? 0;
    if (indent > 0 && indent % indentUnit !== 0) {
      errors.push({ line: i, message: `Indentation (${indent}) is not a multiple of ${indentUnit}` });
    }

    // Missing space after colon in key-value patterns
    const stripped = line.trim();
    if (!stripped.startsWith("-") && !stripped.startsWith("#")) {
      const kvMatch = stripped.match(/^([\w.-]+):(\S)/);
      if (kvMatch) {
        errors.push({
          line: i,
          message: `Missing space after ":" — did you mean "${kvMatch[1]}: ${kvMatch[2]}..."?`,
          severity: "warning",
        });
      }
    }
  });

  // Parse validation using js-yaml
  try {
    yaml.loadAll(text);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "mark" in e) {
      const yamlErr = e as { mark?: { line?: number }; reason?: string; message?: string };
      const errorLine = Math.max(0, yamlErr.mark?.line ?? lines.length - 1);
      const msg = yamlErr.reason || (yamlErr.message ? yamlErr.message.split("\n")[0] : "Invalid YAML");
      // Avoid duplicate error on same line
      if (!errors.some((err) => err.line === errorLine && err.severity !== "warning")) {
        errors.push({ line: errorLine, message: msg });
      }
    }
  }

  return errors;
}

// ─── Error / warning application ────────────────────────────────────────────

function applyLineErrors(html: string, errors: LineError[]): string {
  if (errors.length === 0) return html;
  const lineMap = new Map<number, "error" | "warning">();
  for (const e of errors) {
    const sev = e.severity || "error";
    const existing = lineMap.get(e.line);
    // Error takes precedence over warning on same line
    if (!existing || (existing === "warning" && sev === "error")) {
      lineMap.set(e.line, sev);
    }
  }
  return html
    .split("\n")
    .map((line, i) => {
      const sev = lineMap.get(i);
      if (!sev) return line;
      const cls = sev === "error" ? "code-error-line" : "code-warning-line";
      return `<span class="${cls}">${line}</span>`;
    })
    .join("\n");
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxRows?: number;
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
  maxRows,
  placeholder,
  className,
  language = "json",
  envVars,
  wordWrap = false,
  onEnvVarClick,
}: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const activeHighlightRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef(-1);

  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const gutterDigits = Math.max(2, String(lineCount).length);
  const maxHeightPx = maxRows
    ? maxRows * LINE_HEIGHT_PX + PADDING_Y_PX * 2
    : undefined;

  // ── Scroll sync ──────────────────────────────────────────────────────────

  const positionActiveHighlight = useCallback(() => {
    const ta = ref.current;
    const highlight = activeHighlightRef.current;
    if (!ta || !highlight || activeLineRef.current < 0) {
      if (highlight) highlight.style.display = "none";
      return;
    }
    const top = PADDING_Y_PX + activeLineRef.current * LINE_HEIGHT_PX - ta.scrollTop;
    highlight.style.transform = `translateY(${top}px)`;
    highlight.style.display =
      top > -LINE_HEIGHT_PX && top < ta.clientHeight ? "block" : "none";
  }, []);

  const syncScroll = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
    positionActiveHighlight();
  }, [positionActiveHighlight]);

  // Re-sync scroll whenever value changes (content reflow can shift positions)
  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  // ── Active line tracking (imperative — no React re-renders) ──────────────

  const updateActiveLine = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;

    const pos = ta.selectionStart;
    const line = ta.value.slice(0, pos).split("\n").length - 1;

    if (line !== activeLineRef.current) {
      activeLineRef.current = line;

      // Update gutter highlighting
      const gutter = gutterRef.current;
      if (gutter) {
        const prev = gutter.querySelector("[data-active]");
        if (prev) {
          prev.removeAttribute("data-active");
          (prev as HTMLElement).style.color = "";
        }
        const lineEl = gutter.children[line] as HTMLElement | undefined;
        if (lineEl) {
          lineEl.setAttribute("data-active", "");
          lineEl.style.color = "var(--color-primary)";
        }
      }
    }

    positionActiveHighlight();
  }, [positionActiveHighlight]);

  const handleBlur = useCallback(() => {
    activeLineRef.current = -1;
    if (activeHighlightRef.current) activeHighlightRef.current.style.display = "none";
    const gutter = gutterRef.current;
    if (gutter) {
      const prev = gutter.querySelector("[data-active]");
      if (prev) {
        prev.removeAttribute("data-active");
        (prev as HTMLElement).style.color = "";
      }
    }
  }, []);

  // ── Validation ───────────────────────────────────────────────────────────

  const errors = useMemo(() => {
    if (language === "json") return validateJSON(value);
    if (language === "yaml") return validateYAML(value);
    return [];
  }, [value, language]);

  const errorCount = useMemo(
    () => errors.filter((e) => (e.severity || "error") === "error").length,
    [errors],
  );
  const warningCount = useMemo(
    () => errors.filter((e) => e.severity === "warning").length,
    [errors],
  );

  // ── Highlighted HTML ─────────────────────────────────────────────────────

  const highlighted = useMemo(() => {
    let html: string;
    if (language === "json") html = highlightJSON(value);
    else if (language === "yaml") html = highlightYAML(value);
    else html = escapeHtml(value);

    // Env var highlighting
    if (envVars !== undefined) {
      html = html.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => {
        const defined = key in envVars && envVars[key].trim() !== "";
        const cls = defined ? "env-var-defined" : "env-var-missing";
        const clickable = onEnvVarClick ? " env-var-clickable" : "";
        return `<span class="${cls}${clickable}" data-envvar="${key}">${match}</span>`;
      });
    }

    // Error/warning line decoration
    html = applyLineErrors(html, errors);

    // Whitespace dots/arrows (last — modifies text nodes)
    html = renderWhitespace(html);

    return html;
  }, [value, language, envVars, onEnvVarClick, errors]);

  // ── Text insertion helpers ───────────────────────────────────────────────

  // Insert text via execCommand to preserve the browser's native undo stack.
  const nativeInsert = useCallback(
    (ta: HTMLTextAreaElement, text: string) => {
      ta.focus();
      if (!document.execCommand("insertText", false, text)) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = ta.value.slice(0, start) + text + ta.value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = start + text.length;
          ta.selectionEnd = start + text.length;
        });
      } else {
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

  // ── Keyboard handling ────────────────────────────────────────────────────

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
          const blockStart = val.lastIndexOf("\n", start - 1) + 1;
          const blockEnd = val.indexOf("\n", end - 1);
          const blockEndFinal = blockEnd === -1 ? val.length : blockEnd;
          const block = val.slice(blockStart, blockEndFinal);
          const lines = block.split("\n");

          let newLines: string[];
          let startDelta = 0;
          let totalDelta = 0;

          if (e.shiftKey) {
            newLines = lines.map((line, i) => {
              if (line.startsWith(TAB)) {
                if (i === 0) startDelta = -TAB.length;
                totalDelta -= TAB.length;
                return line.slice(TAB.length);
              }
              return line;
            });
          } else {
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

  // ── Mouse handlers ───────────────────────────────────────────────────────

  const handleTextareaClick = useCallback(() => {
    if (!onEnvVarClick || !ref.current) return;
    const ta = ref.current;
    const pos = ta.selectionStart;
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      const tooltip = tooltipRef.current;
      const ta = ref.current;
      if (!tooltip || !ta) return;

      if (errors.length === 0) {
        tooltip.style.display = "none";
        return;
      }

      const rect = ta.getBoundingClientRect();
      const y = e.clientY - rect.top + ta.scrollTop;
      const lineIndex = Math.floor((y - PADDING_Y_PX) / LINE_HEIGHT_PX);

      const lineErrors = errors.filter((err) => err.line === lineIndex);
      if (lineErrors.length > 0) {
        tooltip.textContent = lineErrors.map((err) => err.message).join(" · ");
        tooltip.style.display = "block";

        const lineTop =
          PADDING_Y_PX + lineIndex * LINE_HEIGHT_PX - ta.scrollTop;
        const tooltipH = tooltip.offsetHeight;

        tooltip.style.top =
          lineTop - tooltipH - 4 >= 0
            ? `${lineTop - tooltipH - 4}px`
            : `${lineTop + LINE_HEIGHT_PX + 4}px`;
        tooltip.style.left = "12px";
      } else {
        tooltip.style.display = "none";
      }
    },
    [errors],
  );

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }, []);

  // ── Layout helpers ───────────────────────────────────────────────────────

  const wrapClass = wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre";
  const sharedStyles = `${SHARED_STYLES} ${wrapClass}`;
  const hasIssues = errorCount > 0 || warningCount > 0;

  // ── Gutter line numbers ──────────────────────────────────────────────────

  const gutterLines = useMemo(() => {
    const arr = [];
    for (let i = 1; i <= lineCount; i++) {
      arr.push(
        <div
          key={i}
          className="pr-3 pl-2 text-right leading-5 select-none"
          style={{ height: LINE_HEIGHT_PX }}
        >
          {i}
        </div>,
      );
    }
    return arr;
  }, [lineCount]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-background-alt overflow-hidden focus-within:border-border-emphasis",
        errorCount > 0
          ? "border-red-500/40"
          : warningCount > 0
            ? "border-amber-500/30"
            : "border-border-strong",
        className,
      )}
    >
      <div className="flex" style={maxHeightPx ? { maxHeight: maxHeightPx } : undefined}>
        {/* Gutter — line numbers */}
        <div
          ref={gutterRef}
          className="shrink-0 overflow-hidden border-r border-border-subtle bg-background-alt/50 font-mono text-xs text-muted/30"
          style={{ minWidth: `${gutterDigits + 2}ch` }}
        >
          <div className="py-2">{gutterLines}</div>
        </div>

        {/* Editor area */}
        <div className="relative flex-1 min-w-0 overflow-hidden">
          {/* Active line highlight */}
          <div
            ref={activeHighlightRef}
            className="absolute left-0 right-0 pointer-events-none bg-white/[0.03]"
            style={{ height: LINE_HEIGHT_PX, display: "none" }}
          />

          {/* Highlighted underlay */}
          <pre
            ref={preRef}
            aria-hidden
            className={`code-editor-pre absolute inset-0 ${sharedStyles} overflow-hidden pointer-events-none m-0`}
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
            onKeyUp={updateActiveLine}
            onClick={() => {
              handleTextareaClick();
              updateActiveLine();
            }}
            onFocus={updateActiveLine}
            onBlur={handleBlur}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onScroll={syncScroll}
            placeholder={placeholder}
            spellCheck={false}
            style={{ tabSize: 2, ...(maxHeightPx ? { maxHeight: maxHeightPx } : {}) }}
            className={`relative w-full bg-transparent ${sharedStyles} text-transparent caret-white placeholder:text-muted focus:outline-none resize-none selection:bg-[#264f78] selection:text-[#e4e4e7]`}
          />
        </div>
      </div>

      {/* Error / warning badges */}
      {hasIssues && (
        <div
          className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 select-none"
          title={errors
            .map((e) => `Line ${e.line + 1}: ${e.message}`)
            .join("\n")}
        >
          {errorCount > 0 && (
            <div className="rounded bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
              {errorCount} {errorCount === 1 ? "error" : "errors"}
            </div>
          )}
          {warningCount > 0 && (
            <div className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              {warningCount} {warningCount === 1 ? "hint" : "hints"}
            </div>
          )}
        </div>
      )}

      {/* Error tooltip — shown imperatively via ref on mouse hover */}
      <div
        ref={tooltipRef}
        className="absolute z-20 rounded border border-red-500/30 bg-surface-elevated px-2 py-1 text-xs text-red-300 shadow-lg whitespace-nowrap pointer-events-none"
        style={{ display: "none" }}
      />
    </div>
  );
}
