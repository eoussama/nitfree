/*
 * Plays Discord's message context menu on the stand-in page, the way its web client behaves:
 * - a right click in a message opens Discord's "message" menu and stops the event, unless it is on a
 *   link with text or text is selected; so a custom emoji, a sticker or an image (whose click lands on
 *   the invisible link laid over it) gets Discord's menu, never the browser's;
 * - anywhere else, the browser's menu shows only on something with a src or href, as
 *   `contextMenuCallbackWeb` decides;
 * - the menu's code loads lazily: its box shows first, its items a moment later;
 * - Escape in the menu, a press outside it or choosing an item closes it.
 * Chosen items are kept in `discordMenuChoices` for tests to read.
 */

globalThis.discordMenuChoices = [];

const ITEMS = [
  [["reply", "Reply"], ["forward", "Forward"]],
  [["copy-link", "Copy Message Link"], ["delete", "Delete Message", "colorDanger_c1e9c4"]],
];

let openLayer = null;

function closeMenu() {
  openLayer?.remove();
  openLayer = null;
}

function fill(menu) {
  const scroller = menu.querySelector("[class^=\"scroller_\"]");

  ITEMS.forEach((group, index) => {
    if (index) {
      const separator = document.createElement("div");

      separator.className = "separator_c1e9c4";
      separator.setAttribute("role", "separator");
      scroller.append(separator);
    }

    const element = document.createElement("div");

    element.setAttribute("role", "group");

    for (const [id, label, color = "colorDefault_c1e9c4"] of group) {
      const item = document.createElement("div");

      item.className = `item_c1e9c4 labelContainer_c1e9c4 ${color}`;
      item.id = `message-${id}`;
      item.setAttribute("role", "menuitem");
      item.setAttribute("tabindex", "-1");
      item.setAttribute("data-menu-item", "true");
      // Discord's current items: the icon first, the text in a marquee wrapper whose classes set its font.
      item.innerHTML = `<div class="iconContainerLeft_c1e9c4"><svg class="icon_c1e9c4" width="18" height="18"></svg></div><div class="label_c1e9c4"><div class="container_a4ac84"><div class="text_a4ac84 text-sm-medium_cf4812">${label}</div></div></div>`;
      item.addEventListener("click", () => {
        globalThis.discordMenuChoices.push(id);
        closeMenu();
      });
      element.append(item);
    }

    scroller.append(element);
  });
}

function openMenu(event) {
  closeMenu();

  const layer = document.createElement("div");
  const menu = document.createElement("div");

  layer.className = "layer_c1e9c4";
  layer.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px; z-index: 1000;`;
  menu.className = "menu_c1e9c4";
  menu.id = "message";
  menu.setAttribute("role", "menu");
  menu.setAttribute("tabindex", "-1");
  menu.setAttribute("aria-label", "Message Actions");
  menu.innerHTML = "<div class=\"scroller_c1e9c4\"></div>";
  menu.addEventListener("keydown", (keydown) => {
    if (keydown.key === "Escape") {
      keydown.stopPropagation();
      keydown.preventDefault();
      closeMenu();
    }
  });

  layer.append(menu);
  document.querySelector("#layers").append(layer);
  openLayer = layer;
  menu.focus();
  setTimeout(() => menu.isConnected && fill(menu), 50);
}

function hasSource(target) {
  for (let node = target; node; node = node.parentNode) {
    if (("src" in node && node.src) || ("href" in node && node.href)) {
      return true;
    }
  }

  return false;
}

// The message's own handler, which React runs before the window's.
document.addEventListener("contextmenu", (event) => {
  const message = event.target.closest?.("[role=\"article\"]");

  if (!message) {
    return;
  }

  if ((event.target.tagName === "A" && event.target.textContent !== "") || !getSelection().isCollapsed) {
    return;
  }

  event.stopPropagation();
  event.preventDefault();
  openMenu(event);
});

window.addEventListener("contextmenu", (event) => {
  if (!hasSource(event.target)) {
    event.preventDefault();
  }
});

document.addEventListener("mousedown", (event) => {
  if (openLayer && !openLayer.contains(event.target)) {
    closeMenu();
  }
});
