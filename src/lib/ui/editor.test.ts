// @vitest-environment happy-dom
import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyEdits, NO_EDITS } from "~/lib/media/edit";
import { imageFingerprint } from "~/lib/media/fingerprint";
import { sendMessage } from "~/lib/messaging";
import { gif, png } from "~/test/fixtures";

import {
  canStartAdd,
  closeEditor,
  convertDraft,
  duplicateWarning,
  editDraft,
  editFromView,
  editor,
  editSource,
  focusedElement,
  isUsable,
  removeDraft,
  replaceFile,
  resetEditor,
  revertDraft,
  saveEditor,
  startAdd,
  startEdit,
  startView,
} from "./editor.svelte";
import { library } from "./library.svelte";
import { thumbnail } from "./thumbnails";



vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn() }));
vi.mock("~/lib/media/fingerprint", async original => ({ ...await original<object>(), imageFingerprint: vi.fn(async () => null) }));
vi.mock("~/lib/media/edit", async original => ({ ...await original<object>(), applyEdits: vi.fn() }));
vi.mock("./thumbnails", () => ({ thumbnail: vi.fn(async () => "blob:thumbnail"), forgetThumbnails: vi.fn() }));

type THandler = (data: never) => unknown;

const send = vi.mocked(sendMessage);
const fingerprint = vi.mocked(imageFingerprint);
const edited = vi.mocked(applyEdits);
let handlers: Record<string, THandler>;

const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
const image = (name = "party.png", bytes: Uint8Array<ArrayBuffer> = png(8, 8)) => new File([bytes], name, { type: "image/png" });

function item(patch: Partial<TItem> = {}): TItem {
  return { id: "a", type: "emoji", title: "wave", description: "", tags: [], packs: [], favorite: false, hash: "h", size: 10, format: "png", mime: "image/png", width: 8, height: 8, animated: false, createdAt: 0, updatedAt: 0, usedAt: null, usageCount: 0, ...patch };
}

function answer(patch: Record<string, THandler>): void {
  Object.assign(handlers, patch);
}

async function hashOf(bytes: Uint8Array): Promise<string> {
  const { hashBytes } = await import("~/lib/db/library");

  return hashBytes(new Uint8Array(bytes));
}

beforeEach(() => {
  resetEditor();
  Object.assign(library, { items: [], tags: [], packs: [], loaded: true, error: null });
  fingerprint.mockReset().mockResolvedValue(null);
  edited.mockReset();
  vi.mocked(thumbnail).mockReset().mockResolvedValue("blob:thumbnail");
  handlers = {
    "library:similar": () => null,
    "library:file": () => new Blob([png(8, 8)], { type: "image/png" }),
    "library:add": () => item(),
    "library:update": () => item(),
    "tags:add": ({ name }: { name: string }) => ({ id: `tag-${name}`, name }),
    "tags:list": () => [],
    "packs:add": ({ name }: { name: string }) => ({ id: `pack-${name}`, name }),
    "packs:list": () => [],
  };
  send.mockReset().mockImplementation((async (name: string, data: never) => {
    const handler = handlers[name];

    if (!handler) {
      throw new Error(`No handler for "${name}"`);
    }

    return handler(data);
  }) as never);
  document.body.innerHTML = "";
});

afterEach(() => {
  resetEditor();
});

