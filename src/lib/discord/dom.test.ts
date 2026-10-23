// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import {
  chatButtonGroupOf,
  composerOf,
  copyEmojiRow,
  discordOptions,
  draftAttachmentIds,
  emojiRows,
  findAll,
  findChatButtonGroups,
  findChatMedia,
  findDiscordAutocomplete,
  findEmojiButton,
  findExpandedPickerButton,
  findMessageBox,
  findPickerButtons,
  findUploadInput,
  imageMedia,
  messageBoxOf,
  NITFREE_OPTION,
  readChatButtonClasses,
  readMenuLook,
  readPickerTabClasses,
} from "./index";



function mount(html: string): void {
  document.body.innerHTML = html;
}

const q = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;

const COMPOSER = `
  <form class="channelTextArea_x">
    <div class="buttons_a">
      <div class="expression-picker-chat-input-button buttonContainer_1 extra">
        <div role="button" class="button_b expression-picker-chat-input-button" aria-expanded="false" aria-controls="gifs">
          <div class="buttonWrapper_w"></div>
        </div>
      </div>
      <div class="expression-picker-chat-input-button buttonContainer_2">
        <div role="button" class="button_b emojiButton_e" aria-expanded="true" aria-controls="emojis">
          <div class="buttonWrapper_w"></div>
        </div>
      </div>
    </div>
    <div role="textbox" data-slate-editor="true" contenteditable="true" aria-expanded="true" aria-controls="list"><span id="typed">x</span></div>
    <div class="uploadInput_u"><input type="file"></div>
    <ul data-list-id="attachments"><li data-list-item-id="attachments___1"></li><li data-list-item-id="attachments___2"></li></ul>
  </form>
  <div id="list"></div>`;

beforeEach(() => {
  mount("");
});

describe("findAll", () => {
  it("uses the first selector that finds anything, and finds nothing when none does", () => {
    mount("<p class=\"b\"></p><p class=\"b\"></p><p class=\"c\"></p>");

    expect(findAll(document, [".a", ".b", ".c"])).toHaveLength(2);
    expect(findAll(document, [".a", ".z"])).toEqual([]);
  });
});

describe("the composer", () => {
  it("is found from anything inside it, by its form or by its class", () => {
    mount(COMPOSER);
    expect(composerOf(q("#typed"))?.tagName).toBe("FORM");

    mount("<div class=\"channelTextArea_x\"><i id=\"inner\"></i></div><i id=\"outside\"></i>");
    expect(composerOf(q("#inner"))?.className).toBe("channelTextArea_x");
    expect(composerOf(q("#outside"))).toBeNull();
  });

  it("has its button group, upload input, text box and attachments found", () => {
    mount(COMPOSER);

    expect(findChatButtonGroups()).toHaveLength(1);
    expect(chatButtonGroupOf(q(".emojiButton_e"))?.className).toBe("buttons_a");
    expect(chatButtonGroupOf(q("#list"))).toBeNull();
    expect(findUploadInput(q("form"))?.type).toBe("file");
    expect(findMessageBox(q("form"))?.getAttribute("role")).toBe("textbox");
    expect(messageBoxOf(q("#typed"))?.getAttribute("role")).toBe("textbox");
    expect(messageBoxOf(q("#list"))).toBeNull();
    expect(messageBoxOf(null)).toBeNull();
    expect(draftAttachmentIds(q("form"))).toEqual(["attachments___1", "attachments___2"]);
  });

  it("finds nothing where Discord's markup is gone", () => {
    mount("<form></form>");

    expect(findUploadInput(q("form"))).toBeNull();
    expect(findMessageBox(q("form"))).toBeNull();
    expect(draftAttachmentIds(q("form"))).toEqual([]);
  });

  it("falls back to other markup for the upload input", () => {
    mount("<form><input class=\"file-input\" type=\"file\"></form>");
    expect(findUploadInput(q("form"))).not.toBeNull();
  });

  it("finds the autocomplete Discord opened, while the box points to it", () => {
    mount(COMPOSER);
    expect(findDiscordAutocomplete(q("[role=textbox]"))?.id).toBe("list");

    q("[role=textbox]").setAttribute("aria-expanded", "false");
    expect(findDiscordAutocomplete(q("[role=textbox]"))).toBeNull();
  });
});

