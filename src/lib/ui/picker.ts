import type { TItem } from "~/lib/db";

import { mount, unmount } from "svelte";

import Library from "~/components/Library.svelte";
import { findAll, SELECTORS } from "~/lib/discord";



const TAB_ID = "nitfree-picker-tab";
const PANEL_ID = "nitfree-picker-tab-panel";
const STYLE_ID = "nitfree-picker-style";

/**
 * The Discord panel's size from the captured markup, used if it cannot be measured.
 */
const FALLBACK_HEIGHT = 426;

/**
 * Hides Discord's tab content while the Nitfree tab is selected, without touching what React renders.
 */
const STYLE = `
[data-nitfree-selected] > [role="tabpanel"]:not(#${PANEL_ID}) { display: none !important; }
#${PANEL_ID} { display: none; width: 100%; overflow: hidden; }
[data-nitfree-selected] > #${PANEL_ID} { display: block; }
`;

type TInjected = {
  tabList: Element;
  observer: MutationObserver;
  container: HTMLElement;
  tab: HTMLElement;
  host: HTMLElement;
  library: { focusSearch: () => void };
  component: object;
};

export type TPickerTab = {
  /**
   * Re-reads the page: adds the tab to a newly opened picker and keeps the selection in place
   * through Discord's re-renders. Called on every page change.
   */
  scan: () => void;

  /**
   * Whether Discord's picker is open.
   */
  isOpen: () => boolean;

  /**
   * Selects the Nitfree tab in the open picker.
   *
   * @returns Whether a picker was open to select it in.
   */
  select: () => boolean;

  /**
   * Gives the picker back to Discord's own tabs.
   */
  deselect: () => void;

  /**
   * Removes the tab and everything it added.
   */
  stop: () => void;
};

type TOptions = {
  onpick: (item: TItem, send: boolean) => void;
  onchange: (selected: boolean) => void;
};