describe("the editor, in detail", () => {
  const revoked = () => vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url);

  beforeEach(() => {
    let count = 0;

    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${count++}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells a file it does not take from one it cannot read, by name and by type, and owns no URL for either", async () => {
    const unreadable = (file: File) => {
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("Moved."));

      return file;
    };

    await startAdd([
      unreadable(new File(["?"], "notes.txt", { type: "text/plain" })),
      unreadable(new File(["?"], "odd.bmp", { type: "image/bmp" })),
      unreadable(new File(["?"], "x.png", { type: "" })),
      new File(["?"], "odd.bmp", { type: "image/bmp" }),
    ]);

    expect(editor.drafts.map(draft => [draft.error, draft.ownsUrl, draft.url])).toEqual([
      ["This file is not a supported image or video.", false, null],
      ["This file could not be read. It may have been moved or changed.", false, null],
      ["This file could not be read. It may have been moved or changed.", false, null],
      ["This file is not a supported image or video.", false, null],
    ]);
    expect(editor.drafts[0]).toMatchObject({ description: "", tags: [], packs: [] });
  });

  it("lets go of the URLs of a dialog it opens over, closes, or drops a file from", async () => {
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);
    removeDraft(editor.drafts[0]!);
    expect(revoked()).toEqual(["blob:0"]);

    await startAdd([image("c.png", png(7, 7))]);
    startEdit(item());
    expect(revoked()).toEqual(["blob:0", "blob:1", "blob:2"]);

    // The item's thumbnail is not the editor's to let go of.
    await wait();
    closeEditor();
    expect(revoked()).toEqual(["blob:0", "blob:1", "blob:2"]);
  });

  it("lets go of the URLs of files read for a dialog that is gone, or that another request opened", async () => {
    await startAdd([image("a.png")]);

    const joining = startAdd([image("b.png", png(9, 9))]);

    closeEditor();
    await joining;
    expect(revoked()).toEqual(["blob:0", "blob:1"]);

    const first = startAdd([image("c.png", png(7, 7))]);
    const second = startAdd([image("d.png", png(6, 6))]);

    await Promise.all([first, second]);
    expect(revoked()).toEqual(["blob:0", "blob:1", "blob:2"]);
    expect(editor.drafts.map(draft => draft.url)).toEqual(["blob:3"]);
  });

  it("replaces the right file, letting go of what it replaces, or of what it read for nothing", async () => {
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);

    const [a, b] = editor.drafts;

    await replaceFile(b!, image("c.png", png(7, 7)));
    expect(editor.drafts.map(draft => draft.file?.name)).toEqual(["a.png", "c.png"]);
    expect(revoked()).toEqual(["blob:1"]);

    const gone = replaceFile(a!, image("d.png", png(6, 6)));

    editor.drafts = editor.drafts.slice(1);
    await gone;
    expect(editor.drafts.map(draft => draft.file?.name)).toEqual(["c.png"]);
    expect(revoked()).toEqual(["blob:1", "blob:3"]);

    const closed = replaceFile(editor.drafts[0]!, image("e.png", png(5, 5)));

    closeEditor();
    await closed;
    expect(revoked()).toEqual(["blob:1", "blob:3", "blob:2", "blob:4"]);
    expect(editor.reading).toBe(0);
  });

  it("gives an edited image the type it was made as", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    await startAdd([image("a.gif", gif(8, 8, 2))]);
    await editDraft(editor.drafts[0]!, editor.drafts[0]!.file!, NO_EDITS);
    expect(editor.drafts[0]!.file?.type).toBe("image/png");
  });

  it("gives an item's draft its details as the library has them, by id", () => {
    library.tags = [{ id: "t0", name: "Dogs", color: null, createdAt: 0 }, { id: "t1", name: "Cats", color: null, createdAt: 0 }];
    library.packs = [{ id: "p0", name: "Other", icon: null, createdAt: 0 }, { id: "p1", name: "Pets", icon: null, createdAt: 0 }];
    startEdit(item({ tags: ["t1"], packs: ["p1"], format: "gif", mime: "image/gif", width: 3, height: 2, animated: true }));
    expect(editor.drafts[0]).toMatchObject({ tags: ["Cats"], packs: ["Pets"], ownsUrl: false, info: { format: "gif", mime: "image/gif", width: 3, height: 2, animated: true } });
  });

  it("switches from a view to editing once, keeping the draft's place and picture, and then what the user typed", async () => {
    library.items = [item({ id: "z", title: "other" }), item({ title: "renamed" })];
    startView(item());
    await wait();

    const { key } = editor.drafts[0]!;

    editFromView();
    expect(editor.drafts[0]).toMatchObject({ key, url: "blob:thumbnail", title: "renamed" });

    editor.drafts[0]!.title = "typed";
    library.items = [item({ title: "again" })];
    editFromView();
    expect(editor.drafts[0]!.title).toBe("typed");
  });

  it("asks the library for the edited item's file by id, and gives it as it is", async () => {
    startEdit(item());

    const file = await editSource(editor.drafts[0]!);

    expect(send).toHaveBeenCalledWith("library:file", { id: "a" });
    expect(file).toMatchObject({ name: "wave.png", type: "image/png", size: png(8, 8).length });
  });

  it("does not warn of a file with no hash listed after another, nor of the item an edited copy is made from", async () => {
    await startAdd([new File(["?"], "x.txt"), new File(["?"], "y.txt")]);
    expect(duplicateWarning(editor.drafts[1]!)).toBeNull();

    const result = png(4, 4);

    edited.mockResolvedValue(new Blob([result], { type: "image/png" }));
    fingerprint.mockResolvedValue("0000000000000000ffffff");
    answer({ "library:similar": () => item() });
    library.items = [item({ hash: await hashOf(result) })];
    startEdit(item());
    await editDraft(editor.drafts[0]!, image("wave.png"), NO_EDITS);
    expect(editor.drafts[0]!.copyOf?.id).toBe("a");
    expect(duplicateWarning(editor.drafts[0]!)).toBeNull();
  });

  it("names the item a file looks like, and not another", async () => {
    library.items = [item({ id: "z", title: "other" }), item({ id: "look", title: "look" })];
    fingerprint.mockResolvedValue("0000000000000000ffffff");
    answer({ "library:similar": () => item({ id: "look", title: "look" }) });
    await startAdd([image()]);
    expect(duplicateWarning(editor.drafts[0]!)).toBe("This looks like “look”, already in your library. Saving it keeps a second copy.");
  });

  it("does not compare pictures with a file listed above when either has no fingerprint", async () => {
    fingerprint.mockResolvedValueOnce("0000000000000000ffffff").mockResolvedValueOnce(null).mockResolvedValueOnce("0000000000000000ffffff");
    await startAdd([image("a.png", png(8, 8)), image("b.png", png(9, 9)), image("c.png", png(7, 7))]);

    expect(duplicateWarning(editor.drafts[1]!)).toBeNull();
    // The draft above it with no fingerprint is passed over; the first is like it.
    expect(duplicateWarning(editor.drafts[2]!)).toBe("This looks like a file listed above. Adding both keeps two copies.");

    editor.drafts[0]!.fingerprint = null;
    expect(duplicateWarning(editor.drafts[2]!)).toBeNull();
  });

  it("edits the right draft, letting go of what it replaces, or of what it made for nothing", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);

    const [a, b] = editor.drafts;

    await editDraft(b!, b!.file!, NO_EDITS);
    expect(editor.drafts.map(draft => draft.source?.name ?? null)).toEqual([null, "b.png"]);
    expect(revoked()).toEqual(["blob:1"]);

    const gone = editDraft(a!, a!.file!, NO_EDITS);

    editor.drafts = editor.drafts.slice(1);
    await gone;
    expect(editor.drafts.map(draft => draft.source?.name)).toEqual(["b.png"]);
    expect(revoked()).toEqual(["blob:1", "blob:3"]);

    // Going back lets go of the edited image.
    await revertDraft(editor.drafts[0]!);
    expect(revoked()).toEqual(["blob:1", "blob:3", "blob:2"]);

    const late = editDraft(editor.drafts[0]!, editor.drafts[0]!.file!, NO_EDITS);

    closeEditor();
    await late;
    expect(revoked()).toEqual(["blob:1", "blob:3", "blob:2", "blob:4", "blob:5"]);
  });

  it("goes back only for a draft still in the dialog, to the item the copy was made from, with its picture", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    library.items = [item({ id: "z", title: "other" }), item()];
    startEdit(item());
    await wait();
    await editDraft(editor.drafts[0]!, image("wave.png"), NO_EDITS);

    const draft = editor.drafts[0]!;

    await revertDraft({ ...draft, key: -1 });
    expect(draft.source).not.toBeNull();

    vi.mocked(thumbnail).mockResolvedValue("blob:again");
    await revertDraft(draft);
    expect(editor.item?.id).toBe("a");
    expect(revoked()).toEqual(["blob:0"]);
    await wait();
    expect(draft.url).toBe("blob:again");
  });

  it("lets go of what it read going back once the dialog is gone, or the draft is", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    await startAdd([image("a.png")]);
    await editDraft(editor.drafts[0]!, editor.drafts[0]!.file!, NO_EDITS);

    const draft = editor.drafts[0]!;
    const reverting = revertDraft(draft);

    editor.drafts = [];
    await reverting;
    expect(revoked()).toEqual(["blob:0", "blob:2"]);
  });

  it("converts the right video, of the GIF's type, and lets go of what it replaces or made for nothing", async () => {
    const clip = { start: 0, end: 1, rate: 10, size: 320 };
    const video = () => new File(["v"], "clip.webm", { type: "video/webm" });

    await startAdd([video(), video()]);

    const [a, b] = editor.drafts;

    await convertDraft(b!, clip, new Blob([gif(8, 8, 2)], { type: "image/gif" }));
    expect(editor.drafts.map(draft => draft.clip)).toEqual([null, clip]);
    expect(b!.file?.type).toBe("image/gif");
    expect(revoked()).toEqual(["blob:1"]);

    const gone = convertDraft(a!, clip, new Blob([gif(8, 8, 2)], { type: "image/gif" }));

    editor.drafts = editor.drafts.slice(1);
    await gone;
    expect(revoked()).toEqual(["blob:1", "blob:3"]);
  });

  it("finds the tag another tab made by its name, among others", async () => {
    answer({
      "tags:add": () => {
        throw new Error("Taken.");
      },
      "tags:list": () => [{ id: "t8", name: "Dogs" }, { id: "t9", name: "Cats" }],
    });
    await startAdd([image("a.png")]);
    editor.drafts[0]!.tags = ["cats"];
    await saveEditor();
    expect(send).toHaveBeenCalledWith("library:add", expect.objectContaining({ tags: ["t9"] }));
  });

  it("saves only the usable files, refuses when any of them has no name, and is saving meanwhile", async () => {
    await startAdd([image("a.png"), image("b.png", png(9, 9)), new File(["?"], "x.txt")]);
    editor.drafts[1]!.title = " ";
    expect(await saveEditor()).toBe(false);

    editor.drafts[1]!.title = "b";
    editor.reading = 1;
    expect(await saveEditor()).toBe(false);
    editor.reading = 0;
    editor.saving = true;
    expect(await saveEditor()).toBe(false);
    editor.saving = false;

    let finish!: () => void;

    answer({ "library:add": () => new Promise<TItem>(resolve => (finish = () => resolve(item()))) });

    const saving = saveEditor();

    await wait();
    expect(editor.saving).toBe(true);
    answer({ "library:add": () => item() });
    finish();
    expect(await saving).toBe(true);
    expect(send.mock.calls.filter(([name]) => name === "library:add")).toHaveLength(2);
  });

  it("lets go of the saved files, and keeps those that failed", async () => {
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);
    answer({
      "library:add": ({ title }: { title: string }) => {
        if (title === "b") {
          throw new Error("Disk full.");
        }

        return item();
      },
    });
    await saveEditor();
    expect(revoked()).toEqual(["blob:0"]);
  });
});

