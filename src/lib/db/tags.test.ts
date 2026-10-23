import type { NitfreeDatabase } from "./schema";

import { beforeEach, describe, expect, it } from "vitest";

import { png } from "~/test/fixtures";

import { createLibrary } from "./library";
import { createTags, tagKey } from "./tags";
import { openTestDatabase, steppingClock } from "./testing";



let db: NitfreeDatabase;
let library: ReturnType<typeof createLibrary>;
let tags: ReturnType<typeof createTags>;

beforeEach(async () => {
  db = await openTestDatabase();

  const clock = steppingClock();

  library = createLibrary(db, clock);
  tags = createTags(db, clock);
});

describe("tags", () => {
  it("normalizes names into keys", () => {
    expect(tagKey("  Funny   Cats ")).toBe("funny cats");
  });

  it("creates, lists by name and keeps names unique regardless of case", async () => {
    const zebra = await tags.add({ name: "Zebra", color: "#ffffff" });
    const apple = await tags.add({ name: "  apple  " });

    expect(apple).toMatchObject({ name: "apple", color: null });
    expect((await tags.list()).map(tag => tag.name)).toEqual(["apple", "Zebra"]);
    expect(await tags.list()).toContainEqual(zebra);
    await expect(tags.add({ name: "ZEBRA" })).rejects.toThrow(/already exists/);
    await expect(tags.add({ name: "  " })).rejects.toThrow(/needs a name/);
  });

  it("renames and recolors, refusing names taken by another tag", async () => {
    const cats = await tags.add({ name: "Cats" });

    await tags.add({ name: "Dogs" });

    expect(await tags.update(cats.id, { name: "CATS", color: "#ff0000" })).toMatchObject({ name: "CATS", color: "#ff0000" });
    await expect(tags.update(cats.id, { name: "dogs" })).rejects.toThrow(/already exists/);
    await expect(tags.update("missing", { name: "x" })).rejects.toThrow(/No tag/);
  });

  it("removing a tag takes it off every item", async () => {
    const cats = await tags.add({ name: "Cats" });
    const cute = await tags.add({ name: "Cute" });
    const a = await library.add({ file: new Blob([png(1, 1)]), type: "image", title: "a", tags: [cats.id, cute.id] });
    const b = await library.add({ file: new Blob([png(2, 2)]), type: "image", title: "b", tags: [cute.id] });

    expect(await tags.remove(cats.id)).toEqual([a.id]);
    expect((await library.get(a.id))?.tags).toEqual([cute.id]);
    expect((await library.get(b.id))?.tags).toEqual([cute.id]);
    expect(await tags.list()).toHaveLength(1);
    expect(await db.items.where("tags").equals(cats.id).count()).toBe(0);
  });
});

describe("ensure and clear", () => {
  it("finds a tag whatever its case, or creates it", async () => {
    const created = await tags.ensure({ name: "Cats", color: "#fff" });
    const found = await tags.ensure({ name: " cats ", color: "#000" });

    expect(created.created).toBe(true);
    expect(found).toEqual({ tag: created.tag, created: false });
    expect(await tags.list()).toHaveLength(1);
  });

  it("clears every tag", async () => {
    const { tag } = await tags.ensure({ name: "a" });

    expect(await tags.clear()).toEqual([tag.id]);
    expect(await tags.list()).toEqual([]);
  });
});
