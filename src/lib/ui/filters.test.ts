import type { TItem, TPack, TTag } from "~/lib/db/types";

import { describe, expect, it } from "vitest";

import { applyFilters, filterCount, findTagOptions, noFilters, packOptions, tagOptions, toggled, typeOptions, withoutMissingPacks, withoutMissingTags } from "./filters";



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

function tag(id: string, name = id): TTag {
  return { id, name, color: null, createdAt: 0 };
}

function pack(id: string, name = id): TPack {
  return { id, name, createdAt: 0 };
}

describe("applyFilters", () => {
  const items = [
    item("a", { type: "emoji", tags: ["cat", "happy"] }),
    item("b", { type: "gif", tags: ["cat"] }),
    item("c", { type: "sticker", tags: ["happy"] }),
    item("d", { type: "gif", tags: [] }),
  ];

  it("keeps everything when nothing is chosen", () => {
    expect(applyFilters(items, noFilters())).toEqual(items);
  });

  it("returns a copy, not the library itself", () => {
    expect(applyFilters(items, noFilters())).not.toBe(items);
  });

  it("keeps only items carrying all the chosen tags", () => {
    expect(applyFilters(items, { types: [], tags: ["cat"], packs: [] }).map(found => found.id)).toEqual(["a", "b"]);
    expect(applyFilters(items, { types: [], tags: ["cat", "happy"], packs: [] }).map(found => found.id)).toEqual(["a"]);
    expect(applyFilters(items, { types: [], tags: ["cat", "missing"], packs: [] })).toEqual([]);
  });

  it("keeps items of any of the chosen types", () => {
    expect(applyFilters(items, { types: ["gif"], tags: [], packs: [] }).map(found => found.id)).toEqual(["b", "d"]);
    expect(applyFilters(items, { types: ["gif", "sticker"], tags: [], packs: [] }).map(found => found.id)).toEqual(["b", "c", "d"]);
  });

  it("combines types and tags", () => {
    expect(applyFilters(items, { types: ["gif"], tags: ["cat"], packs: [] }).map(found => found.id)).toEqual(["b"]);
    expect(applyFilters(items, { types: ["sticker"], tags: ["cat"], packs: [] })).toEqual([]);
  });

  it("keeps items in any of the chosen packs, as an item can be in several", () => {
    const packed = [
      item("a", { packs: ["cats"] }),
      item("b", { packs: ["dogs", "cats"] }),
      item("c", { packs: ["dogs"] }),
      item("d", { packs: [] }),
    ];

    expect(applyFilters(packed, { types: [], tags: [], packs: ["cats"] }).map(found => found.id)).toEqual(["a", "b"]);
    expect(applyFilters(packed, { types: [], tags: [], packs: ["cats", "dogs"] }).map(found => found.id)).toEqual(["a", "b", "c"]);
  });

  it("combines packs with types and tags", () => {
    const packed = [item("a", { type: "gif", tags: ["cat"], packs: ["cats"] }), item("b", { type: "emoji", tags: ["cat"], packs: ["cats"] })];

    expect(applyFilters(packed, { types: ["gif"], tags: ["cat"], packs: ["cats"] }).map(found => found.id)).toEqual(["a"]);
  });
});

describe("toggled", () => {
  it("adds a value, then takes it off again, without touching the list it was given", () => {
    const list = ["a"];

    expect(toggled(list, "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
    expect(list).toEqual(["a"]);
  });
});

describe("filterCount", () => {
  it("counts types, tags and packs together", () => {
    expect(filterCount(noFilters())).toBe(0);
    expect(filterCount({ types: ["gif"], tags: ["a", "b"], packs: ["p"] })).toBe(4);
  });
});

describe("tagOptions", () => {
  const tags = [tag("cat"), tag("dog"), tag("unused")];
  const items = [item("a", { tags: ["cat", "dog"] }), item("b", { tags: ["cat"] })];

  it("counts the items carrying each tag and leaves out tags nothing carries", () => {
    expect(tagOptions(items, tags, [])).toEqual([{ value: "cat", count: 2 }, { value: "dog", count: 1 }]);
  });

  it("keeps a chosen tag nothing carries, so it can be switched off", () => {
    expect(tagOptions(items, tags, ["unused"])).toContainEqual({ value: "unused", count: 0 });
  });

  it("ignores tags on items that are not in the library's tag list", () => {
    expect(tagOptions([item("a", { tags: ["gone"] })], tags, [])).toEqual([]);
  });
});

describe("packOptions", () => {
  it("counts the items in each pack, in the order given, and keeps empty packs", () => {
    const items = [item("a", { packs: ["cats"] }), item("b", { packs: ["cats", "dogs"] })];

    expect(packOptions(items, [pack("dogs"), pack("cats"), pack("new")])).toEqual([
      { value: "dogs", count: 1 },
      { value: "cats", count: 2 },
      { value: "new", count: 0 },
    ]);
  });
});

describe("typeOptions", () => {
  it("counts the items of each type, in the order given", () => {
    const items = [item("a", { type: "gif" }), item("b", { type: "gif" }), item("c", { type: "image" })];

    expect(typeOptions(items, ["emoji", "gif", "image"])).toEqual([
      { value: "emoji", count: 0 },
      { value: "gif", count: 2 },
      { value: "image", count: 1 },
    ]);
  });
});

describe("withoutMissingTags", () => {
  it("drops tags that no longer exist", () => {
    expect(withoutMissingTags({ types: ["gif"], tags: ["cat", "gone"], packs: [] }, [tag("cat")])).toEqual({ types: ["gif"], tags: ["cat"], packs: [] });
  });

  it("returns the same filter when nothing is missing, so nothing re-renders", () => {
    const filters = { types: [], tags: ["cat"], packs: [] };

    expect(withoutMissingTags(filters, [tag("cat")])).toBe(filters);
  });
});

describe("withoutMissingPacks", () => {
  it("drops packs that no longer exist", () => {
    expect(withoutMissingPacks({ types: [], tags: [], packs: ["cats", "gone"] }, [pack("cats")])).toEqual({ types: [], tags: [], packs: ["cats"] });
  });

  it("returns the same filter when nothing is missing, so nothing re-renders", () => {
    const filters = { types: [], tags: [], packs: ["cats"] };

    expect(withoutMissingPacks(filters, [pack("cats")])).toBe(filters);
  });
});

describe("findTagOptions", () => {
  const tags = [tag("1", "Happy Cat"), tag("2", "Dog"), tag("3", "cats")];
  const options = tags.map(({ id }) => ({ value: id, count: 1 }));

  it("keeps the tags whose name contains the text, ignoring case", () => {
    expect(findTagOptions(options, tags, " CAT ").map(option => option.value)).toEqual(["1", "3"]);
  });

  it("keeps every tag for an empty search", () => {
    expect(findTagOptions(options, tags, "  ")).toEqual(options);
  });

  it("finds nothing when no name matches", () => {
    expect(findTagOptions(options, tags, "bird")).toEqual([]);
  });
});
