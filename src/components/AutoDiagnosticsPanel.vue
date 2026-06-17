<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-3xl' }">
    <template #header>
      <h4 class="font-semibold">Auto Diagnostics</h4>
    </template>

    <template #body>
      <div
        data-auto-diagnostics
        class="flex flex-col gap-4 max-h-[70vh] overflow-y-auto text-sm"
        @mousedown.stop
        @keydown.stop
        @keyup.stop
        @wheel.stop
      >
        <div v-if="!logStore.hasLog" class="text-sm text-dimmed py-4 text-center">
          Open a blackbox log (.bbl) first.
        </div>

        <template v-else>
          <div
            v-if="diagnosticsStore.logQuality"
            class="rounded-lg border border-default px-3 py-2"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-semibold uppercase text-dimmed">Log quality</span>
              <StatusBadge :status="logQualityStatus" compact />
              <span class="text-xs tabular-nums text-dimmed ml-auto">{{ diagnosticsStore.logQuality.score }}/100</span>
            </div>
            <ul v-if="diagnosticsStore.logQuality.issues.length" class="text-xs text-dimmed list-disc pl-4 space-y-0.5">
              <li v-for="(issue, i) in diagnosticsStore.logQuality.issues" :key="i">{{ issue }}</li>
            </ul>
          </div>

          <div
            v-if="diagnosticsStore.analysisRunning && diagnosticsStore.analysisStatusLabel"
            class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-dimmed"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-primary-500 shrink-0" />
            {{ diagnosticsStore.analysisStatusLabel }}
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <SettingRow label="Frame type">
              <USelect
                :model-value="diagnosticsStore.frameArchetype"
                :items="frameArchetypeItems"
                :ui="{ content: 'z-[300]' }"
                size="sm"
                class="w-full"
                @update:model-value="diagnosticsStore.setFrameArchetype"
              />
            </SettingRow>
            <SettingRow label="AUW (g)">
              <input
                :value="diagnosticsStore.auwGramsText"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-sm font-mono"
                placeholder="650"
                autocomplete="off"
                @input="onAuwInput"
                @keydown.stop
                @keyup.stop
              />
            </SettingRow>
            <SettingRow label="Cells">
              <USelect
                :model-value="diagnosticsStore.cellCount"
                :items="cellCountItems"
                :ui="{ content: 'z-[300]' }"
                size="sm"
                class="w-full"
                @update:model-value="diagnosticsStore.setCellCount"
              />
            </SettingRow>
          </div>

          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <label class="text-xs text-dimmed">
                CLI dump <span class="opacity-70">(optional — supplements log header)</span>
              </label>
              <div class="flex items-center gap-1">
                <input
                  ref="cliFileInput"
                  type="file"
                  accept=".txt,.diff,.cli,text/plain"
                  class="hidden"
                  @change="onCliDumpFile"
                />
                <UButton
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-file-up"
                  label="Import file"
                  size="xs"
                  @click="cliFileInput?.click()"
                />
              </div>
            </div>
            <textarea
              class="w-full min-h-[72px] font-mono text-xs bg-elevated border border-default rounded p-2 resize-y"
              placeholder="# paste diff all output"
              :value="diagnosticsStore.cliDumpText"
              autocomplete="off"
              @input="onCliDumpInput"
              @keydown.stop
              @keyup.stop
            />
            <p v-if="cliImportError" class="text-xs text-red-400 mt-1">{{ cliImportError }}</p>
          </div>

          <div class="flex items-center justify-between gap-2 flex-wrap">
            <p v-if="!diagnosticsStore.canRunAnalysis" class="text-xs text-amber-500">
              {{ runBlockReason }}
            </p>
            <div class="flex-1" />
            <UButton
              variant="solid"
              color="primary"
              icon="i-lucide-play"
              label="Run Analysis"
              size="xs"
              :disabled="!diagnosticsStore.canRunAnalysis"
              :loading="diagnosticsStore.analysisRunning"
              @click="runAnalysis"
            />
          </div>

          <div v-if="validationBlock.length" class="space-y-1">
            <div
              v-for="(msg, i) in validationBlock"
              :key="i"
              class="text-xs flex items-start gap-2 text-amber-500"
            >
              <UIcon name="i-lucide-alert-triangle" class="size-3.5 shrink-0 mt-0.5" />
              <span>{{ msg }}</span>
            </div>
          </div>

          <template v-if="diagnosticsStore.analysisReport">
            <div v-if="diagnosticsStore.analysisReport.directionalHints?.length" class="rounded border border-default p-3">
              <div class="text-xs font-semibold uppercase text-dimmed mb-1">
                Investigate manually
              </div>
              <p class="text-xs text-dimmed mb-2">
                Directional notes from blackbox metrics — not auto-applied CLI commands.
              </p>
              <ul class="space-y-2">
                <li
                  v-for="(hint, i) in diagnosticsStore.analysisReport.directionalHints"
                  :key="i"
                  class="text-xs border-b border-default/40 pb-2 last:border-0 last:pb-0"
                >
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="font-medium">{{ hint.axis }}</span>
                    <span class="text-dimmed">· {{ hint.parameter }}</span>
                    <span class="text-dimmed tabular-nums ml-auto">{{ hint.confidence }}%</span>
                  </div>
                  <p class="text-dimmed">{{ hint.hint }}</p>
                  <p class="text-dimmed opacity-70 mt-0.5">Evidence: {{ hint.evidence }}</p>
                </li>
              </ul>
            </div>

            <div v-if="diagnosticsStore.analysisReport.observations?.length" class="rounded border border-default p-3">
              <div class="text-xs font-semibold uppercase text-dimmed mb-2">Observations</div>
              <ul class="text-xs text-dimmed space-y-1 list-disc pl-4">
                <li v-for="(line, i) in diagnosticsStore.analysisReport.observations" :key="i">{{ line }}</li>
              </ul>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded border border-default p-3">
                <div class="text-xs font-semibold uppercase text-dimmed mb-2">Resonance</div>
                <div class="flex items-center gap-2 mb-1">
                  <StatusBadge :status="diagnosticsStore.analysisReport.hardware.frameResonance.status" compact />
                  <span class="text-xs">
                    {{ diagnosticsStore.analysisReport.hardware.frameResonance.peakHz || "—" }} Hz peak
                  </span>
                </div>
                <p class="text-xs text-dimmed">
                  {{ diagnosticsStore.analysisReport.hardware.frameResonance.summary }}
                </p>
              </div>
              <div class="rounded border border-default p-3">
                <div class="text-xs font-semibold uppercase text-dimmed mb-2">Motors</div>
                <div class="flex items-center gap-2 mb-1">
                  <StatusBadge :status="diagnosticsStore.analysisReport.hardware.motorHealth.status" compact />
                </div>
                <p class="text-xs text-dimmed">
                  {{ diagnosticsStore.analysisReport.hardware.motorHealth.summary }}
                </p>
              </div>
            </div>

            <div class="rounded border border-default p-3 overflow-x-auto">
              <div class="text-xs font-semibold uppercase text-dimmed mb-2">Step response (measured)</div>
              <table class="w-full text-xs">
                <thead>
                  <tr class="border-b border-default text-left text-dimmed">
                    <th class="py-1 pr-3">Axis</th>
                    <th class="py-1 pr-3">Status</th>
                    <th class="py-1 pr-3">Overshoot</th>
                    <th class="py-1 pr-3">Settle</th>
                    <th class="py-1 pr-3">Latency</th>
                    <th class="py-1">Events</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="axis in diagnosticsStore.analysisReport.tuning.axes"
                    :key="axis.name"
                    class="border-b border-default/50"
                  >
                    <td class="py-1 pr-3 font-medium">{{ axis.name }}</td>
                    <td class="py-1 pr-3"><StatusBadge :status="axis.status" compact /></td>
                    <td class="py-1 pr-3 tabular-nums">
                      {{ axis.overshootPct != null ? `${axis.overshootPct.toFixed(1)}%` : "—" }}
                    </td>
                    <td class="py-1 pr-3 tabular-nums">
                      {{ axis.settleTimeMs != null ? `${axis.settleTimeMs.toFixed(0)} ms` : "—" }}
                    </td>
                    <td class="py-1 pr-3 tabular-nums">
                      {{ axis.latencyMs != null ? `${axis.latencyMs.toFixed(0)} ms` : "—" }}
                    </td>
                    <td class="py-1 tabular-nums">{{ axis.stepEvents ?? 0 }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="text-xs text-dimmed mt-2">
                Compared to {{ diagnosticsStore.analysisReport.referenceUsed?.label ?? diagnosticsStore.hardwareProfile.frameLabel }} reference
                (target ~{{ diagnosticsStore.analysisReport.referenceUsed?.sweetOvershootPct ?? "?" }}% overshoot).
              </p>
            </div>

            <div
              v-if="diagnosticsStore.analysisReport.tuning.pidTerms?.available"
              class="rounded border border-default p-3"
            >
              <div class="text-xs font-semibold uppercase text-dimmed mb-2">Logged PID terms</div>
              <ul class="text-xs text-dimmed space-y-1">
                <li v-for="axis in diagnosticsStore.analysisReport.tuning.pidTerms.axes" :key="axis.name">
                  <span class="font-medium">{{ axis.name }}:</span>
                  <span v-if="axis.windup">
                    <StatusBadge :status="axis.windup.status" compact />
                    {{ axis.windup.summary }}
                  </span>
                  <span v-if="axis.feedforward">
                    <StatusBadge :status="axis.feedforward.status" compact />
                    {{ axis.feedforward.summary }}
                  </span>
                </li>
              </ul>
            </div>

            <div class="rounded border border-default p-3">
              <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div class="text-xs font-semibold uppercase text-dimmed">CLI (evidence-based only)</div>
                <div class="flex gap-1 flex-wrap">
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-clipboard-copy"
                    label="Copy report"
                    size="xs"
                    @click="copyFullReport"
                  />
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-download"
                    label="Export MD"
                    size="xs"
                    @click="exportMarkdown"
                  />
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-download"
                    label="Export JSON"
                    size="xs"
                    @click="exportJson"
                  />
                  <UButton
                    v-if="diagnosticsStore.analysisReport.cliCommandsOnly"
                    variant="solid"
                    color="primary"
                    icon="i-lucide-clipboard-copy"
                    label="Copy CLI"
                    size="xs"
                    @click="copyCliCommandsOnly"
                  />
                </div>
              </div>
              <p v-if="!diagnosticsStore.analysisReport.cliItems?.length" class="text-xs text-dimmed">
                No CLI changes met the evidence threshold for this log.
              </p>
              <div v-else class="mb-2 space-y-1 text-xs">
                <div
                  v-for="(item, i) in diagnosticsStore.analysisReport.cliItems"
                  :key="i"
                  class="flex gap-2 text-dimmed"
                >
                  <span class="tabular-nums shrink-0 w-10">{{ item.confidence }}%</span>
                  <code class="text-highlighted shrink-0">{{ item.command }}</code>
                  <span>{{ item.reason }}</span>
                </div>
              </div>
              <textarea
                class="w-full min-h-[100px] font-mono text-xs bg-elevated border border-default rounded p-2 resize-y"
                readonly
                tabindex="-1"
                :value="diagnosticsStore.analysisReport.cliCommandsOnly || diagnosticsStore.analysisReport.cli"
              />
            </div>
          </template>

          <p v-else-if="diagnosticsStore.analysisError" class="text-sm text-red-400">
            {{ diagnosticsStore.analysisError }}
          </p>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useLogStore } from "../stores/log.js";
