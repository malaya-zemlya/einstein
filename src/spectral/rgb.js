// sRGB palette colour → 12 band albedos (spectral.md § rgbToBands).

import { NUM_BANDS, UV_BANDS, VISIBLE_BANDS, IR_BANDS } from './bands.js'
import { SUN_BANDS, bandXYZ, srgbToLinear, xyzToLinearSrgb } from './lut.js'

const BAND_XYZ_1 = Array.from({ length: NUM_BANDS }, (_, i) => bandXYZ(i, 1))

// Rest frame, S = 1, lit by SUN_BANDS with lit = 1: albedo bands → linear sRGB.
export function bandsToLinearRgb(bands) {
  const xyz = [0, 0, 0]
  for (let i = 0; i < NUM_BANDS; i++) {
    const w = bands[i] * SUN_BANDS[i]
    for (let c = 0; c < 3; c++) xyz[c] += w * BAND_XYZ_1[i][c]
  }
  return xyzToLinearSrgb(xyz)
}

// Visible basis over VISIBLE_BANDS.
const B_R = [0, 0, 0, 0.3, 1, 1]
const B_G = [0, 0.3, 1, 1, 0.3, 0]
const B_B = [1, 1, 0.2, 0, 0, 0]
const BASIS = [B_R, B_G, B_B]

const visibleOnly = (v6) => {
  const b = new Float64Array(NUM_BANDS)
  VISIBLE_BANDS.forEach((band, k) => { b[band] = v6[k] })
  return b
}

function inv3(m) {
  const [a, b, c, d, e, f, g, h, k] = m
  const A = e * k - f * h, B = -(d * k - f * g), Cc = d * h - e * g
  const det = a * A + b * B + c * Cc
  return [
    A / det, -(b * k - c * h) / det, (b * f - c * e) / det,
    B / det, (a * k - c * g) / det, -(a * f - c * d) / det,
    Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ]
}

// M: columns = linear sRGB of B_r, B_g, B_b under the sun at S = 1.
const COLS = BASIS.map((v) => bandsToLinearRgb(visibleOnly(v)))
const M_INV = inv3([
  COLS[0][0], COLS[1][0], COLS[2][0],
  COLS[0][1], COLS[1][1], COLS[2][1],
  COLS[0][2], COLS[1][2], COLS[2][2],
])

export function parseRgb(rgb) {
  if (typeof rgb !== 'string') return [rgb[0], rgb[1], rgb[2]]
  const n = parseInt(rgb.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
}

// rgb: '#rrggbb' or [r, g, b] in 0..1 (gamma-encoded sRGB).
export function rgbToBands(rgb, { uv = 0, ir = 0 } = {}) {
  const lin = parseRgb(rgb).map(srgbToLinear)
  const out = new Float32Array(NUM_BANDS)
  const tailBands = new Float64Array(NUM_BANDS)
  for (const i of UV_BANDS) tailBands[i] = uv
  for (const i of IR_BANDS) tailBands[i] = ir
  const tail = bandsToLinearRgb(tailBands)
  const d = [lin[0] - tail[0], lin[1] - tail[1], lin[2] - tail[2]]
  const w = [0, 1, 2].map((r) => Math.max(0, M_INV[3 * r] * d[0] + M_INV[3 * r + 1] * d[1] + M_INV[3 * r + 2] * d[2]))
  out.set(tailBands)
  VISIBLE_BANDS.forEach((b, k) => { out[b] = w[0] * B_R[k] + w[1] * B_G[k] + w[2] * B_B[k] })
  return out
}
