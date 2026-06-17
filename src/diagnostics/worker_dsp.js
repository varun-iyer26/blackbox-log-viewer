/**
 * Pure DSP + scoring logic for diagnostics worker (no DOM, no Pinia).
 */
import { FFTComplex } from "../fft_complex.js";
import { RC_STEP_THRESHOLD, FRAME_THRESHOLD_PROFILES, REFERENCE_TUNING_PROFILES } from "./constants.js";
import {
  nextPowerOf2,
  median,
  rejectOutliersIqr,
  applyHanningWindow,
  findQuietSetpointRanges,
  concatRanges,
  scaleThresholdsByAuw,
  clamp,
} from "./worker_signal.js";

const AXIS_NAMES = ["Roll", "Pitch", "Yaw"];
const RESONANCE_MIN_HZ = 100;
const RESONANCE_MAX_HZ = 500;
const SETTLE_TOLERANCE_PCT = 0.05;
const SETTLE_HOLD_MS = 40;
const WELCH_SEGMENT = 2048;
const WELCH_OVERLAP = 0.5;
const MIN_SETPOINT_STEP_DEG = 90;

function runFftMagnitudes(samples, sampleRateHz) {
  const fftSize = nextPowerOf2(samples.length);
  const padded = new Float64Array(fftSize);
  const count = Math.min(samples.length, fftSize);
  for (let i = 0; i < count; i++) {
    padded[i] = samples[i];
  }
  applyHanningWindow(padded);

  const fftOutput = new Float64Array(fftSize * 2);
  const fft = new FFTComplex(fftSize, false);
  fft.simple(fftOutput, padded, "real");

  const binCount = Math.floor(fftSize / 4);
  const magnitudes = new Float64Array(binCount);
  const freqStep = sampleRateHz / fftSize;

  for (let i = 0; i < binCount; i++) {
    magnitudes[i] = Math.hypot(fftOutput[2 * i], fftOutput[2 * i + 1]);
  }

  return { magnitudes, freqStep, fftSize };
}

function welchSpectrum(samples, sampleRateHz) {
  if (samples.length < WELCH_SEGMENT) {
    return runFftMagnitudes(samples, sampleRateHz);
  }

  const hop = Math.floor(WELCH_SEGMENT * (1 - WELCH_OVERLAP));
  let accum = null;
  let count = 0;
  let freqStep = sampleRateHz / nextPowerOf2(WELCH_SEGMENT);

  for (let start = 0; start + WELCH_SEGMENT <= samples.length; start += hop) {
    const seg = new Float64Array(WELCH_SEGMENT);
    for (let i = 0; i < WELCH_SEGMENT; i++) {
      seg[i] = samples[start + i];
    }
    const fft = runFftMagnitudes(seg, sampleRateHz);
    freqStep = fft.freqStep;
    if (!accum) {
      accum = new Float64Array(fft.magnitudes.length);
    }
    for (let i = 0; i < fft.magnitudes.length; i++) {
      accum[i] += fft.magnitudes[i] ** 2;
    }
    count++;
  }

  if (!accum || count === 0) {
    return runFftMagnitudes(samples, sampleRateHz);
  }

  for (let i = 0; i < accum.length; i++) {
    accum[i] = Math.sqrt(accum[i] / count);
  }
  return { magnitudes: accum, freqStep };
}

function findPeaksInBand(magnitudes, freqStep, minHz, maxHz, topN = 3) {
  const minBin = Math.max(1, Math.floor(minHz / freqStep));
  const maxBin = Math.min(magnitudes.length - 1, Math.ceil(maxHz / freqStep));
  const peaks = [];

  for (let i = minBin + 1; i < maxBin; i++) {
    if (
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] >= magnitudes[i + 1] &&
      magnitudes[i] > 0
    ) {
      peaks.push({ hz: i * freqStep, mag: magnitudes[i], bin: i });
    }
  }

  peaks.sort((a, b) => b.mag - a.mag);
  return peaks.slice(0, topN);
}