describe("focusedElement", () => {
  it("finds what has focus, inside shadow roots too, and nothing when the page has it", () => {
    expect(focusedElement()).toBeNull();

    const host = document.body.appendChild(document.createElement("div"));
    const field = document.createElement("input");

    host.attachShadow({ mode: "open" }).append(field);
    field.focus();
    expect(focusedElement()).toBe(field);

    const plain = document.body.appendChild(document.createElement("button"));

    plain.focus();
    expect(focusedElement()).toBe(plain);
  });
});

describe("startAdd", () => {
  it("opens the add dialog with each file's name, type and details, and the reason a file cannot be used", async () => {
    fingerprint.mockResolvedValue("0000000000000000ffffff");

    await startAdd([image("Party Parrot.png"), new File(["hi"], "notes.txt", { type: "text/plain" })]);

    const [ok, text] = editor.drafts;

    expect(editor.mode).toBe("add");
    expect(ok).toMatchObject({ title: "Party_Parrot", type: "emoji", error: null, fingerprint: "0000000000000000ffffff", ownsUrl: true });
    expect(ok!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ok!.url).toMatch(/^blob:/);
    expect(isUsable(ok!)).toBe(true);
    expect(text).toMatchObject({ info: null, error: "This file is not a supported image or video." });
    expect(isUsable(text!)).toBe(false);
    expect(send).toHaveBeenCalledWith("library:similar", { fingerprint: "0000000000000000ffffff", width: 8, height: 8 });
  });

  it("fills in what is already known about the files, and does nothing with none", async () => {
    const onsaved = vi.fn();

    await startAdd([], null);
    expect(editor.mode).toBeNull();

    await startAdd([image("x.png")], null, { title: "blob_cat", type: "sticker", onsaved });
    expect(editor.drafts[0]).toMatchObject({ title: "blob_cat", type: "sticker", onsaved });
  });

  it("says a file that cannot be read, or an image of a kind it does not take, cannot be used", async () => {
    const moved = image();

    vi.spyOn(moved, "arrayBuffer").mockRejectedValue(new Error("Moved."));
    await startAdd([moved, new File(["?"], "odd.bmp", { type: "image/bmp" })]);
    expect(editor.drafts.map(draft => draft.error)).toEqual(["This file could not be read. It may have been moved or changed.", "This file is not a supported image or video."]);
  });

  it("finds no similar item when the fingerprint or the background fails", async () => {
    fingerprint.mockRejectedValueOnce(new Error("No canvas.")).mockResolvedValueOnce("0000000000000000ffffff");
    answer({
      "library:similar": () => {
        throw new Error("Restarting.");
      },
    });

    await startAdd([image("a.png"), image("b.png", png(9, 9))]);
    expect(editor.drafts.map(draft => [draft.fingerprint, draft.similar])).toEqual([[null, null], ["0000000000000000ffffff", null]]);
  });

  it("takes a video as it is, to be made into a GIF before it can be added", async () => {
    await startAdd([new File(["v"], "clip.webm", { type: "video/webm" })]);
    expect(editor.drafts[0]).toMatchObject({ file: null, info: null, type: "sticker", error: null, clip: null, ownsUrl: true });
    expect(editor.drafts[0]!.video?.name).toBe("clip.webm");
  });

  it("adds files to the add dialog that is open, unless it closes while they are read", async () => {
    await startAdd([image("a.png")]);
    await startAdd([image("b.png", png(9, 9))]);
    expect(editor.drafts.map(draft => draft.title)).toEqual(["a", "b"]);

    const late = startAdd([image("c.png", png(7, 7))]);

    expect(editor.reading).toBe(1);
    closeEditor();
    await late;
    expect(editor.mode).toBeNull();
    expect(editor.drafts).toEqual([]);
  });

  it("opens for the latest files only, and not over a dialog that opened meanwhile", async () => {
    const first = startAdd([image("first.png")]);
    const second = startAdd([image("second.png", png(9, 9))]);

    await Promise.all([first, second]);
    expect(editor.drafts.map(draft => draft.title)).toEqual(["second"]);

    resetEditor();

    const pending = startAdd([image("late.png")]);

    startEdit(item());
    await pending;
    expect(editor.mode).toBe("edit");
  });

  it("takes no files while an item is edited or the dialog saves", async () => {
    startEdit(item());
    expect(canStartAdd()).toBe(false);
    await startAdd([image()]);
    expect(editor.mode).toBe("edit");

    resetEditor();
    editor.saving = true;
    expect(canStartAdd()).toBe(false);
  });
});

