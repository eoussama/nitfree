<svelte:options css="injected" />

<!--
  Quick edits to a draft's image, over the add and edit dialog: crop, free or square; the first and
  last frames of an animation; and a solid background made transparent. Edits are always made from
  the original, which the draft keeps, so opening it again shows them and they can be changed. The
  preview is smaller than the original; the edited file is made at full size on Apply.
-->
<script lang="ts">
  import type { TColor, TPoint, TPreviewFrame, TRect } from "~/lib/media/edit";
  import type { TDraft } from "~/lib/ui/editor.svelte";

  import { toError, tryCatch } from "@eoussama/core";
  import Pause from "@lucide/svelte/icons/pause";
  import Pipette from "@lucide/svelte/icons/pipette";
  import Play from "@lucide/svelte/icons/play";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";

  import { inspectImage } from "~/lib/media";
  import { clearBackground, dragRect, fullRect, hasEdits, isFullRect, moveRect, previewFrames, resizeRect, squareWithin } from "~/lib/media/edit";
  import { editDraft, editSource, revertDraft } from "~/lib/ui/editor.svelte";
  import { onEscape } from "~/lib/ui/escape";
  import { motion } from "~/lib/ui/motion.svelte";



  const { draft, onclose }: { draft: TDraft; onclose: () => void } = $props();

  /**
   * The longest side frames are read at for the preview.
   */
  const PREVIEW_MAX = 640;

  /**
   * The preview's height; its width is the dialog's. Small images are shown larger, up to this many times.
   */
  const STAGE_HEIGHT = 300;
  const MAX_ZOOM = 8;

  /**
   * The room around the image, for the crop's corners.
   */
  const STAGE_MARGIN = 12;

  const DEFAULT_TOLERANCE = 10;

  const seconds = new Intl.NumberFormat(i18n.t("locale"), { style: "unit", unit: "second", maximumFractionDigits: 2 });

  type TDrag = { kind: "move"; from: TPoint; rect: TRect } | { kind: "size"; anchor: TPoint };
  type TCorner = "nw" | "ne" | "sw" | "se";

  let dialog: HTMLElement | undefined = $state();
  let box: HTMLElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let stageWidth = $state(0);

  let source: File | null = null;
  let size = $state({ width: 0, height: 0 });
  let frames: TPreviewFrame[] = $state.raw([]);
  let failure: string | null = $state(null);
  let applying = $state(false);

  let crop: TRect = $state({ x: 0, y: 0, width: 0, height: 0 });
  let square = $state(false);
  let start = $state(0);
  let end = $state(0);
  let index = $state(0);
  let playing = $state(!motion.reduced);
  let removing = $state(false);
  let color: TColor = $state([255, 255, 255]);
  let tolerance = $state(DEFAULT_TOLERANCE);
  let picking = $state(false);
  let drag: TDrag | null = null;

  // Frames with the background cleared, kept while the color and tolerance stay the same.
  let cleared: (ImageData | undefined)[] = [];
  let clearedFor = "";

  const loaded = $derived(frames.length > 0);
  const animated = $derived(frames.length > 1);
  const scale = $derived(loaded ? Math.min((stageWidth - STAGE_MARGIN * 2) / size.width, (STAGE_HEIGHT - STAGE_MARGIN * 2) / size.height, MAX_ZOOM) : 0);
  const shown = $derived({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
  const preview = $derived(frames[0]?.canvas ?? null);
  const duration = $derived(frames.slice(start, end + 1).reduce((total, frame) => total + frame.duration, 0));
  const swatch = $derived(`rgb(${color.join(" ")})`);
  const squareHint = $derived(loaded && (draft.type === "emoji" || draft.type === "sticker") && crop.width !== crop.height);

  onMount(() => {
    let cancelled = false;

    void (async () => {
      const [error, read] = await tryCatch(async () => {
        const file = await editSource(draft);
        const info = file && inspectImage(new Uint8Array(await file.arrayBuffer()));

        if (!file || !info) {
          throw new Error(i18n.t("editor.unreadable"));
        }

        return { file, info, frames: await previewFrames(file, info, PREVIEW_MAX) };
      });

      if (cancelled) {
        return;
      }

      if (error || !read.frames.length) {
        failure = i18n.t("imageEditor.failed", { error: toError(error ?? i18n.t("editor.unreadable")).message });

        return;
      }

      // The edits the draft was made with, when it was edited from this very file.
      const edits = draft.source ? draft.edits : null;

      source = read.file;
      size = { width: read.info.width, height: read.info.height };
      crop = edits?.crop ?? fullRect(size);
      square = crop.width === crop.height && !isFullRect(crop, size);
      start = edits?.trim?.start ?? 0;
      end = Math.min(edits?.trim?.end ?? Infinity, read.frames.length - 1);
      index = start;
      removing = Boolean(edits?.background);
      color = edits?.background?.color ?? cornerColor(read.frames[0]!.canvas);
      tolerance = edits?.background?.tolerance ?? DEFAULT_TOLERANCE;
      frames = read.frames;
    })();

    return () => {
      cancelled = true;
    };
  });

  $effect(() => onEscape(() => !applying && (picking ? (picking = false) : onclose())));

  $effect(() => {
    dialog?.focus();
  });

  // Plays the kept frames over and over, unless paused.
  $effect(() => {
    if (!playing || !animated) {
      return;
    }

    const timer = setTimeout(() => {
      index = index < start || index >= end ? start : index + 1;
    }, frames[index]?.duration ?? 100);

    return () => clearTimeout(timer);
  });

  $effect(() => {
    const frame = frames[index];
    const context = canvas?.getContext("2d");

    if (!frame || !context) {
      return;
    }

    const { width, height } = frame.canvas;

    context.clearRect(0, 0, width, height);

    if (!removing) {
      context.drawImage(frame.canvas, 0, 0);

      return;
    }

    const key = `${color.join()}|${tolerance}`;

    if (key !== clearedFor) {
      cleared = [];
      clearedFor = key;
    }

    let pixels = cleared[index];

    if (!pixels) {
      pixels = frame.canvas.getContext("2d")!.getImageData(0, 0, width, height);
      clearBackground(pixels.data, width, height, color, tolerance);
      cleared[index] = pixels;
    }

    context.putImageData(pixels, 0, 0);
  });

  function cornerColor(frame: OffscreenCanvas): TColor {
    const [r, g, b] = frame.getContext("2d")!.getImageData(0, 0, 1, 1).data;

    return [r ?? 255, g ?? 255, b ?? 255];
  }

  function pointOf(event: PointerEvent): TPoint {
    const bounds = box!.getBoundingClientRect();

    return { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale };
  }

  // The color under a point of the original, read from the frame shown, before its background is cleared.
  function pickColor(point: TPoint): void {
    const frame = frames[index]?.canvas;

    if (!frame) {
      return;
    }

    const x = Math.min(Math.floor((point.x / size.width) * frame.width), frame.width - 1);
    const y = Math.min(Math.floor((point.y / size.height) * frame.height), frame.height - 1);
    const [r, g, b] = frame.getContext("2d")!.getImageData(Math.max(x, 0), Math.max(y, 0), 1, 1).data;

    color = [r ?? 0, g ?? 0, b ?? 0];
    removing = true;
  }

  function opposite(corner: TCorner): TPoint {
    return {
      x: corner.endsWith("w") ? crop.x + crop.width : crop.x,
      y: corner.startsWith("n") ? crop.y + crop.height : crop.y,
    };
  }

  // A corner resizes the crop, its inside moves it, and anywhere else on the image draws a new one.
  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !box || applying) {
      return;
    }

    event.preventDefault();

    const point = pointOf(event);
    const target = event.target as HTMLElement;
    const corner = target.dataset.corner as TCorner | undefined;

    if (picking) {
      pickColor(point);
      picking = false;

      return;
    }

    if (corner) {
      drag = { kind: "size", anchor: opposite(corner) };
    }
    // A crop of the whole image cannot move: a press inside it starts a new one.
    else if (target.closest("[data-crop]") && !isFullRect(crop, size)) {
      drag = { kind: "move", from: point, rect: crop };
    }
    else {
      drag = { kind: "size", anchor: point };
      crop = dragRect(point, point, size, square);
    }

    box.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag) {
      return;
    }

    const point = pointOf(event);

    crop = drag.kind === "move"
      ? moveRect(drag.rect, Math.round(point.x - drag.from.x), Math.round(point.y - drag.from.y), size)
      : dragRect(drag.anchor, point, size, square);
  }

  // Arrow keys move the crop, and with Shift resize it, by about four pixels on screen.
  function onCropKeydown(event: KeyboardEvent): void {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = steps[event.key];

    if (!direction) {
      return;
    }

    event.preventDefault();

    const step = Math.max(1, Math.round(4 / scale));
    const [dx, dy] = [direction[0] * step, direction[1] * step];

    crop = event.shiftKey ? resizeRect(crop, dx, dy, size, square) : moveRect(crop, dx, dy, size);
  }

  function setSquare(value: boolean): void {
    square = value;

    if (value) {
      crop = squareWithin(crop);
    }
  }

  function resetCrop(): void {
    crop = fullRect(size);
    square = false;
  }

  function setStart(value: number): void {
    start = Math.min(value, end);
    index = start;
    playing = false;
  }

  function setEnd(value: number): void {
    end = Math.max(value, start);
    index = end;
    playing = false;
  }

  function reset(): void {
    resetCrop();
    start = 0;
    end = frames.length - 1;
    index = 0;
    removing = false;
    picking = false;
  }

  async function apply(): Promise<void> {
    if (!source || applying) {
      return;
    }

    const edits = {
      crop: isFullRect(crop, size) ? null : crop,
      trim: animated && (start > 0 || end < frames.length - 1) ? { start, end } : null,
      background: removing ? { color, tolerance } : null,
    };

    applying = true;
    failure = null;

    const [error] = await tryCatch(async () => {
      if (hasEdits(edits)) {
        await editDraft(draft, source!, edits);
      }
      else if (draft.source) {
        await revertDraft(draft);
      }
    });

    applying = false;

    if (error) {
      failure = i18n.t("imageEditor.failed", { error: toError(error).message });

      return;
    }

    onclose();
  }
