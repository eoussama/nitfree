<svelte:options css="injected" />

<!--
  A short message at the bottom of the window, such as why an item could not be sent.
-->
<script lang="ts">
  import { notice } from "~/lib/ui/notice.svelte";
</script>

{#if notice.text}
  <div class="notice" role="alert">{notice.text}</div>
{/if}

<style>
  .notice {
    max-width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-surface-highest, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    font-size: 14px;
    line-height: 18px;
    box-shadow: 0 8px 16px rgb(0 0 0 / 24%);
    pointer-events: auto;
  }
</style>
