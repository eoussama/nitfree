<!--
  Discord's confirmation modal, over the popup: a title, what will happen, and Cancel next to the
  action. Escape or a click on the backdrop cancels.
-->
<script lang="ts">
  type TProps = {
    open: boolean;
    title: string;
    body: string;
    action: string;
    onconfirm: () => void;
    oncancel: () => void;
  };

  const { open, title, body, action, onconfirm, oncancel }: TProps = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }
    else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function onBackdrop(event: MouseEvent): void {
    if (event.target === dialog) {
      oncancel();
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="modal"
  aria-labelledby="nf-confirm-title"
  aria-describedby="nf-confirm-body"
  oncancel={(event) => {
    event.preventDefault();
    oncancel();
  }}
  onclick={onBackdrop}
>
  <div class="content">
    <h2 id="nf-confirm-title" class="title">{title}</h2>
    <p id="nf-confirm-body" class="body">{body}</p>
  </div>
  <footer class="footer">
    <button class="button secondary" type="button" onclick={oncancel}>{i18n.t("editor.cancel")}</button>
    <button class="button critical" type="button" onclick={onconfirm}>{action}</button>
  </footer>
</dialog>

<style>
  .modal {
    box-sizing: border-box;
    width: calc(100vw - 32px);
    max-width: 440px;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle, var(--nf-border));
    border-radius: var(--radius-md, 12px);
    background-color: var(--modal-background, var(--nf-bg));
    color: var(--text-default, var(--nf-text));
    box-shadow: 0 16px 48px rgb(0 0 0 / 32%);
  }

  .modal::backdrop {
    background-color: var(--background-scrim, rgb(0 0 0 / 72%));
  }

  .content {
    padding: 16px 16px 20px;
  }

  .title {
    margin: 0 0 8px;
    color: var(--text-strong, var(--nf-text));
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
  }

  .body {
    margin: 0;
    font-size: 16px;
    line-height: 20px;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px;
    background-color: var(--modal-footer-background, var(--nf-bg-elevated));
  }
</style>
