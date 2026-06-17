<template>
  <div v-if="!logStore.hasLog" class="welcome-pane">
    <div class="welcome-container">
      <div class="jumbotron">
        <h1>Welcome to the Enhanced Blackbox Explorer!</h1>
        <p>This tool allows you to view and analyze logs created by Betaflight's Blackbox feature.</p>
        <LogFileInput
          size="lg"
          label="Open log file/video"
          @files-selected="$emit('files-selected', $event)"
        />
      </div>
    </div>

    <div class="welcome-container">
      <div class="panel-row">
        <div class="panel panel-default">
          <div class="panel-heading">Introduction to Blackbox</div>
          <div class="panel-body">
            <p>
              The Blackbox feature is built in to
              <a href="https://github.com/betaflight/betaflight/releases" target="_blank" rel="noopener noreferrer">Betaflight</a>
              and is supported on most modern flight controllers (HAKRC F405, SpeedyBee F405, Mamba F722, etc.).
            </p>
            <p>
              To get started with Blackbox recording, read
              <a href="https://github.com/betaflight/betaflight/blob/master/docs/Blackbox.md" target="_blank" rel="noopener noreferrer">Betaflight's Blackbox feature documentation</a>.
            </p>
            <p>
              Already have a log recorded? View
              <a href="https://github.com/betaflight/blackbox-tools/blob/master/Readme.md" target="_blank" rel="noopener noreferrer">the documentation for this log viewer</a>
              for details on how to best use this tool.
            </p>
            <p>
              If you believe you've found a bug in this viewer (e.g. the viewer crashes upon attempting to open a log file), or you have
              a suggestion, please add it to
              <a href="https://github.com/betaflight/blackbox-log-viewer/issues" target="_blank" rel="noopener noreferrer">the viewer's GitHub bug tracker</a>.
            </p>
          </div>
        </div>

        <div class="panel panel-default">
          <div class="panel-heading">Tuning your craft</div>
          <div class="panel-body">
            <p>
              The Blackbox can deliver insights on your flight performance that will allow you to tune variables such as your PIDs and
              low-pass filter settings.
            </p>
            <p>For help and instructions on how to tune your craft, please read some of these resources:</p>
            <ul>
              <li>
                <a href="http://www.rcgroups.com/forums/showthread.php?t=2439428" target="_blank" rel="noopener noreferrer">Mini quad PID tuning from start to finish</a>
                by Joshua Bardwell on RCGroups.com
              </li>
              <li>
                <a href="http://www.rcgroups.com/forums/showthread.php?t=2386267" target="_blank" rel="noopener noreferrer">Blackbox log analyzation/help thread</a>
                on RCGroups.com
              </li>
              <li>
                <a href="https://github.com/betaflight/betaflight/blob/master/docs/PID-Tuning.md" target="_blank" rel="noopener noreferrer">Betaflight's PID tuning documentation</a>
              </li>
              <li>
                <a href="http://www.rcgroups.com/forums/showthread.php?t=2464844" target="_blank" rel="noopener noreferrer">Betaflight support topic</a>
                on RCGroups.com
              </li>
              <li>
                <a href="http://www.rcgroups.com/forums/showthread.php?t=2299805" target="_blank" rel="noopener noreferrer">Blackbox announcement topic (original viewer)</a>
                on RCGroups.com
              </li>
              <li>
                <a href="http://www.rcgroups.com/forums/showthread.php?t=2649495" target="_blank" rel="noopener noreferrer">Enhanced Blackbox announcement topic (this viewer)</a>
                on RCGroups.com
              </li>
            </ul>
          </div>
        </div>

        <div class="panel panel-default">
          <div class="panel-heading">Other tools</div>
          <div class="panel-body">
            <p>
              If you want to analyze your logs with your own mathematics package (such as Matlab) you can use the separate
              <a href="https://github.com/betaflight/blackbox-tools/" target="_blank" rel="noopener noreferrer">blackbox_decode tool</a>
              to convert your log file into a CSV file for analysis.
            </p>
            <p>
              If you want to share your log as a video, you can use the "export video" button at the top to render a WebM video, or use
              the commandline
              <a href="https://github.com/betaflight/blackbox-tools/" target="_blank" rel="noopener noreferrer">blackbox_render tool</a>
              tool to turn your log into a series of PNG files, or use a screen recording tool to record the playback of this log viewer.
            </p>
          </div>
        </div>

        <div class="panel panel-default">
          <div class="panel-heading">Version</div>
          <div class="panel-body">
            <p>This build: <strong>{{ appVersion }}</strong> (Auto Diagnostics experimental fork)</p>
            <p>
              The latest official release is at
              <a href="https://blackbox.betaflight.com" target="_blank" rel="noopener noreferrer">blackbox.betaflight.com</a>
            </p>
            <p>
              The latest development version is at
              <a href="https://master.blackbox.betaflight.com/" target="_blank" rel="noopener noreferrer">master.blackbox.betaflight.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLogStore } from "../stores/log.js";
import LogFileInput from "./LogFileInput.vue";

defineEmits(["files-selected"]);
const logStore = useLogStore();
const appVersion = __APP_VERSION__;
</script>

<style scoped>
.welcome-pane {
  padding: 1.5rem 0 2rem;
  background: #f5f5f5;
  min-height: 100vh;
}

:root.dark .welcome-pane {
  background: hsl(0, 0%, 14%);
}

.welcome-container {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0 1rem;
}

.jumbotron {
  background: #eee;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 2rem 2.5rem;
  margin-bottom: 1.5rem;
  text-align: center;
}

:root.dark .jumbotron {
  background: hsl(0, 0%, 18%);
  border-color: hsl(0, 0%, 28%);
}

.jumbotron h1 {
  font-size: 2rem;
  font-weight: 500;
  margin: 0 0 0.75rem;
  color: #333;
}

:root.dark .jumbotron h1 {
  color: #eee;
}

.jumbotron p {
  font-size: 1.05rem;
  color: #555;
  margin: 0 0 1.25rem;
}

:root.dark .jumbotron p {
  color: #bbb;
}

.panel-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

@media (max-width: 992px) {
  .panel-row {
    grid-template-columns: 1fr;
  }
}

.panel {
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  margin-bottom: 0;
}

:root.dark .panel {
  background: hsl(0, 0%, 16%);
  border-color: hsl(0, 0%, 28%);
}

.panel-heading {
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  border-bottom: 1px solid #ddd;
  background: #f7f7f7;
  color: #333;
}

:root.dark .panel-heading {
  background: hsl(0, 0%, 20%);
  border-color: hsl(0, 0%, 28%);
  color: #eee;
}

.panel-body {
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: #444;
}

:root.dark .panel-body {
  color: #ccc;
}

.panel-body p {
  margin: 0 0 0.75rem;
}

.panel-body ul {
  margin: 0;
  padding-left: 1.25rem;
}

.panel-body li {
  margin-bottom: 0.35rem;
}

.panel-body a {
  color: #337ab7;
  text-decoration: none;
}

.panel-body a:hover {
  text-decoration: underline;
}

:root.dark .panel-body a {
  color: #6cb2ff;
}

.panel-row .panel:last-child {
  grid-column: 1 / -1;
  max-width: 33%;
}

@media (max-width: 992px) {
  .panel-row .panel:last-child {
    max-width: none;
  }
}
</style>
