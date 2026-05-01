import type { NumericValue } from "../schemas/pipelineTypes";

function bounds(v: NumericValue): { low: number; high: number } {
  if (Array.isArray(v.value)) return { low: v.value[0], high: v.value[1] };
  return { low: v.value, high: v.value };
}

export function extractMidpoint(v: NumericValue): number {
  if (Array.isArray(v.value)) return (v.value[0] + v.value[1]) / 2;
  return v.value;
}

export function addNumericValues(a: NumericValue, b: NumericValue): NumericValue {
  const { low: aLow, high: aHigh } = bounds(a);
  const { low: bLow, high: bHigh } = bounds(b);
  const sumLow = aLow + bLow;
  const sumHigh = aHigh + bHigh;
  const result: NumericValue = {
    value: sumLow === sumHigh ? sumLow : [sumLow, sumHigh],
    unit: a.unit,
  };
  if (a.is_annual === true && b.is_annual === true) result.is_annual = true;
  return result;
}

export function subtractNumericValues(a: NumericValue, b: NumericValue): NumericValue {
  const { low: aLow, high: aHigh } = bounds(a);
  const { low: bLow, high: bHigh } = bounds(b);
  // Subtraction widens range: low = aLow - bHigh; high = aHigh - bLow.
  const diffLow = aLow - bHigh;
  const diffHigh = aHigh - bLow;
  const result: NumericValue = {
    value: diffLow === diffHigh ? diffLow : [diffLow, diffHigh],
    unit: a.unit,
  };
  if (a.is_annual === true && b.is_annual === true) result.is_annual = true;
  return result;
}

export function multiplyNumericByScalar(v: NumericValue, scalar: number): NumericValue {
  const { low, high } = bounds(v);
  const newLow = low * scalar;
  const newHigh = high * scalar;
  return {
    ...v,
    value: newLow === newHigh ? newLow : [newLow, newHigh],
  };
}

// A NumericRange with negative low endpoint is unusual in financial impact context —
// if encountered, likely a Stage 3a bug rather than legitimate data. The high>0 rule
// is defensive, not encouragement.
export function isPositiveValue(v: NumericValue): boolean {
  if (Array.isArray(v.value)) return v.value[1] > 0; // any positive endpoint
  return v.value > 0;
}

export function isRange(v: NumericValue): boolean {
  return Array.isArray(v.value);
}

export function rangeBounds(v: NumericValue): { low: number; high: number } {
  return bounds(v);
}

// ────────────────────────────────────────────────────────────────────────
// Currency formatting (K/M/B + sig figs)
// 3 sig figs under $10M, 2 sig figs above. No trailing zeros after the decimal.
// ────────────────────────────────────────────────────────────────────────

function toSigFigs(value: number, sf: number): string {
  if (value === 0) return "0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const magnitude = Math.floor(Math.log10(abs));
  const factor = Math.pow(10, magnitude - sf + 1);
  const rounded = Math.round(abs / factor) * factor;
  const decimals = Math.max(0, sf - 1 - magnitude);
  let s = rounded.toFixed(decimals);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return sign + s;
}

export function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sf = abs < 10_000_000 ? 3 : 2;
  if (abs < 1000) {
    return `$${Math.round(value)}`;
  }
  if (abs < 1_000_000) {
    return `$${toSigFigs(value / 1000, sf)}K`;
  }
  if (abs < 1_000_000_000) {
    return `$${toSigFigs(value / 1_000_000, sf)}M`;
  }
  return `$${toSigFigs(value / 1_000_000_000, sf)}B`;
}

// Render a NumericValue as a money string. Single → "$X"; range → "$low–$high".
export function formatNumericValueMoney(v: NumericValue): string {
  if (Array.isArray(v.value)) {
    const [low, high] = v.value;
    return `${formatMoney(low)}–${formatMoney(high)}`;
  }
  return formatMoney(v.value);
}
