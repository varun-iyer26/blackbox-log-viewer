<template>
  <span class="inline-flex items-center gap-1.5">
    <span
      class="inline-block size-2.5 rounded-full"
      :class="dotClass"
      :title="label"
    />
    <span v-if="!compact" class="text-xs font-medium">{{ label }}</span>
  </span>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  status: {
    type: String,
    default: "green",
    validator: (value) => ["green", "yellow", "red"].includes(value),
  },
  compact: { type: Boolean, default: false },
});

const label = computed(() => {
  if (props.status === "red") {
    return "Needs attention";
  }
  if (props.status === "yellow") {
    return "Monitor";
  }
  return "Good";
});

const dotClass = computed(() => ({
  "bg-green-500": props.status === "green",
  "bg-amber-400": props.status === "yellow",
  "bg-red-500": props.status === "red",
}));
</script>
