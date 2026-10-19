<!--
  The popup's settings: the sizes emojis and stickers are sent at, what a click on an item does, and
  whether animated items play in the panel. Each change is saved at once, and open Discord tabs
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

<section class="popup-section" aria-labelledby="nf-settings">
  <h2 id="nf-settings" class="popup-heading">{i18n.t("popup.settings")}</h2>

  <fieldset class="group">
    <legend class="legend">{i18n.t("popup.sizes")}</legend>
    <div class="sizes">
      {#each SIZE_KINDS as kind (kind)}
        <label class="size">
          <span class="label">{i18n.t(`panel.types.${kind}`)}</span>
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
    <p class="hint">{i18n.t("popup.sizesHint")}</p>
  </fieldset>

  <fieldset class="group">
    <legend class="legend">{i18n.t("popup.click")}</legend>
    {#each CLICK_ACTIONS as value (value)}
      <label class="choice">
        <input type="radio" name="nf-click" {value} checked={action === value} onchange={() => saveAction(value)} />
        <span>{value === "send" ? i18n.t("popup.clickSend") : i18n.t("popup.clickAdd")}</span>
      </label>
    {/each}
    <p class="hint">{i18n.t("popup.clickHint")}</p>
  </fieldset>

  <label class="toggle">
    <span>{i18n.t("popup.animations")}</span>
    <input class="switch" type="checkbox" role="switch" checked={play} onchange={event => savePlay(event.currentTarget.checked)} />
  </label>
</section>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0 0 16px;
    padding: 0;
    border: none;
  }

  .legend {
    margin-bottom: 8px;
    padding: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
  }

  .sizes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .size {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .number {
    position: relative;
    display: flex;
  }

  .input {
    box-sizing: border-box;
    width: 100%;
    height: 36px;
    padding: 0 32px 0 10px;
    border: 1px solid var(--nf-border);
    border-radius: 8px;
    background-color: rgb(0 0 0 / 8%);
    color: inherit;
    font: inherit;
    font-size: 14px;
    outline: none;
  }

  .input:focus {
    border-color: var(--nf-accent);
  }

  .unit {
    position: absolute;
    inset-inline-end: 10px;
    top: 50%;
    color: var(--nf-muted);
    font-size: 12px;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .hint {
    margin: 0;
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
  }

  .choice input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--nf-accent);
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    cursor: pointer;
  }

  /* Discord's switch: a pill whose knob slides over when it is on. */
  .switch {
    position: relative;
    flex: none;
    width: 40px;
    height: 24px;
    margin: 0;
    border-radius: 12px;
    background-color: var(--nf-muted);
    cursor: pointer;
    transition: background-color 0.2s ease;
    appearance: none;
  }

  .switch::before {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: #fff;
    content: "";
    transition: transform 0.2s ease;
  }

  .switch:checked {
    background-color: var(--nf-accent);
  }

  .switch:checked::before {
    transform: translateX(16px);
  }

  .switch:focus-visible,
  .choice input:focus-visible {
    outline: 2px solid var(--nf-accent);
    outline-offset: 2px;
  }

  :global([data-nf-reduced-motion="true"]) .switch,
  :global([data-nf-reduced-motion="true"]) .switch::before {
    transition: none;
  }
</style>