describe("the picker buttons", () => {
  it("are the chat bar's, with the emoji one found by its class or as the last, and the open one by its state", () => {
    mount(COMPOSER);

    const group = q(".buttons_a");

    expect(findPickerButtons()).toHaveLength(2);
    expect(findEmojiButton(group)?.className).toContain("emojiButton_e");
    expect(findExpandedPickerButton()?.getAttribute("aria-controls")).toBe("emojis");

    q(".emojiButton_e").className = "button_b";
    expect(findEmojiButton(group)?.getAttribute("aria-controls")).toBe("emojis");

    q("[aria-controls=emojis]").setAttribute("aria-expanded", "false");
    expect(findExpandedPickerButton()).toBeNull();
    expect(findEmojiButton(document.createElement("div"))).toBeNull();
  });

  it("show the classes that give them their look, without the ones that drive them", () => {
    mount(COMPOSER);

    expect(readChatButtonClasses(q(".buttons_a"))).toEqual({ container: "buttonContainer_1", button: "button_b", wrapper: "buttonWrapper_w" });
    expect(readChatButtonClasses(document.createElement("div"))).toEqual({ container: "", button: "", wrapper: "" });
  });

  it("have tabs whose classes tell the base look from the selected one", () => {
    mount(`<div role="tablist">
      <div role="tab" class="navButton_1 navButtonActive_2"></div>
      <div role="tab" class="navItem_3 navButton_1"></div>
      <div class="navItem_9"></div>
    </div>`);

    expect(readPickerTabClasses(q("[role=tablist]"))).toEqual({ base: "navButton_1 navItem_3", active: "navButtonActive_2" });
    expect(readPickerTabClasses(document.createElement("div"))).toEqual({ base: "", active: "" });
  });
});

describe("the autocomplete", () => {
  const row = (extra = "", content = true) => `
    <div role="option" id="r1" class="autocompleteRowVertical_1" data-list-item-id="x" data-list-index="1" aria-selected="true" ${extra}>
      <div class="${content ? "autocompleteRowContent_c" : "plain"}">
        <img class="emojiImage_i other">
        <div class="autocompleteRowHeading_h">:old:</div>
        <div class="autocompleteRowContentSecondary_s">Server</div>
      </div>
    </div>`;

  it("lists Discord's rows, and those of them that are emojis, never Nitfree's", () => {
    mount(`<div id="list">${row()}<div role="option" class="autocompleteRowVertical_1"><i class="plain"></i></div><div role="option" ${NITFREE_OPTION}></div><div class="autocompleteRowVertical_1"></div></div>`);

    expect(discordOptions(q("#list"))).toHaveLength(2);
    expect(emojiRows(q("#list")).map(found => found.id)).toEqual(["r1"]);
  });

  it("copies a row for an item, as Discord's own would look, with a badge for its type", () => {
    mount(row());

    const { row: copy, image } = copyEmojiRow(q("#r1"), "nf-1", "party", "GIF");

    expect(copy.id).toBe("nf-1");
    expect(copy.hasAttribute(NITFREE_OPTION)).toBe(true);
    expect(copy.getAttribute("aria-selected")).toBe("false");
    expect(copy.getAttributeNames().some(name => name.startsWith("data-list"))).toBe(false);
    expect(copy.querySelector(".autocompleteRowContentSecondary_s")).toBeNull();
    expect(copy.querySelector(".autocompleteRowHeading_h")?.textContent).toBe(":party:");
    expect(copy.querySelector("img")).toBe(image);
    expect(image.className).toBe("emojiImage_i");
    expect(copy.querySelector(".autocompleteRowContent_c")?.lastElementChild?.textContent).toBe("GIF");
    // The model is left as it was.
    expect(q("#r1").querySelector(".autocompleteRowHeading_h")?.textContent).toBe(":old:");
  });

  it("copes with a row that has no heading, icon or content wrapper", () => {
    mount("<div role=\"option\" id=\"bare\" class=\"autocompleteRowVertical_1\"></div>");

    const { row: copy } = copyEmojiRow(q("#bare"), "nf-2", "x", "Image");

    expect(copy.lastElementChild?.textContent).toBe("Image");
  });
});