function bandMean(magnitudes, freqStep, minHz, maxHz) {
  const minBin = Math.max(1, Math.floor(minHz / freqStep));
  const maxBin = Math.min(magnitudes.length - 1, Math.ceil(maxHz / freqStep));
  let sum = 0;
  let count = 0;
  for (let i = minBin; i <= maxBin; i++) {
    sum += magnitudes[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function statusFromScore(score) {
  if (score >= 0.85) {
    return "red";
  }
  if (score >= 0.45) {
    return "yellow";
  }
  return "green";
}

function analyzeAxisResonance(
  gyroData,
  setpointData,
  timesUs,
  sampleRateHz,
  severityScale,
  resonanceBandHz,
) {
  const bandMin = resonanceBandHz?.[0] ?? RESONANCE_MIN_HZ;
  const bandMax = resonanceBandHz?.[1] ?? RESONANCE_MAX_HZ;
  if (!gyroData?.length || gyroData.length < 512) {
    return {
      status: "yellow",
      peakHz: 0,
      peakMag: 0,
      confidence: 0,
      peaks: [],
      summary: "Insufficient samples for FFT on this axis.",
    };
  }

  let analysisSamples = gyroData;
  if (setpointData?.length && timesUs?.length) {
    const quiet = findQuietSetpointRanges(setpointData, timesUs);
    if (quiet.length > 0) {
      analysisSamples = concatRanges(gyroData, quiet);
    }
  }

  const fft = welchSpectrum(analysisSamples, sampleRateHz);
  const noiseFloor = bandMean(fft.magnitudes, fft.freqStep, 20, 90);
  const peaks = findPeaksInBand(
    fft.magnitudes,
    fft.freqStep,
    bandMin,
    bandMax,
  );

  const primary = peaks[0] ?? { hz: 0, mag: 0 };
  const snr = noiseFloor > 0 ? primary.mag / noiseFloor : 0;
  const score = Math.min(1, (snr / 8) * (severityScale ?? 1));
  const status = statusFromScore(score);
  const confidence = clamp(Math.round(score * 100), 0, 99);

  return {
    status,
    peakHz: Math.round(primary.hz),
    peakMag: primary.mag,
    score,
    confidence,
    peaks: peaks.map((p) => ({ hz: Math.round(p.hz), mag: p.mag })),
    summary:
      status === "red"
        ? `Persistent ${Math.round(primary.hz)} Hz resonance (SNR ${snr.toFixed(1)}× floor) — likely mechanical.`
        : status === "yellow"
          ? `Elevated ${Math.round(primary.hz)} Hz vibration during quiet setpoint segments.`
          : `No structural resonance in ${bandMin}–${bandMax} Hz during stable flight.`,
  };
}

function maxInRange(arr, start, end) {
  let value = arr[start];
  let index = start;
  for (let i = start + 1; i <= end; i++) {
    if (Math.abs(arr[i]) > Math.abs(value)) {
      value = arr[i];
      index = i;
    }
  }
  return { value, index };
}

function findSetpointStepEvents(setpoint, rc, timesUs, sampleRateHz) {
  const events = [];
  const window = Math.max(3, Math.round(sampleRateHz * 0.012));
  const minGapUs = 400000;

  for (let i = window; i < setpoint.length - window * 8; i++) {
    const deltaSp = setpoint[i] - setpoint[i - window];
    const deltaRc = rc ? rc[i] - rc[i - window] : deltaSp;
    if (Math.abs(deltaSp) < MIN_SETPOINT_STEP_DEG && Math.abs(deltaRc) < RC_STEP_THRESHOLD) {
      continue;
    }
    const peakAhead = maxInRange(setpoint, i, Math.min(setpoint.length - 1, i + window * 6));
    if (Math.abs(peakAhead.value) < MIN_SETPOINT_STEP_DEG * 0.7) {
      continue;
    }
    if (events.length > 0 && timesUs[i] - events[events.length - 1].timeUs < minGapUs) {
      continue;
    }
    events.push({ index: i, timeUs: timesUs[i], direction: Math.sign(deltaSp || deltaRc) });
    if (events.length >= 20) {
      break;
    }
  }
  return events;
}

function analyzeStepAtEvent(gyro, setpoint, timesUs, event, sampleRateHz) {
  const start = event.index;
  const windowSamples = Math.round(sampleRateHz * 0.35);
  const end = Math.min(gyro.length - 1, start + windowSamples);
  const target = setpoint[start];
  const peakTarget = maxInRange(setpoint, start, end).value;
  const amplitude = Math.max(Math.abs(peakTarget - target), Math.abs(peakTarget), 60);

  let peakOvershoot = 0;
  let peakUndershoot = 0;
  let peakIndex = start;
  let riseTimeUs = null;
  let latencyUs = null;
  const tenPct = Math.abs(peakTarget) * 0.1;
  const ninetyPct = Math.abs(peakTarget) * 0.9;

  for (let i = start; i <= end; i++) {
    const err = gyro[i] - peakTarget;
    const overshoot = event.direction > 0 ? err : -err;
    if (overshoot > peakOvershoot) {
      peakOvershoot = overshoot;
      peakIndex = i;
    }
    if (-overshoot > peakUndershoot) {
      peakUndershoot = -overshoot;
    }
    if (latencyUs == null && Math.abs(gyro[i] - target) >= tenPct && tenPct > 8) {
      latencyUs = timesUs[i] - timesUs[start];
    }
    if (riseTimeUs == null && Math.abs(gyro[i]) >= ninetyPct && ninetyPct > 30) {
      riseTimeUs = timesUs[i] - timesUs[start];
    }
  }

  let ringingCount = 0;
  let prevSign = Math.sign(gyro[peakIndex] - peakTarget) || 1;
  for (let i = peakIndex + 1; i <= end; i++) {
    const sign = Math.sign(gyro[i] - peakTarget);
    if (sign !== 0 && sign !== prevSign) {
      ringingCount++;
      prevSign = sign;
    }
  }

  const tolerance = Math.max(amplitude * SETTLE_TOLERANCE_PCT, 10);
  let settleTimeUs = null;
  for (let i = peakIndex; i <= end; i++) {
    if (Math.abs(gyro[i] - peakTarget) > tolerance) {
      continue;
    }
    let stable = true;
    for (let j = i; j <= end; j++) {
      if (timesUs[j] - timesUs[i] > SETTLE_HOLD_MS * 1000) {
        break;
      }
      if (Math.abs(gyro[j] - peakTarget) > tolerance) {
        stable = false;
        break;
      }
    }
    if (stable) {
      settleTimeUs = timesUs[i] - timesUs[start];
      break;
    }
  }

  let trackingErrorSum = 0;
  for (let i = start; i <= end; i++) {
    trackingErrorSum += Math.abs(setpoint[i] - gyro[i]);
  }

  return {
    overshootPct: amplitude > 0 ? (peakOvershoot / amplitude) * 100 : 0,
    undershootPct: amplitude > 0 ? (peakUndershoot / amplitude) * 100 : 0,
    settleTimeMs: settleTimeUs != null ? settleTimeUs / 1000 : null,
    riseTimeMs: riseTimeUs != null ? riseTimeUs / 1000 : null,
    latencyMs: latencyUs != null ? latencyUs / 1000 : null,
    ringingCount,
    trackingErrorDeg: (end - start + 1) > 0 ? trackingErrorSum / (end - start + 1) : 0,
    peakSetpointDeg: Math.abs(peakTarget),
  };
}

function aggregateStepMetrics(responses) {
  if (!responses.length) {
    return null;
  }
  const overshoots = rejectOutliersIqr(responses.map((r) => r.overshootPct));
  const settles = rejectOutliersIqr(
    responses.filter((r) => r.settleTimeMs != null).map((r) => r.settleTimeMs),
  );
  const rises = rejectOutliersIqr(
    responses.filter((r) => r.riseTimeMs != null).map((r) => r.riseTimeMs),
  );
  const latencies = rejectOutliersIqr(
    responses.filter((r) => r.latencyMs != null).map((r) => r.latencyMs),
  );
  const tracking = rejectOutliersIqr(responses.map((r) => r.trackingErrorDeg));
  const ringingCount = median(responses.map((r) => r.ringingCount ?? 0));

  return {
    overshootPct: median(overshoots),
    settleTimeMs: settles.length ? median(settles) : null,
    riseTimeMs: rises.length ? median(rises) : null,
    latencyMs: latencies.length ? median(latencies) : null,
    trackingErrorDeg: median(tracking),
    ringingCount: Math.round(ringingCount),
    stepEvents: responses.length,
  };
}

function classifyStepStatus(metrics, ref) {
  if (!metrics) {
    return "yellow";
  }
  const s = ref.stepResponse;
  if (
    metrics.overshootPct > s.maxOvershootPct * 1.15 ||
    (metrics.settleTimeMs != null && metrics.settleTimeMs > s.maxSettleMs * 1.2)
  ) {
    return "red";
  }
  if (
    metrics.overshootPct > s.sweetOvershootPct * 2 ||
    (metrics.settleTimeMs != null && metrics.settleTimeMs > s.maxSettleMs)
  ) {
    return "yellow";
  }
  return "green";
}

function analyzeAxisStepResponse(
  gyroSeries,
  setpointSeries,
  rcSeries,
  reference,
  sampleRateHz,
) {
  const gyro = gyroSeries?.data;
  const setpoint = setpointSeries?.data;
  const rc = rcSeries?.data;
  const timesUs = gyroSeries?.timesUs ?? setpointSeries?.timesUs;
  const ref = reference?.stepResponse ?? REFERENCE_TUNING_PROFILES.freestyle_5.stepResponse;

  if (!gyro?.length || !setpoint?.length || !timesUs?.length) {
    return {
      status: "yellow",
      overshootPct: null,
      settleTimeMs: null,
      riseTimeMs: null,
      latencyMs: null,
      trackingErrorDeg: null,
      stepEvents: 0,
      confidence: 0,
      summary: "Missing axis data for step-response analysis.",
    };
  }

  const events = findSetpointStepEvents(setpoint, rc, timesUs, sampleRateHz);
  if (events.length === 0) {
    return {
      status: "yellow",
      overshootPct: 0,
      settleTimeMs: null,
      riseTimeMs: null,
      latencyMs: null,
      trackingErrorDeg: 0,
      stepEvents: 0,
      confidence: 0,
      summary: "No qualifying setpoint steps — perform sharp rolls/flips during logging.",
    };
  }

  const highThreshold = ref.highRateThresholdDeg ?? 500;
  const lowResponses = [];
  const highResponses = [];
  const allResponses = [];

  for (const event of events) {
    const r = analyzeStepAtEvent(gyro, setpoint, timesUs, event, sampleRateHz);
    allResponses.push(r);
    if (r.peakSetpointDeg >= highThreshold) {
      highResponses.push(r);
    } else {
      lowResponses.push(r);
    }
  }

  const combined = aggregateStepMetrics(allResponses);
  const lowRate = aggregateStepMetrics(lowResponses);
  const highRate = aggregateStepMetrics(highResponses);
  const status = classifyStepStatus(combined, reference ?? { stepResponse: ref });
  const confidence = clamp(
    Math.round(45 + allResponses.length * 3 + (lowResponses.length > 1 ? 10 : 0) + (highResponses.length > 1 ? 10 : 0)),
    0,
    95,
  );

  const sweet = ref.sweetOvershootPct;
  let summary;
  if (status === "green") {
    summary = `Critically damped profile: ${combined.overshootPct.toFixed(1)}% overshoot (target ~${sweet}%), ${combined.settleTimeMs?.toFixed(0) ?? "?"} ms settle.`;
  } else if (combined.overshootPct > ref.maxOvershootPct) {
    summary = `Under-damped: ${combined.overshootPct.toFixed(1)}% overshoot — reduce P or raise D/FF per axis.`;
  } else if (combined.latencyMs != null && combined.latencyMs > ref.maxLatencyMs) {
    summary = `Sluggish: ${combined.latencyMs.toFixed(0)} ms latency — consider raising P or FF.`;
  } else {
    summary = `Borderline vs ${reference?.label ?? "profile"} reference — minor filter/PID tweaks recommended.`;
  }

  return {
    status,
    ...combined,
    lowRate,
    highRate,
    confidence,
    summary,
  };
}

function analyzeMotorHealth(motorSeries, saturationThreshold) {
  const motors = motorSeries?.series ?? [];
  if (!motors.length) {
    return { status: "yellow", summary: "Motor outputs not logged.", motors: [], confidence: 0 };
  }

  const hfNoise = motors.map(() => 0);
  const hfCounts = motors.map(() => 0);
  const length = motors[0].data.length;

  for (let i = 2; i < length; i++) {
    const values = motors.map((m) => m.data[i]);
    const saturated = values.some((v) => v >= saturationThreshold);
    if (!saturated) {
      continue;
    }
    for (let m = 0; m < motors.length; m++) {
      hfNoise[m] += Math.abs(
        motors[m].data[i] - 2 * motors[m].data[i - 1] + motors[m].data[i - 2],
      );
      hfCounts[m]++;
    }
  }

  const motorStats = motors.map((m, i) => ({
    motor: m.motor ?? i + 1,
    hfNoise: hfCounts[i] > 0 ? hfNoise[i] / hfCounts[i] : 0,
    status: "green",
  }));

  const noiseVals = motorStats.map((m) => m.hfNoise).filter((v) => v > 0);
  const med = noiseVals.length ? median(noiseVals) : 0;
  const flagged = [];

  for (const m of motorStats) {
    if (med > 0 && m.hfNoise > med * 1.4) {
      m.status = "red";
      flagged.push(m.motor);
    } else if (med > 0 && m.hfNoise > med * 1.18) {
      m.status = "yellow";
    }
  }

  let status = "green";
  if (flagged.length > 0) {
    status = "red";
  } else if (motorStats.some((m) => m.status === "yellow")) {
    status = "yellow";
  }

  return {
    status,
    confidence: clamp(50 + flagged.length * 20, 0, 90),
    summary:
      flagged.length > 0
        ? `Motor(s) ${flagged.join(", ")} show elevated mechanical noise under saturation.`
        : status === "yellow"
          ? "Minor motor imbalance — check props and bell screws."
          : "Motors balanced under load.",
    motors: motorStats,
  };
}

function analyzeTrackingRms(gyro, setpoint) {
  if (!gyro?.length || !setpoint?.length) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < gyro.length; i++) {
    const e = setpoint[i] - gyro[i];
    sum += e * e;
  }
  return Math.sqrt(sum / gyro.length);
}

function pickSeriesByAxis(channelPack, axis) {
  const series = channelPack?.series?.find((s) => s.axis === axis);
  if (!series) {
    return null;
  }
  return { data: series.data, timesUs: channelPack.timesUs };
}

function analyzeAxisIWindup(axisIData, setpointData, sampleRateHz) {
  if (!axisIData?.length || !setpointData?.length || axisIData.length < 200) {
    return null;
  }

  const window = Math.max(3, Math.round(sampleRateHz * 0.012));
  const duringMove = [];
  const quiet = [];

  for (let i = window; i < setpointData.length - window; i++) {
    const deltaSp = Math.abs(setpointData[i] - setpointData[i - window]);
    const iMag = Math.abs(axisIData[i]);
    if (deltaSp >= 40) {
      duringMove.push(iMag);
    } else if (Math.abs(setpointData[i]) < 25 && deltaSp < 8) {
      quiet.push(iMag);
    }
  }

  if (duringMove.length < 40 || quiet.length < 40) {
    return null;
  }

  const moveMed = median(duringMove);
  const quietMed = median(quiet);
  const ratio = quietMed > 1 ? moveMed / quietMed : moveMed;

  let status = "green";
  if (ratio > 2.2) {
    status = "red";
  } else if (ratio > 1.5) {
    status = "yellow";
  }

  return {
    status,
    ratio,
    medianDuringMove: moveMed,
    medianQuiet: quietMed,
    summary:
      status === "red"
        ? `I-term ${moveMed.toFixed(0)}% during stick moves vs ${quietMed.toFixed(0)}% quiet (${ratio.toFixed(1)}×) — check iterm_relax.`
        : status === "yellow"
          ? `I-term elevated during stick input (${ratio.toFixed(1)}× quiet baseline).`
          : "I-term stable during stick moves.",
  };
}

function analyzeFeedforwardLogged(axisFData, setpointData, sampleRateHz) {
  if (!axisFData?.length || !setpointData?.length || axisFData.length < 200) {
    return null;
  }

  const window = Math.max(3, Math.round(sampleRateHz * 0.01));
  let fastSegments = 0;
  let lowFfSegments = 0;

  for (let i = window; i < setpointData.length; i++) {
    const slew = Math.abs(setpointData[i] - setpointData[i - window]);
    if (slew < 55) {
      continue;
    }
    fastSegments++;
    const ffMag = Math.abs(axisFData[i]);
    if (ffMag < slew * 0.12) {
      lowFfSegments++;
    }
  }

  if (fastSegments < 35) {
    return null;
  }

  const lowFraction = lowFfSegments / fastSegments;
  if (lowFraction < 0.45) {
    return {
      status: "green",
      lowFraction,
      summary: "Logged feedforward tracks fast setpoint segments.",
    };
  }

  return {
    status: lowFraction > 0.65 ? "red" : "yellow",
    lowFraction,
    summary:
      lowFraction > 0.65
        ? `Logged FF weak on ${Math.round(lowFraction * 100)}% of fast setpoint moves — consider raising feedforward.`
        : `Logged FF modest on ${Math.round(lowFraction * 100)}% of fast setpoint segments.`,
  };
}

function analyzePidTerms(pidI, pidF, setpoint, sampleRateHz) {
  const hasI = pidI?.series?.length > 0;
  const hasF = pidF?.series?.length > 0;
  if (!hasI && !hasF) {
    return { available: false, axes: [] };
  }

  const axes = AXIS_NAMES.map((name, axis) => {
    const iSeries = pickSeriesByAxis(pidI, axis);
    const fSeries = pickSeriesByAxis(pidF, axis);
    const spSeries = pickSeriesByAxis(setpoint, axis);
    const windup = iSeries?.data
      ? analyzeAxisIWindup(iSeries.data, spSeries?.data, sampleRateHz)
      : null;
    const feedforward = fSeries?.data
      ? analyzeFeedforwardLogged(fSeries.data, spSeries?.data, sampleRateHz)
      : null;
    if (!windup && !feedforward) {
      return null;
    }
    return { name, windup, feedforward };
  }).filter(Boolean);

  return { available: axes.length > 0, axes };
}

export function runDiagnosticsAnalysis(payload) {
  const {
    sampleRateHz,
    gyro,
    setpoint,
    rcCommand,
    motor,
    pidI,
    pidF,
    thresholdProfile,
    referenceProfile,
    hardwareProfile,
    headerBaseline,
    saturationThreshold,
  } = payload;

  const archetype = hardwareProfile?.frameArchetype ?? "freestyle_5";
  const reference =
    referenceProfile ?? REFERENCE_TUNING_PROFILES[archetype] ?? REFERENCE_TUNING_PROFILES.freestyle_5;

  const thresholds = scaleThresholdsByAuw(
    thresholdProfile ?? FRAME_THRESHOLD_PROFILES[archetype] ?? FRAME_THRESHOLD_PROFILES.freestyle_5,
    hardwareProfile?.auwGrams,
  );
  const severityScale = thresholds.resonanceSeverityScale ?? 1;

  const resonanceAxes = AXIS_NAMES.map((name, axis) => {
    const gyroSeries = pickSeriesByAxis(gyro, axis);
    const spSeries = pickSeriesByAxis(setpoint, axis);
    const result = analyzeAxisResonance(
      gyroSeries?.data,
      spSeries?.data,
      gyroSeries?.timesUs,
      sampleRateHz,
      severityScale,
      reference.filters.resonanceBandHz,
    );
    return { name, axis, ...result };
  });

  const worstResonance = resonanceAxes.reduce(
    (best, cur) => (!best || cur.score > best.score ? cur : best),
    null,
  );

  const tuningAxes = AXIS_NAMES.map((name, axis) => ({
    name,
    ...analyzeAxisStepResponse(
      pickSeriesByAxis(gyro, axis),
      pickSeriesByAxis(setpoint, axis),
      pickSeriesByAxis(rcCommand, axis),
      reference,
      sampleRateHz,
    ),
  }));

  const trackingRms = AXIS_NAMES.map((name, axis) => ({
    name,
    rmsDeg: analyzeTrackingRms(
      pickSeriesByAxis(gyro, axis)?.data,
      pickSeriesByAxis(setpoint, axis)?.data,
    ),
  }));

  const motorHealth = analyzeMotorHealth(motor, saturationThreshold ?? 1850);
  const pidTerms = analyzePidTerms(pidI, pidF, setpoint, sampleRateHz);

  return {
    summary: {
      craftName: headerBaseline?.craftName ?? "Unknown craft",
      firmwareVersion: headerBaseline?.firmwareVersion
        ? `Betaflight ${headerBaseline.firmwareVersion}`
        : "Unknown firmware",
      loggingRateHz: sampleRateHz,
      flightDurationSec: payload.flightDurationSec ?? 0,
      frameLabel: hardwareProfile?.frameLabel ?? "",
      auwGrams: hardwareProfile?.auwGrams ?? null,
      cellCount: hardwareProfile?.cellCount ?? null,
    },
    hardware: {
      frameResonance: {
        status: worstResonance?.status ?? "yellow",
        peakHz: worstResonance?.peakHz ?? 0,
        peakMag: worstResonance?.peakMag ?? 0,
        confidence: worstResonance?.confidence ?? 0,
        summary: worstResonance?.summary ?? "Resonance analysis unavailable.",
        perAxis: resonanceAxes.map(
          ({ name, status, peakHz, confidence, peaks, summary }) => ({
            name,
            status,
            peakHz,
            confidence,
            peaks,
            summary,
          }),
        ),
      },
      motorHealth,
    },
    tuning: { axes: tuningAxes, trackingRms, pidTerms },
    thresholdsUsed: thresholds,
    referenceUsed: {
      label: reference.label,
      description: reference.description,
      sweetOvershootPct: reference.stepResponse.sweetOvershootPct,
      sweetSettleMs: reference.stepResponse.sweetSettleMs,
      highRateThresholdDeg: reference.stepResponse.highRateThresholdDeg,
    },
  };
}
