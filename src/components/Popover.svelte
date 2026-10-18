<svelte:options css="injected" />

<!--
  The standalone Nitfree panel, used when Discord's picker cannot host the Nitfree tab. It opens
  above the composer that holds the button that opened it, aligned to the composer's right edge
  like Discord's picker. Lives in a shadow root so Discord's styles cannot reach it; colors come
  from the theme engine's --nf-* variables, which inherit into the shadow root.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import { cubicOut } from "svelte/easing";

  import { SELECTORS } from "~/lib/discord";
  import { closePanel, panel } from "~/lib/ui/panel.svelte";

  import Library from "./Library.svelte";



  type TProps = {
    host: HTMLElement;
    onpick?: (item: TItem, send: boolean) => void;
  };

  const { host, onpick }: TProps = $props();

  const GAP = 8;
  const MARGIN = 16;

  let content: ReturnType<typeof Library> | undefined = $state();
  let position = $state({ bottom: 0, right: 0 });

  function place(): void {
    const anchor = panel.anchor;
    const box = (anchor?.closest(SELECTORS.composerBox.join(",")) ?? anchor)?.getBoundingClientRect();

    if (box) {
      position = { bottom: window.innerHeight - box.top + GAP, right: Math.max(GAP, window.innerWidth - box.right) };
    }
  }

  function reducedMotion(): boolean {
    return document.documentElement.dataset.nfReducedMotion === "true";
  }

  // Discord's picker motion: a short scale and fade with a spring-like curve.
  function pop(_: Element): { duration: number; easing: (t: number) => number; css: (t: number) => string } {
    return {
      duration: reducedMotion() ? 0 : 160,
      easing: cubicOut,
      css: t => `opacity: ${t}; transform: scale(${0.95 + 0.05 * t}); transform-origin: bottom right;`,
    };
  }

  $effect(() => {
    if (!panel.open || panel.mode !== "popover") {
      return;
    }

    place();
    content?.focusSearch();

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      // Keep Discord from also acting on this Escape, e.g. cancelling a reply.
      event.stopPropagation();

      const anchor = panel.anchor;

      closePanel();
      anchor?.focus();
    };

    const onPointerDown = (event: PointerEvent): void => {
      const path = event.composedPath();

      // Presses in Nitfree's overlay (the dialog, the item menu) belong to the panel too.
      const inOverlay = path.some(node => node instanceof HTMLElement && node.dataset.nitfreeOverlay !== undefined);

      if (!inOverlay && !path.includes(host) && !(panel.anchor && path.includes(panel.anchor))) {
        closePanel();
      }
    };

    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", place);

    return () => {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", place);
    };
  });
</script>

{#if panel.open && panel.mode === "popover"}
  <div
    class="panel"
    role="dialog"
    aria-label={i18n.t("panel.label")}
    style:bottom="{position.bottom}px"
    style:right="{position.right}px"
    style:max-height="calc(100vh - {position.bottom + MARGIN}px)"
    transition:pop
  >
    <Library bind:this={content} {onpick} />
  </div>
{/if}

<style>
  /* Sized and colored like Discord's expression picker, without its tab bar. */
  .panel {
    --nf-header-top: 16px;

    position: fixed;
    box-sizing: border-box;
    width: min(498px, calc(100vw - 16px));
    height: 442px;
    overflow: hidden;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, var(--nf-radius, 8px));
    background-color: var(--background-surface-high, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
    font-family: var(--font-primary, inherit);
  }

  .panel :global(*) {
    box-sizing: border-box;
  }
</style>
