import { describe, expect, it } from 'vitest'
import { BALLOON_COLOURS, PALETTE, materialBands } from '../../src/world/palette.js'

describe('palette', () => {
  it('has every material from the spec', () => {
    for (const k of ['grass', 'sand', 'rock', 'water', 'trunk', 'canopy', 'cherry', 'stick', 'seaHaze', ...BALLOON_COLOURS]) {
      expect(PALETTE[k].rgb).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(PALETTE.grass.ir).toBe(0.9)
    expect(PALETTE.water.ir).toBe(0.02)
  })

  it('materialBands gives 12 non-negative bands through spectral and caches', () => {
    const b = materialBands('grass')
    expect(b).toHaveLength(12)
    for (const v of b) expect(v).toBeGreaterThanOrEqual(0)
    expect(b[10]).toBeGreaterThan(materialBands('water')[10]) // leaves reflect near-IR, water absorbs it
    expect(materialBands('grass')).toBe(b)
    expect(() => materialBands('nope')).toThrow()
  })
})
