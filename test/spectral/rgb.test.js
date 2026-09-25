import { UV_BANDS, IR_BANDS } from '../../src/spectral/bands.js'
import { describe, it, expect } from 'vitest'
import { bandsToLinearRgb, rgbToBands } from '../../src/spectral/rgb.js'
import { srgbToLinear } from '../../src/spectral/lut.js'
import { deltaE2000, linearSrgbToLab } from './deltaE.js'

const PALETTE = [
  '#8fd16a', '#f2dca0', '#a9a3b8', '#5fb3d9', '#9b6b4a', '#7fcf8a',
  '#f7a8c4', '#ff6b6b', '#ffd93d', '#4d96ff', '#f5f5f5', '#9fc4d8',
]
const hexToLinear = (h) => [1, 3, 5].map((k) => srgbToLinear(parseInt(h.slice(k, k + 2), 16) / 255))

describe('rgbToBands', () => {
  it('returns 12 non-negative bands with UV and IR set from the options', () => {
    const b = rgbToBands('#7fcf8a', { uv: 0.05, ir: 0.85 })
    expect(b).toBeInstanceOf(Float32Array)
    expect(b).toHaveLength(12)
    for (const v of b) expect(v).toBeGreaterThanOrEqual(0)
    for (const i of UV_BANDS) expect(b[i]).toBeCloseTo(0.05, 6)
    for (const i of IR_BANDS) expect(b[i]).toBeCloseTo(0.85, 6)
  })

  it('accepts [r, g, b] arrays in 0..1', () => {
    const a = rgbToBands('#ff8000', { uv: 0.1, ir: 0.3 })
    const b = rgbToBands([1, 128 / 255, 0], { uv: 0.1, ir: 0.3 })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it.each(PALETTE)('round trip %s has ΔE2000 < 3', (hex) => {
    for (const [uv, ir] of [[0, 0], [0.05, 0.85], [0.3, 0.6]]) {
      const got = bandsToLinearRgb(rgbToBands(hex, { uv, ir }))
      const dE = deltaE2000(linearSrgbToLab(hexToLinear(hex)), linearSrgbToLab(got))
      expect(dE).toBeLessThan(3)
    }
  })
})
