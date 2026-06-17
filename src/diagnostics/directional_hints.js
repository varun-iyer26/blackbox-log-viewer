/**
 * Tier-2 directional hints — observations from blackbox metrics, not CLI commands.
 * Only emitted when step/FFT evidence meets minimum thresholds.
 */

import { REFERENCE_TUNING_PROFILES, MIN_LOG_RATE_HZ } from "./constants.js";

const MIN_STEP_EVENTS = 3;

export function buildDirectionalHints(analysis, hardwareProfile, extra = {}) {
  const archetype = hardwareProfile?.frameArchetype ?? "freestyle_5";
  const ref =
    extra.referenceProfile ??
    REFERENCE_TUNING_PROFILES[archetype] ??
    REFERENCE_TUNING_PROFILES.freestyle_5;
  const stepRef = ref.stepResponse;
  const hints = [];
  const baseline = extra.baseline;

  const logQualityOk =
    (baseline?.loggingRateHz ?? 0) >= MIN_LOG_RATE_HZ &&
    (baseline?.valid === true || (baseline?.rcStepEvents ?? 0) >= 2);

  for (const axis of analysis?.tuning?.axes ?? []) {
    if ((axis.stepEvents ?? 0) < MIN_STEP_EVENTS) {
      continue;
    }

    const name = axis.name;
    const os = axis.overshootPct;
    const settle = axis.settleTimeMs;
    const latency = axis.latencyMs;
    const ringing = axis.ringingCount ?? 0;
    const lowOs = axis.lowRate?.overshootPct;
    const highOs = axis.highRate?.overshootPct;

    if (os == null) {
      continue;
    }

    // Feedforward — strongest PID-related signal from setpoint→gyro delay.
    if (
      latency != null &&
      latency > stepRef.maxLatencyMs &&
      os < stepRef.maxOvershootPct * 0.55
    ) {
      hints.push({
        axis: name,
        parameter: "Feedforward",
        hint: `Consider raising ${name.toLowerCase()} feedforward — gyro lags setpoint by ~${latency.toFixed(0)} ms on steps (target ≤${stepRef.maxLatencyMs} ms for ${ref.label}) with low overshoot.`,
        evidence: `${latency.toFixed(0)} ms latency, ${os.toFixed(1)}% overshoot`,
        confidence: clampConfidence(55 + axis.stepEvents * 3 + (latency > stepRef.maxLatencyMs * 1.3 ? 10 : 0)),
      });
    }

    // D / d_min — under-damped step with ringing.
    if (os > stepRef.sweetOvershootPct * 2.5 || ringing > 2) {
      const highRateNote =
        highOs != null && lowOs != null && highOs > lowOs * 1.25
          ? " High-rate steps overshoot more — d_min may help more than base D."
          : "";
      hints.push({
        axis: name,
        parameter: "D / d_min",
        hint: `Under-damped ${name.toLowerCase()} response — try more D or d_min before lowering P.${highRateNote}`,
        evidence: `${os.toFixed(1)}% overshoot${ringing > 0 ? `, ${ringing} post-step oscillations` : ""}${settle != null ? `, ${settle.toFixed(0)} ms settle` : ""}`,
        confidence: clampConfidence(50 + axis.stepEvents * 2 + (ringing > 2 ? 12 : 0)),
      });
    }

    // P too high — heavy overshoot without latency issue.
    if (
      os > stepRef.maxOvershootPct * 0.85 &&
      (latency == null || latency <= stepRef.maxLatencyMs)
    ) {
      hints.push({
        axis: name,
        parameter: "P",
        hint: `Heavy ${name.toLowerCase()} overshoot with acceptable latency — if filters are clean, try slightly lower P after addressing D.`,
        evidence: `${os.toFixed(1)}% overshoot vs ~${stepRef.sweetOvershootPct}% typical for ${ref.label}`,
        confidence: clampConfidence(48 + axis.stepEvents * 2),
      });
    }

    // P too low — sluggish with low overshoot.
    if (
      os < stepRef.sweetOvershootPct * 1.5 &&
      latency != null &&
      latency > stepRef.maxLatencyMs * 0.85 &&
      axis.trackingErrorDeg != null &&
      axis.trackingErrorDeg > stepRef.maxTrackingRmsDeg * 0.7
    ) {
      hints.push({
        axis: name,
        parameter: "P",
        hint: `Sluggish ${name.toLowerCase()} tracking with low overshoot — P or feedforward may be low; verify filters first.`,
        evidence: `${latency.toFixed(0)} ms latency, ${axis.trackingErrorDeg.toFixed(1)}° mean tracking error`,
        confidence: clampConfidence(45 + axis.stepEvents * 2),
      });
    }

    // Style context — measured vs reference, no prescription.
    if (axis.status === "green" && os <= stepRef.sweetOvershootPct * 1.8) {
      hints.push({
        axis: name,
        parameter: "Profile match",
        hint: `${name} step response aligns with ${ref.label} reference (~${stepRef.sweetOvershootPct}% overshoot target).`,
        evidence: `${os.toFixed(1)}% overshoot, ${settle?.toFixed(0) ?? "?"} ms settle`,
        confidence: clampConfidence(60 + axis.stepEvents * 2),
      });
    }
  }

  const resonance = analysis?.hardware?.frameResonance;
  if (resonance?.status === "yellow" && resonance.peakHz > 0) {
    hints.push({
      axis: "Frame",
      parameter: "Filters / mechanical",
      hint: `Elevated ${resonance.peakHz} Hz vibration — fix mechanical sources first; filter/notch changes alone may not be enough.`,
      evidence: resonance.summary ?? `${resonance.peakHz} Hz peak`,
      confidence: resonance.confidence ?? 55,
    });
  }

  if (!logQualityOk && hints.length === 0) {
    hints.push({
      axis: "Log",
      parameter: "Data quality",
      hint: "Re-log at ≥2 kHz with sharp rolls/flips before trusting PID directional hints.",
      evidence: `${baseline?.loggingRateHz ?? "?"} Hz logging, ${baseline?.rcStepEvents ?? 0} stick events`,
      confidence: 90,
    });
  }

  for (const axis of analysis?.tuning?.pidTerms?.axes ?? []) {
    if (axis.feedforward?.status === "red" || axis.feedforward?.status === "yellow") {
      hints.push({
        axis: axis.name,
        parameter: "Feedforward",
        hint: `${axis.name} logged FF is low during fast setpoint segments — blackbox shows weak feedforward contribution while setpoint slew is high.`,
        evidence: axis.feedforward.summary,
        confidence: axis.feedforward.status === "red" ? 78 : 62,
      });
    }
    if (axis.windup?.status === "red") {
      hints.push({
        axis: axis.name,
        parameter: "I / iterm_relax",
        hint: `${axis.name} I-term rises during stick moves — iterm_relax may be too weak or I gain too high. Review on bench; no auto CLI value suggested.`,
        evidence: axis.windup.summary,
        confidence: 72,
      });
    } else if (axis.windup?.status === "yellow") {
      hints.push({
        axis: axis.name,
        parameter: "I / iterm_relax",
        hint: `${axis.name} shows mild I accumulation during inputs — worth checking iterm_relax if you see bounce-back after flips.`,
        evidence: `${axis.windup.ratio.toFixed(1)}× quiet I-term during moves`,
        confidence: 58,
      });
    }
  }

  return dedupeHints(hints).sort((a, b) => b.confidence - a.confidence);
}

function clampConfidence(value) {
  return Math.max(35, Math.min(85, Math.round(value)));
}

function dedupeHints(hints) {
  const seen = new Set();
  const out = [];
  for (const h of hints) {
    const key = `${h.axis}:${h.parameter}:${h.hint.slice(0, 40)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(h);
  }
  return out;
}
