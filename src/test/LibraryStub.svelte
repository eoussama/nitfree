<!--
  Stands in for the library panel in tests: it counts how often its search is asked to take focus.
-->
<script lang="ts">
  const { onpick }: { onpick: unknown } = $props();

  /**
   * Counts a request to focus the search, as the real panel would take it.
   */
  export function focusSearch(): void {
    const counter = globalThis as { focusedSearch?: number };

    counter.focusedSearch = (counter.focusedSearch ?? 0) + 1;
  }
</script>

<div data-library-stub data-onpick={typeof onpick}></div>
