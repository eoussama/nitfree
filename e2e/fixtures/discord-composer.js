/*
 * Plays Discord's composer on the stand-in page, the way its client code behaves:
 * - files put on the hidden upload input and announced with a change event join the message a moment
 *   later, listed in the "attachments" tray, as the upload button does;
 * - Enter in the text box, without Shift, sends the message with its text and attachments;
 * - typing `:` and two characters opens its emoji autocomplete above the composer, when it knows an
 *   emoji by that name. Its rows are drawn as Discord draws them (from its client code and
 *   stylesheet), again on every key; the text box points to the list with aria-controls and to the
 *   highlighted row with aria-activedescendant. The arrow keys move the highlight, wrapping around;
 *   Enter or Tab picks the highlighted emoji instead of sending; Escape closes it;
 * - a `beforeinput` that deletes over a selection removes that text, as its editor does, read from
 *   the page's selection at that moment.
 * Sent messages are kept in `discordSent`, and emojis picked from its autocomplete in
 * `discordAutocompletePicks`, for tests to read.
 */

globalThis.discordSent = [];
globalThis.discordAutocompletePicks = [];

const AUTOCOMPLETE_ID = "channel-autocomplete";

/**
 * The emojis Discord knows here: built-in ones, drawn as text, and a server's own, drawn as an image
 * with the server's name.
 */
