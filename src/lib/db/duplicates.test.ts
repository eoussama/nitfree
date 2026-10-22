import { describe, expect, it } from "vitest";

import { groupDuplicates } from "./duplicates";



type TCandidate = Parameters<typeof groupDuplicates>[0][number];

function item(id: string, overrides: Partial<TCandidate> = {}): TCandidate {
  return { id, hash: id, fingerprint: null, width: 64, height: 64, usageCount: 0, createdAt: 0, ...overrides };
}

const RED = "0123456789abcdefff0000";

describe("groupDuplicates", () => {
  it("groups the same files, and near-identical images of the same shape", () => {
    const groups = groupDuplicates([
      item("a", { hash: "x" }),
      item("b", { hash: "x" }),
      item("c", { fingerprint: RED }),
      item("d", { fingerprint: "0123456789abcdeeff0000", width: 128, height: 128 }),
      item("e"),
    ]);

    expect(groups).toEqual([
      { ids: ["d", "c"], exact: false },
      { ids: ["a", "b"], exact: true },
    ]);
  });

  it("leaves apart images of other shapes, colors or patterns", () => {
    expect(groupDuplicates([
      item("a", { fingerprint: RED }),
      item("b", { fingerprint: RED, width: 128 }),
      item("c", { fingerprint: "0123456789abcdef0000ff" }),
      item("d", { fingerprint: "fedcba9876543210ff0000" }),
      item("e", { fingerprint: null }),
    ])).toEqual([]);
  });

  it("chains matches into one group, and is not exact once one file differs", () => {
    expect(groupDuplicates([
      item("a", { hash: "x", fingerprint: RED }),
      item("b", { hash: "x", fingerprint: RED }),
      item("c", { fingerprint: RED }),
    ])).toEqual([{ ids: ["a", "b", "c"], exact: false }]);
  });

  it("suggests keeping the largest, then the most sent, then the oldest", () => {
    const [group] = groupDuplicates([
      item("old", { hash: "x", createdAt: 1 }),
      item("sent", { hash: "x", createdAt: 3, usageCount: 2 }),
      item("older", { hash: "x", createdAt: 0 }),
      item("big", { hash: "y", fingerprint: RED, width: 256, height: 256, createdAt: 9 }),
      item("same", { hash: "x", fingerprint: RED, createdAt: 4 }),
    ]);

    expect(group?.ids).toEqual(["big", "sent", "older", "old", "same"]);
  });
});
