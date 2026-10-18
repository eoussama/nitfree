<svelte:options css="injected" />

<!--
  The standalone Nitfree panel, anchored above the chat bar button that opened it.
  Lives in a shadow root so Discord's styles cannot reach it; colors come from the theme engine's
  --nf-* variables, which inherit into the shadow root.
-->
<script lang="ts">
  import { cubicOut } from "svelte/easing";

  import { closePanel, panel } from "~/lib/ui/panel.svelte";

  import Logo from "./Logo.svelte";



  const { host }: { host: HTMLElement } = $props();

  const GAP = 8;

  let dialog: HTMLElement | undefined = $state();
  let position = $state({ bottom: 0, right: 0 });

  function place(): void {
    const rect = panel.anchor?.getBoundingClientRect();

    if (rect) {
      position = { bottom: window.innerHeight - rect.top + GAP, right: Math.max(GAP, window.innerWidth - rect.right) };
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
    if (!panel.open) {
      return;
    }

    place();
    dialog?.focus();

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

      if (!path.includes(host) && !(panel.anchor && path.includes(panel.anchor))) {
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

{#if panel.open}
  <div
    bind:this={dialog}
    class="panel"
    role="dialog"
    aria-label={i18n.t("panel.label")}
    tabindex="-1"
    style:bottom="{position.bottom}px"
    style:right="{position.right}px"
    transition:pop
  >
    <header class="header">
      <span class="mark"><Logo /></span>
      <h2 class="title">{i18n.t("extName")}</h2>
    </header>
    <p class="placeholder">{i18n.t("panel.placeholder")}</p>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    width: min(440px, calc(100vw - 16px));
    min-height: 240px;
    padding: 16px;
    border: 1px solid var(--nf-border, #3f4147);
    border-radius: var(--nf-radius, 8px);
    background: var(--nf-bg-elevated, #2b2d31);
    color: var(--nf-text, #dbdee1);
    box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
    font-family: inherit;
    outline: none;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mark {
    display: block;
    width: 20px;
    height: 20px;
    overflow: hidden;
    border-radius: 5px;
  }

  .title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .placeholder {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    margin: 0;
    text-align: center;
    font-size: 14px;
    color: var(--nf-muted, #949ba4);
  }
</style>
