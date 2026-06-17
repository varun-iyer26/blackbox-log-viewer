import { buildAnalysisBuffersAsync } from "./data_extractor.js";
import { attachCliToAnalysis } from "./cli_recommendations.js";
import { REFERENCE_TUNING_PROFILES } from "./constants.js";
import {
  buildAnalysisMetadata,
  validateWorkerPayload,
} from "./analysis_reliability.js";
import { getBuildInfo, REPORT_SCHEMA_VERSION } from "./build_info.js";
import { isFreshWorkerPerRun } from "./feature_flags.js";
import {
  recordAnalysisStarted,
  recordAnalysisCompleted,
  recordAnalysisFailed,
  recordAnalysisCancelled,
} from "./telemetry.js";
import {
  buildWorkerPayload,
  collectTransferables,
} from "./worker_serialization.js";

const WORKER_TIMEOUT_MS = 45000;
const MAX_WORKER_ATTEMPTS = 2;

let workerInstance = null;
let jobId = 0;

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("./worker-diagnostics.js", import.meta.url),
      { type: "module" },
    );
  }
  return workerInstance;
}

function resetWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

function runWorkerAnalysisOnce(payload, transferables) {
  const worker = getWorker();
  const id = ++jobId;

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data?.id !== id) {
        return;
      }
      cleanup();
      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error ?? "Analysis failed"));
      }
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Analysis timed out after ${WORKER_TIMEOUT_MS / 1000}s — try a shorter log segment.`,
        ),
      );
    }, WORKER_TIMEOUT_MS);

    function cleanup() {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      globalThis.clearTimeout(timeoutId);
    }

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    try {
      worker.postMessage({ id, payload }, transferables);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

async function runWorkerAnalysis(payload, transferables) {
  validateWorkerPayload(payload);

  let lastError;
  for (let attempt = 1; attempt <= MAX_WORKER_ATTEMPTS; attempt++) {
    try {
      return await runWorkerAnalysisOnce(payload, transferables);
    } catch (err) {
      lastError = err;
      resetWorker();
      if (attempt >= MAX_WORKER_ATTEMPTS) {
        break;
      }
      await new Promise((r) => globalThis.setTimeout(r, 100));
    }
  }
  throw lastError;
}

/**
 * @param {object} context
 * @param {(phase: string) => void} [onPhaseChange]
 * @param {(progress: object) => void} [onProgress]
 */
export async function runDiagnosticsInWorker(flightLog, context, onPhaseChange, onProgress) {
  const startedAt = Date.now();
  if (isFreshWorkerPerRun()) {
    resetWorker();
  }
  onPhaseChange?.("extracting");
  recordAnalysisStarted({
    frameArchetype: context.hardwareProfile?.frameArchetype,
  });

  try {
    const buffers = await buildAnalysisBuffersAsync(flightLog, 65536, (progress) => {
      onProgress?.(progress);
    });

    const sysConfig = flightLog.getSysConfig();
    const saturationThreshold =
      sysConfig?.maxthrottle != null ? sysConfig.maxthrottle * 0.92 : 1850;

    const archetype = context.hardwareProfile?.frameArchetype ?? "freestyle_5";
    const referenceProfile =
      REFERENCE_TUNING_PROFILES[archetype] ?? REFERENCE_TUNING_PROFILES.freestyle_5;

    const payload = buildWorkerPayload(
      buffers,
      { ...context, saturationThreshold },
      referenceProfile,
    );

    const transferables = collectTransferables(payload);

    onPhaseChange?.("analyzing");
    onProgress?.({ phase: "analyzing", percent: 100, etaMs: null });

    const analysis = await runWorkerAnalysis(payload, transferables);

    const report = attachCliToAnalysis(analysis, context.effectiveConfig, context.hardwareProfile, {
      warnings: context.baseline?.warnings ?? [],
      referenceProfile,
      baseline: context.baseline,
    });

    const buildInfo = getBuildInfo();
    report.metadata = {
      ...buildAnalysisMetadata(context.baseline, report),
      ...buildInfo,
    };
    report.schemaVersion = REPORT_SCHEMA_VERSION;

    recordAnalysisCompleted({
      durationMs: Date.now() - startedAt,
      confidenceTier: report.metadata.confidenceTier,
      confidenceScore: report.metadata.confidenceScore,
    });

    return report;
  } catch (err) {
    recordAnalysisFailed({
      durationMs: Date.now() - startedAt,
      reason: err?.message ?? "unknown",
    });
    throw err;
  }
}

export function terminateDiagnosticsWorker() {
  resetWorker();
}

export function cancelDiagnosticsWorker() {
  jobId += 1;
  resetWorker();
  recordAnalysisCancelled();
}