describe("duplicateWarning", () => {
  it("warns of a file already in the library, listed above, or showing the same picture", async () => {
    const bytes = png(8, 8);
    const hash = await hashOf(bytes);

    library.items = [item({ id: "same", title: "same", hash }), item({ id: "look", title: "look" })];
    fingerprint.mockResolvedValue("0000000000000000ffffff");
    answer({ "library:similar": () => item({ id: "look", title: "look" }) });

    await startAdd([image("a.png", bytes), image("b.png", bytes)]);
    expect(duplicateWarning(editor.drafts[0]!)).toBe("This file is already in your library as “same”. Saving it keeps a second copy.");

    library.items = [item({ id: "look", title: "look" })];
    expect(duplicateWarning(editor.drafts[1]!)).toBe("This file is also listed above. Adding both keeps two copies.");
    expect(duplicateWarning(editor.drafts[0]!)).toBe("This looks like “look”, already in your library. Saving it keeps a second copy.");

    // Gone from the library meanwhile, it is not named.
    library.items = [];
    expect(duplicateWarning(editor.drafts[0]!)).toBeNull();
  });

  it("warns of a file that looks like one listed above, and of nothing for a draft with no hash", async () => {
    fingerprint.mockResolvedValue("0000000000000000ffffff");
    await startAdd([image("a.png", png(8, 8)), image("b.png", png(9, 9)), new File(["?"], "x.txt")]);

    expect(duplicateWarning(editor.drafts[0]!)).toBeNull();
    expect(duplicateWarning(editor.drafts[1]!)).toBe("This looks like a file listed above. Adding both keeps two copies.");
    expect(duplicateWarning(editor.drafts[2]!)).toBeNull();
  });

  it("does not warn of the item being edited", async () => {
    const bytes = png(8, 8);
    const self = item({ hash: await hashOf(bytes) });

    library.items = [self];
    startEdit(self);
    await replaceFile(editor.drafts[0]!, image("again.png", bytes));
    expect(duplicateWarning(editor.drafts[0]!)).toBeNull();
  });
});

