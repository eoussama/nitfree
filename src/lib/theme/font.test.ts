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

  it("reads an address with spaces and quotes around it, and only quotes that wrap it whole", () => {
    expect(pickFontUrl("url(  \"d.ttf\"  )", BASE)).toBe("https://discord.com/assets/d.ttf");
    expect(pickFontUrl("url(e\"f.ttf\")", BASE)).toBe("https://discord.com/assets/e%22f.ttf%22");
    expect(pickFontUrl("url(\"g.ttf\"h)", BASE)).toBe("https://discord.com/assets/%22g.ttf%22h");
  });

  it("passes over entries with no address, wherever the address starts in the next", () => {
    expect(pickFontUrl("local(\"gg sans\"), url(a.ttf)", BASE)).toBe("https://discord.com/assets/a.ttf");
  });

  it("takes WOFF2 by its format, in any case, or by its name", () => {
    expect(pickFontUrl("url(a.ttf) format(\"truetype\"), url(b) format(\"WOFF2\")", BASE)).toBe("https://discord.com/assets/b");
    expect(pickFontUrl("url(a.ttf), url(b.woff2)", BASE)).toBe("https://discord.com/assets/b.woff2");
  });

  it("takes plain and secure web addresses, and no other kind", () => {
    expect(pickFontUrl("url(http://cdn.example/a.woff2)", BASE)).toBe("http://cdn.example/a.woff2");
    expect(pickFontUrl("url(https://cdn.example/a.woff2)", BASE)).toBe("https://cdn.example/a.woff2");
    expect(pickFontUrl("url(ftp://cdn.example/a.woff2)", BASE)).toBeNull();
  });

  it("refuses faces with no file, local fonts and addresses that are not web ones", () => {
    expect(pickFontUrl("local(\"gg sans\")", BASE)).toBeNull();
    expect(pickFontUrl("", BASE)).toBeNull();
    expect(pickFontUrl("url(data:font/woff2;base64,AAAA)", BASE)).toBeNull();
    expect(pickFontUrl("url(javascript:alert(1))", BASE)).toBeNull();
  });
});
