import type { TTag } from "~/lib/db";

import { describe, expect, it } from "vitest";

import { guessItemType, isAcceptedFile, isVideoFile, parseTagNames, resolveTagNames, suggestTags, titleFromFileName, videoItemType } from "./drafts";



function tag(id: string, name: string): TTag {
  return { id, name, color: null, createdAt: 0 };
}

describe("isAcceptedFile", () => {
  it("accepts the supported image types by MIME type or extension", () => {
    expect(isAcceptedFile({ name: "a.png", type: "image/png" })).toBe(true);
    expect(isAcceptedFile({ name: "a.APNG", type: "" })).toBe(true);
    expect(isAcceptedFile({ name: "photo.jpeg", type: "" })).toBe(true);
    expect(isAcceptedFile({ name: "clip", type: "image/webp" })).toBe(true);
    expect(isAcceptedFile({ name: "party.gif", type: "image/gif" })).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAcceptedFile({ name: "icon.svg", type: "image/svg+xml" })).toBe(false);
    expect(isAcceptedFile({ name: "video.mp4", type: "video/mp4" })).toBe(false);
    expect(isAcceptedFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and joins words with underscores", () => {
    expect(titleFromFileName("Party Parrot.gif")).toBe("Party_Parrot");
    expect(titleFromFileName("cat-thumbs-up.v2.png")).toBe("cat_thumbs_up_v2");
    expect(titleFromFileName("  __wave__  .webp")).toBe("wave");
  });

  it("falls back when nothing is left", () => {
    expect(titleFromFileName(".png")).toBe("untitled");
    expect(titleFromFileName("")).toBe("untitled");
  });
});

describe("isVideoFile", () => {
  it("accepts MP4 and WebM videos, by type or extension", () => {
    expect(isVideoFile({ name: "clip.mp4", type: "video/mp4" })).toBe(true);
    expect(isVideoFile({ name: "clip.WEBM", type: "" })).toBe(true);
    expect(isVideoFile({ name: "clip", type: "video/webm" })).toBe(true);
  });

  it("rejects images and other videos", () => {
    expect(isVideoFile({ name: "party.gif", type: "image/gif" })).toBe(false);
    expect(isVideoFile({ name: "clip.mov", type: "video/quicktime" })).toBe(false);
  });
});

describe("videoItemType", () => {
  it("makes a sticker up to a sticker's size, else a GIF", () => {
    expect(videoItemType({ width: 320, height: 180 })).toBe("sticker");
    expect(videoItemType({ width: 160, height: 160 })).toBe("sticker");
    expect(videoItemType({ width: 480, height: 270 })).toBe("gif");
  });
});

describe("guessItemType", () => {
  it("guesses from size and animation", () => {
    expect(guessItemType({ width: 48, height: 48, animated: true, format: "gif" })).toBe("emoji");
    expect(guessItemType({ width: 128, height: 96, animated: false, format: "png" })).toBe("emoji");
    expect(guessItemType({ width: 320, height: 320, animated: true, format: "png" })).toBe("sticker");
    expect(guessItemType({ width: 498, height: 280, animated: true, format: "gif" })).toBe("gif");
    expect(guessItemType({ width: 1920, height: 1080, animated: false, format: "jpeg" })).toBe("image");
    expect(guessItemType({ width: 640, height: 640, animated: true, format: "webp" })).toBe("image");
  });

  it("calls an unreadable file an image", () => {
    expect(guessItemType(null)).toBe("image");
  });
});

describe("tags", () => {
  const tags = [tag("1", "Cats"), tag("2", "Funny"), tag("3", "Big cats"), tag("4", "Dogs")];

  it("parses comma-separated names without duplicates", () => {
    expect(parseTagNames(" cats, Funny ,, CATS,  big   cats ")).toEqual(["cats", "Funny", "big cats"]);
    expect(parseTagNames("")).toEqual([]);
  });

  it("matches names to existing tags regardless of case", () => {
    expect(resolveTagNames(["cats", "new one", "FUNNY"], tags)).toEqual({ ids: ["1", "2"], missing: ["new one"] });
  });

  it("suggests tags starting with the query first, without the chosen ones", () => {
    expect(suggestTags("cat", tags, []).map(found => found.name)).toEqual(["Cats", "Big cats"]);
    expect(suggestTags("cat", tags, ["cats"]).map(found => found.name)).toEqual(["Big cats"]);
    expect(suggestTags("", tags, ["Dogs"], 2).map(found => found.name)).toEqual(["Cats", "Funny"]);
  });
});
