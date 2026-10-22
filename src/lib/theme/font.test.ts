import { describe, expect, it } from "vitest";

import { pickFontUrl } from "./font";



const BASE = "https://discord.com/assets/web.css";

describe("pickFontUrl", () => {
  it("prefers the WOFF2 file, resolved against the stylesheet", () => {
    expect(pickFontUrl("url(\"/assets/a.woff\") format(\"woff\"), url(\"/assets/a.woff2\") format(\"woff2\")", BASE)).toBe("https://discord.com/assets/a.woff2");
    expect(pickFontUrl("url(b.woff2), url(b.ttf)", BASE)).toBe("https://discord.com/assets/b.woff2");
  });

  it("falls back to the first file when none is WOFF2", () => {
    expect(pickFontUrl("url('c.woff') format('woff'), url('c.ttf')", BASE)).toBe("https://discord.com/assets/c.woff");
  });

  it("refuses faces with no file, local fonts and addresses that are not web ones", () => {
    expect(pickFontUrl("local(\"gg sans\")", BASE)).toBeNull();
    expect(pickFontUrl("", BASE)).toBeNull();
    expect(pickFontUrl("url(data:font/woff2;base64,AAAA)", BASE)).toBeNull();
    expect(pickFontUrl("url(javascript:alert(1))", BASE)).toBeNull();
  });
});
