import { describe, expect, it } from "vitest";
import { datedFilename, toCsv } from "./csv";

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(toCsv(["A", "B"], [[1, 2], [3, 4]])).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = toCsv(["Name", "Note"], [
      ["Cruz, Ana", 'She said "hi"'],
      ["Multi", "line\nbreak"],
    ]);
    expect(csv).toContain('"Cruz, Ana"');
    // Embedded quotes are doubled per RFC 4180.
    expect(csv).toContain('"She said ""hi"""');
    expect(csv).toContain('"line\nbreak"');
  });

  it("renders null and undefined as empty cells, not the words", () => {
    expect(toCsv(["A", "B"], [[null, undefined]])).toBe("A,B\r\n,");
  });

  it("handles an empty row set", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });

  describe("formula injection", () => {
    it("prefixes text cells starting with = + - @ tab or CR with a single quote", () => {
      expect(toCsv(["A"], [["=SUM(A1:A9)"]])).toBe("A\r\n'=SUM(A1:A9)");
      expect(toCsv(["A"], [["+cmd|' /C calc'!A0"]])).toBe("A\r\n'+cmd|' /C calc'!A0");
      expect(toCsv(["A"], [["-2+3"]])).toBe("A\r\n'-2+3");
      expect(toCsv(["A"], [["@SUM(1,1)"]])).toBe('A\r\n"\'@SUM(1,1)"');
      expect(toCsv(["A"], [["\t=1+1"]])).toBe("A\r\n'\t=1+1");
      expect(toCsv(["A"], [["\r=1+1"]])).toBe('A\r\n"\'\r=1+1"');
    });

    it("still quotes a prefixed cell that also contains a comma", () => {
      expect(toCsv(["A"], [["=HYPERLINK(\"http://x\",\"x\")"]])).toBe('A\r\n"\'=HYPERLINK(""http://x"",""x"")"');
    });

    it("leaves ordinary text that merely contains these characters alone", () => {
      expect(toCsv(["A"], [["Ana = best"]])).toBe("A\r\nAna = best");
      expect(toCsv(["A"], [["user@example.com"]])).toBe("A\r\nuser@example.com");
      expect(toCsv(["A"], [["₱1,200.00"]])).toBe('A\r\n"₱1,200.00"');
    });

    it("does not prefix numbers typed as numbers, including negatives", () => {
      expect(toCsv(["A", "B", "C"], [[-500, 0, 12.5]])).toBe("A,B,C\r\n-500,0,12.5");
    });

    it("does not prefix numeric strings such as a negative amount", () => {
      expect(toCsv(["A"], [["-500"]])).toBe("A\r\n-500");
      expect(toCsv(["A"], [["+3.5"]])).toBe("A\r\n+3.5");
    });
  });
});

describe("datedFilename", () => {
  it("appends an ISO date and the csv extension", () => {
    expect(datedFilename("taskbuddy-users")).toMatch(/^taskbuddy-users-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
