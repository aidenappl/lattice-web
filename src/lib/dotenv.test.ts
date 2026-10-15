import { describe, expect, it } from "vitest";
import { normaliseEnvKey, parseDotEnv, toDotEnv } from "./dotenv";

describe("parseDotEnv", () => {
  it("reads plain, quoted and exported assignments", () => {
    const { entries, invalidLines } = parseDotEnv(
      [
        "# a comment",
        "",
        "PLAIN=value",
        'DOUBLE="has spaces"',
        "SINGLE='keeps $literal'",
        "export EXPORTED=1",
      ].join("\n"),
    );
    expect(invalidLines).toEqual([]);
    expect(entries).toEqual([
      { key: "PLAIN", value: "value" },
      { key: "DOUBLE", value: "has spaces" },
      { key: "SINGLE", value: "keeps $literal" },
      { key: "EXPORTED", value: "1" },
    ]);
  });

  it("strips inline comments only when preceded by whitespace", () => {
    const { entries } = parseDotEnv("A=1 # note\nURL=https://x.test/#frag");
    expect(entries).toEqual([
      { key: "A", value: "1" },
      { key: "URL", value: "https://x.test/#frag" },
    ]);
  });

  it("unescapes double-quoted values", () => {
    const { entries } = parseDotEnv('MULTI="a\\nb \\"q\\""');
    expect(entries[0].value).toBe('a\nb "q"');
  });

  it("normalises keys and lets the last definition win", () => {
    const { entries } = parseDotEnv("my-key=1\nMY_KEY=2\nmykey=3");
    expect(entries).toEqual([
      { key: "MYKEY", value: "3" },
      { key: "MY_KEY", value: "2" },
    ]);
  });

  it("reports lines that are not assignments", () => {
    const { entries, invalidLines } = parseDotEnv(
      "GOOD=1\nnot an assignment\n=nokey\n---=x",
    );
    expect(entries).toEqual([{ key: "GOOD", value: "1" }]);
    expect(invalidLines).toEqual([2, 3, 4]);
  });

  it("keeps an empty value", () => {
    expect(parseDotEnv("EMPTY=").entries).toEqual([
      { key: "EMPTY", value: "" },
    ]);
  });
});

describe("toDotEnv", () => {
  it("round-trips through parseDotEnv", () => {
    const original = [
      { key: "A", value: 'quote " and \\ slash' },
      { key: "B", value: "line1\nline2" },
    ];
    expect(parseDotEnv(toDotEnv(original)).entries).toEqual(original);
  });
});

describe("normaliseEnvKey", () => {
  it("upper-cases and strips invalid characters", () => {
    expect(normaliseEnvKey(" db.url-1 ")).toBe("DBURL1");
  });
});
