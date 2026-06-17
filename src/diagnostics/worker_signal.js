/**
 * Shared signal-processing helpers for diagnostics worker.
 */

export function nextPowerOf2(size) {
  return 2 ** Math.ceil(Math.log2(Math.max(1, size)));
}

export function median(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = clamp(Math.floor((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function rejectOutliersIqr(values) {
  if (values.length < 4) {
    return values;
  }
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const filtered = values.filter((v) => v >= lo && v <= hi);
  return filtered.length > 0 ? filtered : values;
}

export function applyHanningWindow(samples) {
  const size = samples.length;
  if (size < 2) {
    return;
  }
  for (let i = 0; i < size; i++) {
    samples[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
}

export function derivativeSeries(values, timesUs) {
  const out = new Float32Array(values.length);
  for (let i = 1; i < values.length; i++) {
    const dt = (timesUs[i] - timesUs[i - 1]) / 1e6;
    out[i] = dt > 0 ? (values[i] - values[i - 1]) / dt : 0;
  }
  return out;
}

/** Build index ranges where |setpoint derivative| stays below threshold (deg/s² scale). */
export function findQuietSetpointRanges(setpoint, timesUs, maxRateDegPerSec = 80) {
  const rate = derivativeSeries(setpoint, timesUs);
  const ranges = [];
  let start = null;

  for (let i = 0; i < rate.length; i++) {
    const quiet = Math.abs(rate[i]) < maxRateDegPerSec && Math.abs(setpoint[i]) < 120;
    if (quiet && start == null) {
      start = i;
    } else if (!quiet && start != null) {
      if (i - start >= 256) {
        ranges.push({ start, end: i });
      }
      start = null;
    }
  }
  if (start != null && rate.length - start >= 256) {
    ranges.push({ start, end: rate.length });
  }
  return ranges;
}

export function concatRanges(values, ranges, maxLen = 16384) {
  const chunks = [];
  let total = 0;
  for (const r of ranges) {
    const len = r.end - r.start;
    if (total + len > maxLen) {
      break;
    }
    chunks.push(values.subarray(r.start, r.end));
    total += len;
  }
  if (!chunks.length) {
    return values.subarray(0, Math.min(values.length, maxLen));
  }
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function scaleThresholdsByAuw(profile, auwGrams) {
  if (!profile || !auwGrams) {
    return profile;
  }
  let settleScale = 1;
  let overshootScale = 1;
  if (auwGrams < 350) {
    settleScale = 0.88;
    overshootScale = 1.08;
  } else if (auwGrams > 750) {
    settleScale = 1.12;
    overshootScale = 0.92;
  } else if (auwGrams > 550) {
    settleScale = 1.05;
  }
  return {
    ...profile,
    maxSettleMs: Math.round(profile.maxSettleMs * settleScale),
    maxOvershootPct: profile.maxOvershootPct * overshootScale,
  };
}
