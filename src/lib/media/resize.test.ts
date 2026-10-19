import { describe, expect, it } from "vitest";

import { fitWithin } from "./resize";



describe("fitWithin", () => {
  it("shrinks the longest side to the limit, keeping the aspect ratio", () => {
    expect(fitWithin({ width: 512, height: 512 }, 48)).toEqual({ width: 48, height: 48 });
    expect(fitWithin({ width: 512, height: 256 }, 48)).toEqual({ width: 48, height: 24 });
    expect(fitWithin({ width: 100, height: 400 }, 160)).toEqual({ width: 40, height: 160 });
  });

  it("never enlarges, and keeps at least a pixel each way", () => {
    expect(fitWithin({ width: 32, height: 20 }, 48)).toEqual({ width: 32, height: 20 });
    expect(fitWithin({ width: 4000, height: 3 }, 48)).toEqual({ width: 48, height: 1 });
  });
});
