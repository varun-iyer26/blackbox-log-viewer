<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-3xl' }">
    <template #header>
      <div class="flex items-center gap-2 min-w-0 w-full">
        <h4 class="font-semibold shrink-0">Auto Diagnostics</h4>
        <span
          v-if="diagnosticsStore.analysisReport?.metadata"
          class="text-xs text-dimmed truncate"
        >
          Report confidence:
          {{ diagnosticsStore.analysisReport.metadata.confidenceTier }}
          ({{ diagnosticsStore.analysisReport.metadata.confidenceScore }}/100)
        </span>
      </div>
    </template>

    <template #body>
      <div
        data-auto-diagnostics
        class="flex flex-col gap-4 p-4 max-h-[70vh] overflow-y-auto text-sm"
        @mousedown.stop
        @keydown.stop
        @keyup.stop
        @wheel.stop
      >
        <div v-if="!logStore.hasLog" class="text-sm text-dimmed py-4 text-center">
          Open a blackbox log (.bbl) first.
        </div>

        <template v-else>
          <UiBox
            v-if="diagnosticsStore.logQuality"
            title="Log quality"
            :type="logQualityBoxType"
            highlight
          >
            <div class="flex items-center gap-2">
              <StatusBadge :status="logQualityStatus" compact />
              <span class="text-xs tabular-nums text-dimmed ml-auto">{{ diagnosticsStore.logQuality.score }}/100</span>
            </div>
            <ul v-if="diagnosticsStore.logQuality.issues.length" class="text-xs text-dimmed list-disc pl-4 space-y-0.5 mt-1">
              <li v-for="(issue, i) in diagnosticsStore.logQuality.issues" :key="i">{{ issue }}</li>
            </ul>
          </UiBox>

          <div
            v-if="diagnosticsStore.analysisRunning && diagnosticsStore.analysisStatusLabel"
            class="flex flex-col gap-2"
          >
            <div class="flex items-center gap-2 text-xs text-dimmed">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-primary-500 shrink-0" />
              {{ diagnosticsStore.analysisStatusLabel }}
            </div>
            <UProgress
              v-if="diagnosticsStore.analysisProgress?.phase === 'extracting'"
              :model-value="diagnosticsStore.analysisProgress.percent"
              color="primary"
              size="sm"
            />
          </div>

          <UiBox title="Craft setup">
            <SettingRow label="Frame type">
              <USelect
                :model-value="diagnosticsStore.frameArchetype"
                :items="frameArchetypeItems"
                :ui="{ content: 'z-[300]' }"
                size="sm"
                class="min-w-36"
                @update:model-value="diagnosticsStore.setFrameArchetype"
              />
            </SettingRow>
            <SettingRow label="AUW (g)" help="Total all-up weight in grams">
              <UInput
                :model-value="diagnosticsStore.auwGramsText"
                size="sm"
                class="min-w-24 font-mono"
                placeholder="650"
                inputmode="numeric"
                autocomplete="off"
                @update:model-value="diagnosticsStore.setAuwGramsText"
                @keydown.stop
              />
            </SettingRow>
            <SettingRow label="Cells">
              <USelect
                :model-value="diagnosticsStore.cellCount"
                :items="cellCountItems"
                :ui="{ content: 'z-[300]' }"
                size="sm"
                class="min-w-24"
                @update:model-value="diagnosticsStore.setCellCount"
              />
            </SettingRow>
          </UiBox>

          <UiBox title="CLI dump" help="Optional Betaflight diff all or dump — supplements log header" type="neutral">
            <template #actions>
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
                label="Import"
                size="xs"
                @click="cliFileInput?.click()"
              />
            </template>
            <textarea
              class="w-full min-h-[72px] font-mono text-xs bg-default border border-default rounded p-2 resize-y"
              placeholder="# paste diff all output"
              :value="diagnosticsStore.cliDumpText"
              autocomplete="off"
              @input="onCliDumpInput"
              @keydown.stop
              @keyup.stop
            />
            <p v-if="cliImportError" class="text-xs text-red-400">{{ cliImportError }}</p>
          </UiBox>

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

          <p v-if="!diagnosticsStore.canRunAnalysis && runBlockReason" class="text-xs text-amber-500">
            {{ runBlockReason }}
          </p>

          <template v-if="diagnosticsStore.analysisReport">
            <UiBox
              v-if="diagnosticsStore.analysisReport.metadata?.confidenceReasons?.length"
              title="Report confidence"
              type="neutral"
              collapsible
            >
              <p class="text-xs text-dimmed">
                Tier: <span class="font-medium capitalize">{{ diagnosticsStore.analysisReport.metadata.confidenceTier }}</span>
                · Score {{ diagnosticsStore.analysisReport.metadata.confidenceScore }}/100
              </p>
              <ul class="text-xs text-dimmed list-disc pl-4 mt-1 space-y-0.5">
                <li
                  v-for="(reason, i) in diagnosticsStore.analysisReport.metadata.confidenceReasons"
                  :key="i"
                >
                  {{ reason }}
                </li>
              </ul>
            </UiBox>

            <UiBox
              v-if="diagnosticsStore.analysisReport.directionalHints?.length"
              title="Investigate manually"
              help="Directional notes — not auto-applied CLI commands"
              type="neutral"
              collapsible
            >
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
            </UiBox>

            <UiBox
              v-if="diagnosticsStore.analysisReport.observations?.length"
              title="Observations"
              type="neutral"
              collapsible
            >
              <ul class="text-xs text-dimmed space-y-1 list-disc pl-4">
                <li v-for="(line, i) in diagnosticsStore.analysisReport.observations" :key="i">{{ line }}</li>
              </ul>
            </UiBox>

            <UiBox title="Hardware metrics" type="neutral" collapsible>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <div class="text-xs font-medium mb-1">Resonance</div>
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
                <div>
                  <div class="text-xs font-medium mb-1">Motors</div>
                  <div class="flex items-center gap-2 mb-1">
                    <StatusBadge :status="diagnosticsStore.analysisReport.hardware.motorHealth.status" compact />
                  </div>
                  <p class="text-xs text-dimmed">
                    {{ diagnosticsStore.analysisReport.hardware.motorHealth.summary }}
                  </p>
                </div>
              </div>
            </UiBox>

            <UiBox title="Step response" type="neutral" collapsible>
              <div class="overflow-x-auto">
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
            </UiBox>

            <UiBox
              v-if="diagnosticsStore.analysisReport.tuning.pidTerms?.available"
              title="Logged PID terms"
              type="neutral"
              collapsible
              collapsed
            >
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
            </UiBox>

            <UiBox title="CLI (evidence-based only)" type="neutral" collapsible>
              <template #actions>
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
                    label="MD"
                    size="xs"
                    @click="exportMarkdown"
                  />
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-download"
                    label="JSON"
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
                    :disabled="!diagnosticsStore.canCopyCli"
                    :title="copyCliDisabledReason"
                    @click="copyCliCommandsOnly"
                  />
                </div>
              </template>
              <label
                v-if="diagnosticsStore.benchVerificationRequired && diagnosticsStore.analysisReport.cliCommandsOnly"
                class="flex items-start gap-2 text-xs text-dimmed mb-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="mt-0.5"
                  :checked="diagnosticsStore.benchVerified"
                  @change="diagnosticsStore.setBenchVerified($event.target.checked)"
                />
                <span>I verified these settings on the bench — safe to copy CLI commands.</span>
              </label>
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
                class="w-full min-h-[100px] font-mono text-xs bg-default border border-default rounded p-2 resize-y"
                readonly
                tabindex="-1"
                :value="diagnosticsStore.analysisReport.cliCommandsOnly || diagnosticsStore.analysisReport.cli"
              />
            </UiBox>
          </template>

          <UiBox title="Reliability settings" type="neutral" collapsible collapsed>
            <SettingRow label="Anonymous telemetry" help="Local-only counters (duration, success/fail). Never uploads logs.">
              <USwitch
                :model-value="diagnosticsStore.telemetryOptIn"
                size="sm"
                @update:model-value="diagnosticsStore.setTelemetryOptIn"
              />
            </SettingRow>
            <div class="flex gap-2 flex-wrap pt-1">
              <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-download"
                label="Export telemetry"
                size="xs"
                :disabled="!diagnosticsStore.telemetryOptIn"
                @click="exportTelemetry"
              />
            </div>
            <p class="text-xs text-dimmed">
              Feature flags: append
              <code class="text-highlighted">?bf_diag=0</code>
              to disable diagnostics, or
              <code class="text-highlighted">?bf_diag_bench=0</code>
              to skip bench verification.
            </p>
          </UiBox>

          <p
            v-if="diagnosticsStore.analysisError && !diagnosticsStore.analysisReport"
            class="text-sm"
            :class="isCancelledError ? 'text-dimmed' : 'text-red-400'"
          >
            {{ diagnosticsStore.analysisError }}
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <div v-if="logStore.hasLog" class="flex justify-end gap-2">
        <UButton
          v-if="diagnosticsStore.analysisRunning"
          variant="outline"
          color="neutral"
          label="Cancel"
          size="sm"
          @click="diagnosticsStore.cancelAnalysis()"
        />
        <UButton
          variant="outline"
          color="neutral"
          label="Close"
          size="sm"
          @click="open = false"
        />
        <UButton
          color="primary"
          icon="i-lucide-play"
          label="Run analysis"
          size="sm"
          :disabled="!diagnosticsStore.canRunAnalysis"
          :loading="diagnosticsStore.analysisRunning"
          @click="runAnalysis"
        />
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
import { downloadTelemetryExport } from "../diagnostics/telemetry.js";
import SettingRow from "./SettingRow.vue";
import UiBox from "./UiBox.vue";
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

