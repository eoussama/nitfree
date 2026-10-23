<svelte:options css="injected" />

<!--
  Turns a draft's video into a GIF, over the add dialog: the clip to keep, up to a few seconds, its
  frame rate and its size. The video plays the clip over and over. Frames are taken by seeking the
  video and written into the GIF in a worker, with the progress shown. The draft keeps the video and
  the clip, so opening this again starts from them.
-->
<script lang="ts">
  import type { TClip } from "~/lib/media/video";
  import type { TDraft } from "~/lib/ui/editor.svelte";

  import { toError, tryCatch } from "@eoussama/core";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";

  import { formatBytes } from "~/lib/format";
  import { CLIP_SIZES, clipFrameSize, clipTimes, defaultClip, FRAME_RATES, loadVideo, MAX_CLIP, moveClip, seekVideo, videoToGif } from "~/lib/media/video";
  import { convertDraft } from "~/lib/ui/editor.svelte";
  import { onEscape } from "~/lib/ui/escape";
  import { motion } from "~/lib/ui/motion.svelte";
  import { UPLOAD_LIMIT } from "~/lib/ui/send";



  const { draft, onclose }: { draft: TDraft; onclose: () => void } = $props();

  /**
   * The preview's height; its width is the dialog's.
   */
  const STAGE_HEIGHT = 300;

  /**
   * How far the clip's ends move with the arrow keys, in seconds.
   */
  const STEP = 0.1;

  const locale = i18n.t("locale");
  const seconds = new Intl.NumberFormat(locale, { style: "unit", unit: "second", maximumFractionDigits: 1 });

  let dialog: HTMLElement | undefined = $state();
  let video: HTMLVideoElement | undefined = $state();

  let duration = $state(0);
  let natural = $state({ width: 0, height: 0 });
  let clip: TClip = $state(defaultClip(0));
  let playing = $state(false);
  let failure: string | null = $state(null);
  let applying = $state(false);
  let progress: { done: number; total: number } | null = $state(null);
  // Stops making the GIF when the dialog closes.
  let making: AbortController | null = null;

  const loaded = $derived(duration > 0);
  const frameSize = $derived(clipFrameSize(natural, clip));
  const frameCount = $derived(clipTimes(clip).length);
  const range = $derived(i18n.t("video.range", { start: seconds.format(clip.start), end: seconds.format(clip.end), length: seconds.format(clip.end - clip.start) }));

  onMount(() => {
    const url = URL.createObjectURL(draft.video!);
    const loading = new AbortController();

    void (async () => {
      const [error, length] = await tryCatch(loadVideo(video!, url, loading.signal));

      if (loading.signal.aborted) {
        return;
      }

      if (error) {
        failure = i18n.t("video.unreadable");

        return;
      }

      natural = { width: video!.videoWidth, height: video!.videoHeight };
      clip = draft.clip ? { ...draft.clip } : defaultClip(length);
      duration = length;
      await tryCatch(seekVideo(video!, clip.start, loading.signal));
      playing = !motion.reduced;
    })();

    return () => {
      loading.abort();
      making?.abort();
      URL.revokeObjectURL(url);
    };
  });

  $effect(() => onEscape(onclose));

  $effect(() => {
    dialog?.focus();
  });

  // Plays the clip over and over, unless paused.
  $effect(() => {
    const element = video;
    const { start, end } = clip;

    if (!playing || applying || !element) {
      return;
    }

    if (element.currentTime < start || element.currentTime >= end) {
      element.currentTime = start;
    }

    void element.play().catch(() => (playing = false));

    let frame = requestAnimationFrame(function loop() {
      if (element.currentTime >= end || element.ended) {
        element.currentTime = start;
        void element.play().catch(() => undefined);
      }

      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      element.pause();
    };
  });

  // Moving an end shows its frame.
  function move(edge: "start" | "end", time: number): void {
    clip = moveClip(clip, edge, time, duration);
    playing = false;

    if (video) {
      void seekVideo(video, clip[edge]).catch(() => undefined);
    }
  }

  function reset(): void {
    clip = defaultClip(duration);
    move("start", 0);
  }

  async function apply(): Promise<void> {
    if (!video || !loaded || applying) {
      return;
    }

    const wanted = $state.snapshot(clip);
    const controller = new AbortController();

    making = controller;
    playing = false;
    applying = true;
    failure = null;
    progress = { done: 0, total: clipTimes(wanted).length };

    const [error] = await tryCatch(async () => {
      const gif = await videoToGif(video!, wanted, (done, total) => (progress = { done, total }), controller.signal);

      if (gif.size > UPLOAD_LIMIT) {
        throw new Error(i18n.t("video.tooLarge", { size: formatBytes(gif.size, locale) }));
      }

      controller.signal.throwIfAborted();
      await convertDraft(draft, wanted, gif);
    });

    if (controller.signal.aborted) {
      return;
    }

    applying = false;
    progress = null;

    if (error) {
      failure = toError(error).message;

      return;
    }

    onclose();
  }
</script>

<div class="backdrop" aria-hidden="true" onpointerdown={() => !applying && onclose()}></div>
<div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="nf-video-editor-title" tabindex="-1">
  <header class="modal-header">
    <h2 class="modal-title" id="nf-video-editor-title">{i18n.t("video.title")}</h2>
    <button class="close" type="button" aria-label={i18n.t("editor.cancel")} onclick={onclose}>
      <X size={24} aria-hidden="true" />
    </button>
  </header>

  <div class="modal-content">
    <div class="stage" style:height="{STAGE_HEIGHT}px">
      <video bind:this={video} class="frame" class:hidden={!loaded} muted playsinline disablepictureinpicture></video>
      {#if !loaded && !failure}
        <p class="status">{i18n.t("video.loading")}</p>
      {/if}
    </div>

    {#if failure}
      <p class="error" role="alert">{failure}</p>
    {/if}

    {#if loaded}
      <p class="size" data-size>{i18n.t("imageEditor.size", { width: String(frameSize.width), height: String(frameSize.height) })} · {i18n.t("video.frames", frameCount)}</p>

      <fieldset class="section" disabled={applying}>
        <legend class="label">{i18n.t("video.clip")}</legend>
        <div class="row">
          <button class="icon" type="button" aria-label={playing ? i18n.t("imageEditor.pause") : i18n.t("imageEditor.play")} onclick={() => (playing = !playing)}>
            {#if playing}<Pause size={16} aria-hidden="true" />{:else}<Play size={16} aria-hidden="true" />{/if}
          </button>
          <div class="ranges">
            <label class="range">
              <span class="range-label">{i18n.t("video.start")}</span>
              <input type="range" min="0" max={duration} step={STEP} value={clip.start} oninput={event => move("start", event.currentTarget.valueAsNumber)} />
            </label>
            <label class="range">
              <span class="range-label">{i18n.t("video.end")}</span>
              <input type="range" min="0" max={duration} step={STEP} value={clip.end} oninput={event => move("end", event.currentTarget.valueAsNumber)} />
            </label>
          </div>
        </div>
        <p class="hint" data-clip>{range} · {i18n.t("video.clipHint", { max: seconds.format(MAX_CLIP) })}</p>
      </fieldset>

      <fieldset class="section" disabled={applying}>
        <legend class="label">{i18n.t("video.rate")}</legend>
        <div class="segments" role="radiogroup" aria-label={i18n.t("video.rate")}>
          {#each FRAME_RATES as rate (rate)}
            <button class="segment" class:selected={clip.rate === rate} type="button" role="radio" aria-checked={clip.rate === rate} onclick={() => (clip.rate = rate)}>
              {i18n.t("video.fps", { rate: String(rate) })}
            </button>
          {/each}
        </div>
      </fieldset>

      <fieldset class="section" disabled={applying}>
        <legend class="label">{i18n.t("video.size")}</legend>
        <div class="segments" role="radiogroup" aria-label={i18n.t("video.size")}>
          {#each CLIP_SIZES as size (size)}
            <button class="segment" class:selected={clip.size === size} type="button" role="radio" aria-checked={clip.size === size} onclick={() => (clip.size = size)}>
              {i18n.t("video.pixels", { size: String(size) })}
            </button>
          {/each}
        </div>
        <p class="hint">{i18n.t("video.sizeHint")}</p>
      </fieldset>
    {/if}
  </div>

  <footer class="modal-footer">
    {#if progress}
      <div class="progress" role="status">
        <progress max={progress.total} value={progress.done}></progress>
        <span class="hint">{i18n.t("video.progress", { done: String(progress.done), total: String(progress.total) })}</span>
      </div>
    {:else}
      <button class="link reset" type="button" disabled={!loaded || applying} onclick={reset}>{i18n.t("imageEditor.reset")}</button>
    {/if}
    <button class="button secondary" type="button" onclick={onclose}>{i18n.t("editor.cancel")}</button>
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
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
  }

  .frame {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .frame.hidden {
    position: absolute;
    visibility: hidden;
  }

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
    align-self: flex-start;
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

  .range input,
  .progress progress {
    width: 100%;
    margin: 0;
    accent-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
  }

  .progress {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    margin-right: 8px;
  }

  .icon {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
    cursor: pointer;
  }

  .icon:hover {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
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

  .button:disabled {
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
  .icon:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: 2px;
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

    .segment {
      min-width: 0;
    }
  }
</style>
