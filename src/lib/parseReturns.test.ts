import { describe, expect, it } from "vitest";
import { extractColumn, guessReturnColumn, parseCsvTable, parseReturnsText } from "./parseReturns";

describe("parseReturnsText", () => {
  it("handles newlines, commas, semicolons and spaces", () => {
    expect(parseReturnsText("0.01\n-0.02\r\n0.03, 0.04;0.05  -0.06").values).toEqual([0.01, -0.02, 0.03, 0.04, 0.05, -0.06]);
  });
  it("reports unreadable tokens instead of dropping them silently", () => {
    const r = parseReturnsText("0.01 abc 1.2% 0.02");
    expect(r.values).toEqual([0.01, 0.02]);
    expect(r.invalid).toEqual(["abc", "1.2%"]);
  });
  it("empty text gives empty result", () => {
    expect(parseReturnsText("  \n ")).toEqual({ values: [], invalid: [] });
  });
});

describe("CSV parsing", () => {
  const csv = "date,return\n2024-01-01,0.01\n2024-01-02,-0.02\n2024-01-03,0.005\n";
  it("detects header and picks the return column", () => {
    const t = parseCsvTable(csv);
    expect(t.header).toEqual(["date", "return"]);
    expect(t.rows.length).toBe(3);
    const col = guessReturnColumn(t);
    expect(col).toBe(1);
    expect(extractColumn(t, col)).toEqual({ values: [0.01, -0.02, 0.005], invalid: [] });
  });
  it("handles a single column without header", () => {
    const t = parseCsvTable("0.01\n-0.02\n0.03");
    expect(t.header).toBeNull();
    expect(extractColumn(t, guessReturnColumn(t)).values).toEqual([0.01, -0.02, 0.03]);
  });
  it("handles semicolon delimiter and CRLF", () => {
    const t = parseCsvTable("ret;x\r\n0.01;5\r\n0.02;6\r\n");
    expect(t.columnCount).toBe(2);
    expect(extractColumn(t, 0).values).toEqual([0.01, 0.02]);
  });
  it("prefers the last mostly-numeric column when no header hint", () => {
    const t = parseCsvTable("2024-01-01,0.01\n2024-01-02,0.02");
    expect(guessReturnColumn(t)).toBe(1);
  });
  it("flags invalid cells in the chosen column", () => {
    const t = parseCsvTable("r\n0.01\nn/a\n0.02");
    expect(extractColumn(t, 0)).toEqual({ values: [0.01, 0.02], invalid: ["n/a"] });
  });
});
