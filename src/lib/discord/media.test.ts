import { describe, expect, it } from "vitest";

import { emojiMedia, imageMedia, stickerMedia } from "./media";



describe("emojiMedia", () => {
  it("takes the uploaded emoji, a PNG when still and a GIF when animated, named after its alt text", () => {
    expect(emojiMedia("123", ":blob_cat:", "https://cdn.discordapp.com/emojis/123.webp?size=48&quality=lossless&name=blob_cat"))
      .toEqual({ url: "https://cdn.discordapp.com/emojis/123.png", type: "emoji", name: "blob_cat" });
    expect(emojiMedia("456", ":party:", "https://cdn.discordapp.com/emojis/456.webp?size=48&animated=true"))
      .toEqual({ url: "https://cdn.discordapp.com/emojis/456.gif", type: "emoji", name: "party" });
    expect(emojiMedia("789", ":old:", "https://cdn.discordapp.com/emojis/789.gif?size=48").url).toBe("https://cdn.discordapp.com/emojis/789.gif");
  });

  it("falls back to the name in the address, then to a generic one", () => {
    expect(emojiMedia("123", "", "https://cdn.discordapp.com/emojis/123.webp?name=wave").name).toBe("wave");
    expect(emojiMedia("123", "", "not a url").name).toBe("emoji");
  });
});

describe("stickerMedia", () => {
  it("takes the full sticker, keeping APNG and GIF animation", () => {
    expect(stickerMedia("1", "Wave", "1")).toEqual({ url: "https://media.discordapp.net/stickers/1.png", type: "sticker", name: "Wave" });
    expect(stickerMedia("2", "Dance", "2")?.url).toBe("https://media.discordapp.net/stickers/2.png");
    expect(stickerMedia("4", "Spin", "4")?.url).toBe("https://media.discordapp.net/stickers/4.gif");
  });

  it("skips Lottie stickers, which are not images", () => {
    expect(stickerMedia("3", "Hi", "3")).toBeNull();
  });
});

describe("imageMedia", () => {
  it("takes an attachment as uploaded, keeping its signature", () => {
    const href = "https://cdn.discordapp.com/attachments/1/2/Party%20Parrot.png?ex=a&is=b&hm=c&";
    const safeSrc = "https://media.discordapp.net/attachments/1/2/Party%20Parrot.png?ex=a&is=b&hm=c&=&format=webp&width=550&height=309";

    expect(imageMedia(href, safeSrc)).toEqual({
      url: "https://cdn.discordapp.com/attachments/1/2/Party%20Parrot.png?ex=a&is=b&hm=c",
      type: "image",
      name: "Party Parrot.png",
    });
  });

  it("reads an attachment from Discord's proxy as from its CDN, and GIFs as GIFs", () => {
    expect(imageMedia("https://media.discordapp.net/attachments/1/2/spin.gif?ex=a&width=100", "")).toEqual({
      url: "https://cdn.discordapp.com/attachments/1/2/spin.gif?ex=a",
      type: "gif",
      name: "spin.gif",
    });
  });

  it("takes an embedded image from elsewhere through Discord's proxy, at its original size", () => {
    expect(imageMedia(
      "https://example.com/pics/cat.jpg",
      "https://images-ext-1.discordapp.net/external/abc/https/example.com/pics/cat.jpg?format=webp&width=400&height=300",
    )).toEqual({ url: "https://images-ext-1.discordapp.net/external/abc/https/example.com/pics/cat.jpg", type: "image", name: "cat.jpg" });
  });

  it("skips images Discord does not serve", () => {
    expect(imageMedia("https://example.com/cat.jpg", "https://example.com/cat.jpg")).toBeNull();
    expect(imageMedia("https://example.com/cat.jpg", "")).toBeNull();
  });
});
