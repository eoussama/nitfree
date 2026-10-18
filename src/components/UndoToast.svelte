<svelte:options css="injected" />

<!--
  Confirms a deletion at the bottom of the window, with a few seconds to undo it.
-->
<script lang="ts">
  import { undoable, undoDelete } from "~/lib/ui/trash.svelte";



  const latest = $derived(undoable());
</script>

{#if latest}
  <div class="toast" role="status">
    <span class="text">{i18n.t("toast.deleted", { title: latest.title })}</span>
    <button class="undo" type="button" onclick={() => undoDelete(latest.id)}>{i18n.t("toast.undo")}</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: calc(100vw - 32px);
    padding: 8px 8px 8px 16px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-surface-highest, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    font-size: 14px;
    line-height: 18px;
    box-shadow: 0 8px 16px rgb(0 0 0 / 24%);
    transform: translateX(-50%);
    pointer-events: auto;
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .undo {
    flex: none;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--control-secondary-border-default, transparent);
    border-radius: var(--radius-sm, 8px);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .undo:hover {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
  }

  .undo:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: 2px;
  }
</style>
