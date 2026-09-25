import { vec3 } from '../math/vec3.js'
import { MeshBuilder, qualityOf, stitch } from './geometry.js'
import { fbm, noise2D } from './noise.js'
import { BALLOON_COLOURS, materialBands } from './palette.js'
import { buildProps, placePropSites } from './props.js'
import { placeTargetSites } from './targets.js'

// Bump whenever any output for a given seed would change.
export const GENERATOR_VERSION = 1

export const R = 90
export const SHORE_RADIUS = 85
export const TERRAIN_HALF = 120 // terrain square is 240 m
export const TERRAIN_KEEP = R + 10
export const WATER_INNER = R - 10
export const WATER_FINE = 100 // water max-edge guarantee holds for r < WATER_FINE
export const WATER_OUTER = 400
export const NORMAL_EPS = 0.1

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
const clamp01 = (x) => Math.min(1, Math.max(0, x))

// Height field, normals and material rule; no meshes. Shared by buildIsland and shapeHash.
export function heightField(seed) {
  const noise = noise2D(seed)
  const heightAt = (x, z) => {
    const m = smoothstep(R, 0.55 * R, Math.sqrt(x * x + z * z))
    if (m === 0) return -2
    return m * (5 * fbm(noise, x / 70, z / 70) + 3) - (1 - m) * 2
  }
  const normalAt = (x, z) => {
    const dx = (heightAt(x + NORMAL_EPS, z) - heightAt(x - NORMAL_EPS, z)) / (2 * NORMAL_EPS)
    const dz = (heightAt(x, z + NORMAL_EPS) - heightAt(x, z - NORMAL_EPS)) / (2 * NORMAL_EPS)
    const l = Math.sqrt(dx * dx + 1 + dz * dz)
    return vec3(-dx / l, 1 / l, -dz / l)
  }
  const materialFrom = (h, ny) => (h < 0 ? 'water' : h < 1 ? 'sand' : 1 - ny > 0.35 ? 'rock' : 'grass')
  const materialAt = (x, z) => {
    const h = heightAt(x, z)
    return h < 1 ? materialFrom(h, 1) : materialFrom(h, normalAt(x, z).y)
  }
  return { seed, R, SHORE_RADIUS, heightAt, normalAt, materialAt }
}

// Island {heightAt, normalAt, materialAt, SHORE_RADIUS, R, terrain, water, props, propSites, ...}.
// opts.bandsFor(name) → 12 band albedos (defaults to the palette via spectral).
export function buildIsland(seed, quality = 'high', { bandsFor = materialBands } = {}) {
  const q = qualityOf(quality)
  const field = heightField(seed)
  const propSites = placePropSites(seed, field)
  return {
    ...field,
    quality,
    propSites,
    terrain: buildTerrain(field, q.terrainSpacing, bandsFor),
    water: buildWater(q.waterEdge, bandsFor),
    props: buildProps(seed, propSites, q.propEdge, bandsFor),
  }
}