describe("startEdit and startView", () => {
  it("open an item with its details, its tags and packs by name, and its thumbnail", async () => {
    library.tags = [{ id: "t1", name: "Cats", color: null, createdAt: 0 }];
    library.packs = [{ id: "p1", name: "Pets", icon: null, createdAt: 0 }];

    const button = document.body.appendChild(document.createElement("button"));

    startView(item({ tags: ["t1", "gone"], packs: ["p1", "gone"] }), button);
    expect(editor.mode).toBe("view");
    expect(editor.drafts[0]).toMatchObject({ file: null, hash: null, tags: ["Cats"], packs: ["Pets"], title: "wave" });
    await wait();
    expect(editor.drafts[0]!.url).toBe("blob:thumbnail");

    closeEditor();
    expect(document.activeElement).toBe(button);
  });

  it("do nothing while saving, and keep a file picked before the thumbnail came", async () => {
    editor.saving = true;
    startEdit(item());
    startView(item());
    expect(editor.mode).toBeNull();

    editor.saving = false;

    let show!: (url: string) => void;

    vi.mocked(thumbnail).mockReturnValue(new Promise(resolve => (show = resolve)));
    startEdit(item());
    await replaceFile(editor.drafts[0]!, image("new.png"));
    show("blob:late");
    await wait();
    expect(editor.drafts[0]!.url).not.toBe("blob:late");
  });

  it("switches a view to editing the item as the library has it now", () => {
    library.items = [item({ title: "renamed" })];
    startView(item());
    editFromView();
    expect(editor).toMatchObject({ mode: "edit", item: { title: "renamed" } });
    expect(editor.drafts[0]!.title).toBe("renamed");

    editFromView();
    expect(editor.mode).toBe("edit");

    library.items = [];
    startView(item());
    editFromView();
    expect(editor.mode).toBe("view");
  });
});

