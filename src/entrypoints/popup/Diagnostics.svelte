<!--
  The popup's diagnostics page, opened from the settings: checks that Nitfree still finds everything
  it uses on Discord's page, in the open Discord tab. Opening the page only reads Discord's page;
  checking again also opens Discord's picker and a message menu for a moment, to check them too.
  Each check says whether it works, works only because Discord changed and a fallback matched, or is
  broken. The results can be copied as a report for a bug.
-->
<script lang="ts">
  import type { TCheckGroup, TCheckStatus, TDiagnostics } from "~/lib/diagnostics";

  import { toError, tryCatch } from "@eoussama/core";

  import { formatReport, groupChecks, runDiagnostics, summarize } from "~/lib/diagnostics";



  type TMessage = { text: string; tone: "positive" | "warning" | "critical" | null };

  const { version } = browser.runtime.getManifest();

  const SKIPPED_HINTS: Partial<Record<TCheckGroup, string>> = {
    composer: i18n.t("diagnostics.skippedHint.composer"),
    chat: i18n.t("diagnostics.skippedHint.chat"),
    picker: i18n.t("diagnostics.skippedHint.picker"),
    menu: i18n.t("diagnostics.skippedHint.menu"),
  };

  let result = $state<TDiagnostics | null>(null);
  let ranAt = new Date();
  let running = $state(false);
  let copied = $state<TMessage | null>(null);

  const groups = $derived(result ? groupChecks(result.checks) : []);
  const summary: TMessage | null = $derived.by(() => {
    if (!result) {
      return null;
    }

    if (result.tab === "none") {
      return { text: i18n.t("diagnostics.noTab"), tone: null };
    }

    if (result.tab === "unreachable") {
      return { text: i18n.t("diagnostics.unreachable"), tone: "critical" };
    }

    const { problems, changes } = summarize(result.checks);

    if (problems) {
      return { text: i18n.t("diagnostics.problems", problems), tone: "critical" };
    }

    return changes ? { text: i18n.t("diagnostics.changed", changes), tone: "warning" } : { text: i18n.t("diagnostics.allGood"), tone: "positive" };
  });

  async function run(interactive: boolean): Promise<void> {
    running = true;
    copied = null;
    ranAt = new Date();
    result = await runDiagnostics(interactive);
    running = false;
  }

  async function copy(): Promise<void> {
    if (!result) {
      return;
    }

    const report = formatReport($state.snapshot(result), { version, browser: navigator.userAgent, date: ranAt });
    const [error] = await tryCatch(navigator.clipboard.writeText(report));

    copied = error
      ? { text: i18n.t("popup.failed", { error: toError(error).message }), tone: "critical" }
      : { text: i18n.t("diagnostics.copied"), tone: "positive" };
  }

  function statusText(status: TCheckStatus): string {
    return i18n.t(`diagnostics.status.${status}`);
  }

  $effect(() => {
    void run(false);
  });
</script>

<div class="form-section" aria-busy={running}>
  <h2 class="form-title">{i18n.t("diagnostics.results")}</h2>
  {#if summary && !running}
    <p class="feedback summary {summary.tone ?? ""}" role="status">{summary.text}</p>
  {:else}
    <p class="form-description">{i18n.t("diagnostics.running")}</p>
  {/if}

  {#each groups as { group, checks } (group)}
    <h3 id="nf-check-{group}" class="group-title">{i18n.t(`diagnostics.groups.${group}`)}</h3>
    {#if SKIPPED_HINTS[group] && checks.some(check => check.status === "skipped")}
      <p class="form-description hint">{SKIPPED_HINTS[group]}</p>
    {/if}
    <dl class="rows" aria-labelledby="nf-check-{group}">
      {#each checks as check (check.id)}
        <div class="row">
          <dt>{i18n.t(`diagnostics.checks.${check.id}`)}</dt>
          <dd class="status {check.status}" data-check={check.id} data-status={check.status}>{statusText(check.status)}</dd>
        </div>
      {/each}
    </dl>
  {/each}

  <p class="form-description recheck">{i18n.t("diagnostics.recheckHint")}</p>
  <div class="actions">
    <button class="button secondary" type="button" disabled={running} onclick={() => void run(true)}>{i18n.t("diagnostics.recheck")}</button>
  </div>
</div>

<div class="form-section">
  <h2 class="form-title">{i18n.t("diagnostics.reportTitle")}</h2>
  <p class="form-description">{i18n.t("diagnostics.reportHint")}</p>
  <div class="actions">
    <button class="button primary" type="button" disabled={running || !result} onclick={() => void copy()}>{i18n.t("diagnostics.copy")}</button>
  </div>
  {#if copied}
    <p class="feedback {copied.tone ?? ""}" role={copied.tone === "critical" ? "alert" : "status"}>{copied.text}</p>
  {/if}
</div>

<style>
  .summary {
    margin: 0 0 4px;
  }

  /* Discord's section header in its settings lists. */
  .group-title {
    margin: 16px 0 4px;
    color: var(--text-muted, var(--nf-muted));
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .hint {
    margin-bottom: 4px;
  }

  .recheck {
    margin: 16px 0 0;
  }

  .status {
    font-weight: 500;
  }

  .status.ok {
    color: var(--text-feedback-positive, var(--nf-positive-text));
  }

  .status.fallback {
    color: var(--text-feedback-warning, var(--nf-warning-text));
  }

  .status.missing {
    color: var(--text-feedback-critical, var(--nf-critical-text));
  }
</style>
