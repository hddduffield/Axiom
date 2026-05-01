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
