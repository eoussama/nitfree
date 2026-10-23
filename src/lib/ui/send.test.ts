import { describe, expect, it } from "vitest";

import { fileName } from "./send";



describe("fileName", () => {
  it("names the file after the item, with the extension of what is sent", () => {
    expect(fileName("party_parrot", "image/gif")).toBe("party_parrot.gif");
    expect(fileName("wave", "image/png")).toBe("wave.png");
    expect(fileName("photo", "image/jpeg")).toBe("photo.jpg");
  });

  it("replaces characters file systems refuse", () => {
    expect(fileName("a/b:c*d", "image/webp")).toBe("a_b_c_d.webp");
    expect(fileName("", "image/png")).toBe("nitfree.png");
    expect(fileName("odd", "image/bmp")).toBe("odd.png");
  });
});
