<script lang="ts">
  import logo from "~/assets/logo.png";
  import { followStoredTheme } from "~/lib/theme";



  const { version } = browser.runtime.getManifest();

  $effect(() => followStoredTheme(document.documentElement));
</script>

<main>
  <img src={logo} alt="Nitfree" width="48" height="48" />
  <h1>Nitfree</h1>
  <p>v{version}</p>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--nf-bg);
    color: var(--nf-text);
    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 280px;
    padding: 24px 16px;
  }

  h1 {
    margin: 8px 0 0;
    font-size: 18px;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: var(--nf-muted);
  }
</style>
