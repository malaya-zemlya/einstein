import { describe, expect, it } from 'vitest'
import { fbm, mulberry32, noise2D, subSeed } from '../../src/world/noise.js'

describe('noise', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(mulberry32(43)()).not.toBe(mulberry32(42)())
  })

  it('subSeed separates streams', () => {
    expect(subSeed(7, 1)).not.toBe(subSeed(7, 2))
    expect(subSeed(7, 1)).toBe(subSeed(7, 1))
  })

  it('fbm is seeded, deterministic and bounded', () => {
    const n1 = noise2D(1)
    const n1b = noise2D(1)
    const n2 = noise2D(2)
    let differs = false
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 30, z = i * 0.11 + 5
      const v = fbm(n1, x, z)
      expect(v).toBe(fbm(n1b, x, z))
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      if (v !== fbm(n2, x, z)) differs = true
    }
    expect(differs).toBe(true)
  })
})
