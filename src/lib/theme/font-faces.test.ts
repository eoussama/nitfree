import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { toBase64 } from "~/lib/messaging/codec";

import { captureDiscordFont, discordFont, findFontFaces, loadDiscordFont } from "./font";



const BASE = "https://discord.com/assets/web.css";

type TRuleProps = Record<string, string>;

class FakeFontFaceRule {
  style: { getPropertyValue: (name: string) => string };

  constructor(props: TRuleProps) {
    this.style = { getPropertyValue: name => props[name] ?? "" };
  }
}

const face = (props: TRuleProps) => new FakeFontFaceRule({ "font-family": "\"gg sans\"", "src": "url(a.woff2)", ...props });
const sheet = (rules: unknown[], href: string | null = BASE) => ({ href, cssRules: rules }) as unknown as CSSStyleSheet;

function fonts(rules: unknown[]): Document {
  return { styleSheets: [sheet(rules)], baseURI: BASE } as unknown as Document;
}

describe("findFontFaces", () => {
  beforeEach(() => {
    vi.stubGlobal("CSSFontFaceRule", FakeFontFaceRule);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds Discord's faces in the weights the popup uses, keeping each file once", () => {
    const faces = findFontFaces([
      sheet([
        face({ "font-weight": "500", "unicode-range": " U+0000-00FF " }),
        face({ "font-weight": "500" }),
        face({ "src": "url(b.woff2)", "font-weight": "700" }),
        face({ src: "url(c.woff2)" }),
      ]),
    ], "https://other.example/");

    expect(faces).toEqual([
      { url: "https://discord.com/assets/a.woff2", weight: "500", unicodeRange: "U+0000-00FF" },
      { url: "https://discord.com/assets/b.woff2", weight: "700", unicodeRange: "" },
      { url: "https://discord.com/assets/c.woff2", weight: "400", unicodeRange: "" },
    ]);
  });

  it("leaves out other fonts, italics, other weights, faces with no usable file, and rules that are not faces", () => {
    expect(findFontFaces([
      sheet([
        face({ "font-family": "Noto Sans" }),
        face({ "font-style": "italic" }),
        face({ "font-style": "oblique 10deg" }),
        face({ "font-weight": "300" }),
        face({ src: "local(\"gg sans\")" }),
        { style: {} },
        face({ "font-family": "'GG Sans'", "font-weight": "600" }),
      ]),
    ], BASE)).toEqual([{ url: "https://discord.com/assets/a.woff2", weight: "600", unicodeRange: "" }]);
  });

  it("goes by the page's address for a stylesheet with none of its own, and skips one it cannot read", () => {
    const unreadable = {
      href: "https://cdn.example/x.css",
      get cssRules(): never {
        throw new DOMException("Cross-origin.", "SecurityError");
      },
    } as unknown as CSSStyleSheet;

    expect(findFontFaces([unreadable, sheet([face({})], null)], "https://discord.com/channels/")).toEqual([
      { url: "https://discord.com/channels/a.woff2", weight: "400", unicodeRange: "" },
    ]);
  });
});

