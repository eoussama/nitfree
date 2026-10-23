<!--
  Stands in for a large component in tests: it shows where it was mounted and with what.
-->
<script lang="ts">
  const props: Record<string, unknown> = $props();
</script>

<div data-stub data-props={Object.keys(props).join(" ")}></div>
