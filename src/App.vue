<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <!-- No route transition on purpose. This app lives in a background tab, and a
       backgrounded tab throttles requestAnimationFrame — a Vue <Transition>
       started there can stall on its first frame and strand the view at
       opacity 0 (or, with mode="out-in", never mount the incoming one at all).
       Navigation is user-initiated, so instant is both safer and snappier. -->
  <RouterView />
</template>
