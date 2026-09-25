// Colour parity: common.wgsl shadeColour() on the GPU vs spectral/colourReference.js shade() in double.
import { describe, it, expect } from 'vitest'
import commonWgsl from '../../src/render/wgsl/common.wgsl?raw'
import { shade } from '../../src/spectral/colourReference.js'
import {
  LUT_SIZE, LOG2S_MIN, LOG2S_MAX, LOG2T_MIN, LOG2T_MAX, SUN_BANDS, THERMAL_EPS, THERMAL_T,
  FIREBALL_T, BURST_T, EMIT_FIREBALL, EMIT_BURST, skyBands, xyzToLinearSrgb,
} from '../../src/spectral/lut.js'
import { rgbToBands } from '../../src/spectral/rgb.js'
import { getDevice, lutTextures, packFrame, runCompute, uniform } from './gpuHarness.js'

const entry = /* wgsl */ `
struct Case { w0: vec4f, w1: vec4f, w2: vec4f, p: vec4f }   // p = (D, emitT, emitScale, thermal)
@group(1) @binding(0) var<storage, read> cases: array<Case>;
@group(1) @binding(1) var<storage, read_write> out: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&cases)) { return; }
  let c = cases[i];
  out[i] = vec4f(shadeColour(c.w0, c.w1, c.w2, c.p.x, c.p.y, c.p.z, c.p.w > 0.5), 0.0);
}
`
const code = commonWgsl + entry

const lit = (albedo) => Array.from(albedo, (a, i) => a * SUN_BANDS[i])
const WHITE = lit(new Array(12).fill(1))
const FOLIAGE = lit(rgbToBands('#3a7d2c', { uv: 0.05, ir: 0.6 }))
const RED = lit(rgbToBands('#c0302a'))
const UV_IR = lit(rgbToBands('#000000', { uv: 1, ir: 1 }))
const NONE = new Array(12).fill(0)
const ON = { doppler: true, searchlight: true }

const CASES = [
  { name: 'white paper at rest', weights: WHITE, D: 1, ...ON, thermal: true },
  { name: 'foliage at rest', weights: FOLIAGE, D: 1, ...ON, thermal: true },
  { name: 'foliage approaching D=2', weights: FOLIAGE, D: 2, ...ON, thermal: true },
  { name: 'red receding D=0.5', weights: RED, D: 0.5, ...ON, thermal: true },
  { name: 'white D=4', weights: WHITE, D: 4, ...ON, thermal: true },
  { name: 'white D=0.25', weights: WHITE, D: 0.25, ...ON, thermal: true },
  { name: 'white D=0.05 (log2 S clamped at −4)', weights: WHITE, D: 0.05, ...ON, thermal: false },
  { name: 'white D=20 (log2 S clamped at +4)', weights: WHITE, D: 20, ...ON, thermal: false },
  { name: 'doppler only D=3', weights: FOLIAGE, D: 3, doppler: true, searchlight: false, thermal: true },
  { name: 'searchlight only D=3', weights: FOLIAGE, D: 3, doppler: false, searchlight: true, thermal: true },
  { name: 'neither effect D=3', weights: FOLIAGE, D: 3, doppler: false, searchlight: false, thermal: true },
  { name: 'UV+IR only, blue-shifted D=3', weights: UV_IR, D: 3, ...ON, thermal: false },
  { name: 'UV+IR only, red-shifted D=0.4', weights: UV_IR, D: 0.4, ...ON, thermal: false },
  { name: 'sky bands D=1.5', weights: Array.from(skyBands()), D: 1.5, ...ON, thermal: false },
  { name: '290 K thermal glow at D=6', weights: NONE, D: 6, ...ON, thermal: true },
  { name: 'fireball at rest', weights: NONE, D: 1, ...ON, thermal: false, emitT: FIREBALL_T, emitScale: EMIT_FIREBALL },
  { name: 'fireball receding D=0.3', weights: NONE, D: 0.3, ...ON, thermal: true, emitT: FIREBALL_T, emitScale: EMIT_FIREBALL },
  { name: 'fireball approaching D=2.5', weights: WHITE, D: 2.5, ...ON, thermal: true, emitT: FIREBALL_T, emitScale: EMIT_FIREBALL },
  { name: 'fireball beyond LUT T range (D=12 → 1.2e5 K)', weights: WHITE, D: 12, ...ON, thermal: false, emitT: FIREBALL_T, emitScale: EMIT_FIREBALL },
  { name: 'burst particle D=1.2, doppler only', weights: NONE, D: 1.2, doppler: true, searchlight: false, thermal: false, emitT: BURST_T, emitScale: EMIT_BURST },
  { name: 'very bright white at D=4 clamps blue at 6e4', weights: WHITE.map((w) => w * 1500), D: 4, ...ON, thermal: false },
].map((c) => ({ emitT: 0, emitScale: 0, ...c, weights: Array.from(c.weights, Math.fround), D: Math.fround(c.D) }))

