import { describe, expect, it } from "vitest";
import { toCSV } from "./csv";

describe("toCSV", () => {
  it("quotes every field and escapes quotes", () => {
    expect(toCSV(["a", "b"], [["x", 'say "hi"']])).toBe(
      '"a","b"\r\n"x","say ""hi"""\r\n',
    );
  });

  it("keeps commas and newlines inside a field", () => {
    expect(toCSV(["d"], [["one, two\nthree"]])).toBe('"d"\r\n"one, two\nthree"\r\n');
  });

  it("renders null and undefined as empty, numbers as text", () => {
    expect(toCSV(["a", "b", "c"], [[null, undefined, 42]])).toBe(
      '"a","b","c"\r\n"","","42"\r\n',
    );
  });

  it("neutralises spreadsheet formulas", () => {
    expect(toCSV(["x"], [["=HYPERLINK(1)"], ["-2"], ["@a"], ["+1"]])).toBe(
      "\"x\"\r\n\"'=HYPERLINK(1)\"\r\n\"'-2\"\r\n\"'@a\"\r\n\"'+1\"\r\n",
    );
  });
});