describe("captureDiscordFont", () => {
  const rules = [face({ "font-weight": "500", "unicode-range": "U+0-FF" }), face({ "src": "url(b.woff2)", "font-weight": "700" })];

  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal("CSSFontFaceRule", FakeFontFaceRule);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(size = 4) {
    const fetched = vi.fn(async (url: string) => ({ ok: !url.endsWith("bad.woff2"), status: 404, arrayBuffer: async () => new Uint8Array(size).buffer }));

    vi.stubGlobal("fetch", fetched);

    return fetched;
  }

  it("keeps the files of the faces it finds, as text", async () => {
    serve();
    await captureDiscordFont(fonts(rules));

    expect(await discordFont.getValue()).toEqual({
      faces: [
        { url: "https://discord.com/assets/a.woff2", weight: "500", unicodeRange: "U+0-FF", data: toBase64(new Uint8Array(4)) },
        { url: "https://discord.com/assets/b.woff2", weight: "700", unicodeRange: "", data: toBase64(new Uint8Array(4)) },
      ],
    });
  });

  it("fetches nothing again while Discord serves the same files", async () => {
    const fetched = serve();

    await captureDiscordFont(fonts(rules));
    await captureDiscordFont(fonts(rules));
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it("fetches again when a face's file, weight, range or number has changed", async () => {
    const fetched = serve();
    const only = (props: TRuleProps) => fonts([face({ "font-weight": "500", "unicode-range": "U+0-FF", "src": "url(z.woff2)", ...props })]);

    await captureDiscordFont(fonts(rules));
    await captureDiscordFont(fonts([rules[0]!]));
    await captureDiscordFont(only({}));
    await captureDiscordFont(only({ "font-weight": "600" }));
    await captureDiscordFont(only({ "font-weight": "600", "unicode-range": "U+0-7F" }));
    expect(fetched).toHaveBeenCalledTimes(2 + 1 + 1 + 1 + 1);
  });

  it("keeps what it had when the page has no faces, a file cannot be fetched, or the files are too many bytes", async () => {
    serve();
    await captureDiscordFont(fonts([]));
    expect(await discordFont.getValue()).toBeNull();

    await captureDiscordFont(fonts([face({ src: "url(bad.woff2)" })]));
    expect(await discordFont.getValue()).toBeNull();

    serve(3 * 1024 * 1024);
    await captureDiscordFont(fonts(rules));
    expect(await discordFont.getValue()).toBeNull();
  });

  it("looks at the page it runs on when none is given", async () => {
    serve();
    vi.stubGlobal("document", { styleSheets: [sheet(rules)], baseURI: BASE });
    await captureDiscordFont();
    expect((await discordFont.getValue())?.faces).toHaveLength(2);
  });
});

describe("loadDiscordFont", () => {
  const created: { family: string; descriptors: Record<string, string> }[] = [];

  class FakeFontFace {
    constructor(readonly family: string, readonly data: Uint8Array, readonly descriptors: Record<string, string>) {
      created.push(this);
    }

    async load(): Promise<void> {
      if (this.data.length === 0) {
        throw new Error("Bad font.");
      }
    }
  }

  beforeEach(() => {
    fakeBrowser.reset();
    created.length = 0;
    vi.stubGlobal("FontFace", FakeFontFace);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds every stored face to the page, skipping one that cannot be loaded", async () => {
    await discordFont.setValue({
      faces: [
        { url: "a", weight: "400", unicodeRange: "U+0-FF", data: toBase64(Uint8Array.of(1, 2)) },
        { url: "b", weight: "500", unicodeRange: "", data: toBase64(Uint8Array.of(3)) },
        { url: "c", weight: "700", unicodeRange: "", data: toBase64(new Uint8Array()) },
      ],
    });

    const added: unknown[] = [];

    await loadDiscordFont({ add: (loaded: unknown) => added.push(loaded) } as unknown as FontFaceSet);

    expect(created.map(({ family, descriptors }) => [family, descriptors])).toEqual([
      ["gg sans", { weight: "400", unicodeRange: "U+0-FF" }],
      ["gg sans", { weight: "500" }],
      ["gg sans", { weight: "700" }],
    ]);
    expect(added).toHaveLength(2);
  });

  it("adds nothing when none is stored, and uses the page's fonts when not told which", async () => {
    const added = vi.fn();

    vi.stubGlobal("document", { fonts: { add: added } });
    await loadDiscordFont();
    expect(added).not.toHaveBeenCalled();

    await discordFont.setValue({ faces: [{ url: "a", weight: "400", unicodeRange: "", data: toBase64(Uint8Array.of(1)) }] });
    await loadDiscordFont();
    expect(added).toHaveBeenCalledOnce();
  });
});
