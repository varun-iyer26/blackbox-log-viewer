import { FlightLogParser } from "../flightlog_parser.js";
import {
  DIAGNOSTIC_CHANNELS,
  MIN_LOG_RATE_HZ,
  MIN_RC_STEP_EVENTS,
  RC_STEP_THRESHOLD,
} from "./constants.js";

const TIME_INDEX = FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME;
const AXIS_COUNT = 3;
const YIELD_EVERY_CHUNKS = 4;

function resolveFieldIndex(flightLog, candidates) {
  for (const name of candidates) {
    const index = flightLog.getMainFieldIndexByName(name);
    if (index !== undefined) {
      return index;
    }
  }
  return undefined;
}

function estimateConfiguredRateHz(sysConfig) {
  if (!sysConfig?.looptime) {
    return 0;
  }
  let rate =
    (1e6 / sysConfig.looptime) *
    ((sysConfig.frameIntervalPNum ?? 1) / (sysConfig.frameIntervalPDenom ?? 1));
  if (sysConfig.pid_process_denom != null) {
    rate /= sysConfig.pid_process_denom;
  }
  return rate;
}

function computeSampleRateHz(flightLog) {
  const chunks = flightLog.getChunksInTimeRange(
    flightLog.getMinTime(),
    flightLog.getMinTime() + 2e6,
  );
  const times = [];
  for (const chunk of chunks) {
    for (const frame of chunk.frames) {
      times.push(frame[TIME_INDEX]);
      if (times.length >= 500) {
        break;
      }
    }
    if (times.length >= 500) {
      break;
    }
  }

  if (times.length < 2) {
    return estimateConfiguredRateHz(flightLog.getSysConfig());
  }

  const deltas = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 0) {
      deltas.push(dt);
    }
  }
  deltas.sort((a, b) => a - b);
  const medianDt = deltas[Math.floor(deltas.length / 2)];
  return medianDt > 0 ? 1e6 / medianDt : estimateConfiguredRateHz(flightLog.getSysConfig());
}

function countRcStepEvents(flightLog, rcFieldIndexes) {
  let totalEvents = 0;

  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    const fieldIndex = rcFieldIndexes[axis];
    if (fieldIndex === undefined) {
      continue;
    }

    const chunks = flightLog.getChunksInTimeRange(
      flightLog.getMinTime(),
      flightLog.getMaxTime(),
    );
    let prev = null;
    let lastEventTime = -Infinity;

    for (const chunk of chunks) {
      for (const frame of chunk.frames) {
        const value = frame[fieldIndex];
        if (prev != null && Math.abs(value - prev) >= RC_STEP_THRESHOLD) {
          const timeUs = frame[TIME_INDEX];
          if (timeUs - lastEventTime >= 500000) {
            totalEvents++;
            lastEventTime = timeUs;
          }
        }
        prev = value;
      }
    }
  }

  return totalEvents;
}

function extractHeaderBaseline(sysConfig) {
  if (!sysConfig) {
    return {};
  }

  return {
    craftName: sysConfig.craftName ?? sysConfig.name ?? null,
    firmwareVersion: sysConfig.firmwareVersion ?? null,
    firmwareType: sysConfig.firmwareType ?? null,
    looptime: sysConfig.looptime ?? null,
    pid_process_denom: sysConfig.pid_process_denom ?? null,
    rollPID: sysConfig.rollPID ? [...sysConfig.rollPID] : null,
    pitchPID: sysConfig.pitchPID ? [...sysConfig.pitchPID] : null,
    yawPID: sysConfig.yawPID ? [...sysConfig.yawPID] : null,
    gyro_lowpass_hz: sysConfig.gyro_lowpass_hz ?? null,
    gyro_lowpass2_hz: sysConfig.gyro_lowpass2_hz ?? null,
    gyro_lowpass_dyn_hz: sysConfig.gyro_lowpass_dyn_hz
      ? [...sysConfig.gyro_lowpass_dyn_hz]
      : null,
    dterm_lpf1_static_hz: sysConfig.dterm_lpf1_static_hz ?? null,
    dterm_lpf2_static_hz: sysConfig.dterm_lpf2_static_hz ?? null,
    d_min: sysConfig.d_min ? [...sysConfig.d_min] : null,
    d_max: sysConfig.d_max ? [...sysConfig.d_max] : null,
    dshot_bidir: sysConfig.dshot_bidir ?? null,
    dynamic_idle_min_rpm: sysConfig.dynamic_idle_min_rpm ?? null,
    gyro_rpm_notch_harmonics: sysConfig.gyro_rpm_notch_harmonics ?? null,
    gyro_rpm_notch_q: sysConfig.gyro_rpm_notch_q ?? null,
    gyro_rpm_notch_min: sysConfig.gyro_rpm_notch_min ?? null,
    motor_poles: sysConfig.motor_poles ?? null,
    dyn_notch_count: sysConfig.dyn_notch_count ?? null,
    dyn_notch_q: sysConfig.dyn_notch_q ?? null,
  };
}