describe("replaceFile", () => {
  it("swaps the file, or keeps it with the reason when the new one cannot be used", async () => {
    startEdit(item());

    const draft = editor.drafts[0]!;

    await replaceFile(draft, new File(["?"], "notes.txt"));
    expect(draft.error).toBe("This file is not a supported image or video.");
    expect(draft.file).toBeNull();

    await replaceFile(draft, image("new.png"));
    expect(draft).toMatchObject({ error: null, source: null, edits: null, video: null });
    expect(draft.file?.name).toBe("new.png");
  });

  it("changes nothing once the dialog closed, or the draft went, meanwhile", async () => {
    startEdit(item());

    const draft = editor.drafts[0]!;
    const closed = replaceFile(draft, image());

    closeEditor();
    await closed;
    expect(editor.drafts).toEqual([]);

    await startAdd([image("a.png"), image("b.png", png(9, 9))]);

    const gone = editor.drafts[0]!;
    const replacing = replaceFile(gone, image("c.png"));

    editor.drafts = editor.drafts.slice(1);
    await replacing;
    expect(editor.drafts.map(found => found.title)).toEqual(["b"]);
  });
});

describe("editSource", () => {
  it("is the original of an edited draft, else its file, else the edited item's file from the library", async () => {
    await startAdd([image("a.png")]);

    const draft = editor.drafts[0]!;

    expect(await editSource(draft)).toBe(draft.file);

    resetEditor();
    startEdit(item({ format: "gif" }));
    expect((await editSource(editor.drafts[0]!))?.name).toBe("wave.gif");

    answer({ "library:file": () => null });
    expect(await editSource(editor.drafts[0]!)).toBeNull();

    resetEditor();
    await startAdd([new File(["v"], "clip.webm", { type: "video/webm" })]);
    expect(await editSource(editor.drafts[0]!)).toBeNull();
  });
});

