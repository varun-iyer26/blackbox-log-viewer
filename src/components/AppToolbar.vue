<template>
  <nav class="bf-navbar">
    <div class="bf-navbar-inner">
      <div class="bf-navbar-brand">
        <img src="/images/cf_logo_white.svg" alt="Betaflight" class="bf-logo" />
        <span v-if="appStore.logFilename" class="bf-filename" :title="appStore.logFilename">
          {{ appStore.logFilename }}
        </span>
      </div>

      <div v-if="logStore.hasLog" class="bf-navbar-actions">
        <div class="bf-btn-group">
          <UButton
            variant="outline"
            color="neutral"
            label="New Window"
            size="xs"
            class="bf-btn-default"
            @click="$emit('new-window')"
          />
          <UButton
            variant="solid"
            color="primary"
            label="Export video..."
            size="xs"
            class="bf-btn-primary"
            @click="$emit('export-video')"
          />
          <UButton
            variant="solid"
            color="primary"
            label="Export Workspaces..."
            size="xs"
            class="bf-btn-primary"
            @click="$emit('export-workspaces')"
          />
          <UButton
            variant="solid"
            color="primary"
            label="Export CSV..."
            size="xs"
            class="bf-btn-primary"
            @click="$emit('export-csv')"
          />
          <UButton
            variant="solid"
            color="primary"
            label="Export GPX..."
            size="xs"
            class="bf-btn-primary"
            @click="$emit('export-gpx')"
          />
          <UButton
            variant="solid"
            color="primary"
            label="Auto Diagnostics"
            size="xs"
            class="bf-btn-primary"
            title="Analyze log for filter/PID observations (experimental)"
            @click="$emit('open-diagnostics')"
          />
          <LogFileInput size="xs" label="Open log file/video" @files-selected="$emit('files-selected', $event)" />
        </div>
        <div class="bf-btn-group bf-btn-group-icons">
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-settings"
            size="xs"
            title="User Settings"
            @click="$emit('open-settings')"
          />
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-keyboard"
            size="xs"
            title="Keyboard Shortcuts"
            @click="$emit('open-keys')"
          />
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { useLogStore } from "../stores/log.js";
import { useAppStore } from "../stores/app.js";
import LogFileInput from "./LogFileInput.vue";

defineEmits([
  "files-selected",
  "export-csv",
  "export-gpx",
  "export-video",
  "export-workspaces",
  "new-window",
  "open-settings",
  "open-keys",
  "open-diagnostics",
]);

const logStore = useLogStore();
const appStore = useAppStore();
</script>

<style scoped>
.bf-navbar {
  background: #222;
  border-bottom: 1px solid #080808;
  color: #9d9d9d;
  width: 100%;
}

.bf-navbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.35rem 0.75rem;
  flex-wrap: wrap;
}

.bf-navbar-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.bf-logo {
  height: 1.35rem;
  width: auto;
}

.bf-filename {
  font-size: 0.75rem;
  color: #9d9d9d;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bf-navbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-left: auto;
}

.bf-btn-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.bf-btn-group-icons :deep(button) {
  color: #ccc;
}

.bf-btn-primary :deep(button) {
  font-weight: 600;
}

.bf-btn-default :deep(button) {
  background: #fff;
  border-color: #ccc;
  color: #333;
}

:root.dark .bf-btn-default :deep(button) {
  background: hsl(0, 0%, 22%);
  border-color: hsl(0, 0%, 35%);
  color: #eee;
}
</style>
