<svelte:options css="injected" />

<!--
  Everything Nitfree shows above Discord's page: the add and edit dialog, the item menu, and the
  notice and undo toast at the bottom. Escape closes the tag suggestions, the menu or the dialog first, before Discord or Nitfree's
  panel see it; Tab stays inside the dialog while it is open. Files dropped here never reach Discord's
  upload; dropped or pasted on the add dialog, they join it.
-->
<script lang="ts">
  import { closeEditor, editor, startAdd } from "~/lib/ui/editor.svelte";
  import { escapeTop } from "~/lib/ui/escape";
  import { closeMenu, menu } from "~/lib/ui/menu.svelte";

  import ContextMenu from "./ContextMenu.svelte";
  import EditorDialog from "./EditorDialog.svelte";
  import Notice from "./Notice.svelte";
  import UndoToast from "./UndoToast.svelte";



  const DRAG_EVENTS = ["dragenter", "dragover", "drop"] as const;

  const { host }: { host: HTMLElement } = $props();

  function focusables(): HTMLElement[] {
    const dialog = host.shadowRoot?.querySelector("[role=\"dialog\"]");

    return dialog
      ? [...dialog.querySelectorAll<HTMLElement>("button, input, textarea, select, [tabindex]")].filter(element => element.tabIndex >= 0 && !element.matches(":disabled"))
      : [];
  }

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && (menu.item || editor.mode)) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (escapeTop()) {
          return;
        }

        if (menu.item) {
          closeMenu(true);
        }
        else if (!editor.saving) {
          closeEditor();
        }

        return;
      }

      if (event.key === "Tab" && editor.mode && !menu.item) {
        const all = focusables();
        const active = host.shadowRoot?.activeElement;

        // Nothing to focus while it saves: Tab stays on the dialog.
        if (!all.length) {
          event.preventDefault();

          return;
        }

        if (!active || !all.includes(active as HTMLElement)) {
          event.preventDefault();
          all[0]!.focus();
        }
        else if (event.shiftKey && active === all[0]) {
          event.preventDefault();
          all.at(-1)!.focus();
        }
        else if (!event.shiftKey && active === all.at(-1)) {
          event.preventDefault();
          all[0]!.focus();
        }
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (menu.item && !event.composedPath().some(node => node instanceof HTMLElement && node.getAttribute("role") === "menu")) {
        closeMenu();
      }
    };

    const onScroll = (): void => {
      if (menu.item) {
        closeMenu();
      }
    };

    const onDrag = (event: DragEvent): void => {
      const adding = editor.mode === "add" && !editor.saving;

      event.preventDefault();
      event.stopPropagation();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = adding ? "copy" : "none";
      }

      if (event.type === "drop" && adding) {
        void startAdd(event.dataTransfer?.files ?? []);
      }
    };

    const onPaste = (event: ClipboardEvent): void => {
      const files = [...event.clipboardData?.files ?? []];

      if (files.length) {
        event.preventDefault();

        if (editor.mode === "add" && !editor.saving) {
          void startAdd(files);
        }
      }
    };

    for (const type of DRAG_EVENTS) {
      host.addEventListener(type, onDrag);
    }

    host.addEventListener("paste", onPaste);

    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      for (const type of DRAG_EVENTS) {
        host.removeEventListener(type, onDrag);
      }

      host.removeEventListener("paste", onPaste);

      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  });
</script>

<EditorDialog />
<ContextMenu />
<div class="toasts">
  <Notice />
  <UndoToast />
</div>

<style>
  .toasts {
    position: fixed;
    bottom: 24px;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: calc(100vw - 32px);
    transform: translateX(-50%);
    pointer-events: none;
  }
</style>