describe("editDraft and revertDraft", () => {
  const crop = { ...NO_EDITS, crop: { x: 0, y: 0, width: 4, height: 4 } };

  it("give a draft the edited image, keeping its original, and back", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    await startAdd([image("party.gif", gif(8, 8, 2))]);

    const draft = editor.drafts[0]!;
    const original = draft.file!;

    await editDraft(draft, original, crop);
    expect(draft.file?.name).toBe("party.png");
    expect(draft).toMatchObject({ source: original, edits: crop, copyOf: null });

    await revertDraft(draft);
    expect(draft).toMatchObject({ file: original, source: null, edits: null });

    // Nothing to go back to.
    await revertDraft(draft);
    expect(draft.file).toBe(original);
  });

  it("make an edited item a new item, and going back edits the item again while it is there", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    library.items = [item()];
    startEdit(item());

    const draft = editor.drafts[0]!;

    draft.title = "kept";
    await editDraft(draft, image("wave.png"), crop);
    expect(editor).toMatchObject({ mode: "add", item: null });
    expect(draft.copyOf?.id).toBe("a");

    await revertDraft(draft);
    expect(editor).toMatchObject({ mode: "edit", item: { id: "a" } });
    expect(draft.title).toBe("kept");

    // The item went from the library meanwhile: the copy stays a new item, with its original back.
    await editDraft(draft, image("wave.png"), crop);
    library.items = [];
    await revertDraft(draft);
    expect(editor.mode).toBe("add");
    expect(draft).toMatchObject({ source: null, copyOf: null });
  });

  it("refuse an original that is not an image", async () => {
    await startAdd([image()]);
    await expect(editDraft(editor.drafts[0]!, new File(["?"], "x.txt"), crop)).rejects.toThrow("This file is not a supported image or video.");
  });

  it("change nothing once the dialog closed meanwhile", async () => {
    edited.mockResolvedValue(new Blob([png(4, 4)], { type: "image/png" }));
    await startAdd([image()]);

    const draft = editor.drafts[0]!;
    const editing = editDraft(draft, draft.file!, crop);

    closeEditor();
    await editing;
    expect(editor.drafts).toEqual([]);

    await startAdd([image()]);

    const again = editor.drafts[0]!;

    await editDraft(again, again.file!, crop);

    const reverting = revertDraft(again);

    closeEditor();
    await reverting;
    expect(editor.drafts).toEqual([]);
  });
});

describe("convertDraft", () => {
  const clip = { start: 0, end: 1, rate: 10, size: 320 };

  it("gives a video's draft its GIF, choosing the type only the first time", async () => {
    await startAdd([new File(["v"], "clip.webm", { type: "video/webm" })]);

    const draft = editor.drafts[0]!;

    await convertDraft(draft, clip, new Blob([gif(480, 270, 2)], { type: "image/gif" }));
    expect(draft).toMatchObject({ type: "gif", clip, source: null, edits: null });
    expect(draft.file?.name).toBe("clip.gif");

    draft.type = "image";
    await convertDraft(draft, clip, new Blob([gif(160, 90, 2)], { type: "image/gif" }));
    expect(draft.type).toBe("image");
  });

  it("does nothing for a draft with no video, or once the dialog closed", async () => {
    await startAdd([image()]);
    await convertDraft(editor.drafts[0]!, clip, new Blob([gif(8, 8, 2)], { type: "image/gif" }));
    expect(editor.drafts[0]!.clip).toBeNull();

    resetEditor();
    await startAdd([new File(["v"], "clip.webm", { type: "video/webm" })]);

    const converting = convertDraft(editor.drafts[0]!, clip, new Blob([gif(8, 8, 2)], { type: "image/gif" }));

    closeEditor();
    await converting;
    expect(editor.drafts).toEqual([]);
  });

  it("leaves the type alone when the GIF cannot be read", async () => {
    await startAdd([new File(["v"], "clip.webm", { type: "video/webm" })]);
    await convertDraft(editor.drafts[0]!, clip, new Blob(["broken"], { type: "image/gif" }));
    expect(editor.drafts[0]).toMatchObject({ type: "sticker", info: null });
  });
});

