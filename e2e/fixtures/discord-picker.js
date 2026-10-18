/*
 * Plays Discord's part on the stand-in page, the way its React app behaves:
 * - the GIF, sticker and emoji buttons open the picker on their tab, or close it when that tab is already showing;
 * - a tab click, or Enter or Space on a tab, re-renders the tabs only when the selected tab changes;
 * - Escape and any press outside the picker close it;
 * - focus stays in the open picker, as Discord's popouts lock it with its focus-layers library;
 * - a paste while nothing editable has focus goes to the chat box, as Discord's paste-anywhere does.
 * Expects `PICKER` (the captured markup) and `NO_TABS` (open the picker without its tab bar, as if
 * Discord's markup had changed) to be defined before it runs.
 */

/* global PICKER, NO_TABS */

const layers = document.getElementById("layers");
const LABELS = { gif: "Open GIF picker", sticker: "Open sticker picker", emoji: "Add Emoji" };
let active = null;

const picker = () => layers.querySelector("[class*=\"expressionPickerPositionLayer\"]");
const button = name => document.querySelector(`#chat [aria-label="${LABELS[name]}"]`);

function render() {
  for (const tab of picker().querySelectorAll("[role=\"tablist\"] > [role=\"tab\"]:not([data-nitfree-tab])")) {
    const on = tab.id === `${active}-picker-tab`;

    tab.className = `navButton__08434 navItem__08434${on ? " navButtonActive__08434" : ""}`;
    tab.setAttribute("aria-selected", String(on));
  }
  const panel = picker().querySelector("[role=\"tabpanel\"]:not(#nitfree-picker-tab-panel)");

  panel.id = `${active}-picker-tab-panel`;
  panel.dataset.discordTab = active;
  panel.setAttribute("aria-labelledby", `${active}-picker-tab`);

  for (const name of Object.keys(LABELS)) {
    button(name).setAttribute("aria-expanded", String(name === active));
  }
}

function open(name) {
  if (!picker()) {
    layers.insertAdjacentHTML("beforeend", PICKER);

    if (NO_TABS) {
      picker().querySelector("nav").remove();
    }
  }
  active = name;
  render();
}

function close() {
  layers.replaceChildren();
  active = null;

  for (const name of Object.keys(LABELS)) {
    button(name).setAttribute("aria-expanded", "false");
  }
}

for (const name of Object.keys(LABELS)) {
  button(name).addEventListener("click", () => (picker() && active === name ? close() : open(name)));
}

// Discord's tabs act on a click, and on Enter or Space without any click.
function activateTab(event) {
  const tab = event.target.closest("[role=\"tab\"]");
  const name = tab?.id.replace("-picker-tab", "");

  if (tab && !tab.hasAttribute("data-nitfree-tab") && name !== active) {
    active = name;
    render();
  }
}

layers.addEventListener("click", activateTab);
layers.addEventListener("keydown", event => (event.key === "Enter" || event.key === " ") && activateTab(event));

document.addEventListener("keydown", event => event.key === "Escape" && picker() && close());
document.addEventListener("pointerdown", (event) => {
  if (picker() && !event.target.closest("[class*=\"expressionPickerPositionLayer\"], .expression-picker-chat-input-button")) {
    close();
  }
});

// Discord's focus-layers, as its popouts use it: capture listeners on the document see focus in a
// shadow root as focus on its host, and pull focus that lands outside the layer back in.
function focusInside(layer) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_ELEMENT, {
    acceptNode: element => (element.tabIndex >= 0 && !element.disabled ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });

  (walker.firstChild() ?? layer).focus();
}

document.addEventListener("focusin", (event) => {
  requestAnimationFrame(() => {
    const layer = picker();

    if (layer && !layer.contains(event.target ?? document.body)) {
      focusInside(layer);
    }
  });
}, { capture: true });

document.addEventListener("focusout", (event) => {
  const layer = picker();

  if (!layer) {
    return;
  }

  if (event.relatedTarget === null || event.relatedTarget === document.body) {
    layer.focus();
  }

  if (!layer.contains(event.target ?? document.body)) {
    focusInside(layer);
  }
}, { capture: true });

// Discord's paste-anywhere: a paste while nothing editable has focus is sent to the chat box.
document.addEventListener("paste", (event) => {
  const active = document.activeElement;

  if (!active || !active.matches("input, textarea, [contenteditable=\"true\"]")) {
    const seen = globalThis.discordChatPastes ?? [];

    globalThis.discordChatPastes = [...seen, [...event.clipboardData?.files ?? []].map(file => file.name)];
  }
});
