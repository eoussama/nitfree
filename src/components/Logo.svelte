<svelte:options css="injected" />

<!--
  Nitfree's logo drawn as SVG, so its eyes can blink. Shapes and colors match src/assets/logo.png.
-->
<script lang="ts"></script>

<svg class="logo" viewBox="0 0 1080 1080" aria-hidden="true">
  <rect width="1080" height="1080" fill="#6990ff" />
  <ellipse class="eye" cx="145" cy="476" rx="55.5" ry="58.5" />
  <ellipse class="eye" cx="934.5" cy="476" rx="55.5" ry="58.5" />
  <rect x="276" y="363" width="516" height="353" rx="165" ry="176.5" fill="#b8cdff" />
  <rect x="383" y="570" width="104" height="68" rx="34" fill="#6990ff" />
  <rect x="594" y="570" width="104" height="68" rx="34" fill="#6990ff" />
</svg>

<style>
  .logo {
    display: block;
    width: 100%;
    height: 100%;
  }

  .eye {
    fill: #000;
    transform-box: fill-box;
    transform-origin: center;
  }
</style>
