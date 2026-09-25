import { buildIsland, heightField } from '../../src/world/island.js'
import { placePropSites } from '../../src/world/props.js'

const islands = new Map()

// Stub palette → bands, so these tests don't depend on src/spectral (tested on its own).
const NAMES = ['grass', 'sand', 'rock', 'water', 'trunk', 'canopy', 'cherry', 'balloonRed', 'balloonYellow', 'balloonBlue', 'stick']
export const stubBands = (name) => new Float32Array(12).fill((NAMES.indexOf(name) + 1) / 16)

// Cached island builds shared across tests (building is the slow part).
export function island(seed, quality = 'low') {
  const key = `${seed}:${quality}`
  if (!islands.has(key)) islands.set(key, buildIsland(seed, quality, { bandsFor: stubBands }))
  return islands.get(key)
}

// Height field plus prop sites, without meshes: enough for target placement.
export function lightIsland(seed) {
  const field = heightField(seed)
  return { ...field, quality: 'low', propSites: placePropSites(seed, field) }
}

export const SPEC_KEYS = ['positions', 'normals', 'indices', 'bands0', 'bands1', 'bands2', 'emitTemp', 'particle']

export function expectConsistent(expect, spec) {
  const n = spec.emitTemp.length
  expect(n).toBeGreaterThan(0)
  expect(spec.positions).toBeInstanceOf(Float32Array)
  expect(spec.indices).toBeInstanceOf(Uint32Array)
  expect(spec.particle).toBeInstanceOf(Uint32Array)
  expect(spec.positions.length).toBe(3 * n)
  expect(spec.normals.length).toBe(3 * n)
  for (const k of ['bands0', 'bands1', 'bands2']) expect(spec[k].length).toBe(4 * n)
  expect(spec.particle.length).toBe(n)
  expect(spec.indices.length % 3).toBe(0)
  let maxIndex = 0
  for (const i of spec.indices) maxIndex = Math.max(maxIndex, i)
  expect(maxIndex).toBeLessThan(n)
  let finite = true
  for (const v of spec.positions) finite &&= Number.isFinite(v)
  for (const v of spec.normals) finite &&= Number.isFinite(v)
  expect(finite).toBe(true)
}

export const bytesOf = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)

// Horizontal (xz) or full 3-D longest edge over triangles passing `filter`.
export function longestEdge(spec, { xz = false, filter = null } = {}) {
  const p = spec.positions
  const ix = spec.indices
  let m = 0
  const d2 = (a, b) => (p[3 * a] - p[3 * b]) ** 2 + (xz ? 0 : (p[3 * a + 1] - p[3 * b + 1]) ** 2) + (p[3 * a + 2] - p[3 * b + 2]) ** 2
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]
    if (filter && !filter(a, b, c)) continue
    m = Math.max(m, d2(a, b), d2(b, c), d2(c, a))
  }
  return Math.sqrt(m)
}