</script>

<div class="backdrop" aria-hidden="true" onpointerdown={() => !applying && onclose()}></div>
<div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="nf-image-editor-title" tabindex="-1">
  <header class="modal-header">
    <h2 class="modal-title" id="nf-image-editor-title">{i18n.t("imageEditor.title")}</h2>
    <button class="close" type="button" aria-label={i18n.t("editor.cancel")} disabled={applying} onclick={onclose}>
      <X size={24} aria-hidden="true" />
    </button>
  </header>

  <div class="modal-content">
    <div class="stage" bind:clientWidth={stageWidth} style:height="{STAGE_HEIGHT}px">
      {#if loaded && scale > 0}
        <div
          bind:this={box}
          class="image"
          class:picking
          role="presentation"
          style:width="{shown.width}px"
          style:height="{shown.height}px"
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={() => (drag = null)}
          onpointercancel={() => (drag = null)}
        >
          <canvas bind:this={canvas} class="frame" class:pixelated={scale * size.width > (preview?.width ?? 0)} width={preview?.width} height={preview?.height}></canvas>
          <div class="shade" aria-hidden="true">
            <div class="hole" style:left="{crop.x * scale}px" style:top="{crop.y * scale}px" style:width="{crop.width * scale}px" style:height="{crop.height * scale}px"></div>
          </div>
          <button
            class="crop"
            type="button"
            data-crop
            aria-label={i18n.t("imageEditor.cropArea")}
            style:left="{crop.x * scale}px"
            style:top="{crop.y * scale}px"
            style:width="{crop.width * scale}px"
            style:height="{crop.height * scale}px"
            onkeydown={onCropKeydown}
          >
            {#each ["nw", "ne", "sw", "se"] as corner (corner)}
              <span class="handle {corner}" data-corner={corner} aria-hidden="true"></span>
            {/each}
          </button>
        </div>
      {:else if !failure}
        <p class="status">{i18n.t("imageEditor.loading")}</p>
      {/if}
    </div>

    {#if failure}
      <p class="error" role="alert">{failure}</p>
    {/if}

    {#if loaded}
      <p class="size" data-size>
        {i18n.t("imageEditor.size", { width: crop.width, height: crop.height })}
        {#if squareHint}<span class="hint"> · {i18n.t("imageEditor.squareHint")}</span>{/if}
      </p>

      <fieldset class="section" disabled={applying}>
        <legend class="label">{i18n.t("imageEditor.crop")}</legend>
        <div class="row">
          <div class="segments" role="radiogroup" aria-label={i18n.t("imageEditor.aspect")}>
            <button class="segment" class:selected={!square} type="button" role="radio" aria-checked={!square} onclick={() => setSquare(false)}>{i18n.t("imageEditor.free")}</button>
            <button class="segment" class:selected={square} type="button" role="radio" aria-checked={square} onclick={() => setSquare(true)}>{i18n.t("imageEditor.square")}</button>
          </div>
          <button class="link" type="button" disabled={isFullRect(crop, size)} onclick={resetCrop}>{i18n.t("imageEditor.uncrop")}</button>
        </div>
      </fieldset>

      {#if animated}
        <fieldset class="section" disabled={applying}>
          <legend class="label">{i18n.t("imageEditor.frames")}</legend>
          <div class="row">
            <button class="icon" type="button" aria-label={playing ? i18n.t("imageEditor.pause") : i18n.t("imageEditor.play")} onclick={() => (playing = !playing)}>
              {#if playing}<Pause size={16} aria-hidden="true" />{:else}<Play size={16} aria-hidden="true" />{/if}
            </button>
            <div class="ranges">
              <label class="range">
                <span class="range-label">{i18n.t("imageEditor.start")}</span>
                <input type="range" min="0" max={frames.length - 1} value={start} oninput={event => setStart(event.currentTarget.valueAsNumber)} />
              </label>
              <label class="range">
                <span class="range-label">{i18n.t("imageEditor.end")}</span>
                <input type="range" min="0" max={frames.length - 1} value={end} oninput={event => setEnd(event.currentTarget.valueAsNumber)} />
              </label>
            </div>
          </div>
          <p class="hint" data-frames>{i18n.t("imageEditor.framesRange", { start: start + 1, end: end + 1, count: frames.length, duration: seconds.format(duration / 1000) })}</p>
        </fieldset>
      {/if}

      <fieldset class="section" disabled={applying}>
        <legend class="sr-only">{i18n.t("imageEditor.background")}</legend>
        <label class="check">
          <input type="checkbox" bind:checked={removing} />
          <span class="label">{i18n.t("imageEditor.background")}</span>
        </label>
        <p class="hint">{i18n.t("imageEditor.backgroundHint")}</p>
        {#if removing}
          <div class="row">
            <button class="pick" type="button" aria-pressed={picking} onclick={() => (picking = !picking)}>
              <span class="swatch" style:background-color={swatch} aria-hidden="true"></span>
              <Pipette size={16} aria-hidden="true" />
              {picking ? i18n.t("imageEditor.picking") : i18n.t("imageEditor.pickColor")}
            </button>
            <label class="range grow">
              <span class="range-label">{i18n.t("imageEditor.tolerance")}</span>
              <input type="range" min="0" max="50" bind:value={tolerance} />
            </label>
          </div>
        {/if}
      </fieldset>
    {/if}
  </div>

  <footer class="modal-footer">
    <button class="link reset" type="button" disabled={!loaded || applying} onclick={reset}>{i18n.t("imageEditor.reset")}</button>
    <button class="button secondary" type="button" disabled={applying} onclick={onclose}>{i18n.t("editor.cancel")}</button>
    <button class="button primary" type="button" disabled={!loaded || applying} onclick={() => void apply()}>
      {applying ? i18n.t("imageEditor.applying") : i18n.t("imageEditor.apply")}
    </button>
  </footer>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background-color: var(--background-scrim, rgb(0 0 0 / 72%));
    pointer-events: auto;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: min(var(--modal-width-medium, 602px), calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-md, 12px);
    background-color: var(--modal-background, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    box-shadow: 0 16px 48px rgb(0 0 0 / 32%);
    transform: translate(-50%, -50%);
    pointer-events: auto;
  }

  .modal:focus {
    outline: none;
  }

  .modal :global(*) {
    box-sizing: border-box;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 24px 8px;
  }

  .modal-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-strong, var(--nf-text, #fff));
  }

  .close {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: none;
    color: var(--interactive-icon-default, var(--nf-muted, #949ba4));
    cursor: pointer;
  }

  .close:hover {
    color: var(--interactive-icon-hover, #fff);
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 24px 16px;
    overflow-y: auto;
  }

  .stage {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
  }

  /* A checkerboard behind the image shows what is transparent. */
  .image {
    position: relative;
    flex: none;
    background-color: #2a2b30;
    background-image: conic-gradient(#3a3c42 25%, transparent 0 50%, #3a3c42 0 75%, transparent 0);
    background-size: 16px 16px;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }

  .image.picking,
  .image.picking .crop {
    cursor: copy;
  }

  .frame {
    display: block;
    width: 100%;
    height: 100%;
  }

  .frame.pixelated {
    image-rendering: pixelated;
  }

  /* What is cut away is dimmed around the crop; the corners stay whole past the image's edges. */
  .shade {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .hole {
    position: absolute;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 55%);
  }

  .crop {
    position: absolute;
    padding: 0;
    border: none;
    background: none;
    outline: 1px solid #fff;
    cursor: move;
  }

  .crop:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
  }

  .handle {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid #fff;
    border-radius: 2px;
    background-color: var(--nf-accent, #5865f2);
  }

  .nw { top: -6px; left: -6px; cursor: nwse-resize; }
  .ne { top: -6px; right: -6px; cursor: nesw-resize; }
  .sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
  .se { right: -6px; bottom: -6px; cursor: nwse-resize; }

  .status,
  .error,
  .size,
  .hint {
    margin: 0;
    font-size: 14px;
    line-height: 18px;
  }

  .status,
  .hint {
    color: var(--text-muted, var(--nf-muted, #949ba4));
  }

  .size {
    font-variant-numeric: tabular-nums;
  }

  .size .hint {
    color: var(--text-feedback-warning, var(--nf-warning-text, #fbb848));
  }

  .error {
    color: var(--text-feedback-critical, #f57976);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .label {
    padding: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    color: var(--text-default, var(--nf-text, #dbdee1));
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .segments {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
  }

  .segment {
    min-width: 72px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--interactive-text-default, var(--nf-muted, #b5bac1));
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .segment:hover {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
    color: var(--interactive-text-hover, #fff);
  }

  .segment.selected {
    background-color: var(--background-mod-normal, rgb(151 151 159 / 16%));
    color: var(--text-strong, #fff);
  }

  .ranges {
    display: flex;
    flex: 1;
    gap: 12px;
    min-width: 0;
  }

  .range {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .range-label {
    font-size: 12px;
    line-height: 16px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
  }

  .range input {
    width: 100%;
    margin: 0;
    accent-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
  }

  .grow {
    flex: 1;
  }

  .icon,
  .pick {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .icon {
    width: 32px;
    padding: 0;
  }

  .icon:hover,
  .pick:hover {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
  }

  .pick[aria-pressed="true"] {
    outline: 2px solid var(--nf-accent, #5865f2);
    outline-offset: -2px;
  }

  .swatch {
    width: 16px;
    height: 16px;
    border: 1px solid rgb(255 255 255 / 40%);
    border-radius: 4px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .check input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
  }

  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--text-link, #5cabff);
    font: inherit;
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
  }

  .link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .link:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
    background-color: var(--modal-footer-background, var(--nf-bg, #313338));
  }

  .reset {
    margin-right: auto;
  }

  .button {
    min-width: 96px;
    height: 40px;
    padding: 7px 15px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 8px);
    font: inherit;
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
    cursor: pointer;
  }

  .button:disabled,
  .close:disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .secondary {
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
  }

  .secondary:hover {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
  }

  .primary {
    background-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
    color: var(--control-primary-text-default, #fff);
  }

  .primary:hover {
    background-color: var(--control-primary-background-hover, #4752c4);
  }

  .button:focus-visible,
  .segment:focus-visible,
  .close:focus-visible,
  .link:focus-visible,
  .icon:focus-visible,
  .pick:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .modal-header,
    .modal-content,
    .modal-footer {
      padding-inline: 16px;
    }

    .ranges {
      flex-direction: column;
    }
  }
</style>