function resolveChannelMap(flightLog) {
  const motorCount = flightLog.getNumMotors() || 4;
  const gyro = [];
  const setpoint = [];
  const rcCommand = [];
  const pidI = [];
  const pidF = [];
  const motor = [];

  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    gyro.push({
      axis,
      fieldName: resolveFieldName(flightLog, DIAGNOSTIC_CHANNELS.gyroScaled.candidates(axis)),
      fieldIndex: resolveFieldIndex(flightLog, DIAGNOSTIC_CHANNELS.gyroScaled.candidates(axis)),
    });
    setpoint.push({
      axis,
      fieldName: resolveFieldName(flightLog, DIAGNOSTIC_CHANNELS.pidSetpoint.candidates(axis)),
      fieldIndex: resolveFieldIndex(flightLog, DIAGNOSTIC_CHANNELS.pidSetpoint.candidates(axis)),
    });
    rcCommand.push({
      axis,
      fieldName: resolveFieldName(flightLog, DIAGNOSTIC_CHANNELS.rcCommand.candidates(axis)),
      fieldIndex: resolveFieldIndex(flightLog, DIAGNOSTIC_CHANNELS.rcCommand.candidates(axis)),
    });
    pidI.push({
      axis,
      fieldName: resolveFieldName(flightLog, DIAGNOSTIC_CHANNELS.pidI.candidates(axis)),
      fieldIndex: resolveFieldIndex(flightLog, DIAGNOSTIC_CHANNELS.pidI.candidates(axis)),
    });
    pidF.push({
      axis,
      fieldName: resolveFieldName(flightLog, DIAGNOSTIC_CHANNELS.pidF.candidates(axis)),
      fieldIndex: resolveFieldIndex(flightLog, DIAGNOSTIC_CHANNELS.pidF.candidates(axis)),
    });
  }

  for (let i = 0; i < motorCount; i++) {
    motor.push({
      motor: i,
      fieldName: resolveFieldName(flightLog, DIAGNOSTIC_CHANNELS.motorOutput.candidates(i)),
      fieldIndex: resolveFieldIndex(flightLog, DIAGNOSTIC_CHANNELS.motorOutput.candidates(i)),
    });
  }

  return { gyro, setpoint, rcCommand, pidI, pidF, motor };
}

function resolveFieldName(flightLog, candidates) {
  for (const name of candidates) {
    if (flightLog.getMainFieldIndexByName(name) !== undefined) {
      return name;
    }
  }
  return null;
}

export function extractDiagnosticsBaseline(flightLog) {
  if (!flightLog) {
    return {
      valid: false,
      errors: ["No flight log loaded."],
      warnings: [],
      channels: null,
      headerBaseline: null,
      loggingRateHz: 0,
      rcStepEvents: 0,
    };
  }

  const sysConfig = flightLog.getSysConfig();
  const channels = resolveChannelMap(flightLog);
  const loggingRateHz = Math.round(computeSampleRateHz(flightLog));
  const configuredRateHz = Math.round(estimateConfiguredRateHz(sysConfig));
  const effectiveRateHz = loggingRateHz || configuredRateHz;

  const rcIndexes = channels.rcCommand.map((c) => c.fieldIndex);
  const rcStepEvents = countRcStepEvents(flightLog, rcIndexes);

  const errors = [];
  const warnings = [];

  if (effectiveRateHz < MIN_LOG_RATE_HZ) {
    warnings.push(
      `Logging rate ~${effectiveRateHz} Hz is below ${MIN_LOG_RATE_HZ} Hz — FFT and step-response confidence will be reduced.`,
    );
  }

  if (channels.gyro.some((c) => c.fieldIndex === undefined)) {
    errors.push("Missing gyro channels — enable gyro logging in Blackbox.");
  }
  if (channels.setpoint.some((c) => c.fieldIndex === undefined)) {
    warnings.push("PID setpoint fields missing — step tracking metrics may be limited.");
  }
  if (rcStepEvents < MIN_RC_STEP_EVENTS) {
    warnings.push(
      `Few sharp stick inputs (${rcStepEvents} events; ≥${MIN_RC_STEP_EVENTS} recommended). Perform flips or snaps for better PID analysis.`,
    );
  }

  const stats = flightLog.getStats();
  const frameCount =
    (stats?.frame?.I?.validCount ?? 0) + (stats?.frame?.P?.validCount ?? 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    channels,
    headerBaseline: extractHeaderBaseline(sysConfig),
    loggingRateHz: effectiveRateHz,
    configuredRateHz,
    rcStepEvents,
    frameCount,
    flightDurationSec: Math.round(
      (flightLog.getMaxTime() - flightLog.getMinTime()) / 1e6,
    ),
    motorCount: flightLog.getNumMotors(),
  };
}

