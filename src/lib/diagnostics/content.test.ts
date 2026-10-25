// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { sendMessage, sendTabMessage } from "~/lib/messaging";

import { runChecks } from "./checks";
import { composerProblems, startDiagnostics } from "./content";



vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn(async () => undefined) }));
vi.mock("./checks", async original => ({ ...await original<object>(), runChecks: vi.fn(async () => [{ id: "theme", status: "ok" }]) }));

const COMPOSER = `
  <form class="channelTextArea_x">
    <div class="buttons_a">
      <div data-nitfree-toggler></div>
      <div class="expression-picker-chat-input-button buttonContainer_1">
        <div role="button" class="button_b emojiButton_e" aria-controls="emojis"><div class="buttonWrapper_w"></div></div>
      </div>
    </div>
    <div role="textbox" data-slate-editor="true" contenteditable="true"></div>
    <div class="uploadInput_u"><input type="file"></div>
  </form>`;

const reports = () => vi.mocked(sendMessage).mock.calls;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/channels/1/2");
  vi.mocked(sendMessage).mockClear().mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("composerProblems", () => {
  it("counts what is missing in the message box, but not the message box itself", () => {
    expect(composerProblems()).toBe(0);

    document.body.innerHTML = COMPOSER;
    expect(composerProblems()).toBe(0);

    document.querySelector("[data-nitfree-toggler]")!.remove();
    document.querySelector(".uploadInput_u")!.remove();
    expect(composerProblems()).toBe(2);
  });
});

describe("startDiagnostics", () => {
  it("tells the background a moment after starting, then only when the count changes", async () => {
    document.body.innerHTML = COMPOSER;

    const stop = startDiagnostics();

    await vi.advanceTimersByTimeAsync(2999);
    expect(reports()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reports()).toEqual([["diagnostics:status", { problems: 0 }]]);

    // A change that keeps the message box working is not told again.
    document.body.append(document.createElement("p"));
    await vi.advanceTimersByTimeAsync(3000);
    expect(reports()).toHaveLength(1);

    document.querySelector("[data-nitfree-toggler]")!.remove();
    await vi.advanceTimersByTimeAsync(2999);
    expect(reports()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reports().at(-1)).toEqual(["diagnostics:status", { problems: 1 }]);

    stop();
  });

  it("checks once per burst of changes", async () => {
    document.body.innerHTML = COMPOSER;

    const stop = startDiagnostics();

    await vi.advanceTimersByTimeAsync(3000);
    document.querySelector("[data-nitfree-toggler]")!.remove();
    await vi.advanceTimersByTimeAsync(1000);
    document.body.append(document.createElement("p"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(reports().at(-1)).toEqual(["diagnostics:status", { problems: 1 }]);
    expect(reports()).toHaveLength(2);

    stop();
  });

  it("keeps going when the background cannot be told", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("Extension context invalidated."));
    document.body.innerHTML = COMPOSER;

    const stop = startDiagnostics();

    await vi.advanceTimersByTimeAsync(3000);
    document.querySelector("[data-nitfree-toggler]")!.remove();
    await vi.advanceTimersByTimeAsync(3000);
    expect(reports()).toHaveLength(2);

    stop();
  });

  it("answers the popup with the page's checks", async () => {
    // The popup's message reaches the tab's listeners, as the browser passes it on.
    vi.spyOn(browser.tabs, "sendMessage").mockImplementation(((_: number, message: unknown) => new Promise((resolve) => {
      void fakeBrowser.runtime.onMessage.trigger(message, {}, resolve);
    })) as never);

    const stop = startDiagnostics();

    expect(await sendTabMessage(1, "diagnostics:run", { interactive: true })).toEqual([{ id: "theme", status: "ok" }]);
    expect(runChecks).toHaveBeenCalledWith(true);

    stop();
    await expect(fakeBrowser.runtime.onMessage.trigger({}, {}, () => undefined)).resolves.toEqual([]);
  });

  it("stops checking and answering once stopped", async () => {
    document.body.innerHTML = COMPOSER;

    const stop = startDiagnostics();

    stop();
    document.querySelector("[data-nitfree-toggler]")!.remove();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reports()).toEqual([]);
  });
});
