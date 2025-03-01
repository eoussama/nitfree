<script setup lang="ts">
import { LogHelper } from "~/core";
import "./../../styles/nitfree-trigger.scss";



let opened: boolean = false;

function onclick() {
  LogHelper.print({ opened });

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
</script>

<template>
  <button class="nitfree-trigger" @click="onclick">
    <img src="/assets/logo.png" alt="Nitfree">
  </button>
</template>