function initSeriesPack(entries) {
  return {
    times: [],
    series: entries.map((entry) => ({
      axis: entry.axis,
      motor: entry.motor,
      values: [],
      fieldIndex: entry.fieldIndex,
    })),
  };
}

function finalizeSeriesPack(pack) {
  return {
    timesUs: Float32Array.from(pack.times),
    series: pack.series.map((s) => ({
      axis: s.axis,
      motor: s.motor,
      data: Float32Array.from(s.values),
    })),
  };
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

/**
 * Single-pass buffer build with periodic yields so the UI stays responsive.
 */
export async function buildAnalysisBuffersAsync(flightLog, maxSamples = 65536) {
  const baseline = extractDiagnosticsBaseline(flightLog);
  const missingGyro = baseline.channels?.gyro?.some((c) => c.fieldIndex === undefined);
  if (missingGyro) {
    throw new Error("Missing gyro channels — enable gyro logging in Blackbox.");
  }

  const chunks = flightLog.getChunksInTimeRange(
    flightLog.getMinTime(),
    flightLog.getMaxTime(),
  );

  let totalFrames = 0;
  for (const chunk of chunks) {
    totalFrames += chunk.frames.length;
  }
  const stride = totalFrames > maxSamples ? Math.ceil(totalFrames / maxSamples) : 1;

  const gyroEntries = baseline.channels.gyro.filter((c) => c.fieldIndex !== undefined);
  const setpointEntries = baseline.channels.setpoint.filter((c) => c.fieldIndex !== undefined);
  const rcEntries = baseline.channels.rcCommand.filter((c) => c.fieldIndex !== undefined);
  const motorEntries = baseline.channels.motor.filter((c) => c.fieldIndex !== undefined);
  const pidIEntries = baseline.channels.pidI.filter((c) => c.fieldIndex !== undefined);
  const pidFEntries = baseline.channels.pidF.filter((c) => c.fieldIndex !== undefined);

  const gyroPack = initSeriesPack(gyroEntries);
  const setpointPack = initSeriesPack(setpointEntries);
  const rcPack = initSeriesPack(rcEntries);
  const motorPack = initSeriesPack(motorEntries);
  const pidIPack = pidIEntries.length ? initSeriesPack(pidIEntries) : null;
  const pidFPack = pidFEntries.length ? initSeriesPack(pidFEntries) : null;

  const gyroConvert = (raw) => flightLog.gyroRawToDegreesPerSecond(raw);

  const appendFrame = (pack, convert) => {
    for (const s of pack.series) {
      const raw = pack._frame[s.fieldIndex];
      s.values.push(convert ? convert(raw) : raw);
    }
  };

  let frameIndex = 0;
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    for (const frame of chunk.frames) {
      if (frameIndex++ % stride !== 0) {
        continue;
      }

      gyroPack.times.push(frame[TIME_INDEX]);
      setpointPack.times.push(frame[TIME_INDEX]);
      rcPack.times.push(frame[TIME_INDEX]);
      motorPack.times.push(frame[TIME_INDEX]);
      if (pidIPack) {
        pidIPack.times.push(frame[TIME_INDEX]);
      }
      if (pidFPack) {
        pidFPack.times.push(frame[TIME_INDEX]);
      }

      gyroPack._frame = frame;
      setpointPack._frame = frame;
      rcPack._frame = frame;
      motorPack._frame = frame;
      if (pidIPack) {
        pidIPack._frame = frame;
      }
      if (pidFPack) {
        pidFPack._frame = frame;
      }

      appendFrame(gyroPack, gyroConvert);
      appendFrame(setpointPack);
      appendFrame(rcPack);
      appendFrame(motorPack);
      if (pidIPack) {
        appendFrame(pidIPack);
      }
      if (pidFPack) {
        appendFrame(pidFPack);
      }
    }

    if (ci > 0 && ci % YIELD_EVERY_CHUNKS === 0) {
      await yieldToMainThread();
    }
  }

  return {
    sampleRateHz: baseline.loggingRateHz,
    gyro: finalizeSeriesPack(gyroPack),
    setpoint: finalizeSeriesPack(setpointPack),
    rcCommand: finalizeSeriesPack(rcPack),
    motor: finalizeSeriesPack(motorPack),
    pidI: pidIPack ? finalizeSeriesPack(pidIPack) : null,
    pidF: pidFPack ? finalizeSeriesPack(pidFPack) : null,
  };
}

/** @deprecated Use buildAnalysisBuffersAsync */
export function buildAnalysisBuffers(flightLog, maxSamples = 32768) {
  return buildAnalysisBuffersAsync(flightLog, maxSamples);
}
