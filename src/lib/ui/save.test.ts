// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canStartAdd, startAdd } from "./editor.svelte";
import { clearNotice, notice } from "./notice.svelte";
import { followSaveFromChat } from "./save";



vi.mock("~/components/Overlay.svelte", () => import("~/test/Stub.svelte"));
vi.mock("~/components/Popover.svelte", () => import("~/test/Stub.svelte"));
vi.mock("./editor.svelte", () => ({
  canStartAdd: vi.fn(() => true),
  focusedElement: vi.fn(() => null),
  startAdd: vi.fn(async () => undefined),
}));

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

const MESSAGE = `
  <img id="emoji" data-type="emoji" data-id="111" alt=":blob_cat:" src="https://cdn.discordapp.com/emojis/111.webp">
  <a id="image" data-role="img" href="https://cdn.discordapp.com/attachments/1/2/party-parrot.png"></a>
  <p id="text">hello</p>`;

function rightClick(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, composed: true }));
}

function openMenu(withItems = true): HTMLElement {
  const menu = document.createElement("div");

  menu.setAttribute("role", "menu");
  menu.innerHTML = withItems ? "<div role=\"group\"><div role=\"menuitem\" class=\"item_a colorDefault_b\"></div></div>" : "";
  document.body.append(menu);

  return menu;
}

function serve(response: { ok: boolean; status?: number; statusText?: string }) {
  const fetched = vi.fn(async () => ({ ...response, blob: async () => new Blob(["x"], { type: "image/png" }) }));

  vi.stubGlobal("fetch", fetched);

  return fetched;
}

let stop: () => void;

beforeEach(() => {
  document.body.innerHTML = MESSAGE;
  clearNotice();
  vi.mocked(canStartAdd).mockReturnValue(true);
  vi.mocked(startAdd).mockClear();
  stop = followSaveFromChat();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("followSaveFromChat", () => {
  it("adds Save to Nitfree to the menu a right click on an emoji opens, and saves it from there", async () => {
    const fetched = serve({ ok: true });

    rightClick(document.querySelector("#emoji")!);

    const menu = openMenu();
    const escape = vi.fn();

    menu.addEventListener("keydown", event => escape(event.key));
    await settle();
    flushSync();

    const item = menu.querySelector<HTMLElement>("[data-nitfree-save] [role=menuitem]")!;

    item.click();
    await settle();

    // Discord's menu closes the way Escape closes it, and the add dialog opens with the emoji.
    expect(escape).toHaveBeenCalledWith("Escape");
    expect(fetched).toHaveBeenCalledWith("https://cdn.discordapp.com/emojis/111.png");

    const [files, , preset] = vi.mocked(startAdd).mock.calls[0]!;

    expect([...files].map(file => file.name)).toEqual(["blob_cat"]);
    expect(preset).toMatchObject({ title: "blob_cat", type: "emoji" });

    preset!.onsaved!("blob_cat");
    expect(notice.text).toBe("Saved “blob_cat” to Nitfree.");
  });

  it("names an image after its file, and says why it could not be downloaded", async () => {
    serve({ ok: false, status: 404, statusText: "Not Found" });
    rightClick(document.querySelector("#image")!);

    const menu = openMenu();

    await settle();
    flushSync();
    menu.querySelector<HTMLElement>("[data-nitfree-save] [role=menuitem]")!.click();
    await settle();

    expect(startAdd).not.toHaveBeenCalled();
    expect(notice.text).toBe("Could not save “party_parrot”: 404 Not Found");
  });

  it("says a status alone when the server gives no reason", async () => {
    serve({ ok: false, status: 500, statusText: "" });
    rightClick(document.querySelector("#image")!);

    const menu = openMenu();

    await settle();
    flushSync();
    menu.querySelector<HTMLElement>("[data-nitfree-save] [role=menuitem]")!.click();
    await settle();
    expect(notice.text).toBe("Could not save “party_parrot”: 500");
  });

  it("waits for the dialog that is open to be finished with", async () => {
    const fetched = serve({ ok: true });

    vi.mocked(canStartAdd).mockReturnValue(false);
    rightClick(document.querySelector("#emoji")!);

    const menu = openMenu();

    await settle();
    flushSync();
    menu.querySelector<HTMLElement>("[data-nitfree-save] [role=menuitem]")!.click();
    await settle();

    expect(fetched).not.toHaveBeenCalled();
    expect(notice.text).toBe("Finish with the open Nitfree dialog first.");
  });

  it("adds nothing for a right click on something it cannot save, or outside the page's elements", async () => {
    rightClick(document.querySelector("#text")!);
    openMenu();
    await settle();
    expect(document.querySelector("[data-nitfree-save]")).toBeNull();

    window.dispatchEvent(new MouseEvent("contextmenu"));
    openMenu();
    await settle();
    expect(document.querySelector("[data-nitfree-save]")).toBeNull();
  });

  it("leaves a menu that was open already, and waits for the new one to have items", async () => {
    const old = openMenu();

    rightClick(document.querySelector("#emoji")!);
    await settle();
    expect(old.querySelector("[data-nitfree-save]")).toBeNull();

    const fresh = openMenu(false);

    await settle();
    expect(fresh.querySelector("[data-nitfree-save]")).toBeNull();

    fresh.innerHTML = "<div role=\"group\"></div>";
    await settle();
    flushSync();
    expect(fresh.querySelector("[data-nitfree-save]")).not.toBeNull();
  });

  it("takes the item out of the last menu when another right click opens a new one", async () => {
    rightClick(document.querySelector("#emoji")!);

    const first = openMenu();

    await settle();
    flushSync();
    rightClick(document.querySelector("#image")!);

    const second = openMenu();

    await settle();
    flushSync();
    expect(first.querySelector("[data-nitfree-save]")).toBeNull();
    expect(second.querySelector("[data-nitfree-save]")).not.toBeNull();
  });

  it("stops waiting for a menu that never opens", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    rightClick(document.querySelector("#emoji")!);
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    openMenu();
    await settle();
    expect(document.querySelector("[data-nitfree-save]")).toBeNull();
  });

  it("removes its item and stops listening once stopped", async () => {
    rightClick(document.querySelector("#emoji")!);

    const menu = openMenu();

    await settle();
    flushSync();
    stop();
    flushSync();
    expect(menu.querySelector("[data-nitfree-save]")).toBeNull();

    rightClick(document.querySelector("#emoji")!);
    openMenu();
    await settle();
    expect(document.querySelector("[data-nitfree-save]")).toBeNull();
    stop = () => undefined;
  });
});
