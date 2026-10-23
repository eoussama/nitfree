<svelte:options css="injected" />

<!--
  An item shown as large as the window allows, never larger than its own size, over a dark scrim.
  It zooms in steps up to eight times that, from its toolbar, the + and - keys or the wheel, and
  0 or the zoom level fits it back. Zoomed in, it is dragged to look around. Escape, the close
  button or a click beside the image closes it.
-->
<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import { tick } from "svelte";

  import { onEscape } from "~/lib/ui/escape";



  type TProps = {
    url: string;
    title: string;
    width: number;
    height: number;
    onclose: () => void;
  };

  const { url, title, width, height, onclose }: TProps = $props();

  /**
   * The zoom steps, as multiples of the fitted size.
   */
  const STEPS = [1, 1.5, 2, 3, 4, 6, 8];

  /**
   * The room kept around the fitted image: the toolbar above, a margin on the other sides.
   */
  const ROOM = { x: 48, y: 72 };

  /**
   * How far the pointer may move during a press and still count as a click.
   */
  const CLICK_SLOP = 4;

  const percent = new Intl.NumberFormat(i18n.t("locale"), { style: "percent" });

  let root: HTMLElement | undefined = $state();
  let stage: HTMLElement | undefined = $state();
  let step = $state(0);
  let viewport = $state({ width: window.innerWidth, height: window.innerHeight });
  let drag: { x: number; y: number; left: number; top: number; moved: boolean; onImage: boolean } | null = null;
  let dragging = $state(false);

  // As large as the window allows, but never past the file's own size.
  const fit = $derived(Math.min(1, (viewport.width - ROOM.x * 2) / width, (viewport.height - ROOM.y * 2) / height));
  const scale = $derived(Math.max(fit, 0) * STEPS[step]!);
  const last = STEPS.length - 1;

  $effect(() => onEscape(onclose));

  $effect(() => {
    root?.querySelector<HTMLElement>("[data-close]")?.focus();

    const onResize = (): void => {
      viewport = { width: window.innerWidth, height: window.innerHeight };
    };

    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  });

  // Zooms to a step, keeping the point under the pointer, or the middle, where it is.
  async function zoomTo(next: number, anchor?: { x: number; y: number }): Promise<void> {
    const target = Math.min(Math.max(next, 0), last);

    if (target === step || !stage) {
      return;
    }

    const point = anchor ?? { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    const ratio = STEPS[target]! / STEPS[step]!;
    const x = stage.scrollLeft + point.x;
    const y = stage.scrollTop + point.y;

    step = target;
    await tick();

    stage.scrollLeft = x * ratio - point.x;
    stage.scrollTop = y * ratio - point.y;
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      void zoomTo(step + 1);
    }
    else if (event.key === "-") {
      event.preventDefault();
      void zoomTo(step - 1);
    }
    else if (event.key === "0") {
      event.preventDefault();
      void zoomTo(0);
    }
  }

  function onWheel(event: WheelEvent): void {
    if (!stage || event.deltaY === 0) {
      return;
    }

    event.preventDefault();

    const box = stage.getBoundingClientRect();

    void zoomTo(step + (event.deltaY < 0 ? 1 : -1), { x: event.clientX - box.left, y: event.clientY - box.top });
  }

  function onPointerDown(event: PointerEvent): void {
    if (!stage || event.button !== 0) {
      return;
    }

    // Captured, the release is aimed at the stage, so where the press began is noted now.
    drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false, onImage: event.target instanceof HTMLImageElement };
    stage.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || !stage) {
      return;
    }

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (!drag.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
      drag.moved = true;
      dragging = true;
    }

    if (drag.moved) {
      stage.scrollLeft = drag.left - dx;
      stage.scrollTop = drag.top - dy;
    }
  }

  // A click on the image zooms in, back out from the last step; a click beside it closes.
  function onPointerUp(event: PointerEvent): void {
    const pressed = drag;

    drag = null;
    dragging = false;

    if (!pressed || pressed.moved || !stage) {
      return;
    }

    if (pressed.onImage) {
      const box = stage.getBoundingClientRect();

      void zoomTo(step === last ? 0 : step + 1, { x: event.clientX - box.left, y: event.clientY - box.top });
    }
    else {
      onclose();
    }
  }
</script>

<div bind:this={root} class="lightbox" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={onKeydown}>
  <div
    bind:this={stage}
    class="stage"
    class:dragging
    role="presentation"
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={() => {
      drag = null;
      dragging = false;
    }}
  >
    <div class="canvas" style:padding="{ROOM.y}px {ROOM.x}px">
      <img
        class="image"
        class:max={step === last}
        src={url}
        alt={title}
        draggable="false"
        style:width="{width * scale}px"
        style:height="{height * scale}px"
      />
    </div>
  </div>

  <div class="toolbar">
    <span class="name">:{title}:</span>
    <div class="controls">
      <button class="control" type="button" aria-label={i18n.t("details.zoomOut")} disabled={step === 0} onclick={() => void zoomTo(step - 1)}>
        <ZoomOut size={20} aria-hidden="true" />
      </button>
      <button class="control level" type="button" aria-label={i18n.t("details.fit")} disabled={step === 0} onclick={() => void zoomTo(0)}>
        {percent.format(scale)}
      </button>
      <button class="control" type="button" aria-label={i18n.t("details.zoomIn")} disabled={step === last} onclick={() => void zoomTo(step + 1)}>
        <ZoomIn size={20} aria-hidden="true" />
      </button>
      <span class="separator" aria-hidden="true"></span>
      <button class="control" type="button" data-close aria-label={i18n.t("editor.close")} onclick={onclose}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  </div>
</div>

<style>
  .lightbox {
    position: fixed;
    inset: 0;
    background-color: rgb(0 0 0 / 85%);
    color: #fff;
    font-family: var(--font-primary, inherit);
    pointer-events: auto;
  }

  .lightbox:focus {
    outline: none;
  }

  .stage {
    position: absolute;
    inset: 0;
    overflow: auto;
    scrollbar-width: none;
  }

  .stage.dragging {
    cursor: grabbing;
  }

  .canvas {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: max-content;
    min-width: 100%;
    height: max-content;
    min-height: 100%;
  }

  .image {
    display: block;
    max-width: none;
    cursor: zoom-in;
    user-select: none;
  }

  .image.max {
    cursor: zoom-out;
  }

  .dragging .image {
    cursor: grabbing;
  }

  .toolbar {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 24px;
    background: linear-gradient(rgb(0 0 0 / 60%), transparent);
    pointer-events: none;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .controls {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
    background-color: var(--background-surface-high, rgb(43 45 49 / 92%));
    pointer-events: auto;
  }

  .control {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 6px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--interactive-icon-default, #b5bac1);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .control:hover:not(:disabled) {
    background-color: var(--interactive-background-hover, rgb(151 151 159 / 12%));
    color: var(--interactive-icon-hover, #fff);
  }

  .control:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .control:focus-visible {
    outline: 2px solid var(--border-focus, #5865f2);
    outline-offset: -2px;
  }

  .level {
    min-width: 56px;
    font-variant-numeric: tabular-nums;
  }

  .level:disabled {
    opacity: 1;
  }

  .separator {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background-color: var(--border-subtle, rgb(255 255 255 / 16%));
  }
</style>
