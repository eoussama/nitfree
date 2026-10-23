<svelte:options css="injected" />

<!--
  The add, edit and details dialog, styled like a Discord modal: title, one row per file with its
  preview and details, and a footer with the controls of the mode. Viewing shows the very fields of
  editing, read only, with Favorite, Download and Edit instead of Cancel and Save. Clicking a
  preview shows it larger, with zoom.
-->
<script lang="ts">
  import type { TItemType } from "~/lib/db";
  import type { TDraft } from "~/lib/ui/editor.svelte";

  import Download from "@lucide/svelte/icons/download";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Star from "@lucide/svelte/icons/star";
  import StarOff from "@lucide/svelte/icons/star-off";
  import X from "@lucide/svelte/icons/x";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import { tick } from "svelte";

  // Not from "~/lib/db": that would bundle Dexie into the content script, and Chrome refuses its "￿" key bound as invalid UTF-8.
  import { ITEM_TYPES } from "~/lib/db/types";
  import { formatBytes } from "~/lib/format";
  import { sendMessage } from "~/lib/messaging";
  import { ACCEPTED_IMAGES } from "~/lib/ui/drafts";
  import { closeEditor, duplicateWarning, editFromView, editor, isUsable, removeDraft, replaceFile, revertDraft, saveEditor } from "~/lib/ui/editor.svelte";
  import { saveItem } from "~/lib/ui/export";
  import { library } from "~/lib/ui/library.svelte";

  import ImageEditor from "./ImageEditor.svelte";
  import Lightbox from "./Lightbox.svelte";
  import TagInput from "./TagInput.svelte";
  import VideoEditor from "./VideoEditor.svelte";



  const locale = i18n.t("locale");
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  let dialog: HTMLElement | undefined = $state();
  // The preview shown larger, and the button to focus again once it closes.
  let enlarged: number | null = $state(null);
  let enlargedFrom: HTMLElement | null = null;
  // The draft whose image is being edited, and the link to focus again once that is done.
  let retouching: number | null = $state(null);
  let retouchingFrom: HTMLElement | null = null;
  // The draft whose video is being made into a GIF, the link to focus again once that is done, and
  // the videos already offered, each made into a GIF as soon as it is added but only once.
  let converting: number | null = $state(null);
  let convertingFrom: HTMLElement | null = null;
  let offered: number[] = [];

  const viewing = $derived(editor.mode === "view");
  const usable = $derived(editor.drafts.filter(isUsable));
  // The item as the library has it now, for what changes while it shows, such as its favorite.
  const current = $derived(editor.item ? library.items.find(found => found.id === editor.item?.id) ?? null : null);
  const enlargedDraft = $derived(editor.drafts.find(draft => draft.key === enlarged && draft.url && draft.info) ?? null);
  const retouchedDraft = $derived(editor.drafts.find(draft => draft.key === retouching && draft.info) ?? null);
  const convertedDraft = $derived(editor.drafts.find(draft => draft.key === converting && draft.video) ?? null);
  const heading = $derived(viewing ? `:${editor.drafts[0]?.title ?? ""}:` : editor.mode === "edit" ? i18n.t("editor.editTitle") : i18n.t("editor.addTitle"));
  const action = $derived(editor.mode === "edit" ? i18n.t("editor.save") : i18n.t("editor.addCount", usable.length));

  // Focus the first name to change, the action of a view, or the dialog's first button when no file can be added.
  function focusFirst(): void {
    const primary = viewing ? dialog?.querySelector<HTMLElement>("[data-primary]") : null;

    if (primary) {
      primary.focus();

      return;
    }

    const title = dialog?.querySelector<HTMLInputElement>("input[data-title]");

    if (title) {
      title.select();
    }
    else {
      dialog?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    }
  }

  $effect(() => {
    if (editor.mode && dialog) {
      focusFirst();
    }
  });

  // The item went away while shown, e.g. deleted from another tab.
  $effect(() => {
    if (viewing && library.loaded && !current) {
      closeEditor();
    }
  });

  // The larger preview goes with the dialog it belongs to.
  $effect(() => {
    if (!editor.mode) {
      enlarged = null;
      retouching = null;
      converting = null;
      offered = [];
    }
  });

  // A video added opens straight into making its GIF, one at a time.
  $effect(() => {
    if (editor.saving || retouching !== null || converting !== null || enlarged !== null) {
      return;
    }

    const next = editor.drafts.find(draft => draft.video && !draft.clip && !offered.includes(draft.key));

    if (next) {
      offered.push(next.key);
      converting = next.key;
      convertingFrom = null;
    }
  });

  function favorite(): void {
    if (current) {
      void sendMessage("library:update", { id: current.id, patch: { favorite: !current.favorite } }).catch(() => undefined);
    }
  }

  async function edit(): Promise<void> {
    editFromView();
    await tick();
    focusFirst();
  }

  function enlarge(draft: TDraft, button: HTMLElement): void {
    enlarged = draft.key;
    enlargedFrom = button;
  }

  function closeLightbox(): void {
    enlarged = null;
    enlargedFrom?.focus();
  }

  function retouch(draft: TDraft, button: HTMLElement): void {
    retouching = draft.key;
    retouchingFrom = button;
  }

  async function closeImageEditor(): Promise<void> {
    retouching = null;
    await tick();

    // The link is gone when the edits turned an item into a new one: the draft's other link takes focus.
    if (retouchingFrom?.isConnected) {
      retouchingFrom.focus();
    }
    else {
      dialog?.querySelector<HTMLElement>("[data-retouch]")?.focus();
    }
  }

  function convert(draft: TDraft, button: HTMLElement): void {
    converting = draft.key;
    convertingFrom = button;
  }

  // Opened as the video was added, it gives focus to where the dialog starts.
  async function closeVideoEditor(): Promise<void> {
    converting = null;
    await tick();

    if (convertingFrom?.isConnected) {
      convertingFrom.focus();
    }
    else {
      focusFirst();
    }
  }

  async function revert(draft: TDraft): Promise<void> {
    await revertDraft(draft);
    await tick();
    dialog?.querySelector<HTMLElement>("[data-retouch]")?.focus();
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (viewing) {
      return;
    }

    // Every field is disabled while saving, so the dialog holds focus; files that failed get it back.
    dialog?.focus();

    if (!(await saveEditor()) && editor.mode) {
      await tick();
      focusFirst();
    }
  }

  async function remove(draft: TDraft): Promise<void> {
    removeDraft(draft);

    if (editor.mode) {
      await tick();
      focusFirst();
    }
  }

  function pickReplacement(draft: TDraft, input: HTMLInputElement): void {
    const file = input.files?.[0];

    if (file) {
      void replaceFile(draft, file);
    }

    input.value = "";
  }

  function setType(draft: TDraft, type: TItemType): void {
    draft.type = type;
  }
