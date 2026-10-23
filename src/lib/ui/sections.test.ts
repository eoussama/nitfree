import type { TItem, TPack, TTag } from "~/lib/db";

import { describe, expect, it } from "vitest";

import { buildSections, filterItems, foldText, packIcon, RECENT_LIMIT } from "./sections";



function item(id: string, patch: Partial<TItem> = {}): TItem {
  return {
    id,
    type: "emoji",
    title: id,
    description: "",
    tags: [],
    packs: [],
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

describe("foldText", () => {
  it("lowercases and strips accents", () => {
    expect(foldText("Café ÉTÉ Crème Brûlée")).toBe("cafe ete creme brulee");
  });
});

describe("filterItems", () => {
  const tags: TTag[] = [
    { id: "t1", name: "Happy Cat", color: null, createdAt: 0 },
    { id: "t2", name: "dog", color: null, createdAt: 0 },
  ];

  it("matches titles regardless of case and keeps order", () => {
    const items = [item("Party Parrot"), item("cat"), item("PARTY hat")];

    expect(filterItems(items, " party ").map(found => found.id)).toEqual(["Party Parrot", "PARTY hat"]);
    expect(filterItems(items, "")).toEqual(items);
  });

  it("returns a copy for an empty query, not the library itself", () => {
    const items = [item("a")];

    expect(filterItems(items, "  ")).not.toBe(items);
  });

  it("matches descriptions", () => {
    const items = [item("a", { description: "Dancing in the rain" }), item("b")];

    expect(filterItems(items, "rain").map(found => found.id)).toEqual(["a"]);
  });

  it("matches part of a tag name, listing every item with that tag", () => {
    const items = [item("a", { tags: ["t1"] }), item("b", { tags: ["t2"] }), item("c", { tags: ["t1", "t2"] })];

    expect(filterItems(items, "cat", tags).map(found => found.id)).toEqual(["a", "c"]);
    expect(filterItems(items, "HAPP", tags).map(found => found.id)).toEqual(["a", "c"]);
  });

  it("ignores tags that no longer exist", () => {
    expect(filterItems([item("a", { tags: ["gone"] })], "gone", tags)).toEqual([]);
  });

  it("ignores accents on either side", () => {
    const items = [item("Café"), item("plain", { description: "crème brûlée" })];

    expect(filterItems(items, "cafe").map(found => found.id)).toEqual(["Café"]);
    expect(filterItems(items, "CAFÉ").map(found => found.id)).toEqual(["Café"]);
    expect(filterItems(items, "creme brulee").map(found => found.id)).toEqual(["plain"]);
  });

  it("needs every word to match, wherever it is found", () => {
    const items = [item("wave", { description: "hello", tags: ["t1"] }), item("hello", { tags: ["t2"] })];

    expect(filterItems(items, "wave cat hello", tags).map(found => found.id)).toEqual(["wave"]);
    expect(filterItems(items, "hello dog", tags).map(found => found.id)).toEqual(["hello"]);
    expect(filterItems(items, "hello zzz", tags)).toEqual([]);
  });

  it("does not match across the end of one field and the start of the next", () => {
    expect(filterItems([item("ab", { description: "cd" })], "bc")).toEqual([]);
  });
});

describe("packs", () => {
  const cats: TPack = { id: "p1", name: "Cats", icon: null, createdAt: 0 };
  const dogs: TPack = { id: "p2", name: "Dogs", icon: null, createdAt: 0 };
  const empty: TPack = { id: "p3", name: "Empty", icon: null, createdAt: 0 };

  it("gives each pack a section of its items, by pack, after Recent and before All files", () => {
    const items = [
      item("tabby", { packs: ["p1"], usedAt: 5 }),
      item("pug", { packs: ["p2", "p1"] }),
      item("logo", { favorite: true }),
    ];

    expect(buildSections(items, [cats, dogs, empty])).toEqual([
      { id: "favorites", items: [items[2]] },
      { id: "recent", items: [items[0]] },
      { id: "pack:p1", pack: cats, items: [items[0], items[1]] },
      { id: "pack:p2", pack: dogs, items: [items[1]] },
      { id: "all", items },
    ]);
  });

  it("finds the items in a pack by its name, and part of it", () => {
    const items = [item("tabby", { packs: ["p1"] }), item("pug", { packs: ["p2"] }), item("logo")];

    expect(filterItems(items, "cats", [], [cats, dogs]).map(found => found.id)).toEqual(["tabby"]);
    expect(filterItems(items, "DO", [], [cats, dogs]).map(found => found.id)).toEqual(["pug"]);
    expect(filterItems(items, "cats tabby", [], [cats, dogs]).map(found => found.id)).toEqual(["tabby"]);
    expect(filterItems([item("a", { packs: ["gone"] })], "gone", [], [cats])).toEqual([]);
  });

  it("shows a pack with the item picked for it, else its newest, while it is in the pack", () => {
    const items = [item("new", { packs: ["p1"] }), item("old", { packs: ["p1"] }), item("other")];

    expect(packIcon(cats, items)).toBe(items[0]);
    expect(packIcon({ ...cats, icon: "old" }, items)).toBe(items[1]);
    // Picked, then taken out of the pack.
    expect(packIcon({ ...cats, icon: "other" }, items)).toBe(items[0]);
    expect(packIcon(empty, items)).toBeNull();
  });
});