describe("readMenuLook", () => {
  const menu = (items: string) => `<div role="menu" id="menu">${items}<div role="separator" class="separator_9"></div></div>`;
  const item = (extra: string, inner = "") => `<div role="menuitem" class="item_a colorDefault_b labelContainer_c ${extra}">${inner}</div>`;

  it("reads the classes, the font and the icon's side from a plain item with an icon", () => {
    mount(menu(`
      ${item("focused_f", "<div class=\"iconContainerLeft_l\"><svg class=\"icon_i\"></svg></div><div class=\"label_t\"><span>Reply</span></div>")}
      <div role="menuitem" class="item_a colorDanger_d"></div>
    `));

    expect(readMenuLook(q("#menu"))).toMatchObject({
      item: "item_a colorDefault_b labelContainer_c",
      label: "label_t",
      iconContainer: "iconContainerLeft_l",
      icon: "icon_i",
      focused: "focused_f",
      separator: "separator_9",
      iconFirst: true,
      iconSize: 18,
    });
    expect(readMenuLook(q("#menu")).font).toContain("font-size");
  });

  it("names the highlight and separator after the item's own when none shows, and puts the icon last for older menus", () => {
    mount(`<div role="menu" id="menu"><div role="menuitem" class="item_zz colorDefault_b"><div class="iconContainer_r"></div><div class="label_t"></div></div></div>`);

    expect(readMenuLook(q("#menu"))).toMatchObject({
      focused: "focused_zz",
      separator: "separator_zz",
      iconContainer: "iconContainer_r",
      iconFirst: false,
      font: "",
    });
  });

  it("falls back to the first item when none is plain, and reads nothing from a menu with none", () => {
    mount("<div role=\"menu\" id=\"menu\"><div role=\"menuitem\" class=\"labelContainer_c\"></div></div>");
    expect(readMenuLook(q("#menu"))).toMatchObject({ item: "labelContainer_c", focused: "", separator: "", iconSize: 18 });

    mount("<div role=\"menu\" id=\"menu\"></div>");
    expect(readMenuLook(q("#menu"))).toMatchObject({ item: "", label: "", icon: "", iconFirst: false });
  });
});

describe("findChatMedia", () => {
  it("reads a custom emoji from the address it is shown from", () => {
    mount("<p><img id=\"e\" data-type=\"emoji\" data-id=\"111\" alt=\":blob_cat:\" src=\"https://cdn.discordapp.com/emojis/111.webp?size=48\"></p>");

    expect(findChatMedia(q("p"))).toBeNull();
    // Before the browser has picked a file, it is the address in the page that counts.
    Object.defineProperty(q("#e"), "currentSrc", { value: "", configurable: true });
    expect(findChatMedia(q("#e"))).toEqual({ url: "https://cdn.discordapp.com/emojis/111.png", type: "emoji", name: "blob_cat" });

    Object.defineProperty(q("#e"), "currentSrc", { value: "https://cdn.discordapp.com/emojis/111.gif?animated=true", configurable: true });
    expect(findChatMedia(q("#e"))?.url).toBe("https://cdn.discordapp.com/emojis/111.gif");
  });

  it("reads a sticker, nameless or of a format it does not know included", () => {
    mount("<div id=\"s\" data-type=\"sticker\" data-id=\"2\" data-name=\"Wave\" data-format-type=\"1\"><i id=\"inner\"></i></div><div id=\"bare\" data-type=\"sticker\" data-id=\"3\"></div><div id=\"plain\" data-type=\"sticker\" data-id=\"4\" data-format-type=\"2\"></div>");

    expect(findChatMedia(q("#inner"))).toEqual({ url: "https://media.discordapp.net/stickers/2.png", type: "sticker", name: "Wave" });
    expect(findChatMedia(q("#bare"))).toBeNull();
    expect(findChatMedia(q("#plain"))?.name).toBe("sticker");
  });

  it("reads an attached or embedded image from the link over it, or from its proxied copy", () => {
    mount(`<a id="i" data-role="img" href="https://cdn.discordapp.com/attachments/1/2/cat.gif?ex=a" data-safe-src="https://media.discordapp.net/attachments/1/2/cat.gif?width=5"></a>
           <a id="none" data-role="img" href="https://example.com/x.png"></a>`);

    expect(findChatMedia(q("#i"))).toEqual({ url: "https://cdn.discordapp.com/attachments/1/2/cat.gif?ex=a", type: "gif", name: "cat.gif" });
    expect(findChatMedia(q("#none"))).toBeNull();
  });

  it("names an embedded image after its proxied copy when the link it leads to has no file name", () => {
    expect(imageMedia("https://example.com/", "https://media.discordapp.net/external/abc/pic.gif?width=5")).toMatchObject({ name: "pic.gif", type: "gif" });
  });

  it("keeps a file name Discord's address spells badly as it is", () => {
    expect(imageMedia("https://cdn.discordapp.com/attachments/1/2/100%25.png", "")?.name).toBe("100%.png");
    expect(imageMedia("https://cdn.discordapp.com/attachments/1/2/bad%E0%A4%A.png", "")?.name).toBe("bad%E0%A4%A.png");
  });
});
