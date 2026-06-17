import { runDiagnosticsAnalysis } from "./worker_dsp.js";

self.onmessage = (event) => {
  const { id, payload } = event.data ?? {};
  try {
    const result = runDiagnosticsAnalysis(payload);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error?.message ?? "Worker analysis failed.",
    });
  }
};
