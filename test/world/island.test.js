import { describe, expect, it } from 'vitest'
import { GENERATOR_VERSION, R, SHORE_RADIUS, buildIsland, heightField, shapeHash } from '../../src/world/island.js'
import { PROP_SPACING, ROCK_COUNT, SPAWN_CLEAR, TREE_COUNT } from '../../src/world/props.js'
import { placeTargets } from '../../src/world/targets.js'
import { SPEC_KEYS, bytesOf, expectConsistent, island, longestEdge, stubBands } from './helpers.js'

const MESHES = ['terrain', 'water', 'props']
const count = (s) => s.emitTemp.length

describe('island', () => {
  it('exports the interface', () => {
    const isl = island(1)
    expect(GENERATOR_VERSION).toBe(1)
    expect(isl.SHORE_RADIUS).toBe(SHORE_RADIUS)
    expect(SHORE_RADIUS).toBe(85)
    expect(isl.R).toBe(R)
    for (const k of ['heightAt', 'normalAt', 'materialAt']) expect(typeof isl[k]).toBe('function')
  })

  it('same seed gives byte-identical geometry and targets', () => {
    const a = island(7)
    const b = buildIsland(7, 'low', { bandsFor: stubBands })
    for (const m of MESHES) for (const k of SPEC_KEYS) expect(bytesOf(a[m][k]).equals(bytesOf(b[m][k]))).toBe(true)
    const ta = placeTargets(7, a, 12, undefined, { bandsFor: stubBands })
    const tb = placeTargets(7, b, 12, undefined, { bandsFor: stubBands })
    expect(ta.map((t) => t.pos)).toEqual(tb.map((t) => t.pos))
    for (const k of SPEC_KEYS) expect(bytesOf(ta[0].geometry[k]).equals(bytesOf(tb[0].geometry[k]))).toBe(true)
  })

  it('different seeds give different outputs', () => {
    const a = island(1)
    const b = island(2)
    expect(bytesOf(a.terrain.positions).equals(bytesOf(b.terrain.positions))).toBe(false)
    expect(bytesOf(a.props.positions).equals(bytesOf(b.props.positions))).toBe(false)
    expect(placeTargets(1, a, 12, undefined, { bandsFor: stubBands })[0].pos).not.toEqual(placeTargets(2, b, 12, undefined, { bandsFor: stubBands })[0].pos)
  })

  it('shapeHash is stable, seed-dependent and hex', () => {
    expect(shapeHash(1)).toBe(shapeHash(1))
    expect(shapeHash(1)).toMatch(/^[0-9a-f]{8}$/)
    const hashes = new Set([1, 2, 3, 4, 5].map(shapeHash))
    expect(hashes.size).toBe(5)
  })

  it('heightAt is negative beyond R and positive at spawn', () => {
    for (let seed = 0; seed < 20; seed++) {
      const f = heightField(seed)
      expect(f.heightAt(0, 0)).toBeGreaterThan(0)
      for (let k = 0; k < 360; k++) {
        const a = (k / 360) * 2 * Math.PI
        for (const r of [R + 1e-6, R + 0.5, 95, 120, 300]) expect(f.heightAt(r * Math.cos(a), r * Math.sin(a))).toBeLessThan(0)
      }
    }
  })

  it('materialAt follows the rule', () => {
    const f = heightField(3)
    const seen = new Set()
    for (let i = 0; i < 4000; i++) {
      const x = ((i * 37) % 200) - 100, z = ((i * 53) % 200) - 100 + (i % 7) * 0.13
      const h = f.heightAt(x, z)
      const m = f.materialAt(x, z)
      seen.add(m)
      const want = h < 0 ? 'water' : h < 1 ? 'sand' : 1 - f.normalAt(x, z).y > 0.35 ? 'rock' : 'grass'
      expect(m).toBe(want)
    }
    for (const m of ['water', 'sand', 'grass']) expect(seen.has(m)).toBe(true)
  })

  it('normalAt is unit length and up at sea', () => {
    const f = heightField(4)
    const n = f.normalAt(10, -20)
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 12)
    expect(f.normalAt(200, 0)).toEqual({ x: -0, y: 1, z: -0 })
  })

  it('attribute lengths agree with vertex counts', () => {
    const isl = island(1)
    for (const m of MESHES) expectConsistent(expect, isl[m])
    for (const t of placeTargets(1, isl, 12, undefined, { bandsFor: stubBands })) expectConsistent(expect, t.geometry)
  })

  it('low-quality edges stay within the limits', () => {
    const isl = island(1)
    expect(longestEdge(isl.terrain, { xz: true })).toBeLessThanOrEqual(1.14)
    expect(longestEdge(isl.props)).toBeLessThanOrEqual(0.25)
    const p = isl.water.positions
    const near = (i) => Math.hypot(p[3 * i], p[3 * i + 2]) < 100
    expect(longestEdge(isl.water, { filter: (a, b, c) => near(a) || near(b) || near(c) })).toBeLessThanOrEqual(0.4)
    for (const t of placeTargets(1, isl, 12, undefined, { bandsFor: stubBands })) expect(longestEdge(t.geometry)).toBeLessThanOrEqual(0.25)
  })

  it('terrain covers the island and drops far corners', () => {
    const p = island(1).terrain.positions
    let maxR = 0
    for (let k = 0; k < p.length; k += 3) maxR = Math.max(maxR, Math.hypot(p[k], p[k + 2]))
    expect(maxR).toBeGreaterThan(R + 10)
    expect(maxR).toBeLessThan(R + 12)
  })

  it('props: counts, spacing, spawn clearance, on grass', () => {
    for (const seed of [1, 2, 3]) {
      const sites = island(seed).propSites
      const f = heightField(seed)
      expect(sites.filter((s) => s.kind === 'rock').length).toBe(ROCK_COUNT)
      expect(sites.filter((s) => s.kind !== 'rock').length).toBe(TREE_COUNT)
      for (const kind of ['round', 'pine', 'cherry']) expect(sites.some((s) => s.kind === kind)).toBe(true)
      for (const [i, s] of sites.entries()) {
        expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(SPAWN_CLEAR)
        expect(f.materialAt(s.x, s.z)).toBe('grass')
        expect(s.y).toBe(f.heightAt(s.x, s.z))
        for (let j = 0; j < i; j++) expect(Math.hypot(s.x - sites[j].x, s.z - sites[j].z)).toBeGreaterThanOrEqual(PROP_SPACING)
      }
    }
  })

  it('bandsFor is injectable', () => {
    const stub = (name) => new Float32Array(12).fill(name === 'water' ? 0.5 : 0.25)
    const isl = buildIsland(1, 'low', { bandsFor: stub })
    expect(isl.water.bands0[0]).toBe(0.5)
    expect(isl.props.bands2[3]).toBe(0.25)
    expect(bytesOf(isl.terrain.positions).equals(bytesOf(island(1).terrain.positions))).toBe(true)
  })

  it('high quality: same shapes, finer mesh, within budget', () => {
    const lo = island(5, 'low')
    const t0 = performance.now()
    const hi = buildIsland(5, 'high', { bandsFor: stubBands })
    const ms = performance.now() - t0
    expect(hi.propSites).toEqual(lo.propSites)
    const tlo = placeTargets(5, lo, 12, undefined, { bandsFor: stubBands })
    const thi = placeTargets(5, hi, 12, undefined, { bandsFor: stubBands })
    expect(thi.map((t) => t.pos)).toEqual(tlo.map((t) => t.pos))
    for (const m of MESHES) expectConsistent(expect, hi[m])
    expect(longestEdge(hi.terrain, { xz: true })).toBeLessThanOrEqual(0.25 * Math.SQRT2 + 1e-6)
    expect(longestEdge(hi.props)).toBeLessThanOrEqual(0.1)
    const p = hi.water.positions
    const near = (i) => Math.hypot(p[3 * i], p[3 * i + 2]) < 100
    expect(longestEdge(hi.water, { filter: (a, b, c) => near(a) || near(b) || near(c) })).toBeLessThanOrEqual(0.15)
    for (const t of thi) expect(longestEdge(t.geometry)).toBeLessThanOrEqual(0.1)
    const total = MESHES.reduce((a, m) => a + count(hi[m]), 0) + thi.reduce((a, t) => a + count(t.geometry), 0)
    expect(total).toBeLessThan(3e6)
    expect(total).toBeGreaterThan(count(lo.terrain) * 10)
    expect(ms).toBeLessThan(10000)
  }, 30000)
})
