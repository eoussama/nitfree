import { describe, expect, it } from "vitest";

import { clampSendSize, DEFAULT_SEND_SIZES, fitSendSizes, picksSend, SEND_SIZE_LIMITS } from "./settings";



describe("clampSendSize", () => {
  it("keeps sizes within range as they are", () => {
    expect(clampSendSize("emoji", 64)).toBe(64);
    expect(clampSendSize("sticker", 200)).toBe(200);
  });

  it("brings sizes out of range to the nearest limit", () => {
    expect(clampSendSize("emoji", 2)).toBe(SEND_SIZE_LIMITS.emoji.min);
    expect(clampSendSize("emoji", 4000)).toBe(SEND_SIZE_LIMITS.emoji.max);
    expect(clampSendSize("sticker", 10)).toBe(SEND_SIZE_LIMITS.sticker.min);
  });

  it("rounds to whole pixels", () => {
    expect(clampSendSize("emoji", 47.6)).toBe(48);
  });

  it("refuses what is not a number", () => {
    expect(clampSendSize("emoji", Number.NaN)).toBeNull();
    expect(clampSendSize("emoji", Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("picksSend", () => {
  it("sends on a click and adds on a Shift+click by default", () => {
    expect(picksSend(true, "send")).toBe(true);
    expect(picksSend(false, "send")).toBe(false);
  });

  it("swaps the two when a click is set to add", () => {
    expect(picksSend(true, "add")).toBe(false);
    expect(picksSend(false, "add")).toBe(true);
  });
});

describe("fitSendSizes", () => {
  it("brings both sizes within range, and falls back on ones that are not numbers", () => {
    expect(fitSendSizes({ emoji: 64, sticker: 200 })).toEqual({ emoji: 64, sticker: 200 });
    expect(fitSendSizes({ emoji: 99_999, sticker: 1 })).toEqual({ emoji: SEND_SIZE_LIMITS.emoji.max, sticker: SEND_SIZE_LIMITS.sticker.min });
    expect(fitSendSizes({ emoji: Number.NaN, sticker: Number.POSITIVE_INFINITY })).toEqual(DEFAULT_SEND_SIZES);
  });
});