describe("removeDraft and closeEditor", () => {
  it("drop one file, closing the dialog with the last, but not while it saves", async () => {
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);

    const [a, b] = editor.drafts;

    editor.saving = true;
    removeDraft(a!);
    closeEditor();
    expect(editor.drafts).toHaveLength(2);

    editor.saving = false;
    removeDraft(a!);
    expect(editor.drafts.map(draft => draft.title)).toEqual(["b"]);
    removeDraft(b!);
    expect(editor.mode).toBeNull();
    closeEditor();
  });

  it("give focus back only to what is still on the page", async () => {
    const button = document.body.appendChild(document.createElement("button"));

    await startAdd([image()], button);
    button.remove();
    closeEditor();
    expect(document.activeElement).not.toBe(button);
  });
});

describe("saveEditor", () => {
  it("adds every usable file with its details, making the tags and packs it names, then closes", async () => {
    const onsaved = vi.fn();

    library.tags = [{ id: "t1", name: "Cats", color: null, createdAt: 0 }];
    await startAdd([image("a.png"), new File(["?"], "x.txt")], null, { onsaved });

    const [draft] = editor.drafts;

    Object.assign(draft!, { title: "  wave  ", description: " hi ", tags: ["cats", "New"], packs: ["Pets"] });

    expect(await saveEditor()).toBe(true);
    expect(send).toHaveBeenCalledWith("library:add", expect.objectContaining({ title: "wave", description: "hi", tags: ["t1", "tag-New"], packs: ["pack-Pets"] }));
    expect(onsaved).toHaveBeenCalledWith("wave");
    expect(editor.mode).toBeNull();
  });

  it("updates the edited item, with its new file when one was picked", async () => {
    startEdit(item());
    expect(await saveEditor()).toBe(true);
    expect(send).toHaveBeenLastCalledWith("library:update", { id: "a", patch: expect.not.objectContaining({ file: expect.anything() }) });

    startEdit(item());
    await replaceFile(editor.drafts[0]!, image("new.png"));
    await saveEditor();
    expect(send).toHaveBeenLastCalledWith("library:update", { id: "a", patch: expect.objectContaining({ file: expect.any(File) }) });
  });

  it("changes nothing for an item that is only shown", async () => {
    startView(item());
    expect(await saveEditor()).toBe(true);
    expect(send).not.toHaveBeenCalledWith("library:update", expect.anything());
    expect(send).not.toHaveBeenCalledWith("library:add", expect.anything());
  });

  it("saves nothing while it saves or reads, with no dialog, or when a name is missing", async () => {
    expect(await saveEditor()).toBe(false);

    await startAdd([image()]);
    editor.drafts[0]!.title = " ";
    expect(await saveEditor()).toBe(false);
    expect(editor.error).toBe("Every item needs a name.");

    editor.reading = 1;
    expect(await saveEditor()).toBe(false);
    editor.reading = 0;
    editor.saving = true;
    expect(await saveEditor()).toBe(false);
  });

  it("keeps the files that failed, with the reason, so saving again retries them", async () => {
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);
    answer({
      "library:add": ({ title }: { title: string }) => {
        if (title === "b") {
          throw new Error("Disk full.");
        }

        return item();
      },
    });

    expect(await saveEditor()).toBe(false);
    expect(editor.drafts.map(draft => [draft.title, draft.error])).toEqual([["b", "Could not save: Disk full."]]);
    expect(editor.saving).toBe(false);
  });

  it("finds a tag or pack another tab made meanwhile, and fails when it is nowhere", async () => {
    answer({
      "tags:add": () => {
        throw new Error("Taken.");
      },
      "tags:list": () => [{ id: "t9", name: "Cats" }],
      "packs:add": () => {
        throw new Error("Taken.");
      },
      "packs:list": () => [],
    });
    await startAdd([image("a.png"), image("b.png", png(9, 9))]);
    editor.drafts[0]!.tags = ["cats"];
    editor.drafts[1]!.packs = ["Pets"];

    expect(await saveEditor()).toBe(false);
    expect(send).toHaveBeenCalledWith("library:add", expect.objectContaining({ title: "a", tags: ["t9"] }));
    expect(editor.drafts.map(draft => draft.error)).toEqual(["Could not save: Taken."]);
  });

  it("stops when Nitfree is torn down while it saves", async () => {
    let finish!: () => void;

    answer({ "library:add": () => new Promise<TItem>(resolve => (finish = () => resolve(item()))) });
    await startAdd([image()]);

    const saving = saveEditor();

    await wait();
    resetEditor();
    finish();
    expect(await saving).toBe(false);
  });
});
