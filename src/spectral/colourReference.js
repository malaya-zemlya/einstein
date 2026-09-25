// JS port of the colour.wgsl fragment pipeline (render.md § fragment stage).
// Returns unexposed linear sRGB, before the 6e4 clamp.

import { NUM_BANDS } from './bands.js'
import {
  LOG2S_MAX, LOG2S_MIN, LOG2T_MAX, LOG2T_MIN, SUN_BANDS, THERMAL_EPS, THERMAL_T,
  bandXYZ, bbXYZ, xyzToLinearSrgb,
} from './lut.js'

// bb(T) as the shader samples it: zero outside the LUT's T range.
export function bbSampled(T) {
  const l = Math.log2(T)
  return l < LOG2T_MIN || l > LOG2T_MAX ? [0, 0, 0] : bbXYZ(T)
}

// Radiance XYZ before the radiance scale A.
export function shadeXYZ({ albedoBands, lit = 1, D = 1, doppler = true, thermal = true, emitT = 0, emitScale = 0, weights }) {
  const S = doppler ? D : 1
  const Sb = 2 ** Math.min(LOG2S_MAX, Math.max(LOG2S_MIN, Math.log2(S)))
  const xyz = [0, 0, 0]
  for (let i = 0; i < NUM_BANDS; i++) {
    const w = weights ? weights[i] : albedoBands[i] * SUN_BANDS[i] * lit
    if (w === 0) continue
    const b = bandXYZ(i, Sb)
    for (let c = 0; c < 3; c++) xyz[c] += w * b[c]
  }
  const add = (k, T) => {
    const b = bbSampled(T)
    for (let c = 0; c < 3; c++) xyz[c] += k * b[c]
  }
  if (thermal) add(THERMAL_EPS * S ** -5, THERMAL_T * S)
  if (emitT > 0) add(emitScale * S ** -5, emitT * S)
  return xyz
}

export const radianceScale = ({ D = 1, doppler = true, searchlight = true }) =>
  (searchlight ? D ** 4 : 1) * (doppler ? D : 1)

// Observed XYZ (A applied).
export function shadeXYZObserved(args) {
  const A = radianceScale(args)
  return shadeXYZ(args).map((v) => v * A)
}

// Linear sRGB, unexposed.
export const shade = (args) => xyzToLinearSrgb(shadeXYZObserved(args))
