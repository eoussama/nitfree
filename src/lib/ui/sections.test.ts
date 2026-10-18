import type { TItem } from "~/lib/db";

import { describe, expect, it } from "vitest";

import { buildSections, filterItems, RECENT_LIMIT } from "./sections";



function item(id: string, patch: Partial<TItem> = {}): TItem {
  return {
    id,
    type: "emoji",
    title: id,
    description: "",
    tags: [],
    favorite: false,
    hash: id,
    size: 1,
    format: "png",
    mime: "image/png",
    width: 1,
    height: 1,
    animated: false,
    createdAt: 0,
    updatedAt: 0,
    usedAt: null,
    usageCount: 0,
    ...patch,
  };
}

describe("buildSections", () => {
  it("orders favorites by title, recent by last use, and keeps every item in All files", () => {
    const items = [
      item("zebra", { favorite: true, usedAt: 10 }),
      item("apple", { favorite: true }),
      item("mango", { usedAt: 30 }),
      item("kiwi"),
    ];

    expect(buildSections(items)).toEqual([
      { id: "favorites", items: [items[1], items[0]] },
      { id: "recent", items: [items[2], items[0]] },
      { id: "all", items },
    ]);
  });

  it("leaves out empty sections", () => {
    expect(buildSections([item("a")]).map(section => section.id)).toEqual(["all"]);
    expect(buildSections([])).toEqual([]);
  });

  it("caps the recent section", () => {
    const items = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => item(`i${i}`, { usedAt: i }));
    const recent = buildSections(items).find(section => section.id === "recent")!;

    expect(recent.items).toHaveLength(RECENT_LIMIT);
    expect(recent.items[0]?.usedAt).toBe(RECENT_LIMIT + 4);
  });
});

describe("filterItems", () => {
  it("matches titles regardless of case and keeps order", () => {
    const items = [item("Party Parrot"), item("cat"), item("PARTY hat")];

    expect(filterItems(items, " party ").map(found => found.id)).toEqual(["Party Parrot", "PARTY hat"]);
    expect(filterItems(items, "")).toEqual(items);
  });
});
