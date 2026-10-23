<svelte:options css="injected" />

<!--
  The emojis matching the `:name` being typed, for when Discord suggests none of its own: a list just
  above the message box, drawn as Discord draws its emoji autocomplete. When Discord does suggest some,
  the matches join its list instead, as rows of its own. It never takes focus: typing goes on in the
  message box, whose keys move through it and pick.
-->
<script lang="ts">
  import { SELECTORS } from "~/lib/discord";
  import { highlightSuggestion, pickSuggestion, suggest } from "~/lib/ui/suggest.svelte";
  import { still } from "~/lib/ui/thumbnails";



  let list: HTMLElement | undefined = $state();
  let position: { left: number; bottom: number; width: number } | null = $state(null);

  const shown = $derived(suggest.mode === "list" && suggest.items.length > 0);

  // Follows the message box, which moves and grows while typing.
  $effect(() => {
    const box = shown ? suggest.box : null;

    if (!box) {
      position = null;

      return;
    }

    let frame = 0;

    const place = (): void => {
      const area = (box.closest(SELECTORS.composerBox.join(",")) ?? box).getBoundingClientRect();
      const next = { left: area.left, bottom: window.innerHeight - area.top, width: area.width };

      if (next.left !== position?.left || next.bottom !== position.bottom || next.width !== position.width) {
        position = next;
      }

      frame = requestAnimationFrame(place);
    };

    place();

    return () => cancelAnimationFrame(frame);
  });

  // The highlighted one stays in view as the arrow keys move.
  $effect(() => {
    list?.querySelector(`[data-index="${suggest.highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  });
</script>

{#if shown && position}
  <div
    bind:this={list}
    class="autocomplete"
    style:left="{position.left}px"
    style:bottom="{position.bottom}px"
    style:width="{position.width}px"
    data-nitfree-suggestions
  >
    <div class="list" role="listbox" aria-labelledby="nf-suggestions-title">
      <div class="base">
        <h3 class="title" id="nf-suggestions-title">{i18n.t("suggest.title")} <strong>:{suggest.query}</strong></h3>
      </div>
      {#each suggest.items as item, index (item.id)}
        <div
          class="row"
          role="option"
          tabindex="-1"
          aria-selected={index === suggest.highlighted}
          data-index={index}
          onmousedown={(event) => {
            // Typing goes on in the message box.
            event.preventDefault();
          }}
          onpointermove={() => highlightSuggestion(index)}
          onclick={event => pickSuggestion(item, !event.shiftKey)}
          onkeydown={() => undefined}
        >
          <div class="base">
            <span class="icon">
              {#await still(item) then url}
                {#if url}<img class="emoji" src={url} alt="" draggable="false" />{/if}
              {/await}
            </span>
            <span class="name">:{item.title}:</span>
            <span class="type">{i18n.t(`panel.types.${item.type}`)}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* Discord's emoji autocomplete, from its own stylesheet. */
  .autocomplete {
    position: fixed;
    box-sizing: border-box;
    max-height: 320px;
    padding-bottom: 8px;
    overflow: hidden;
    border-radius: 5px 5px 0 0;
    background-color: var(--background-surface-high, var(--nf-bg-elevated, #2b2d31));
    color: var(--interactive-text-default, var(--nf-muted, #b5bac1));
    font-family: var(--font-primary, inherit);
    pointer-events: auto;
  }

  .list {
    max-height: 312px;
    overflow-y: auto;
  }

  .base {
    display: flex;
    align-items: center;
    padding: 8px;
    border-radius: 3px;
  }

  .title {
    margin: 0;
    padding: 4px 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    color: var(--interactive-text-default, var(--nf-muted, #b5bac1));
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .title strong {
    color: var(--text-subtle, var(--nf-text, #dbdee1));
    text-transform: none;
  }

  .row {
    padding: 0 8px;
    font-size: 14px;
    font-weight: 500;
    line-height: 16px;
  }

  .row > .base {
    cursor: pointer;
  }

  .row:hover > .base,
  .row[aria-selected="true"] > .base {
    background-color: var(--interactive-background-hover, rgb(151 151 159 / 16%));
  }

  .icon {
    display: flex;
    flex: none;
    margin-inline-end: 8px;
  }

  .emoji {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  /* As the badge on the rows added to Discord's own list. */
  .type {
    flex: none;
    margin-inline-start: auto;
    padding: 0 6px;
    border-radius: 4px;
    background-color: var(--background-mod-normal, rgb(151 151 159 / 16%));
    color: var(--text-muted, #949ba4);
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    text-transform: uppercase;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    font-size: 16px;
    font-weight: 400;
    line-height: 20px;
    color: var(--interactive-text-active, var(--nf-text, #fff));
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