const logQualityBoxType = computed(() => {
  const grade = diagnosticsStore.logQuality?.grade;
  if (grade === "good") {
    return "success";
  }
  if (grade === "fair") {
    return "warning";
  }
  return "error";
});

const frameArchetypeItems = computed(() =>
  diagnosticsStore.frameArchetypeOptions.map((o) => ({ label: o.label, value: o.value })),
);

const cellCountItems = computed(() =>
  diagnosticsStore.cellCountOptions.map((o) => ({ label: o.label, value: o.value })),
);

const validationBlock = computed(() => {
  const seen = new Set();
  return diagnosticsStore.validationMessages.filter((m) => {
    if (seen.has(m)) {
      return false;
    }
    seen.add(m);
    return true;
  });
});

const runBlockReason = computed(() => {
  if (!diagnosticsStore.baseline) {
    return "Loading log baseline…";
  }
  if (diagnosticsStore.auwGrams) {
    return "Analysis unavailable for this log.";
  }
  return null;
});

const isCancelledError = computed(() =>
  /cancelled/i.test(diagnosticsStore.analysisError ?? ""),
);

const copyCliDisabledReason = computed(() => {
  if (diagnosticsStore.canCopyCli) {
    return undefined;
  }
  if (diagnosticsStore.benchVerificationRequired) {
    return "Confirm bench verification before copying CLI commands.";
  }
  return undefined;
});

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

function exportTelemetry() {
  downloadTelemetryExport();
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