import { useAppStore } from "../stores/app.js";
import { useDiagnosticsStore } from "../stores/diagnostics.js";
import {
  downloadReportJson,
  downloadReportMarkdown,
  readCliDumpFile,
} from "../diagnostics/report_export.js";
import SettingRow from "./SettingRow.vue";
import StatusBadge from "./DiagnosticsStatusBadge.vue";

const open = defineModel("open", { type: Boolean, default: false });

const logStore = useLogStore();
const appStore = useAppStore();
const diagnosticsStore = useDiagnosticsStore();
const cliFileInput = ref(null);
const cliImportError = ref(null);

const logQualityStatus = computed(() => {
  const grade = diagnosticsStore.logQuality?.grade;
  if (grade === "good") {
    return "green";
  }
  if (grade === "fair") {
    return "yellow";
  }
  return "red";
});

const frameArchetypeItems = computed(() =>
  diagnosticsStore.frameArchetypeOptions.map((o) => ({ label: o.label, value: o.value })),
);

const cellCountItems = computed(() =>
  diagnosticsStore.cellCountOptions.map((o) => ({ label: o.label, value: o.value })),
);

const validationBlock = computed(() => [
  ...(diagnosticsStore.baseline?.errors ?? []),
  ...(diagnosticsStore.baseline?.warnings ?? []),
  ...diagnosticsStore.validationMessages.filter(
    (m) => !diagnosticsStore.baseline?.warnings?.includes(m),
  ),
]);