</script>

{#if editor.mode}
  <div class="backdrop" aria-hidden="true" onpointerdown={() => !editor.saving && closeEditor()}></div>
  <div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="nf-editor-title" tabindex="-1">
    <form class="form" onsubmit={event => void onSubmit(event)}>
      <header class="modal-header">
        <h2 class="modal-title" id="nf-editor-title">{heading}</h2>
        <button class="close" type="button" aria-label={viewing ? i18n.t("editor.close") : i18n.t("editor.cancel")} disabled={editor.saving} onclick={closeEditor}>
          <X size={24} aria-hidden="true" />
        </button>
      </header>

      <div class="modal-content">
        {#each editor.drafts as draft (draft.key)}
          {@const warning = duplicateWarning(draft)}
          {@const unmade = draft.video !== null && !draft.clip}
          <fieldset class="draft" class:unusable={!isUsable(draft) && !unmade} disabled={editor.saving}>
            <legend class="sr-only">{draft.video?.name ?? draft.file?.name ?? draft.title}</legend>

            <button class="preview" type="button" aria-label={i18n.t("editor.enlarge")} disabled={!draft.url || !draft.info} onclick={event => enlarge(draft, event.currentTarget)}>
              {#if draft.url && unmade}
                <video src={draft.url} muted preload="metadata"></video>
              {:else if draft.url}
                <img src={draft.url} alt="" draggable="false" />
                <span class="enlarge" aria-hidden="true"><ZoomIn size={18} /></span>
              {/if}
            </button>

            <div class="fields">
              {#if unmade}
                <p class="draft-note">{i18n.t("video.hint")}</p>
              {/if}

              {#if draft.error}
                <p class="draft-error" role="alert">{draft.error}</p>
              {/if}

              {#if warning}
                <p class="draft-warning">{warning}</p>
              {/if}

              {#if draft.copyOf}
                <p class="draft-note">{i18n.t("imageEditor.copyNote", { title: draft.copyOf.title })}</p>
              {/if}

              {#if draft.info}
                <label class="field">
                  <span class="label">{i18n.t("editor.title")}</span>
                  <input class="input" type="text" required data-title readonly={viewing} bind:value={draft.title} />
                </label>

                <div class="field" role="radiogroup" aria-label={i18n.t("editor.type")}>
                  <span class="label" aria-hidden="true">{i18n.t("editor.type")}</span>
                  <div class="segments">
                    {#each ITEM_TYPES as type (type)}
                      <button
                        class="segment"
                        class:selected={draft.type === type}
                        type="button"
                        role="radio"
                        aria-checked={draft.type === type}
                        disabled={viewing}
                        onclick={() => setType(draft, type)}
                      >
                        {i18n.t(`panel.types.${type}`)}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="field">
                  <label class="label" for="nf-tags-{draft.key}">{i18n.t("editor.tags")}</label>
                  <TagInput bind:tags={draft.tags} available={library.tags} id="nf-tags-{draft.key}" label={i18n.t("editor.tags")} readonly={viewing} />
                </div>

                <div class="field">
                  <label class="label" for="nf-packs-{draft.key}">{i18n.t("editor.packs")}</label>
                  <TagInput bind:tags={draft.packs} available={library.packs} id="nf-packs-{draft.key}" label={i18n.t("editor.packs")} placeholder={i18n.t("editor.packsPlaceholder")} readonly={viewing} />
                </div>

                <label class="field">
                  <span class="label">{i18n.t("editor.description")}</span>
                  <textarea class="input textarea" rows="2" placeholder={viewing ? "" : i18n.t("editor.optional")} readonly={viewing} bind:value={draft.description}></textarea>
                </label>

                {#if editor.item}
                  <dl class="meta">
                    <div class="meta-row">
                      <dt class="meta-label">{i18n.t("details.file")}</dt>
                      <dd class="meta-value">{i18n.t("details.fileInfo", { format: editor.item.format.toUpperCase(), width: editor.item.width, height: editor.item.height, size: formatBytes(editor.item.size, locale) })}{editor.item.animated ? ` · ${i18n.t("panel.animated")}` : ""}</dd>
                    </div>
                    <div class="meta-row">
                      <dt class="meta-label">{i18n.t("details.added")}</dt>
                      <dd class="meta-value">{dates.format(editor.item.createdAt)}</dd>
                    </div>
                    <div class="meta-row">
                      <dt class="meta-label">{i18n.t("details.sent")}</dt>
                      <dd class="meta-value">{i18n.t("details.sentCount", editor.item.usageCount)}{editor.item.usedAt ? ` · ${i18n.t("details.lastSent", { date: dates.format(editor.item.usedAt) })}` : ""}</dd>
                    </div>
                  </dl>
                {/if}
              {/if}

              <div class="draft-actions">
                {#if !viewing && draft.video}
                  <button class="link" type="button" data-convert onclick={event => convert(draft, event.currentTarget)}>{unmade ? i18n.t("video.make") : i18n.t("video.edit")}</button>
                {/if}
                {#if !viewing && draft.info}
                  <button class="link" type="button" data-retouch onclick={event => retouch(draft, event.currentTarget)}>{i18n.t("imageEditor.open")}</button>
                {/if}
                {#if draft.source}
                  <button class="link" type="button" onclick={() => void revert(draft)}>{i18n.t("imageEditor.revert")}</button>
                {/if}
                {#if editor.mode === "edit"}
                  <label class="link">
                    {i18n.t("editor.replace")}
                    <input class="sr-only" type="file" accept={ACCEPTED_IMAGES} onchange={event => pickReplacement(draft, event.currentTarget)} />
                  </label>
                {:else if !viewing && (editor.drafts.length > 1 || draft.error)}
                  <button class="link" type="button" onclick={() => void remove(draft)}>{i18n.t("editor.remove")}</button>
                {/if}
              </div>
            </div>
          </fieldset>
        {/each}
      </div>

      <footer class="modal-footer">
        {#if editor.error}
          <p class="footer-error" role="alert">{editor.error}</p>
        {/if}
        {#if viewing}
          <button class="button secondary" type="button" aria-pressed={current?.favorite ?? false} onclick={favorite}>
            {#if current?.favorite}<StarOff size={16} aria-hidden="true" />{:else}<Star size={16} aria-hidden="true" />{/if}
            {current?.favorite ? i18n.t("menu.unfavorite") : i18n.t("menu.favorite")}
          </button>
          <button class="button secondary" type="button" onclick={() => current && void saveItem(current)}>
            <Download size={16} aria-hidden="true" />
            {i18n.t("menu.download")}
          </button>
          <button class="button primary" type="button" data-primary onclick={() => void edit()}>
            <Pencil size={16} aria-hidden="true" />
            {i18n.t("menu.edit")}
          </button>
        {:else}
          <button class="button secondary" type="button" disabled={editor.saving} onclick={closeEditor}>{i18n.t("editor.cancel")}</button>
          <button class="button primary" type="submit" disabled={editor.saving || editor.reading > 0 || !usable.length}>{action}</button>
        {/if}
      </footer>
    </form>
  </div>

  {#if enlargedDraft?.url && enlargedDraft.info}
    <Lightbox url={enlargedDraft.url} title={enlargedDraft.title} width={enlargedDraft.info.width} height={enlargedDraft.info.height} onclose={closeLightbox} />
  {/if}

  {#if retouchedDraft}
    <ImageEditor draft={retouchedDraft} onclose={() => void closeImageEditor()} />
  {/if}

  {#if convertedDraft}
    {#key convertedDraft.key}
      <VideoEditor draft={convertedDraft} onclose={() => void closeVideoEditor()} />
    {/key}
  {/if}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background-color: var(--background-scrim, rgb(0 0 0 / 72%));
    pointer-events: auto;
  }

  .form {
    display: contents;
  }

  .modal:focus {
    outline: none;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: min(var(--modal-width-medium, 602px), calc(100vw - 32px));
    max-height: calc(100vh - 64px);
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

  .modal :global(*) {
    box-sizing: border-box;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: var(--modal-vertical-padding, 16px) var(--modal-horizontal-padding, 24px) 8px;
  }

  .modal-title {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-strong, var(--nf-text, #fff));
    text-overflow: ellipsis;
    white-space: nowrap;
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
    cursor: pointer;
  }

  .close {
    color: var(--interactive-icon-default, var(--nf-muted, #949ba4));
  }

  .close:hover {
    color: var(--interactive-icon-hover, #fff);
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px var(--modal-horizontal-padding, 24px) 16px;
    overflow-y: auto;
  }

  .draft {
    display: flex;
    gap: 16px;
    margin: 0;
    padding: 0;
    border: none;
  }

  .draft + .draft {
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
  }

  /* A click shows it larger. */
  .preview {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 96px;
    height: 96px;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
    cursor: zoom-in;
  }

  .preview:disabled {
    cursor: default;
  }

  .preview img,
  .preview video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .enlarge {
    position: absolute;
    right: 4px;
    bottom: 4px;
    display: flex;
    padding: 3px;
    border-radius: var(--radius-xs, 4px);
    background-color: rgb(0 0 0 / 60%);
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  }

  .preview:hover .enlarge,
  .preview:focus-visible .enlarge {
    opacity: 1;
  }

  .fields {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label {
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    color: var(--text-default, var(--nf-text, #dbdee1));
  }

  .input {
    width: 100%;
    height: var(--control-input-height-md, 40px);
    padding: 0 12px;
    border: 1px solid var(--input-border-default, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
    color: var(--input-text-default, var(--nf-text, #dbdee1));
    font: inherit;
    font-size: 16px;
    line-height: 20px;
    outline: none;
    transition: border-color 0.1s;
  }

  .input:hover:not(:focus) {
    border-color: var(--input-border-hover, var(--nf-border, #3f4147));
  }

  .input:focus {
    border-color: var(--input-border-active, var(--nf-accent, #5865f2));
    outline: 2px solid var(--input-border-active, var(--nf-accent, #5865f2));
    outline-offset: -2px;
  }

  /* Viewing: the same fields, as plain values. */
  .input:read-only {
    border-color: transparent;
    cursor: default;
  }

  .input:read-only:focus {
    outline-color: var(--border-focus, var(--nf-accent, #5865f2));
  }

  .input::placeholder {
    color: var(--input-placeholder-text-default, var(--nf-muted, #949ba4));
  }

  .textarea {
    height: auto;
    min-height: 64px;
    padding: 10px 12px;
    resize: vertical;
  }

  .textarea:read-only {
    resize: none;
  }

  .segments {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
  }

  .segment {
    flex: 1;
    height: 32px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--interactive-text-default, var(--nf-muted, #b5bac1));
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.1s ease-in-out, color 0.1s ease-in-out;
  }

  .segment:disabled {
    cursor: default;
  }

  .segment:disabled:not(.selected) {
    opacity: 0.5;
  }

  .segment:hover:not(:disabled) {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
    color: var(--interactive-text-hover, #fff);
  }

  .segment.selected {
    background-color: var(--background-mod-normal, rgb(151 151 159 / 16%));
    color: var(--text-strong, #fff);
  }

  .draft-error,
  .draft-warning,
  .footer-error {
    margin: 0;
    font-size: 14px;
    line-height: 18px;
    color: var(--text-feedback-critical, #f57976);
  }

  .draft-warning {
    color: var(--text-feedback-warning, var(--nf-warning-text, #fbb848));
  }

  .draft-note {
    margin: 0;
    font-size: 14px;
    line-height: 18px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
  }

  .footer-error {
    flex: 1;
  }

  /* What Nitfree knows about the file; not something to edit. */
  .meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
  }

  .meta-row {
    display: flex;
    gap: 8px;
    font-size: 14px;
    line-height: 18px;
  }

  .meta-label {
    flex: none;
    width: 56px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
  }

  .meta-value {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .draft-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
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

  .link:hover {
    text-decoration: underline;
  }

  .modal-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px var(--modal-horizontal-padding, 24px);
    background-color: var(--modal-footer-background, var(--nf-bg, #313338));
  }

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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
    transition: background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out;
  }

  .button :global(svg) {
    flex: none;
  }

  .button:disabled,
  .close:disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .secondary {
    border-color: var(--control-secondary-border-default, transparent);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
  }

  .secondary:hover {
    border-color: var(--control-secondary-border-hover, transparent);
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
  }

  .primary {
    border-color: var(--control-primary-border-default, transparent);
    background-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
    color: var(--control-primary-text-default, #fff);
  }

  .primary:hover {
    border-color: var(--control-primary-border-hover, transparent);
    background-color: var(--control-primary-background-hover, #4752c4);
  }

  .primary:active {
    background-color: var(--control-primary-background-active, #3c45a5);
  }

  .button:focus-visible,
  .preview:focus-visible,
  .segment:focus-visible,
  .close:focus-visible,
  .link:focus-visible,
  .link:has(input:focus-visible) {
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

  /* Narrow windows, such as the popup, stack each file's preview above its fields. */
  @media (max-width: 480px) {
    .draft {
      flex-direction: column;
    }

    .modal-header,
    .modal-content,
    .modal-footer {
      padding-inline: 16px;
    }
  }
</style>
