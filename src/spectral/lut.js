// Absolute radiance scale and the startup LUTs.
// Everything is SI spectral radiance (W·sr⁻¹·m⁻³) divided by one constant K, so that
// sunlit white paper has Y = 1. Weights (SUN_BANDS, bbBands, skyBands) carry the 1/K;
// the band LUT is the bare integral Σ G_i(Sλ)·x̄ȳz̄(λ)·Δλ (Δλ = 1 nm) and carries none.
// The blackbody LUT is Σ B_λ·x̄ȳz̄·Δλ / K, i.e. already in weight × band-LUT units.

import { BANDS, NUM_BANDS } from './bands.js'
import { CMF_TABLE, LAMBDA_MIN, NUM_LAMBDA } from './cmf.js'

const H = 6.62607015e-34
const C_LIGHT = 299792458
const KB = 1.380649e-23
const C1 = 2 * H * C_LIGHT * C_LIGHT
const C2 = (H * C_LIGHT) / KB

export const T_SUN = 5778
export const SUN_DILUTION = 2.16e-5 // (R_sun / 1 AU)²
export const THERMAL_EPS = 0.9
export const THERMAL_T = 290

export const LUT_SIZE = 1025 // odd, so log2 S = 0 (no shift) is an exact node
export const LOG2S_MIN = -4
export const LOG2S_MAX = 4
export const LOG2T_MIN = Math.log2(100)
export const LOG2T_MAX = Math.log2(100000)

// Planck spectral radiance B_λ, SI (λ in metres).
export function planck(lambdaM, T) {
  const x = C2 / (lambdaM * T)
  if (x > 700) return 0
  return C1 / (lambdaM ** 5 * Math.expm1(x))
}

// Bare band integral: Σ_λ G_i(Sλ)·x̄ȳz̄(λ)·1 nm.
function bandXYZRaw(i, S) {
  const { mu, sigma } = BANDS[i]
  let x = 0, y = 0, z = 0
  for (let k = 0; k < NUM_LAMBDA; k++) {
    const t = (S * (LAMBDA_MIN + k) - mu) / sigma
    const g = Math.exp(-0.5 * t * t)
    x += g * CMF_TABLE[3 * k]
    y += g * CMF_TABLE[3 * k + 1]
    z += g * CMF_TABLE[3 * k + 2]
  }
  return [x, y, z]
}

function bbXYZRaw(T) {
  let x = 0, y = 0, z = 0
  for (let k = 0; k < NUM_LAMBDA; k++) {
    const b = planck((LAMBDA_MIN + k) * 1e-9, T)
    x += b * CMF_TABLE[3 * k]
    y += b * CMF_TABLE[3 * k + 1]
    z += b * CMF_TABLE[3 * k + 2]
  }
  return [x, y, z]
}

const SUN_RAW = BANDS.map(({ mu }) => planck(mu * 1e-9, T_SUN) * SUN_DILUTION)

// Y of white paper (every albedo 1, lit = 1) under the sun, through the band LUT at S = 1.
export const K = SUN_RAW.reduce((acc, e, i) => acc + e * bandXYZRaw(i, 1)[1], 0)

// Sun's reflected-radiance weight per band: B_λ(mu_i, 5778 K)·(R_sun/AU)² / K.
export const SUN_BANDS = Float64Array.from(SUN_RAW, (e) => e / K)

export const bandXYZ = (i, S) => bandXYZRaw(i, S)
export const bbXYZ = (T) => bbXYZRaw(T).map((v) => v / K)
export const bbBand = (i, T) => planck(BANDS[i].mu * 1e-9, T) / K

export const lutLog2S = (j) => LOG2S_MIN + ((LOG2S_MAX - LOG2S_MIN) * j) / (LUT_SIZE - 1)
export const lutLog2T = (j) => LOG2T_MIN + ((LOG2T_MAX - LOG2T_MIN) * j) / (LUT_SIZE - 1)

// LUT_SIZE × 12 RGBA32F, row = band, column = log2 S over [−4, 4]. rgb = XYZ, a = 0.
export function buildBandLUT() {
  const out = new Float32Array(LUT_SIZE * NUM_BANDS * 4)
  for (let i = 0; i < NUM_BANDS; i++) {
    for (let j = 0; j < LUT_SIZE; j++) out.set(bandXYZ(i, 2 ** lutLog2S(j)), (i * LUT_SIZE + j) * 4)
  }
  return out
}

// LUT_SIZE × 1 RGBA32F over log2 T in [log2 100, log2 1e5]. rgb = XYZ_bb / K.
export function buildBlackbodyLUT() {
  const out = new Float32Array(LUT_SIZE * 4)
  for (let j = 0; j < LUT_SIZE; j++) out.set(bbXYZ(2 ** lutLog2T(j)), j * 4)
  return out
}

// LUT_SIZE × 3 RGBA32F over the same T range; row r holds bands 4r..4r+3: B_λ(mu_i, T) / K.
export function buildBbBandsLUT() {
  const out = new Float32Array(LUT_SIZE * 3 * 4)
  for (let j = 0; j < LUT_SIZE; j++) {
    const T = 2 ** lutLog2T(j)
    for (let i = 0; i < NUM_BANDS; i++) out[((i >> 2) * LUT_SIZE + j) * 4 + (i & 3)] = bbBand(i, T)
  }
  return out
}

// Rayleigh sky: SUN_BANDS·(550/mu)⁴·SKY_K; band 0 (260 nm) zero (ozone). Zenith Y = 0.6 at rest.
const skyRaw = () => Float64Array.from(BANDS, ({ mu }, i) => (i < 1 ? 0 : SUN_BANDS[i] * (550 / mu) ** 4))
export const SKY_K = 0.6 / skyRaw().reduce((acc, w, i) => acc + w * bandXYZ(i, 1)[1], 0)
export const skyBands = () => Float32Array.from(skyRaw(), (w) => w * SKY_K)

// Stylised emitter scales (decision 10): multiply bb(T) so the source at rest hits a target Y.
export const FIREBALL_T = 10000
export const BURST_T = 6000
export const EMIT_FIREBALL = 20 / bbXYZ(FIREBALL_T)[1] // stylised: Y ≈ 20 at rest (≈ 4 receding at 0.7c)
export const EMIT_BURST = 6 / bbXYZ(BURST_T)[1]
export const SUN_DISK_SCALE = 20 / bbXYZ(T_SUN)[1]

// Colour-space helpers (row-major 3×3, D65).
export const XYZ_TO_LINEAR_SRGB = Object.freeze([
  3.2404542, -1.5371385, -0.4985314,
  -0.969266, 1.8760108, 0.041556,
  0.0556434, -0.2040259, 1.0572252,
])
export const LINEAR_SRGB_TO_XYZ = Object.freeze([
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.072175,
  0.0193339, 0.119192, 0.9503041,
])

export const mul3 = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
]
export const xyzToLinearSrgb = (xyz) => mul3(XYZ_TO_LINEAR_SRGB, xyz)
export const linearSrgbToXyz = (rgb) => mul3(LINEAR_SRGB_TO_XYZ, rgb)

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export const luminanceXYZ = (xyz) => xyz[1]
export const luminanceLinearRgb = (rgb) =>
  LINEAR_SRGB_TO_XYZ[3] * rgb[0] + LINEAR_SRGB_TO_XYZ[4] * rgb[1] + LINEAR_SRGB_TO_XYZ[5] * rgb[2]
export const chromaticity = ([x, y, z]) => [x / (x + y + z), y / (x + y + z)]