function setAttribute(element: Element, name: string, value: string): void {
  // Writing an unchanged value still counts as a mutation, which would wake the observer again.
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

function tabClasses(tabList: Element): { base: string; active: string } {
  const tabs = [...tabList.querySelectorAll(":scope > [role=\"tab\"]")];
  const names = tabs.flatMap(tab => [...tab.classList]);

  return {
    base: [...new Set(names.filter(name => /^nav(?:Button|Item)_/.test(name) && !/Active/.test(name)))].join(" "),
    active: names.find(name => name.startsWith("navButtonActive_")) ?? "",
  };
}

/**
 * The Nitfree tab inside Discord's expression picker, next to GIFs, Stickers and Emoji.
 *
 * @param options - What to do when an item is picked, and when the tab is selected or left.
 * @param options.onpick - Called when an item is clicked or chosen with the keyboard.
 * @param options.onchange - Called when the Nitfree tab is selected or left.
 * @returns The controller.
 */
export function createPickerTab({ onpick, onchange }: TOptions): TPickerTab {
  let current: TInjected | null = null;
  let selected = false;
  let activeClass = "";
  let silenced: Element | null = null;

  const style = document.createElement("style");

  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);

  function findTabList(): Element | null {
    return findAll(document, SELECTORS.pickerTabList)[0] ?? null;
  }

  function discordPanel(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>(`:scope > [role="tabpanel"]:not(#${PANEL_ID})`);
  }

  function setSelected(next: boolean): void {
    if (selected !== next) {
      selected = next;
      onchange(next);
    }
  }

  // Leaving the Nitfree tab for one of Discord's, or switching tabs from Discord's chat bar buttons.
  const onDiscordTab = (event: Event): void => {
    const target = event.target as Element | null;

    if (selected && target?.closest("[role=\"tab\"]") && !target.closest(`#${TAB_ID}`)) {
      deselect();
    }
  };

  const onChatButton = (event: Event): void => {
    const target = event.target as Element | null;

    if (!selected || !target?.closest(".expression-picker-chat-input-button")) {
      return;
    }

    // Discord still thinks its emoji tab is showing, so its emoji button would close the picker.
    // Show the emoji tab instead, as that button does from any other tab.
    const backToEmoji = silenced?.id === "emoji-picker-tab" && findAll(target.closest(".expression-picker-chat-input-button")!, SELECTORS.emojiButton).length > 0;

    deselect();

    if (backToEmoji) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("click", onChatButton, true);

  function inject(tabList: Element): TInjected | null {
    const dialog = tabList.closest("[role=\"dialog\"]") ?? tabList.parentElement?.parentElement;
    const container = dialog?.querySelector<HTMLElement>("[role=\"tabpanel\"]")?.parentElement;

    if (!container) {
      return null;
    }

    const classes = tabClasses(tabList);

    activeClass ||= classes.active;

    const tab = document.createElement("div");

    tab.className = classes.base;
    tab.id = TAB_ID;
    tab.setAttribute("role", "tab");
    tab.tabIndex = 0;
    tab.dataset.nitfreeTab = "";
    tab.setAttribute("aria-controls", PANEL_ID);
    tab.setAttribute("aria-selected", "false");
    tab.textContent = i18n.t("extName");
    tab.addEventListener("click", () => void select());
    tab.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });

    const host = document.createElement("div");

    host.id = PANEL_ID;
    host.setAttribute("role", "tabpanel");
    host.setAttribute("aria-labelledby", TAB_ID);

    // `mount` returns the component's exports, here Library's focusSearch.
    const library = mount(Library, { target: host.attachShadow({ mode: "open" }), props: { onpick } }) as unknown as { focusSearch: () => void };

    tabList.append(tab);
    container.append(host);
    tabList.addEventListener("click", onDiscordTab, true);

    // React re-applies its own classes when it re-renders the tabs; put the selection back each time.
    const observer = new MutationObserver(() => sync());

    observer.observe(tabList, { attributes: true, subtree: true, attributeFilter: ["class", "aria-selected"] });

    return { tabList, observer, container, tab, host, library, component: library };
  }

  function teardown(): void {
    if (!current) {
      return;
    }

    current.observer.disconnect();
    current.tabList.removeEventListener("click", onDiscordTab, true);
    void unmount(current.component);
    current.tab.remove();
    current.host.remove();
    delete current.container.dataset.nitfreeSelected;
    current = null;
    silenced = null;
  }

  function sync(): void {
    if (!current) {
      return;
    }

    const { tabList, container, tab } = current;

    setAttribute(tab, "aria-selected", String(selected));

    if (activeClass && tab.classList.contains(activeClass) !== selected) {
      tab.classList.toggle(activeClass, selected);
    }

    if (!selected) {
      if (container.hasAttribute("data-nitfree-selected")) {
        delete container.dataset.nitfreeSelected;
      }

      return;
    }

    setAttribute(container, "data-nitfree-selected", "");

    for (const other of tabList.querySelectorAll(`:scope > [role="tab"]:not(#${TAB_ID})`)) {
      if (activeClass && other.classList.contains(activeClass)) {
        other.classList.remove(activeClass);
        silenced = other;
      }

      setAttribute(other, "aria-selected", "false");
    }
  }

  function scan(): void {
    const tabList = findTabList();

    if (current && (current.tabList !== tabList || !current.tab.isConnected || !current.host.isConnected)) {
      const keep = selected && tabList !== null;

      teardown();

      if (!keep) {
        setSelected(false);
      }
    }

    if (tabList && !current) {
      current = inject(tabList);
    }

    // The picker re-rendered while the Nitfree tab was selected: keep it selected.
    if (current && selected && !current.container.hasAttribute("data-nitfree-selected")) {
      select();
    }

    sync();
  }

  function select(): boolean {
    if (!current) {
      current = findTabList() ? inject(findTabList()!) : null;
    }

    if (!current) {
      return false;
    }

    const height = discordPanel(current.container)?.getBoundingClientRect().height || current.host.getBoundingClientRect().height;

    current.host.style.height = `${height || FALLBACK_HEIGHT}px`;
    setSelected(true);
    sync();
    current.library.focusSearch();

    return true;
  }

  function deselect(): void {
    if (silenced?.isConnected && activeClass) {
      silenced.classList.add(activeClass);
      silenced.setAttribute("aria-selected", "true");
    }

    silenced = null;
    setSelected(false);
    sync();
  }

  return {
    scan,
    select,
    deselect,
    isOpen: () => findTabList() !== null,
    stop: () => {
      document.removeEventListener("click", onChatButton, true);
      teardown();
      setSelected(false);
      style.remove();
    },
  };
}
