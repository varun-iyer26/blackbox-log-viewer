/**
 * Download helpers for Auto Diagnostics reports.
 */

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeBasename(name) {
  return (name ?? "blackbox-log")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

export function buildReportJson(analysis, meta = {}) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      tool: "Betaflight Blackbox Explorer — Auto Diagnostics (experimental)",
      ...meta,
      report: analysis,
    },
    null,
    2,
  );
}

export function downloadReportMarkdown(analysis, logFilename) {
  const text = analysis?.fullReportText ?? "# Auto Diagnostics\n\n(no report)";
  const base = safeBasename(logFilename);
  triggerDownload(`${base}-auto-diagnostics.md`, text, "text/markdown;charset=utf-8");
}

export function downloadReportJson(analysis, logFilename, meta = {}) {
  const base = safeBasename(logFilename);
  triggerDownload(
    `${base}-auto-diagnostics.json`,
    buildReportJson(analysis, meta),
    "application/json;charset=utf-8",
  );
}

export async function readCliDumpFile(file) {
  if (!file) {
    return "";
  }
  const maxBytes = 512 * 1024;
  if (file.size > maxBytes) {
    throw new Error("CLI dump file is too large (max 512 KB).");
  }
  return file.text();
}
