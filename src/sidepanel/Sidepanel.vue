<script setup lang="ts">
import { storageDemo } from '~/logic/storage'
</script>

<template>
  <main class="w-full px-4 py-5 text-center text-gray-700">
    <Logo />
    <div>Sidepanel</div>
    <SharedSubtitle />

    <div class="mt-2">
      <span class="opacity-50">Storage:</span> {{ storageDemo }}
    </div>
  </main>
</template>
