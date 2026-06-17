import { FRAME_THRESHOLD_PROFILES, REFERENCE_TUNING_PROFILES } from "../../src/diagnostics/reference_profiles.js";

const AXIS_COUNT = 3;

function makeTimes(count, sampleRateHz) {
  const dtUs = 1e6 / sampleRateHz;
  const timesUs = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    timesUs[i] = i * dtUs;
  }
  return timesUs;
}

function makeAxisSeries(count, sampleRateHz, valueFn) {
  const timesUs = makeTimes(count, sampleRateHz);
  const series = [];
  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    const data = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      data[i] = valueFn(i, axis, sampleRateHz);
    }
    series.push({ axis, data });
  }
  return { timesUs, series };
}

function makeMotorSeries(count, sampleRateHz, base = 1500) {
  const timesUs = makeTimes(count, sampleRateHz);
  const series = [];
  for (let motor = 0; motor < 4; motor++) {
    const data = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      data[i] = base + Math.sin((2 * Math.PI * i) / 400) * 20;
    }
    series.push({ motor, data });
  }
  return { timesUs, series };
}

/**
 * Synthetic worker payloads for golden regression (no .bbl binary required in CI).
 */
export function buildSyntheticPayload(profile) {
  const sampleRateHz = profile.sampleRateHz ?? 2000;
  const count = profile.sampleCount ?? 4096;
  const toneHz = profile.resonanceHz ?? 0;
  const stepAt = profile.stepAtSample ?? Math.floor(count * 0.3);

  const gyro = makeAxisSeries(count, sampleRateHz, (i, axis, rate) => {
    let v = Math.sin(i * 0.17 + axis * 1.3) * 1.5;
    if (toneHz > 0 && axis === 0) {
      v += 40 * Math.sin((2 * Math.PI * toneHz * i) / rate);
    }
    if (i >= stepAt && axis === 0) {
      v += 120 * (1 - Math.exp(-(i - stepAt) / 80));
    }
    return v;
  });

  const setpoint = makeAxisSeries(count, sampleRateHz, (i, axis) => {
    if (axis !== 0) {
      return 0;
    }
    return i >= stepAt ? 180 : 0;
  });

  const rcCommand = makeAxisSeries(count, sampleRateHz, (i, axis) => {
    if (axis !== 0) {
      return 1500;
    }
    return i >= stepAt ? 1700 : 1500;
  });

  const motor = makeMotorSeries(count, sampleRateHz);
  const archetype = profile.archetype ?? "freestyle_5";

  return {
    sampleRateHz,
    flightDurationSec: Math.round(count / sampleRateHz),
    gyro,
    setpoint,
    rcCommand,
    motor,
    pidI: null,
    pidF: null,
    thresholdProfile: FRAME_THRESHOLD_PROFILES[archetype],
    referenceProfile: REFERENCE_TUNING_PROFILES[archetype],
    hardwareProfile: {
      frameArchetype: archetype,
      frameLabel: archetype,
      auwGrams: profile.auwGrams ?? 650,
      cellCount: "4S",
    },
    headerBaseline: {
      craftName: profile.name ?? "Synthetic",
      firmwareVersion: "4.5.0",
    },
    saturationThreshold: 1850,
  };
}
