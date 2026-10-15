/**
 * Minimal .env parsing for the bulk import on the Env Variables page.
 *
 * Handles what real .env files contain: comments, blank lines, an `export `
 * prefix, single/double quotes, and `\n` escapes inside double quotes. Keys are
 * normalised the same way the add form normalises them (upper-case, [A-Z0-9_]),
 * and a key that is empty after that is reported rather than silently dropped.
 */

export interface DotEnvEntry {
  key: string;
  value: string;
}

export interface DotEnvParseResult {
  entries: DotEnvEntry[];
  /** 1-based line numbers that could not be read as KEY=VALUE. */
  invalidLines: number[];
}

export function normaliseEnvKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
}

export function parseDotEnv(text: string): DotEnvParseResult {
  const entries = new Map<string, string>();
  const invalidLines: number[] = [];

  text.split(/\r?\n/).forEach((rawLine, i) => {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    if (line.startsWith("export ")) line = line.slice(7).trim();

    const eq = line.indexOf("=");
    if (eq <= 0) {
      invalidLines.push(i + 1);
      return;
    }
    const key = normaliseEnvKey(line.slice(0, eq));
    if (!key) {
      invalidLines.push(i + 1);
      return;
    }

    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (
      value.startsWith("'") &&
      value.endsWith("'") &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    } else {
      // Unquoted: an inline comment needs whitespace before the #, so URLs with
      // fragments survive.
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    // Last definition wins, as in a shell.
    entries.set(key, value);
  });

  return {
    entries: Array.from(entries, ([key, value]) => ({ key, value })),
    invalidLines,
  };
}

/** Serialise for download. Values are always double-quoted and escaped. */
export function toDotEnv(entries: DotEnvEntry[]): string {
  return (
    entries
      .map(
        ({ key, value }) =>
          `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`,
      )
      .join("\n") + "\n"
  );
}
