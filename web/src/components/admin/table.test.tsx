import { describe, expect, it } from "vitest";
import { sortRows, type Column } from "./table";

type Row = { name: string; jobs: number | null };
const cols: Column<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
  { id: "jobs", header: "Jobs", cell: (r) => r.jobs, sortValue: (r) => r.jobs },
];
const rows: Row[] = [
  { name: "bea", jobs: 3 },
  { name: "Al", jobs: null },
  { name: "cy", jobs: 12 },
];

describe("sortRows", () => {
  it("sorts text case-insensitively and numbers numerically", () => {
    expect(sortRows(rows, cols, { id: "name", dir: "asc" }).map((r) => r.name)).toEqual(["Al", "bea", "cy"]);
    expect(sortRows(rows, cols, { id: "jobs", dir: "desc" }).map((r) => r.jobs)).toEqual([12, 3, null]);
  });
  it("keeps empty values last in both directions", () => {
    expect(sortRows(rows, cols, { id: "jobs", dir: "asc" }).map((r) => r.jobs)).toEqual([3, 12, null]);
  });
  it("returns rows untouched without a sort", () => {
    expect(sortRows(rows, cols, null)).toBe(rows);
  });
});
