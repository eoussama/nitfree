<svelte:options css="injected" />

<!--
  The right-click menu on a library item, styled like Discord's context menus: Favorite, Edit, then
  Delete in red. Arrow keys move, Enter picks, Escape closes.
-->
<script lang="ts">
  import { sendMessage } from "~/lib/messaging";
  import { startEdit } from "~/lib/ui/editor.svelte";
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

  function edit(): void {
    const { item, restoreFocus } = menu;

    closeMenu();

    if (item) {
      startEdit(item, restoreFocus);
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
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.81 2.86c.38-1.15 2-1.15 2.38 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4L12 18.16l-4.95 3.6c-.98.7-2.3-.26-1.93-1.4l1.9-5.82-4.95-3.6a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83Z" /></svg>
    </button>
    <button class="item" type="button" role="menuitem" onclick={edit}>
      {i18n.t("menu.edit")}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.96 5.46 4.58 4.58a1 1 0 0 0 1.42 0l1.38-1.38a2 2 0 0 0 0-2.82l-3.18-3.18a2 2 0 0 0-2.82 0l-1.38 1.38a1 1 0 0 0 0 1.42ZM2.11 20.16l.73-4.22a3 3 0 0 1 .83-1.61l7.87-7.87a1 1 0 0 1 1.42 0l4.58 4.58a1 1 0 0 1 0 1.42l-7.87 7.87a3 3 0 0 1-1.6.83l-4.23.73a1.5 1.5 0 0 1-1.73-1.73Z" /></svg>
    </button>
    <div class="separator" role="separator"></div>
    <button class="item danger" type="button" role="menuitem" onclick={remove}>
      {i18n.t("menu.delete")}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5ZM5.06 7a1 1 0 0 0-1 1.06l.76 12.13a3 3 0 0 0 3 2.81h8.36a3 3 0 0 0 3-2.81l.75-12.13a1 1 0 0 0-1-1.06H5.07Z" /></svg>
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

  .item svg {
    flex: none;
    width: 18px;
    height: 18px;
    fill: currentcolor;
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