// Square grid, alternating diagonals; triangles entirely beyond TERRAIN_KEEP are dropped.
// Bands: sand→grass lerped over h ∈ [0.75, 1.25], rock over slope ∈ [0.325, 0.375] (land only).
function buildTerrain(field, spacing, bandsFor) {
  const n = Math.round((2 * TERRAIN_HALF) / spacing) + 1
  const coord = (i) => -TERRAIN_HALF + i * spacing
  const far = (i, j) => coord(i) ** 2 + coord(j) ** 2 > TERRAIN_KEEP ** 2
  const quads = []
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      if (far(i, j) && far(i + 1, j) && far(i, j + 1) && far(i + 1, j + 1)) continue
      quads.push(i, j)
    }
  }
  const sand = bandsFor('sand'), grass = bandsFor('grass'), rock = bandsFor('rock')
  const b = new MeshBuilder()
  const index = new Int32Array(n * n).fill(-1)
  const band = new Float32Array(12)
  const vert = (i, j) => {
    const k = j * n + i
    if (index[k] >= 0) return index[k]
    const x = coord(i), z = coord(j)
    const h = field.heightAt(x, z)
    const nm = field.normalAt(x, z)
    const g = clamp01((h - 0.75) / 0.5)
    const rk = g * clamp01((1 - nm.y - 0.325) / 0.05)
    for (let c = 0; c < 12; c++) band[c] = ((1 - g) * sand[c] + g * grass[c]) * (1 - rk) + rock[c] * rk
    index[k] = b.vertex(x, h, z, nm.x, nm.y, nm.z, band)
    return index[k]
  }
  for (let k = 0; k < quads.length; k += 2) {
    const i = quads[k], j = quads[k + 1]
    const a = vert(i, j), bb = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1)
    if ((i + j) % 2 === 0) {
      b.tri(a, bb, d)
      b.tri(a, d, c)
    } else {
      b.tri(a, bb, c)
      b.tri(bb, d, c)
    }
  }
  return b.toSpec()
}

// Flat polar grid at y = 0 from WATER_INNER to WATER_OUTER. Staggered rings of equal count with
// chord ≤ 0.98e and spacing 0.85e out to WATER_FINE (all edges ≤ e there), then ring spacing grows
// ×1.06 per ring and the count relaxes toward square cells (at least 512 per ring).
function buildWater(e, bandsFor) {
  const bands = bandsFor('water')
  let nFine = 3
  while (2 * WATER_FINE * Math.sin(Math.PI / nFine) > 0.98 * e) nFine++
  const h0 = 0.85 * e
  const rings = []
  let r = WATER_INNER
  for (; r < WATER_FINE; r += h0) rings.push([r, nFine])
  rings.push([r, nFine])
  let s = h0
  while (r < WATER_OUTER) {
    s *= 1.06
    r = Math.min(WATER_OUTER, r + s)
    rings.push([r, Math.min(nFine, Math.max(512, Math.ceil((2 * Math.PI * r) / (1.15 * s))))])
  }
  const b = new MeshBuilder()
  let prev = null
  rings.forEach(([rr, count], k) => {
    const off = (k % 2) * 0.5
    const ring = []
    for (let i = 0; i < count; i++) {
      const a = (i + off) / count
      const t = a * 2 * Math.PI
      ring.push({ i: b.vertex(rr * Math.cos(t), 0, rr * Math.sin(t), 0, 1, 0, bands), a })
    }
    if (prev) stitch(b, prev, ring)
    prev = ring
  })
  return b.toSpec()
}

// FNV-1a (32-bit) over the float64 bytes of: GENERATOR_VERSION, heightAt on a 64×64 grid over
// the terrain square, every prop transform and every target spec. Independent of quality.
export function shapeHash(seed) {
  const field = heightField(seed)
  const propSites = placePropSites(seed, field)
  const targets = placeTargetSites(seed, { ...field, propSites }, 12)
  const vals = [GENERATOR_VERSION]
  for (let j = 0; j < 64; j++) {
    for (let i = 0; i < 64; i++) vals.push(field.heightAt(-TERRAIN_HALF + (i * 2 * TERRAIN_HALF) / 63, -TERRAIN_HALF + (j * 2 * TERRAIN_HALF) / 63))
  }
  const kinds = ['round', 'pine', 'cherry', 'rock']
  for (const p of propSites) vals.push(kinds.indexOf(p.kind), p.x, p.y, p.z, p.yaw, p.scale, p.squash, ...p.lump)
  for (const t of targets) vals.push(...t.pos, 1.0, BALLOON_COLOURS.indexOf(t.colour))
  const bytes = new Uint8Array(Float64Array.from(vals).buffer)
  let hash = 0x811c9dc5
  for (let k = 0; k < bytes.length; k++) hash = Math.imul(hash ^ bytes[k], 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
