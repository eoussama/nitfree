import type { TItem, TTag } from "~/lib/db";

import { describe, expect, it } from "vitest";

import { findEmojiQuery, SUGGESTION_LIMIT, suggestItems } from "./autocomplete";



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

const titles = (items: TItem[]) => items.map(found => found.title);

describe("findEmojiQuery", () => {
  it("reads a name of two characters or more typed after a colon, at the start or after a space", () => {
    expect(findEmojiQuery(":cat")).toBe("cat");
    expect(findEmojiQuery("look :blob_cat")).toBe("blob_cat");
    expect(findEmojiQuery("hi\n:café")).toBe("café");
    expect(findEmojiQuery("so :+1")).toBe("+1");
  });

  it("ignores a single character, a finished emoji, a time and a link", () => {
    expect(findEmojiQuery(":c")).toBeNull();
    expect(findEmojiQuery(":cat:")).toBeNull();
    expect(findEmojiQuery(":cat ")).toBeNull();
    expect(findEmojiQuery("at 10:30")).toBeNull();
    expect(findEmojiQuery("https://example")).toBeNull();
  });
});

describe("suggestItems", () => {
  const tags: TTag[] = [{ id: "t1", name: "Kitty", color: null, createdAt: 0 }];

  it("ranks titles that start with the name, then titles holding it, then tags, the most sent first", () => {
    const items = [
      item("tagged", { tags: ["t1"] }),
      item("blobcat"),
      item("cat_wave", { usageCount: 1 }),
      item("cat_jam", { usageCount: 5 }),
      item("dog"),
    ];

    expect(titles(suggestItems(items, tags, "cat"))).toEqual(["cat_jam", "cat_wave", "blobcat"]);
    expect(titles(suggestItems(items, tags, "kit"))).toEqual(["tagged"]);
    expect(titles(suggestItems(items, tags, "itt"))).toEqual(["tagged"]);
  });

  it("ignores case and accents, and suggests every type, emojis first, then the most sent, among the same match", () => {
    const items = [
      item("cafe_image", { type: "image", usageCount: 9 }),
      item("cafe_gif", { type: "gif" }),
      item("Café"),
      item("cafe_sticker", { type: "sticker" }),
      item("the_cafe", { type: "emoji" }),
    ];

    expect(titles(suggestItems(items, [], "CAFE"))).toEqual(["Café", "cafe_image", "cafe_gif", "cafe_sticker", "the_cafe"]);
  });

  it("keeps the best few", () => {
    const items = Array.from({ length: 30 }, (_, index) => item(`cat_${String(index).padStart(2, "0")}`));

    expect(suggestItems(items, [], "cat")).toHaveLength(SUGGESTION_LIMIT);
    expect(titles(suggestItems(items, [], "cat", 2))).toEqual(["cat_00", "cat_01"]);
  });
});
