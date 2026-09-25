import { describe, it, expect } from 'vitest'
import { rgbToBands } from '../../src/spectral/rgb.js'
import { shade, shadeXYZObserved } from '../../src/spectral/colourReference.js'
import {
  EMIT_BURST, EMIT_FIREBALL, LUT_SIZE, SUN_DISK_SCALE, LOG2T_MAX, LOG2T_MIN,
  bandXYZ, buildBlackbodyLUT, skyBands,
} from '../../src/spectral/lut.js'

const ZERO = new Float32Array(12)
const WHITE = new Float32Array(12).fill(1)
const forwardD = (beta) => (1 + beta) / Math.sqrt(1 - beta * beta) // γ(1 + β)
const full = { doppler: true, searchlight: true } // A = D⁵
const Y = (args) => shadeXYZObserved({ ...full, ...args })[1]

describe('scale sanity (A = D⁵, forward)', () => {
  const sand = rgbToBands('#f2dca0', { uv: 0.3, ir: 0.6 })
  const reflected = (D) => Y({ albedoBands: sand, lit: 1, D, thermal: false })
  const thermal = (D) => Y({ albedoBands: ZERO, D, thermal: true })

  it('white paper at rest has Y = 1', () => {
    expect(Y({ albedoBands: WHITE, D: 1, thermal: false })).toBeCloseTo(1, 10)
  })

  it('290 K thermal at D = 1 has Y < 1e-20', () => {
    expect(thermal(1)).toBeLessThan(1e-20)
    expect(thermal(1)).toBeGreaterThan(0)
  })

  it('290 K thermal at D = 14 has Y between 2e3 and 2e4', () => {
    const y = thermal(14)
    expect(y).toBeGreaterThan(2e3)
    expect(y).toBeLessThan(2e4)
  })

  it('sand: reflected > thermal at β = 0.9, thermal > reflected at β = 0.96', () => {
    const d90 = forwardD(0.9), d96 = forwardD(0.96)
    expect(reflected(d90)).toBeGreaterThan(thermal(d90))
    expect(thermal(d96)).toBeGreaterThan(reflected(d96))
  })
})

// Shader-style bb(T): manual lerp of the float32 LUT in log2 T, zero outside range.
const bbLut = buildBlackbodyLUT()
function bbSample(T) {
  const l = Math.log2(T)
  if (l < LOG2T_MIN || l > LOG2T_MAX) return [0, 0, 0]
  const x = ((l - LOG2T_MIN) / (LOG2T_MAX - LOG2T_MIN)) * (LUT_SIZE - 1)
  const j = Math.min(Math.floor(x), LUT_SIZE - 2), f = x - j
  return [0, 1, 2].map((c) => bbLut[j * 4 + c] * (1 - f) + bbLut[(j + 1) * 4 + c] * f)
}

describe('stylised emitters hit their target Y within 1%', () => {
  it.each([
    ['fireball', EMIT_FIREBALL, 10000, 20],
    ['burst', EMIT_BURST, 6000, 6],
    ['sun disk', SUN_DISK_SCALE, 5778, 20],
  ])('%s', (_, scale, T, target) => {
    expect(Math.abs(scale * bbSample(T)[1] / target - 1)).toBeLessThan(0.01)
    const y = Y({ albedoBands: ZERO, D: 1, thermal: false, emitT: T, emitScale: scale })
    expect(Math.abs(y / target - 1)).toBeLessThan(0.01)
  })
})

describe('sky', () => {
  it('zenith sky has Y = 0.6 at rest, with the ozone-absorbed band 0 zero', () => {
    const sky = skyBands()
    expect(sky[0]).toBe(0)
    expect(sky[1]).toBeGreaterThan(0)
    let y = 0
    for (let i = 0; i < 12; i++) y += sky[i] * bandXYZ(i, 1)[1]
    expect(y).toBeCloseTo(0.6, 6)
  })
})

describe('foliage (criterion 6b)', () => {
  const canopy = rgbToBands('#7fcf8a', { uv: 0.05, ir: 0.85 })
  const control = rgbToBands('#7fcf8a', { uv: 0.05, ir: 0 })
  const red = (bands, D, flags) => shade({ albedoBands: bands, lit: 1, D, ...flags })[0]

  it.each([
    ['doppler + searchlight', { doppler: true, searchlight: true }],
    ['doppler only', { doppler: true, searchlight: false }],
  ])('%s: canopy gains red at D = 1.25, the IR-free control loses it', (_, flags) => {
    expect(red(canopy, 1.25, flags)).toBeGreaterThan(red(canopy, 1, flags))
    expect(red(control, 1.25, flags)).toBeLessThan(red(control, 1, flags))
  })
})
