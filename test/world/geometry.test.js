import { describe, expect, it } from 'vitest'
import { MeshBuilder, lathe, maxEdgeLength, mergeSpecs, sphere, stitch } from '../../src/world/geometry.js'
import { expectConsistent } from './helpers.js'

// Each undirected edge used by exactly two triangles, in opposite directions.
function expectClosed(spec) {
  const edges = new Map()
  const ix = spec.indices
  for (let t = 0; t < ix.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = `${ix[t + e]},${ix[t + ((e + 1) % 3)]}`
      edges.set(k, (edges.get(k) ?? 0) + 1)
    }
  }
  for (const [k, c] of edges) {
    const [a, b] = k.split(',')
    expect(c).toBe(1)
    expect(edges.get(`${b},${a}`)).toBe(1)
  }
}

// Face normals point away from `centre`.
function expectOutward(spec, centre) {
  const p = spec.positions
  const ix = spec.indices
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [3 * ix[t], 3 * ix[t + 1], 3 * ix[t + 2]]
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const m = [0, 1, 2].map((k) => (p[a + k] + p[b + k] + p[c + k]) / 3 - centre[k])
    expect(f[0] * m[0] + f[1] * m[1] + f[2] * m[2]).toBeGreaterThan(0)
  }
}

describe('geometry', () => {
  it('sphere respects the max edge, is closed and wound outward', () => {
    for (const [r, e] of [[0.3, 0.25], [1.5, 0.25], [0.8, 0.1]]) {
      const s = sphere(r, e, { center: [1, 2, 3] })
      expectConsistent(expect, s)
      expect(maxEdgeLength(s)).toBeLessThanOrEqual(e)
      expectClosed(s)
      expectOutward(s, [1, 2, 3])
    }
  })

  it('lumpy sphere still respects the max edge', () => {
    const s = sphere(1.2, 0.25, { radiusAt: (x, y, z) => 1 + 0.15 * Math.sin(5 * x) * Math.cos(4 * z), squashY: 0.7 })
    expect(maxEdgeLength(s)).toBeLessThanOrEqual(0.25)
    expectClosed(s)
  })

  it('lathe cone and cylinder respect the max edge and face outward', () => {
    const cone = lathe([[0, 0], [1.5, 0], [0, 2]], 0.25)
    expect(maxEdgeLength(cone)).toBeLessThanOrEqual(0.25)
    expectOutward(cone, [0, 0.5, 0])
    const cyl = lathe([[0.2, 0], [0.2, 2]], 0.1)
    expect(maxEdgeLength(cyl)).toBeLessThanOrEqual(0.1)
    expectOutward(cyl, [0, 1, 0])
  })

  it('stitch closes a band between rings of any counts', () => {
    for (const [na, nb] of [[5, 5], [7, 12], [12, 7], [1, 9], [9, 1]]) {
      const b = new MeshBuilder()
      const ring = (n, y, off) => Array.from({ length: n }, (_, i) => {
        const a = (i + off) / n
        return { i: b.vertex(Math.cos(2 * Math.PI * a), y, Math.sin(2 * Math.PI * a), Math.cos(2 * Math.PI * a), 0, Math.sin(2 * Math.PI * a)), a }
      })
      stitch(b, ring(na, 0, 0), ring(nb, 1, 0.5))
      const spec = b.toSpec()
      expect(spec.indices.length / 3).toBe(na === 1 || nb === 1 ? Math.max(na, nb) : na + nb)
    }
  })

  it('mergeSpecs concatenates attributes and offsets indices', () => {
    const a = sphere(1, 0.5)
    const b = sphere(1, 0.5, { particle: 3, emit: 100 })
    const m = mergeSpecs([a, b])
    expectConsistent(expect, m)
    const na = a.emitTemp.length
    expect(m.emitTemp.length).toBe(na + b.emitTemp.length)
    expect(m.indices[a.indices.length]).toBe(b.indices[0] + na)
    expect(m.particle[na]).toBe(3)
    expect(m.emitTemp[na]).toBe(100)
  })
})
