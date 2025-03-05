<script setup lang="ts">
import "./../../styles/nitfree-trigger.scss";

import { ref, onUnmounted } from "vue";
import { PickerHelper, DOMHelper, EDOMWatch } from "~/core";



let opened = ref(false);

function onclick() {
  PickerHelper.toggle();
}

const clean = DOMHelper.watch("[class*=\"expressionPickerPositionLayer__\"]", (action: EDOMWatch) => {
  opened.value = action === EDOMWatch.Added;
});

onUnmounted(() => {
  clean();
});
</script>

<template>
  <button class="nitfree-trigger" @click="onclick">
    <img src="/assets/logo.png" alt="Nitfree">
  </button>
</template>
