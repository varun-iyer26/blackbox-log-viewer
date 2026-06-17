import { buildAnalysisBuffersAsync } from "./data_extractor.js";
import { attachCliToAnalysis } from "./cli_recommendations.js";
import { REFERENCE_TUNING_PROFILES } from "./constants.js";
import {
  buildWorkerPayload,
  collectTransferables,
} from "./worker_serialization.js";

const WORKER_TIMEOUT_MS = 45000;

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

function runWorkerAnalysis(payload, transferables) {
  const worker = getWorker();
  const id = ++jobId;

  const workerPromise = new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data?.id !== id) {
        return;
      }
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error ?? "Analysis failed"));
      }
    };

    const onError = (err) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(err);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id, payload }, transferables);
  });

  const timeoutPromise = new Promise((_, reject) => {
    globalThis.setTimeout(() => {
      reject(
        new Error(
          `Analysis timed out after ${WORKER_TIMEOUT_MS / 1000}s — try a shorter log segment.`,
        ),
      );
    }, WORKER_TIMEOUT_MS);
  });

  return Promise.race([workerPromise, timeoutPromise]);
}

/**
 * @param {object} context
 * @param {(phase: string) => void} [onPhaseChange]
 */
export async function runDiagnosticsInWorker(flightLog, context, onPhaseChange) {
  onPhaseChange?.("extracting");
  const buffers = await buildAnalysisBuffersAsync(flightLog);

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
  const analysis = await runWorkerAnalysis(payload, transferables);
  return attachCliToAnalysis(analysis, context.effectiveConfig, context.hardwareProfile, {
    warnings: context.baseline?.warnings ?? [],
    referenceProfile,
    baseline: context.baseline,
  });
}

export function terminateDiagnosticsWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}
