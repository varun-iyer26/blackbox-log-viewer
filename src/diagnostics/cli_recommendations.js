/**
 * Conservative CLI output — only settings directly supported by log + CLI evidence.
 * PID/filter tuning heuristics are omitted; those require flight testing.
 */

import { MIN_LOG_RATE_HZ } from "./constants.js";
import { buildDirectionalHints } from "./directional_hints.js";

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readGyroLpf1(config) {
  return num(
    config.gyro_lowpass_hz ??
      config.gyro_lpf1_static_hz ??
      config.gyro_lowpass?.[0],
  );
}

function readDynNotchMin(config) {
  return num(config.dyn_notch_min_hz ?? config.gyro_rpm_notch_min);
}

function rpmFilterConfigured(config) {
  const harmonics = num(config.rpm_filter_harmonics ?? config.gyro_rpm_notch_harmonics);
  return harmonics != null && harmonics > 0;
}

export function buildObservations(analysis, effectiveConfig, baseline) {
  const observations = [];
  const config = effectiveConfig ?? {};

  if ((baseline?.loggingRateHz ?? 0) > 0 && baseline.loggingRateHz < MIN_LOG_RATE_HZ) {
    observations.push(
      `Logging rate ${baseline.loggingRateHz} Hz — high-frequency vibration analysis is limited; use ≥${MIN_LOG_RATE_HZ} Hz for reliable FFT.`,
    );
  }

  if ((baseline?.rcStepEvents ?? 0) < 2) {
    observations.push(
      "Few stick/setpoint steps in this log — PID step-response metrics may be unreliable. Re-log with sharp rolls or flips.",
    );
  }

  for (const axis of analysis?.tuning?.axes ?? []) {
    if (axis.stepEvents === 0) {
      observations.push(`${axis.name}: no qualifying setpoint steps detected.`);
    }
  }

  const resonance = analysis?.hardware?.frameResonance;
  if (resonance?.status === "red" && resonance.peakHz > 0) {
    observations.push(
      `Frame resonance ~${resonance.peakHz} Hz during quiet flight (${resonance.confidence ?? "?"}% confidence). Check props, screws, and frame stiffness before retuning filters.`,
    );
  }

  const motorHealth = analysis?.hardware?.motorHealth;
  if (motorHealth?.status === "red") {
    const flagged = (motorHealth.motors ?? []).filter((m) => m.status === "red").map((m) => m.motor);
    observations.push(
      `Motor(s) ${flagged.join(", ") || "?"} show elevated HF noise under saturation — inspect props, bell screws, and bearings (not a PID setting).`,
    );
  }

  if (!config.dshot_bidir && rpmFilterConfigured(config)) {
    observations.push(
      "CLI shows RPM filter harmonics configured but dshot_bidir is OFF — RPM filter cannot work until bidirectional DShot is enabled.",
    );
  }

  return observations;
}

export function buildCliRecommendations(analysis, effectiveConfig) {
  const config = effectiveConfig ?? {};
  const items = [];
  const resonance = analysis?.hardware?.frameResonance;

  function add(command, confidence, reason) {
    items.push({ command, confidence: clamp(confidence, 0, 99), reason });
  }

  // Factual: RPM filter requires bidirectional DShot when harmonics are configured.
  if (!config.dshot_bidir && rpmFilterConfigured(config)) {
    add(
      "set dshot_bidir = ON",
      98,
      "Your CLI dump configures RPM filter harmonics but dshot_bidir is OFF",
    );
  }

  // Measured resonance with strong FFT evidence — align dynamic notch to logged peak.
  if (
    resonance?.peakHz > 0 &&
    resonance.status === "red" &&
    (resonance.confidence ?? 0) >= 70
  ) {
    const peak = resonance.peakHz;
    const notchMin = readDynNotchMin(config);
    const targetNotch = clamp(Math.round(peak) - 15, 80, 600);

    if (notchMin == null || Math.abs(notchMin - targetNotch) > 30) {
      add(
        `set dyn_notch_min_hz = ${targetNotch}`,
        resonance.confidence,
        `Blackbox FFT peak at ${peak} Hz during quiet setpoint segments`,
      );
    }

    const currentLpf1 = readGyroLpf1(config);
    if (currentLpf1 != null && currentLpf1 > peak + 25) {
      const targetLpf = clamp(Math.round(peak * 0.75), 80, currentLpf1 - 1);
      add(
        `set gyro_lowpass_hz = ${targetLpf}`,
        Math.max(70, resonance.confidence - 8),
        `Gyro LPF1 is ${currentLpf1} Hz but log shows a ${peak} Hz vibration peak above effective filtering`,
      );
    }
  }

  const deduped = dedupeCommands(items);
  const header = [
    "# Auto Diagnostics — evidence-based CLI only",
    "# Only settings directly supported by this .bbl log and CLI dump are listed.",
    "# PID values are never auto-changed — verify on bench before save.",
    "",
  ];

  if (deduped.length === 0) {
    return {
      text: [...header, "# No CLI changes with sufficient evidence for this log."].join("\n"),
      commandsOnly: "",
      items: [],
    };
  }

  const annotated = deduped.flatMap((item) => [
    `# ${item.reason} (confidence ${item.confidence}%)`,
    item.command,
  ]);

  const commandsOnly = [...deduped.map((i) => i.command), "save"].join("\n");

  return {
    text: [...header, "# --- Annotated ---", ...annotated, "", "# --- Copy/paste block ---", commandsOnly].join("\n"),
    commandsOnly,
    items: deduped,
  };
}

function dedupeCommands(items) {
  const byCmd = new Map();
  for (const item of items) {
    const prev = byCmd.get(item.command);
    if (!prev || item.confidence > prev.confidence) {
      byCmd.set(item.command, item);
    }
  }
  return [...byCmd.values()].sort((a, b) => b.confidence - a.confidence);
}

export function buildFullReportText(analysis) {
  const lines = [
    "# Auto Diagnostics Report",
    `# Craft: ${analysis.summary?.craftName ?? "Unknown"}`,
    `# Reference: ${analysis.referenceUsed?.label ?? "—"}`,
    "",
  ];

  if (analysis.observations?.length) {
    lines.push("## Observations", "");
    for (const o of analysis.observations) {
      lines.push(`- ${o}`);
    }
    lines.push("");
  }

  if (analysis.directionalHints?.length) {
    lines.push("## Investigate manually", "");
    for (const h of analysis.directionalHints) {
      lines.push(`- [${h.axis} / ${h.parameter}] ${h.hint}`);
      lines.push(`  Evidence: ${h.evidence} (${h.confidence}%)`);
    }
    lines.push("");
  }

  if (analysis.cli) {
    lines.push("## CLI (evidence-based)", "", analysis.cli);
  }

  return lines.join("\n");
}

export function attachCliToAnalysis(analysis, effectiveConfig, hardwareProfile, extra = {}) {
  const cliResult = buildCliRecommendations(analysis, effectiveConfig);
  const observations = buildObservations(analysis, effectiveConfig, extra.baseline);
  const directionalHints = buildDirectionalHints(analysis, hardwareProfile, extra);
  const report = {
    ...analysis,
    warnings: extra.warnings ?? [],
    observations,
    directionalHints,
    cli: cliResult.text,
    cliCommandsOnly: cliResult.commandsOnly,
    cliItems: cliResult.items,
  };
  report.fullReportText = buildFullReportText(report);
  return report;
}