const runBlockReason = computed(() => {
  if (!diagnosticsStore.baseline) {
    return "Loading log baseline…";
  }
  if (!diagnosticsStore.auwGrams) {
    return "Enter AUW in grams to enable analysis.";
  }
  return "Analysis unavailable for this log.";
});

function onAuwInput(event) {
  diagnosticsStore.setAuwGramsText(event.target.value);
}

function onCliDumpInput(event) {
  diagnosticsStore.setCliDumpText(event.target.value);
  cliImportError.value = null;
}

async function onCliDumpFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }
  try {
    diagnosticsStore.setCliDumpText(await readCliDumpFile(file));
    cliImportError.value = null;
  } catch (err) {
    cliImportError.value = err?.message ?? "Could not read CLI dump file.";
  }
}

async function runAnalysis() {
  await diagnosticsStore.runAnalysis(logStore.flightLog);
}

async function copyCliCommandsOnly() {
  const cli = diagnosticsStore.analysisReport?.cliCommandsOnly;
  if (cli) {
    await navigator.clipboard.writeText(cli);
  }
}

async function copyFullReport() {
  const text = diagnosticsStore.analysisReport?.fullReportText;
  if (text) {
    await navigator.clipboard.writeText(text);
  }
}

function exportMarkdown() {
  const report = diagnosticsStore.analysisReport;
  if (report) {
    downloadReportMarkdown(report, appStore.logFilename);
  }
}

function exportJson() {
  const report = diagnosticsStore.analysisReport;
  if (report) {
    downloadReportJson(report, appStore.logFilename, {
      frameArchetype: diagnosticsStore.frameArchetype,
      auwGrams: diagnosticsStore.auwGrams,
      cellCount: diagnosticsStore.cellCount,
      logQuality: diagnosticsStore.logQuality,
    });
  }
}

watch(
  () => [open.value, logStore.flightLog],
  ([isOpen, flightLog]) => {
    if (isOpen && flightLog) {
      diagnosticsStore.refreshBaseline(flightLog);
    }
  },
);
</script>