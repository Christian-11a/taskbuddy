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
});

describe("datedFilename", () => {
  it("appends an ISO date and the csv extension", () => {
    expect(datedFilename("taskbuddy-users")).toMatch(/^taskbuddy-users-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
