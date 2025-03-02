<script setup lang="ts">
import "./../../styles/nitfree-trigger.scss";
import { DOMHelper, EDOMWatch, LogHelper } from "~/core";



let opened: boolean = false;

function onclick() {
  // TODO: Helper for opening the picker

  if (opened) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'escape' }));
  }
  else {
    const btn = document.getElementById('nitfree')?.previousSibling?.childNodes[0] as HTMLButtonElement;

    if (btn) {
      btn.click();
    }
  }

  opened = !opened;
}

DOMHelper.watch("[class*=\"expressionPickerPositionLayer__\"]", (action: EDOMWatch) => {
  opened = action === EDOMWatch.Added;
});
</script>

<template>
  <button class="nitfree-trigger" @click="onclick">
    <img src="/assets/logo.png" alt="Nitfree">
  </button>
</template>