// shadeColour's arithmetic in double on the float32 LUT data: separates the shader's own arithmetic (compared
// tightly) from the LUT resolution (compared with colourReference at the looser tolerance below).
function lutShade(lut, c) {
  const lerp = (data, x, row) => {
    const xc = Math.min(Math.max(x, 0), LUT_SIZE - 1)
    const x0 = Math.floor(xc)
    const x1 = Math.min(x0 + 1, LUT_SIZE - 1)
    const f = xc - x0
    const at = (j) => data.subarray((row * LUT_SIZE + j) * 4, (row * LUT_SIZE + j) * 4 + 3)
    return [0, 1, 2].map((k) => at(x0)[k] * (1 - f) + at(x1)[k] * f)
  }
  const bb = (T) => {
    const x = ((Math.log2(T) - LOG2T_MIN) / (LOG2T_MAX - LOG2T_MIN)) * (LUT_SIZE - 1)
    return x < 0 || x > LUT_SIZE - 1 ? [0, 0, 0] : lerp(lut.bb, x, 0)
  }
  const S = c.doppler ? c.D : 1
  const A = (c.searchlight ? c.D ** 4 : 1) * S
  const xb = ((Math.min(Math.max(Math.log2(S), LOG2S_MIN), LOG2S_MAX) - LOG2S_MIN) / (LOG2S_MAX - LOG2S_MIN)) * (LUT_SIZE - 1)
  const xyz = [0, 0, 0]
  const acc = (k, v) => v.forEach((x, j) => { xyz[j] += k * x })
  c.weights.forEach((w, i) => { if (w !== 0) acc(w, lerp(lut.band, xb, i)) })
  if (c.thermal) acc(THERMAL_EPS * S ** -5, bb(THERMAL_T * S))
  if (c.emitT > 0) acc(c.emitScale * S ** -5, bb(c.emitT * S))
  return xyzToLinearSrgb(xyz.map((v) => v * A))
}

const clampRgb = (rgb) => rgb.map((v) => Math.min(v, 6e4))
// Error of a vs b as a fraction of b's largest component, with an absolute floor of 1e-6 (white paper has
// Y = 1, so 1e-6 is orders of magnitude below one display code value at any exposure the game reaches).
const relErr = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k]))) / Math.max(1e-6, ...b.map(Math.abs))

describe('common.wgsl shadeColour() parity with colourReference.js', () => {
  const results = (async () => {
    const device = await getDevice()
    const lut = lutTextures(device)
    const group0 = (flags) => [
      { binding: 0, resource: uniform(device, packFrame({ flags, thermalT: THERMAL_T, thermalEps: THERMAL_EPS })) },
      { binding: 3, resource: lut.band.createView() },
      { binding: 4, resource: lut.bb.createView() },
    ]
    // shadeColour reads the doppler/searchlight flags from the Frame uniform: one dispatch per case.
    const gpu = []
    for (const c of CASES) {
      const data = new Float32Array([...c.weights, c.D, c.emitT, c.emitScale, c.thermal ? 1 : 0])
      const out = await runCompute({ code, group0: group0(c), inputs: [data], outBytes: 16, count: 1 })
      gpu.push(Array.from(new Float32Array(out).subarray(0, 3)))
    }
    return { gpu, lut: lut.data }
  })()

  for (const [i, c] of CASES.entries()) {
    it(c.name, async () => {
      const { gpu, lut } = await results
      const ref = clampRgb(shade({ ...c, weights: c.weights }))
      const emu = clampRgb(lutShade(lut, c))
      const eShader = relErr(gpu[i], emu)
      const eRef = relErr(gpu[i], ref)
      console.log(`${c.name}: gpu ${gpu[i].map((v) => v.toPrecision(6))} vs LUT-emulation ${eShader.toExponential(2)}, vs reference ${eRef.toExponential(2)}`)
      // Shader arithmetic (float32) vs the same LUT path in double.
      expect(eShader).toBeLessThan(1e-4)
      // End to end vs the exact spectral reference. The gap is the LUTs' linear interpolation: the band LUT
      // is smooth in log2 S (measured ≤ 6e-5), but the blackbody LUT steps Δlog2T ≈ 0.0097 through a Wien
      // tail e^(−x), x = hc/λkT, whose lerp error is ≈ (ln2·Δlog2T·x)²/8 — ~1e-3 at 1700 K in the blue,
      // growing as T falls. Measured worst here: 9e-4 (290 K glow blue-shifted to 1740 K). Cooler emission
      // is too dim to matter against the 1e-6 absolute floor or any lit surface.
      expect(eRef).toBeLessThan(2e-3)
    })
  }

  it('covers the 6e4 clamp and the out-of-range blackbody', async () => {
    const { gpu } = await results
    expect(Math.max(...gpu[CASES.findIndex((c) => c.name.includes('6e4'))])).toBe(6e4) // blue only; R and G are compared above
    // 1.2e5 K is past the LUT: the emitter contributes nothing, leaving only (fully shifted-out) reflection.
    expect(Math.max(...gpu[CASES.findIndex((c) => c.name.includes('beyond'))].map(Math.abs))).toBeLessThan(1e-6)
  })
})
