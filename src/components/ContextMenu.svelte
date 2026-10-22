<svelte:options css="injected" />

<!--
  The right-click menu on a library item, styled like Discord's context menus: Favorite, Details, Edit, Download, then
  Delete in red. Arrow keys move, Enter picks, Escape closes.
-->
<script lang="ts">
  import Download from "@lucide/svelte/icons/download";
  import Eye from "@lucide/svelte/icons/eye";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Star from "@lucide/svelte/icons/star";
  import StarOff from "@lucide/svelte/icons/star-off";
  import Trash from "@lucide/svelte/icons/trash";

  import { sendMessage } from "~/lib/messaging";
  import { openDetails } from "~/lib/ui/details.svelte";
  import { startEdit } from "~/lib/ui/editor.svelte";
  import { saveItem } from "~/lib/ui/export";
  import { closeMenu, menu } from "~/lib/ui/menu.svelte";
  import { focusAfterRemoval, tileAfterUnfavorite } from "~/lib/ui/tiles";
  import { deleteWithUndo } from "~/lib/ui/trash.svelte";



  const MARGIN = 8;

  let element: HTMLElement | undefined = $state();
  let position = $state({ left: 0, top: 0 });

  $effect(() => {
    if (!menu.item || !element) {
      return;
    }

    // Keep the menu inside the window, flipping left or up when there is no room.
    const { width, height } = element.getBoundingClientRect();
    const left = menu.x + width + MARGIN > window.innerWidth ? Math.max(MARGIN, menu.x - width) : menu.x;
    const top = menu.y + height + MARGIN > window.innerHeight ? Math.max(MARGIN, menu.y - height) : menu.y;

    position = { left, top };
    element.querySelector<HTMLElement>("[role=\"menuitem\"]")?.focus();
  });

  function items(): HTMLElement[] {
    return element ? [...element.querySelectorAll<HTMLElement>("[role=\"menuitem\"]")] : [];
  }

  function onKeydown(event: KeyboardEvent): void {
    const all = items();
    const index = all.indexOf(event.target as HTMLElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      all[(index + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
    }
    else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? all[0] : all.at(-1))?.focus();
    }
    else if (event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
    }
  }

  function toggleFavorite(): void {
    const { item, restoreFocus } = menu;

    closeMenu();

    // Leaving Favorites removes the tile from there, so focus follows the item to All files.
    (restoreFocus && item?.favorite ? tileAfterUnfavorite(restoreFocus) : restoreFocus)?.focus();

    if (item) {
      void sendMessage("library:update", { id: item.id, patch: { favorite: !item.favorite } }).catch(() => undefined);
    }
  }

  function view(): void {
    const { item, restoreFocus } = menu;

    closeMenu();

    if (item) {
      openDetails(item, restoreFocus);
    }
  }

  function edit(): void {
    const { item, restoreFocus } = menu;

    closeMenu();

    if (item) {
      startEdit(item, restoreFocus);
    }
  }

  function save(): void {
    const { item, restoreFocus } = menu;

    closeMenu();
    restoreFocus?.focus();

    if (item) {
      void saveItem(item);
    }
  }

  function remove(): void {
    const { item, restoreFocus } = menu;

    closeMenu();

    if (item) {
      // The tile goes away with the item, so focus moves on to the next one.
      if (restoreFocus) {
        focusAfterRemoval(restoreFocus);
      }

      deleteWithUndo(item);
    }
  }
</script>

{#if menu.item}
  <div
    bind:this={element}
    class="menu"
    role="menu"
    tabindex="-1"
    aria-label={menu.item.title}
    style:left="{position.left}px"
    style:top="{position.top}px"
    onkeydown={onKeydown}
    oncontextmenu={(event) => {
      // On Windows the menu key opens the browser's own menu when released, over this one.
      event.preventDefault();
    }}
  >
    <button class="item" type="button" role="menuitem" onclick={toggleFavorite}>
      {menu.item.favorite ? i18n.t("menu.unfavorite") : i18n.t("menu.favorite")}
      {#if menu.item.favorite}<StarOff size={18} aria-hidden="true" />{:else}<Star size={18} aria-hidden="true" />{/if}
    </button>
    <button class="item" type="button" role="menuitem" onclick={view}>
      {i18n.t("menu.details")}
      <Eye size={18} aria-hidden="true" />
    </button>
    <button class="item" type="button" role="menuitem" onclick={edit}>
      {i18n.t("menu.edit")}
      <Pencil size={18} aria-hidden="true" />
    </button>
    <button class="item" type="button" role="menuitem" onclick={save}>
      {i18n.t("menu.download")}
      <Download size={18} aria-hidden="true" />
    </button>
    <div class="separator" role="separator"></div>
    <button class="item danger" type="button" role="menuitem" onclick={remove}>
      {i18n.t("menu.delete")}
      <Trash size={18} aria-hidden="true" />
    </button>
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 188px;
    max-width: 320px;
    padding: 6px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-surface-higher, var(--nf-bg-elevated, #2b2d31));
    box-shadow: 0 8px 16px rgb(0 0 0 / 24%);
    font-family: var(--font-primary, inherit);
    outline: none;
    pointer-events: auto;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    box-sizing: border-box;
    min-height: 32px;
    margin: 2px 0;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-xs, 4px);
    background: none;
    color: var(--interactive-text-default, var(--nf-text, #dbdee1));
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    text-align: start;
    cursor: pointer;
  }

  .item :global(svg) {
    flex: none;
  }

  .item:hover,
  .item:focus-visible {
    background-color: var(--background-mod-subtle, rgb(151 151 159 / 12%));
    color: var(--interactive-text-active, #fff);
    outline: none;
  }

  .danger {
    color: var(--text-feedback-critical, #f57976);
  }

  .danger:hover,
  .danger:focus-visible {
    background-color: var(--control-critical-primary-background-default, #da373c);
    color: var(--control-critical-primary-text-default, #fff);
  }

  .separator {
    height: 1px;
    margin: 4px 8px;
    background-color: var(--border-subtle, var(--nf-border, #3f4147));
  }
</style>
