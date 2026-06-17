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
import { runDiagnosticsInWorker, cancelDiagnosticsWorker } from "../diagnostics/diagnostics_runner.js";
import { assessLogQuality } from "../diagnostics/log_quality.js";
import {
  loadDiagnosticsPrefs,
  saveDiagnosticsPrefs,
  userFacingError,
} from "../diagnostics/analysis_reliability.js";
import {
  getDiagnosticsFlags,
  isBenchVerificationRequired,
  isTelemetryOptIn,
} from "../diagnostics/feature_flags.js";
import { setTelemetryOptIn as persistTelemetryOptIn } from "../diagnostics/telemetry.js";

const savedPrefs = loadDiagnosticsPrefs();
export const useDiagnosticsStore = defineStore("diagnostics", () => {
  const frameArchetype = ref(savedPrefs?.frameArchetype ?? "freestyle_5");
  const auwGramsText = ref(savedPrefs?.auwGramsText ?? "");
  const cellCount = ref(savedPrefs?.cellCount ?? "4S");
  const cliDumpText = ref("");

  const baseline = ref(null);
  const extractionPending = ref(false);
  const analysisReport = ref(null);
  const analysisError = ref(null);
  const analysisRunning = ref(false);
  /** @type {import('vue').Ref<'idle'|'extracting'|'analyzing'>} */
  const analysisPhase = ref("idle");
  const analysisProgress = ref(null);
  const benchVerified = ref(false);
  const dialogOpen = ref(false);

  const flags = computed(() => getDiagnosticsFlags());
  const telemetryOptIn = computed(() => isTelemetryOptIn());
  const benchVerificationRequired = computed(() => isBenchVerificationRequired());

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
    if (analysisProgress.value?.phase === "extracting") {
      const pct = analysisProgress.value.percent ?? 0;
      const eta = analysisProgress.value.etaMs;
      const etaText =
        eta != null && eta > 0 ? ` · ~${Math.ceil(eta / 1000)}s remaining` : "";
      return `Preparing log data… ${pct}%${etaText}`;
    }
    if (analysisPhase.value === "extracting") {
      return "Preparing log data…";
    }
    if (analysisPhase.value === "analyzing") {
      return "Running FFT and step-response analysis in worker…";
    }
    return null;
  });

  const canCopyCli = computed(
    () =>
      !!analysisReport.value?.cliCommandsOnly &&
      (!benchVerificationRequired.value || benchVerified.value),
  );

  const logQuality = computed(() => assessLogQuality(baseline.value));

  function persistPrefs() {
    saveDiagnosticsPrefs({
      frameArchetype: frameArchetype.value,
      auwGramsText: auwGramsText.value,
      cellCount: cellCount.value,
    });
  }

  function setFrameArchetype(value) {
    frameArchetype.value = value;
    persistPrefs();
  }

  function setAuwGramsText(value) {
    auwGramsText.value = String(value ?? "").replace(/[^\d]/g, "");
    persistPrefs();
  }

  /** @deprecated Use setAuwGramsText — kept for compatibility */
  function setAuwGrams(value) {
    setAuwGramsText(value);
  }

  function setCellCount(value) {
    cellCount.value = value;
    persistPrefs();
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
    analysisProgress.value = null;
    analysisError.value = null;
    analysisReport.value = null;
    benchVerified.value = false;

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
        (progress) => {
          analysisProgress.value = progress;
        },
      );
      analysisReport.value = report;
      return report;
    } catch (err) {
      analysisError.value = userFacingError(err);
      return null;
    } finally {
      analysisRunning.value = false;
      analysisPhase.value = "idle";
      analysisProgress.value = null;
    }
  }

  function setBenchVerified(value) {
    benchVerified.value = !!value;
  }

  function setTelemetryOptIn(enabled) {
    persistTelemetryOptIn(enabled);
  }

  function cancelAnalysis() {
    if (!analysisRunning.value) {
      return;
    }
    cancelDiagnosticsWorker();
    analysisRunning.value = false;
    analysisPhase.value = "idle";
    analysisError.value = "Analysis cancelled.";
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
    analysisProgress,
    analysisStatusLabel,
    benchVerified,
    benchVerificationRequired,
    canCopyCli,
    flags,
    telemetryOptIn,
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
    cancelAnalysis,
    setBenchVerified,
    setTelemetryOptIn,
    resetUserInputs,
    resetAll,
  };
});
