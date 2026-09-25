import { describe, expect, it } from 'vitest'
import {
  BURST_TEMP,
  BALLOON_RADIUS, BURST_PARTICLES, FIREBALL_TEMP, TARGET_HEIGHT, makeBurstGeometry, makeFireballGeometry, placeTargets,
} from '../../src/world/targets.js'
import { BALLOON_COLOURS } from '../../src/world/palette.js'
import { expectConsistent, lightIsland, longestEdge, stubBands } from './helpers.js'

describe('targets', () => {
  it('constraints hold for 50 seeds', () => {
    for (let seed = 100; seed < 150; seed++) {
      const isl = lightIsland(seed)
      const ts = placeTargets(seed, isl, 12, 'low', { bandsFor: stubBands })
      expect(ts.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `t${i}`))
      for (const [i, t] of ts.entries()) {
        const [x, y, z] = t.pos
        const h = isl.heightAt(x, z)
        const r = Math.hypot(x, z)
        expect(h).toBeGreaterThan(1)
        expect(y).toBeCloseTo(h + TARGET_HEIGHT, 12)
        expect(r).toBeGreaterThanOrEqual(20)
        expect(r).toBeLessThanOrEqual(80)
        expect(t.radius).toBe(1)
        expect(t.visualRadius).toBe(0.8)
        expect(t.colour).toBe(BALLOON_COLOURS[i % 3])
        for (let j = 0; j < i; j++) expect(Math.hypot(x - ts[j].pos[0], z - ts[j].pos[2])).toBeGreaterThanOrEqual(15)
      }
    }
  })

  it('geometry: balloon centred on the origin, stick down to the ground, shared per colour', () => {
    const ts = placeTargets(3, lightIsland(3), 12, 'low', { bandsFor: stubBands })
    const g = ts[0].geometry
    expectConsistent(expect, g)
    expect(ts[3].geometry).toBe(g)
    expect(ts[1].geometry).not.toBe(g)
    let minY = Infinity, maxY = -Infinity, maxR = 0
    for (let k = 0; k < g.positions.length; k += 3) {
      minY = Math.min(minY, g.positions[k + 1])
      maxY = Math.max(maxY, g.positions[k + 1])
      maxR = Math.max(maxR, Math.hypot(g.positions[k], g.positions[k + 1], g.positions[k + 2]))
    }
    expect(maxY).toBeCloseTo(BALLOON_RADIUS, 6)
    expect(minY).toBeLessThanOrEqual(-TARGET_HEIGHT)
    expect(longestEdge(g)).toBeLessThanOrEqual(0.25)
    for (const v of g.emitTemp) expect(v).toBe(0)
  })

  it('fireball: r 0.3, emitting, zero bands', () => {
    const f = makeFireballGeometry('low')
    expectConsistent(expect, f)
    for (let k = 0; k < f.positions.length; k += 3) expect(Math.hypot(f.positions[k], f.positions[k + 1], f.positions[k + 2])).toBeCloseTo(0.3, 6)
    expect(f.emitTemp.every((t) => t === FIREBALL_TEMP)).toBe(true)
    for (const k of ['bands0', 'bands1', 'bands2']) expect(f[k].every((b) => b === 0)).toBe(true)
  })

  it('burst: 16 particles at the origin, tagged 0–15', () => {
    for (const q of ['low', 'high']) {
      const b = makeBurstGeometry(q)
      expectConsistent(expect, b)
      expect(b.emitTemp.every((t) => t === BURST_TEMP)).toBe(true)
      expect(new Set(b.particle).size).toBe(BURST_PARTICLES)
      expect(Math.max(...b.particle)).toBe(15)
      for (let k = 0; k < b.positions.length; k += 3) expect(Math.hypot(b.positions[k], b.positions[k + 1], b.positions[k + 2])).toBeCloseTo(0.12, 6)
      // Every triangle belongs to one particle.
      for (let t = 0; t < b.indices.length; t += 3) {
        expect(b.particle[b.indices[t]]).toBe(b.particle[b.indices[t + 1]])
        expect(b.particle[b.indices[t]]).toBe(b.particle[b.indices[t + 2]])
      }
      expect(longestEdge(b)).toBeLessThanOrEqual(q === 'low' ? 0.25 : 0.1)
    }
  })
})
