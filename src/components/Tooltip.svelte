<svelte:options css="injected" />

<!--
  The tooltip, styled like Discord's: its surface color with a subtle border, a pointer toward the
  element, and a quick grow-in from that side. It sits 8 px beside the element it describes, and
  8 px inside the window's edges.
-->
<script lang="ts">
  import { motion } from "~/lib/ui/motion.svelte";
  import { tooltipState } from "~/lib/ui/tooltip.svelte";



  const GAP = 8;
  const MARGIN = 8;

  let element: HTMLElement | undefined = $state();
  let position = $state({ left: 0, top: 0 });

  $effect(() => {
    const { rect, side, text } = tooltipState;

    if (!rect || !text || !element) {
      return;
    }

    // Its layout size: the grow-in animation scales what getBoundingClientRect would measure.
    const { offsetWidth: width, offsetHeight: height } = element;
    const centerX = rect.left + rect.width / 2 - width / 2;
    const centerY = rect.top + rect.height / 2 - height / 2;
    const place = {
      top: { left: centerX, top: rect.top - height - GAP },
      bottom: { left: centerX, top: rect.bottom + GAP },
      left: { left: rect.left - width - GAP, top: centerY },
      right: { left: rect.right + GAP, top: centerY },
    }[side];

    position = {
      left: Math.min(Math.max(MARGIN, place.left), window.innerWidth - width - MARGIN),
      top: Math.min(Math.max(MARGIN, place.top), window.innerHeight - height - MARGIN),
    };
  });
</script>

{#if tooltipState.text}
  <div
    bind:this={element}
    class="tooltip {tooltipState.side}"
    class:reduced={motion.reduced}
    role="tooltip"
    style:left="{position.left}px"
    style:top="{position.top}px"
  >
    <span class="pointer" aria-hidden="true"></span>
    <div class="content">{tooltipState.text}</div>
  </div>
{/if}

<style>
  /* Discord's tooltip: surface color, subtle border, 8 px corners, medium 14 px text. */
  .tooltip {
    position: fixed;
    box-sizing: border-box;
    max-width: 190px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: 8px;
    background-color: var(--background-surface-high, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    font-size: 14px;
    font-weight: var(--font-weight-medium, 500);
    line-height: 16px;
    overflow-wrap: break-word;
    box-shadow: var(--shadow-high, 0 8px 16px rgb(0 0 0 / 24%));
    pointer-events: none;
    animation: appear 0.1s ease-out;
  }

  .content {
    overflow: hidden;
    padding: 8px 12px;
  }

  /* A 5 px triangle in the tooltip's color, pointing at the element. */
  .pointer {
    position: absolute;
    width: 0;
    height: 0;
    border: 5px solid transparent;
    border-top-color: var(--background-surface-high, var(--nf-bg-elevated, #2b2d31));
  }

  .top {
    transform-origin: 50% 100%;
  }

  /* Physical sides, as the tooltip is placed by them whatever the writing direction. */
  .top .pointer {
    top: 100%;
    left: 50%;
    margin-left: -5px;
  }

  .bottom {
    transform-origin: 50% 0;
  }

  .bottom .pointer {
    bottom: 100%;
    left: 50%;
    margin-left: -5px;
    transform: rotate(180deg);
  }

  .left {
    transform-origin: 100% 50%;
  }

  .left .pointer {
    top: 50%;
    left: 100%;
    margin-top: -5px;
    transform: rotate(-90deg);
  }

  .right {
    transform-origin: 0 50%;
  }

  .right .pointer {
    top: 50%;
    right: 100%;
    margin-top: -5px;
    transform: rotate(90deg);
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
  }

  .reduced {
    animation: none;
  }
</style>
