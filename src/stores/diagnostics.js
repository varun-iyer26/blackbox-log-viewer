import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { useLogStore } from "./log.js";
import { extractDiagnosticsBaseline } from "../diagnostics/data_extractor.js";
import {
  parseCliDump,
  mergeConfigBaseline,
} from "../diagnostics/cli_dump_parser.js";
import {
  FRAME_ARCHETYPES,
  CELL_COUNTS,
  FRAME_THRESHOLD_PROFILES,
} from "../diagnostics/constants.js";
import { runDiagnosticsInWorker } from "../diagnostics/diagnostics_runner.js";
import { assessLogQuality } from "../diagnostics/log_quality.js";

export const useDiagnosticsStore = defineStore("diagnostics", () => {
  const frameArchetype = ref("freestyle_5");
  const auwGramsText = ref("");
  const cellCount = ref("4S");
  const cliDumpText = ref("");

  const baseline = ref(null);
  const extractionPending = ref(false);
  const analysisReport = ref(null);
  const analysisError = ref(null);
  const analysisRunning = ref(false);
  /** @type {import('vue').Ref<'idle'|'extracting'|'analyzing'>} */
  const analysisPhase = ref("idle");
  const dialogOpen = ref(false);

  const parsedCliDump = computed(() => parseCliDump(cliDumpText.value));

  const effectiveConfig = computed(() => {
    if (!baseline.value?.headerBaseline) {
      return parsedCliDump.value.values;
    }
    return mergeConfigBaseline(
      baseline.value.headerBaseline,
      parsedCliDump.value.values,
    );
  });

  const auwGrams = computed(() => {
    const trimmed = auwGramsText.value.trim();
    if (!trimmed) {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  });

  const hasGyroChannels = computed(
    () => !baseline.value?.channels?.gyro?.some((c) => c.fieldIndex === undefined),
  );

  const thresholdProfile = computed(
    () =>
      FRAME_THRESHOLD_PROFILES[frameArchetype.value] ??
      FRAME_THRESHOLD_PROFILES.freestyle_5,
  );

  const hardwareProfile = computed(() => ({
    frameArchetype: frameArchetype.value,
    frameLabel:
      FRAME_ARCHETYPES.find((f) => f.value === frameArchetype.value)?.label ??
      frameArchetype.value,
    auwGrams: auwGrams.value,
    cellCount: cellCount.value,
    thresholdProfile: thresholdProfile.value,
  }));

  const validationMessages = computed(() => {
    const messages = [];
    if (baseline.value?.errors?.length) {
      messages.push(...baseline.value.errors);
    }
    if (baseline.value?.warnings?.length) {
      messages.push(...baseline.value.warnings);
    }
    if (!hasGyroChannels.value && baseline.value) {
      messages.push("Missing gyro channels — enable gyro logging in Blackbox.");
    }
    if (auwGrams.value == null || auwGrams.value <= 0) {
      messages.push("Enter total all-up weight (AUW) in grams.");
    }
    return messages;
  });

  const canRunAnalysis = computed(
    () =>
      baseline.value != null &&
      hasGyroChannels.value &&
      !!frameArchetype.value &&
      auwGrams.value != null &&
      auwGrams.value > 0 &&
      !!cellCount.value &&
      !analysisRunning.value,
  );

  const analysisStatusLabel = computed(() => {
    if (analysisPhase.value === "extracting") {
      return "Preparing log data…";
    }
    if (analysisPhase.value === "analyzing") {
      return "Running FFT and step-response analysis in worker…";
    }
    return null;
  });

  const logQuality = computed(() => assessLogQuality(baseline.value));

  function setFrameArchetype(value) {
    frameArchetype.value = value;
  }

  function setAuwGramsText(value) {
    auwGramsText.value = String(value ?? "").replace(/[^\d]/g, "");
  }

  /** @deprecated Use setAuwGramsText — kept for compatibility */
  function setAuwGrams(value) {
    setAuwGramsText(value);
  }

  function setCellCount(value) {
    cellCount.value = value;
  }

  function setCliDumpText(text) {
    cliDumpText.value = text;
  }

  function refreshBaseline(flightLog) {
    extractionPending.value = true;
    try {
      if (!flightLog) {
        baseline.value = null;
        return;
      }
      baseline.value = extractDiagnosticsBaseline(flightLog);
      analysisReport.value = null;
      analysisError.value = null;
    } finally {
      extractionPending.value = false;
    }
  }

  async function runAnalysis(flightLog) {
    if (!flightLog || !canRunAnalysis.value) {
      return null;
    }
    analysisRunning.value = true;
    analysisPhase.value = "extracting";
    analysisError.value = null;
    analysisReport.value = null;

    try {
      const report = await runDiagnosticsInWorker(
        flightLog,
        {
          baseline: baseline.value,
          thresholdProfile: thresholdProfile.value,
          hardwareProfile: hardwareProfile.value,
          effectiveConfig: effectiveConfig.value,
        },
        (phase) => {
          analysisPhase.value = phase;
        },
      );
      analysisReport.value = report;
      return report;
    } catch (err) {
      analysisError.value = err?.message ?? "Analysis failed.";
      return null;
    } finally {
      analysisRunning.value = false;
      analysisPhase.value = "idle";
    }
  }

  function resetUserInputs() {
    frameArchetype.value = "freestyle_5";
    auwGramsText.value = "";
    cellCount.value = "4S";
    cliDumpText.value = "";
  }

  function resetAll() {
    baseline.value = null;
    analysisReport.value = null;
    analysisError.value = null;
    resetUserInputs();
  }

  const logStore = useLogStore();
  watch(
    () => logStore.flightLog,
    (flightLog) => {
      if (flightLog) {
        refreshBaseline(flightLog);
      } else {
        resetAll();
      }
    },
  );

  return {
    frameArchetype,
    auwGramsText,
    auwGrams,
    cellCount,
    cliDumpText,
    baseline,
    extractionPending,
    analysisReport,
    analysisError,
    analysisRunning,
    analysisPhase,
    analysisStatusLabel,
    dialogOpen,
    logQuality,
    parsedCliDump,
    effectiveConfig,
    hardwareProfile,
    thresholdProfile,
    canRunAnalysis,
    validationMessages,
    frameArchetypeOptions: FRAME_ARCHETYPES,
    cellCountOptions: CELL_COUNTS,
    setFrameArchetype,
    setAuwGramsText,
    setAuwGrams,
    setCellCount,
    setCliDumpText,
    refreshBaseline,
    runAnalysis,
    resetUserInputs,
    resetAll,
  };
});
