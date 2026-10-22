<!--
  The popup's settings page: the sizes emojis and stickers are sent at, what a click on an item does,
  and whether animated items play in the panel. Each change is saved at once, and open Discord tabs
  follow it.
-->
<script lang="ts">
  import type { TClickAction, TSendSizes } from "~/lib/settings";

  import { clampSendSize, clickAction, DEFAULT_SEND_SIZES, playAnimations, SEND_SIZE_LIMITS, sendSizes } from "~/lib/settings";



  const SIZE_KINDS: (keyof TSendSizes)[] = ["emoji", "sticker"];
  const CLICK_ACTIONS: TClickAction[] = ["send", "add"];

  let sizes: TSendSizes = $state({ ...DEFAULT_SEND_SIZES });
  let action: TClickAction = $state("send");
  let play = $state(true);

  $effect(() => {
    void sendSizes.getValue().then((value) => {
      sizes = value;
    });
    void clickAction.getValue().then((value) => {
      action = value;
    });
    void playAnimations.getValue().then((value) => {
      play = value;
    });

    const stops = [
      sendSizes.watch((value) => {
        sizes = value ?? DEFAULT_SEND_SIZES;
      }),
      clickAction.watch((value) => {
        action = value ?? "send";
      }),
      playAnimations.watch((value) => {
        play = value ?? true;
      }),
    ];

    return () => stops.forEach(stop => stop());
  });

  // A size out of range is brought within it; one that is not a number puts the saved size back.
  function saveSize(kind: keyof TSendSizes, input: HTMLInputElement): void {
    const size = clampSendSize(kind, input.valueAsNumber);

    input.value = String(size ?? sizes[kind]);

    if (size !== null && size !== sizes[kind]) {
      sizes = { ...sizes, [kind]: size };
      void sendSizes.setValue($state.snapshot(sizes));
    }
  }

  function saveAction(value: TClickAction): void {
    action = value;
    void clickAction.setValue(value);
  }

  function savePlay(value: boolean): void {
    play = value;
    void playAnimations.setValue(value);
  }
</script>

<div class="form-section">
  <h2 class="form-title">{i18n.t("popup.sizes")}</h2>
  <p class="form-description">{i18n.t("popup.sizesHint")}</p>
  <div class="sizes">
    {#each SIZE_KINDS as kind (kind)}
      <label>
        <span class="form-label">{i18n.t(`panel.types.${kind}`)}</span>
        <span class="number">
          <input
            class="input"
            type="number"
            inputmode="numeric"
            min={SEND_SIZE_LIMITS[kind].min}
            max={SEND_SIZE_LIMITS[kind].max}
            step="1"
            value={sizes[kind]}
            onchange={event => saveSize(kind, event.currentTarget)}
          />
          <span class="unit" aria-hidden="true">px</span>
        </span>
      </label>
    {/each}
  </div>
</div>

<div class="form-section">
  <fieldset class="group">
    <legend class="form-title">{i18n.t("popup.click")}</legend>
    <p class="form-description">{i18n.t("popup.clickHint")}</p>
    <div class="options">
      {#each CLICK_ACTIONS as value (value)}
        <label class="option">
          <input class="radio" type="radio" name="nf-click" {value} checked={action === value} onchange={() => saveAction(value)} />
          <span>{value === "send" ? i18n.t("popup.clickSend") : i18n.t("popup.clickAdd")}</span>
        </label>
      {/each}
    </div>
  </fieldset>
</div>

<div class="form-section">
  <label class="toggle">
    <span>{i18n.t("popup.animations")}</span>
    <input class="switch" type="checkbox" role="switch" checked={play} onchange={event => savePlay(event.currentTarget.checked)} />
  </label>
</div>

<style>
  .group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  /* A legend does not take margins like a heading; float it so the description sits under it. */
  .group > legend {
    float: left;
    width: 100%;
    padding: 0;
  }

  .group > legend + * {
    clear: left;
  }

  .sizes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .number {
    position: relative;
    display: flex;
  }

  .number .input {
    padding-inline-end: 32px;
  }

  .unit {
    position: absolute;
    inset-inline-end: 12px;
    top: 50%;
    color: var(--nf-muted);
    font-size: 14px;
    transform: translateY(-50%);
    pointer-events: none;
  }
</style>
