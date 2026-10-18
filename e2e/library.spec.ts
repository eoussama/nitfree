import { expect, test } from "./fixtures";
import { openPopup, PNG, request } from "./helpers";



test("adds, reads and removes items through the background", async ({ page, extensionId }) => {
  await openPopup(page, extensionId);

  const added = await request<{ id: string }>(page, "library:add", { file: PNG, type: "emoji", title: "dot" });

  expect(added).toMatchObject({ ok: true, data: { title: "dot", type: "emoji", format: "png", width: 1, height: 1, animated: false } });

  const id = added.data!.id;

  expect((await request(page, "library:list")).data).toEqual([added.data]);
  expect((await request(page, "library:file", { id })).data).toEqual(PNG);
  expect(await request(page, "library:remove", { id })).toEqual({ ok: true, data: true });
  expect((await request(page, "library:list")).data).toEqual([]);
});

test("rejects files it cannot read", async ({ page, extensionId }) => {
  await openPopup(page, extensionId);

  const reply = await request(page, "library:add", { file: { $nf: "blob", type: "text/plain", data: "aGVsbG8=" }, type: "emoji", title: "x" });

  expect(reply).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Unsupported file/) } });
});

test("the library lives in the extension, so clearing Discord's site data keeps it", async ({ context, page, extensionId }) => {
  await openPopup(page, extensionId);

  const { data: item } = await request(page, "library:add", { file: PNG, type: "sticker", title: "kept" });
  const discord = await context.newPage();

  await context.route("https://discord.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html class=\"theme-dark\"><head></head><body></body></html>" }));
  await discord.goto("https://discord.com/channels/@me");
  await expect(discord.locator("html")).toHaveAttribute("data-nitfree");

  const discordDatabases = await discord.evaluate(async () => (await indexedDB.databases()).map(database => database.name));

  expect(discordDatabases).not.toContain("nitfree-library");

  const cdp = await context.newCDPSession(discord);

  await cdp.send("Storage.clearDataForOrigin", { origin: "https://discord.com", storageTypes: "all" });

  expect((await request(page, "library:list")).data).toEqual([item]);
});

test("changes are announced to other open extension pages", async ({ context, page, extensionId }) => {
  const listener = await context.newPage();

  await openPopup(listener, extensionId);
  await listener.evaluate(() => {
    const { chrome } = globalThis as unknown as { chrome: { runtime: { onMessage: { addListener: (listener: (message: unknown) => void) => void } } } };
    const events: unknown[] = [];

    Object.assign(globalThis, { nitfreeEvents: events });
    chrome.runtime.onMessage.addListener((message) => {
      if ((message as { kind?: string }).kind === "event") {
        events.push(message);
      }
    });
  });

  await openPopup(page, extensionId);

  const { data: tag } = await request<{ id: string }>(page, "tags:add", { name: "Dots" });
  const { data: item } = await request<{ id: string }>(page, "library:add", { file: PNG, type: "emoji", title: "dot", tags: [tag!.id] });

  await expect.poll(() => listener.evaluate(() => (globalThis as unknown as { nitfreeEvents: unknown[] }).nitfreeEvents)).toEqual([
    { channel: "nitfree", kind: "event", name: "tags:changed", data: { change: "added", ids: [tag!.id] } },
    { channel: "nitfree", kind: "event", name: "library:changed", data: { change: "added", ids: [item!.id] } },
  ]);
});
