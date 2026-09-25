import { describe, it, expect } from 'vitest'
import { xyzBar } from '../../src/spectral/cmf.js'

describe('xyzBar (Wyman–Sloan–Shirley 2013)', () => {
  it('ȳ(555) ≈ 1 within 2%', () => {
    expect(Math.abs(xyzBar(555)[1] - 1)).toBeLessThan(0.02)
  })

  it('x̄ has two lobes, peaking near 442 and 599 nm', () => {
    const peaks = []
    for (let l = 361; l < 830; l++) {
      const [a, b, c] = [xyzBar(l - 1)[0], xyzBar(l)[0], xyzBar(l + 1)[0]]
      if (b > a && b >= c) peaks.push(l)
    }
    expect(peaks).toHaveLength(2)
    expect(Math.abs(peaks[0] - 442)).toBeLessThanOrEqual(3)
    expect(Math.abs(peaks[1] - 599)).toBeLessThanOrEqual(3)
  })

  it('matches tabulated CIE 1931 values to within a few percent of peak', () => {
    // CIE 1931 2° table: [λ, x̄, ȳ, z̄]
    const table = [
      [450, 0.3362, 0.038, 1.7721],
      [500, 0.0049, 0.323, 0.272],
      [550, 0.4334499, 0.995, 0.0087499],
      [600, 1.0622, 0.631, 0.0008],
      [650, 0.2835, 0.107, 0.0],
    ]
    for (const [l, ...ref] of table) {
      const v = xyzBar(l)
      for (let c = 0; c < 3; c++) expect(Math.abs(v[c] - ref[c])).toBeLessThan(0.05)
    }
  })
})
