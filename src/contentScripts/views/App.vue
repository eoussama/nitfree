<script setup lang="ts">
import { useToggle } from '@vueuse/core'

const [show, toggle] = useToggle(false)
</script>

<template>
  <div>
    <div :class="show ? 'opacity-100' : 'opacity-0'">
      <h1>
        'Night
      </h1>
      <SharedSubtitle />
    </div>
    <button @click="toggle()">
      <pixelarticons-power />
    </button>
  </div>
</template>
