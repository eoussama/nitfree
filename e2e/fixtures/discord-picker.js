/*
 * Plays Discord's part on the stand-in page, the way its React app behaves:
 * - the GIF, sticker and emoji buttons open the picker on their tab, or close it when that tab is already showing;
 * - a tab click, or Enter or Space on a tab, re-renders the tabs only when the selected tab changes;
 * - Escape and any press outside the picker close it.
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
