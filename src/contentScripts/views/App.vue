<script setup lang="ts">
import './../../styles/nitfree-trigger.css'

let opened: boolean = false

function onclick() {
  opened = !opened

  if (opened) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'escape' }))
  }
  else {
    const btn = document.getElementById('nitfree')?.previousSibling?.childNodes[0] as HTMLButtonElement

    if (btn) {
      btn.click()
    }
  }
}
</script>

<template>
  <button class="nitfree-trigger" @click="onclick">
    <img src="/assets/logo.png" alt="Nitfree">
  </button>
</template>