const DISCORD_EMOJIS = [
  { name: "cat", text: "🐱" },
  { name: "smile_cat", text: "😸" },
  { name: "catdance", image: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", server: "Cat Club" },
];

let matches = [];
let highlighted = 0;

function row(emoji, index) {
  const icon = emoji.image
    ? `<img alt="" class="emojiImage__13533" src="${emoji.image}">`
    : `<span class="emojiRaw__13533 emojiImage__13533">${emoji.text}</span>`;
  const server = emoji.server
    ? `<div class="text-xs/normal_cf4812 autocompleteRowContentSecondary__13533" data-text-variant="text-xs/normal" style="color: var(--interactive-text-default);">${emoji.server}</div>`
    : "";

  return `<div class="clickable__13533 autocompleteRowVertical__13533 autocompleteRow__13533 autocompleteRowVerticalSmall__13533" id="autocomplete-${index}" role="option" aria-selected="${index === highlighted}" data-list-item-id="channel-autocomplete___${index}" tabindex="-1"><div class="base__13533"><div class="autocompleteRowContent__13533"><div class="autocompleteRowIcon__13533">${icon}</div><div class="autocompleteRowContentPrimary__13533"><div class="text-md/normal_cf4812 autocompleteRowHeading__13533" data-text-variant="text-md/normal" style="color: var(--interactive-text-active);">:${emoji.name}:</div></div>${server}</div></div></div>`;
}

function highlight(box, index) {
  highlighted = index;
  document.querySelectorAll(`#${AUTOCOMPLETE_ID} [role="option"]:not([data-nitfree-option])`).forEach((option, at) => option.setAttribute("aria-selected", String(at === index)));
  box.setAttribute("aria-activedescendant", `autocomplete-${index}`);
}

/**
 * An empty line, as Discord's editor draws it (see fixtures/composer.html).
 */
const EMPTY_LINE = "<div data-slate-node=\"element\"><span data-slate-node=\"text\"><span data-slate-leaf=\"true\" class=\"emptyText__1464f\"><span data-slate-zero-width=\"n\" data-slate-length=\"0\"><br></span></span></span></div>";

function textBeforeCaret(box) {
  const selection = getSelection();

  if (!selection.rangeCount || !selection.isCollapsed || !box.contains(selection.anchorNode)) {
    return "";
  }

  const range = document.createRange();

  range.setStart(box, 0);
  range.setEnd(selection.anchorNode, selection.anchorOffset);

  return range.toString();
}

function closeAutocomplete(box) {
  document.getElementById(AUTOCOMPLETE_ID)?.closest("[class^=\"autocomplete_\"]")?.remove();
  matches = [];
  box.removeAttribute("aria-controls");
  box.removeAttribute("aria-activedescendant");
  box.setAttribute("aria-expanded", "false");
}

function followAutocomplete(box) {
  const query = /(?:^|\s):(\w{2,})$/.exec(textBeforeCaret(box))?.[1];
  const found = query ? DISCORD_EMOJIS.filter(emoji => emoji.name.includes(query)) : [];

  if (!found.length) {
    closeAutocomplete(box);

    return;
  }

  let list = document.getElementById(AUTOCOMPLETE_ID);

  if (!list) {
    const container = document.createElement("div");

    // Discord's list sits right above the composer, as wide as it.
    container.className = "autocomplete__13533";
    container.style.cssText = "position: fixed; left: 0; right: 0;";
    container.innerHTML = `<div class="autocompleteInner__13533"><div class="scroller__a1b2c" role="listbox" id="${AUTOCOMPLETE_ID}" aria-label="Emoji"></div></div>`;
    document.body.append(container);
    list = document.getElementById(AUTOCOMPLETE_ID);
  }

  if (found.map(emoji => emoji.name).join() !== matches.map(emoji => emoji.name).join()) {
    highlighted = 0;
  }

  matches = found;
  list.closest("[class^=\"autocomplete_\"]").style.bottom = `${window.innerHeight - box.closest("form").getBoundingClientRect().top}px`;
  // Drawn again on every key, as its rows are.
  list.innerHTML = `<div class="base__13533"><h3 class="contentTitle__13533">Emoji matching <strong>:${query}</strong></h3></div>${found.map(row).join("")}`;
  box.setAttribute("aria-controls", AUTOCOMPLETE_ID);
  box.setAttribute("aria-expanded", "true");
  highlight(box, highlighted);
}

document.addEventListener("input", (event) => {
  const box = event.target instanceof Element ? event.target.closest("[role=\"textbox\"]") : null;

  if (box) {
    followAutocomplete(box);
  }
});

document.addEventListener("beforeinput", (event) => {
  const box = event.target instanceof Element ? event.target.closest("[role=\"textbox\"]") : null;
  const selection = getSelection();

  if (!box || !event.inputType.startsWith("deleteContent") || !selection.rangeCount || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);

  event.preventDefault();
  range.deleteContents();

  // Its editor then puts the caret where the text was, drawing an emptied line as it draws a new one.
  if (box.textContent === "") {
    box.innerHTML = EMPTY_LINE;
    selection.collapse(box.querySelector("[data-slate-zero-width]"), 0);
  }
  else {
    selection.collapse(range.startContainer, range.startOffset);
  }

  followAutocomplete(box);
});

let uploads = 0;

document.addEventListener("change", (event) => {
  const input = event.target;

  if (!(input instanceof HTMLInputElement) || input.type !== "file") {
    return;
  }

  const composer = input.closest("form");
  const files = [...input.files ?? []];

  input.value = "";

  // Discord reads the files first, then lists them.
  setTimeout(() => {
    let tray = composer.querySelector("[data-list-id=\"attachments\"]");

    if (!tray) {
      tray = document.createElement("ul");
      tray.setAttribute("data-list-id", "attachments");
      composer.prepend(tray);
    }

    for (const file of files) {
      const item = document.createElement("li");

      item.setAttribute("data-list-item-id", `attachments___${++uploads}`);
      item.textContent = file.name;
      item.file = file;
      tray.append(item);
    }
  }, 50);
});

document.addEventListener("keydown", (event) => {
  const box = event.target instanceof Element ? event.target.closest("[role=\"textbox\"]") : null;

  if (!box) {
    return;
  }

  if (matches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    highlight(box, (highlighted + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);

    return;
  }

  if (matches.length && ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab")) {
    event.preventDefault();
    globalThis.discordAutocompletePicks.push(`:${matches[highlighted].name}:`);
    closeAutocomplete(box);

    return;
  }

  if (matches.length && event.key === "Escape") {
    closeAutocomplete(box);

    return;
  }

  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }

  const composer = box.closest("form");
  const tray = composer.querySelector("[data-list-id=\"attachments\"]");
  const files = tray ? [...tray.children].map(item => item.file) : [];
  const text = box.textContent.trim();

  if (files.length || text) {
    event.preventDefault();
    globalThis.discordSent.push({ text, files });
    tray?.remove();
  }
});
