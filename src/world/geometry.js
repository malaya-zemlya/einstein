// GeometrySpec construction: builder, primitives tessellated to a maximum edge, merging.
// GeometrySpec = {positions, normals, indices, bands0, bands1, bands2, emitTemp, particle}.

const ZERO_BANDS = new Float32Array(12)

export class MeshBuilder {
  constructor() {
    this.pos = []
    this.nrm = []
    this.bands = []
    this.temp = []
    this.part = []
    this.idx = []
  }

  get count() {
    return this.temp.length
  }

  // bands: 12 band albedos. Returns the vertex index.
  vertex(x, y, z, nx, ny, nz, bands = ZERO_BANDS, emit = 0, particle = 0) {
    this.pos.push(x, y, z)
    this.nrm.push(nx, ny, nz)
    for (let i = 0; i < 12; i++) this.bands.push(bands[i])
    this.temp.push(emit)
    this.part.push(particle)
    return this.temp.length - 1
  }

  // Triangle wound counter-clockwise seen from the side its vertex normals point to.
  tri(a, b, c) {
    const p = this.pos
    const n = this.nrm
    const ux = p[3 * b] - p[3 * a], uy = p[3 * b + 1] - p[3 * a + 1], uz = p[3 * b + 2] - p[3 * a + 2]
    const vx = p[3 * c] - p[3 * a], vy = p[3 * c + 1] - p[3 * a + 1], vz = p[3 * c + 2] - p[3 * a + 2]
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
    const s = fx * (n[3 * a] + n[3 * b] + n[3 * c]) + fy * (n[3 * a + 1] + n[3 * b + 1] + n[3 * c + 1]) +
      fz * (n[3 * a + 2] + n[3 * b + 2] + n[3 * c + 2])
    if (s < 0) this.idx.push(a, c, b)
    else this.idx.push(a, b, c)
  }

  toSpec() {
    const n = this.count
    const spec = {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      indices: Uint32Array.from(this.idx),
      bands0: new Float32Array(4 * n),
      bands1: new Float32Array(4 * n),
      bands2: new Float32Array(4 * n),
      emitTemp: Float32Array.from(this.temp),
      particle: Uint32Array.from(this.part),
    }
    const b = this.bands
    for (let v = 0; v < n; v++) {
      for (let k = 0; k < 4; k++) {
        spec.bands0[4 * v + k] = b[12 * v + k]
        spec.bands1[4 * v + k] = b[12 * v + 4 + k]
        spec.bands2[4 * v + k] = b[12 * v + 8 + k]
      }
    }
    return spec
  }
}

export const vertexCount = (spec) => spec.emitTemp.length

export function mergeSpecs(specs) {
  let nv = 0
  let ni = 0
  for (const s of specs) {
    nv += vertexCount(s)
    ni += s.indices.length
  }
  const out = {
    positions: new Float32Array(3 * nv),
    normals: new Float32Array(3 * nv),
    indices: new Uint32Array(ni),
    bands0: new Float32Array(4 * nv),
    bands1: new Float32Array(4 * nv),
    bands2: new Float32Array(4 * nv),
    emitTemp: new Float32Array(nv),
    particle: new Uint32Array(nv),
  }
  let v = 0
  let i = 0
  for (const s of specs) {
    out.positions.set(s.positions, 3 * v)
    out.normals.set(s.normals, 3 * v)
    out.bands0.set(s.bands0, 4 * v)
    out.bands1.set(s.bands1, 4 * v)
    out.bands2.set(s.bands2, 4 * v)
    out.emitTemp.set(s.emitTemp, v)
    out.particle.set(s.particle, v)
    for (let k = 0; k < s.indices.length; k++) out.indices[i + k] = s.indices[k] + v
    v += vertexCount(s)
    i += s.indices.length
  }
  return out
}

// In place: rotate about +y by yaw, then translate.
export function placeSpec(spec, x, y, z, yaw = 0) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const rot = (a, k) => {
    const px = a[k], pz = a[k + 2]
    a[k] = c * px + s * pz
    a[k + 2] = -s * px + c * pz
  }
  for (let k = 0; k < spec.positions.length; k += 3) {
    rot(spec.positions, k)
    rot(spec.normals, k)
    spec.positions[k] += x
    spec.positions[k + 1] += y
    spec.positions[k + 2] += z
  }
  return spec
}

// Longest triangle edge; `filter(ia, ib, ic)` optionally selects triangles.
export function maxEdgeLength(spec, filter = null) {
  const p = spec.positions
  const ix = spec.indices
  const d2 = (a, b) => {
    const dx = p[3 * a] - p[3 * b], dy = p[3 * a + 1] - p[3 * b + 1], dz = p[3 * a + 2] - p[3 * b + 2]
    return dx * dx + dy * dy + dz * dz
  }
  let m = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]
    if (filter && !filter(a, b, c)) continue
    m = Math.max(m, d2(a, b), d2(b, c), d2(c, a))
  }
  return Math.sqrt(m)
}

// ---- Geodesic sphere ------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
})
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

const unitCache = new Map()

// Unit geodesic sphere of frequency n (each icosahedron edge split into n): {dirs, tris, maxEdge}.
function unitSphere(n) {
  let u = unitCache.get(n)
  if (u) return u
  const dirs = []
  const keyToIndex = new Map()
  const vertexId = (face, i, j) => {
    // Shared corner / edge points are deduplicated through their icosahedron-level identity.
    const [A, B, C] = ICO_F[face]
    const k = n - i - j
    let key
    if (i === n) key = `v${A}`
    else if (j === n) key = `v${B}`
    else if (k === n) key = `v${C}`
    else if (k === 0) key = A < B ? `e${A},${B},${i}` : `e${B},${A},${j}`
    else if (i === 0) key = B < C ? `e${B},${C},${j}` : `e${C},${B},${k}`
    else if (j === 0) key = C < A ? `e${C},${A},${k}` : `e${A},${C},${i}`
    else key = `f${face},${i},${j}`
    let id = keyToIndex.get(key)
    if (id === undefined) {
      const a = ICO_V[A], b = ICO_V[B], c = ICO_V[C]
      const x = i * a[0] + j * b[0] + k * c[0]
      const y = i * a[1] + j * b[1] + k * c[1]
      const z = i * a[2] + j * b[2] + k * c[2]
      const l = Math.hypot(x, y, z)
      id = dirs.length / 3
      dirs.push(x / l, y / l, z / l)
      keyToIndex.set(key, id)
    }
    return id
  }
  const tris = []
  for (let f = 0; f < 20; f++) {
    // Row r = n − i; points (i, j) with i + j ≤ n.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        tris.push(vertexId(f, i + 1, j), vertexId(f, i, j + 1), vertexId(f, i, j))
        if (j < n - i - 1) tris.push(vertexId(f, i + 1, j), vertexId(f, i + 1, j + 1), vertexId(f, i, j + 1))
      }
    }
  }
  let m = 0
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)]
      m = Math.max(m, Math.hypot(dirs[3 * a] - dirs[3 * b], dirs[3 * a + 1] - dirs[3 * b + 1], dirs[3 * a + 2] - dirs[3 * b + 2]))
    }
  }
  u = { dirs, tris, maxEdge: m }
  unitCache.set(n, u)
  return u
}

// Sphere of `radius` centred at `center`, tessellated so no edge exceeds maxEdge.
// radiusAt(dx, dy, dz) → radius multiplier along a unit direction (lumps); squashY scales y.
// Normals come from the displaced surface. minFreq sets a floor on smoothness.
export function sphere(radius, maxEdge, {
  center = [0, 0, 0], radiusAt = null, squashY = 1, bands, emit = 0, particle = 0, minFreq = 1,
} = {}) {
  let n = minFreq
  while (radius * unitSphere(n).maxEdge > maxEdge) n++
  for (;;) {
    const spec = buildSphere(unitSphere(n), radius, center, radiusAt, squashY, bands, emit, particle)
    if (maxEdgeLength(spec) <= maxEdge) return spec
    n++
  }
}

function buildSphere(u, radius, center, radiusAt, squashY, bands, emit, particle) {
  const b = new MeshBuilder()
  const d = u.dirs
  const nv = d.length / 3
  for (let v = 0; v < nv; v++) {
    const dx = d[3 * v], dy = d[3 * v + 1], dz = d[3 * v + 2]
    const r = radius * (radiusAt ? radiusAt(dx, dy, dz) : 1)
    b.vertex(center[0] + r * dx, center[1] + r * dy * squashY, center[2] + r * dz, dx, dy, dz, bands, emit, particle)
  }
  for (let t = 0; t < u.tris.length; t += 3) b.tri(u.tris[t], u.tris[t + 1], u.tris[t + 2])
  const spec = b.toSpec()
  if (radiusAt || squashY !== 1) recomputeNormals(spec)
  return spec
}

// Area-weighted vertex normals from the triangles (winding must be outward).
export function recomputeNormals(spec) {
  const p = spec.positions
  const ix = spec.indices
  const n = new Float64Array(p.length)
  for (let t = 0; t < ix.length; t += 3) {
    const a = 3 * ix[t], b = 3 * ix[t + 1], c = 3 * ix[t + 2]
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
    for (const k of [a, b, c]) {
      n[k] += fx
      n[k + 1] += fy
      n[k + 2] += fz
    }
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1
    spec.normals[k] = n[k] / l
    spec.normals[k + 1] = n[k + 1] / l
    spec.normals[k + 2] = n[k + 2] / l
  }
  return spec
}

// ---- Surfaces of revolution --------------------------------------------------------------

// Radial margins: ring chord ≤ 0.98·e, ring-to-ring profile step ≤ 0.85·e; with staggered rings
// the diagonal is ≤ √(0.49² + 0.85²)·e < e.
const CHORD = 0.98
const STEP = 0.85

// Surface of revolution about +y. profile: [[r, y], ...]; each straight piece gets its own
// vertices and flat profile normal (hard creases between pieces). Normal side is to the left of
// the direction of travel in the (r, y) plane: bottom-to-top reads outward.
export function lathe(profile, maxEdge, { bands, emit = 0, particle = 0, minSegments = 6 } = {}) {
  const b = new MeshBuilder()
  for (let p = 0; p + 1 < profile.length; p++) {
    const [r0, y0] = profile[p]
    const [r1, y1] = profile[p + 1]
    const len = Math.hypot(r1 - r0, y1 - y0)
    const nr = (y1 - y0) / len
    const ny = -(r1 - r0) / len
    const rMax = Math.max(r0, r1)
    // Chord of one segment at rMax: 2·rMax·sin(π/n) ≤ CHORD·e.
    let n = minSegments
    while (2 * rMax * Math.sin(Math.PI / n) > CHORD * maxEdge) n++
    const m = Math.max(1, Math.ceil(len / (STEP * maxEdge)))
    let prev = null
    for (let k = 0; k <= m; k++) {
      const t = k / m
      const r = r0 + (r1 - r0) * t
      const y = y0 + (y1 - y0) * t
      const ring = []
      const count = r < 1e-9 ? 1 : n
      const off = (k % 2) * 0.5
      for (let s = 0; s < count; s++) {
        const a = ((s + off) / count) * 2 * Math.PI
        const c = Math.cos(a), sn = Math.sin(a)
        ring.push({ i: b.vertex(r * c, y, r * sn, nr * c, ny, nr * sn, bands, emit, particle), a: (s + off) / count })
      }
      if (prev) stitch(b, prev, ring)
      prev = ring
    }
  }
  return b.toSpec()
}

// Triangulate the band between two closed rings of vertices ordered by angle (fraction of a turn
// in [0, 1)). Works for any counts, including a single apex vertex.
export function stitch(b, A, B) {
  const na = A.length
  const nb = B.length
  if (na === 1 || nb === 1) {
    const [apex, ring] = na === 1 ? [A[0].i, B] : [B[0].i, A]
    for (let k = 0; k < ring.length; k++) b.tri(apex, ring[k].i, ring[(k + 1) % ring.length].i)
    return
  }
  // B's walk starts at its last vertex at or before A[0] (cyclically).
  let jb = nb - 1
  for (let k = 0; k < nb; k++) if (B[k].a <= A[0].a) jb = k
  const base = B[jb].a <= A[0].a ? 0 : -1
  const angA = (k) => A[k % na].a + Math.floor(k / na)
  const angB = (k) => B[(k + jb) % nb].a + Math.floor((k + jb) / nb) + base
  let i = 0
  let j = 0
  while (i < na || j < nb) {
    if (j >= nb || (i < na && angA(i + 1) <= angB(j + 1))) {
      b.tri(A[i % na].i, A[(i + 1) % na].i, B[(j + jb) % nb].i)
      i++
    } else {
      b.tri(A[i % na].i, B[(j + jb + 1) % nb].i, B[(j + jb) % nb].i)
      j++
    }
  }
}

// Mesh density per quality (world.md). Only tessellation changes, never shapes or placements.
export const QUALITY = Object.freeze({
  high: Object.freeze({ terrainSpacing: 0.25, propEdge: 0.1, waterEdge: 0.15 }),
  low: Object.freeze({ terrainSpacing: 0.8, propEdge: 0.25, waterEdge: 0.4 }),
})

export function qualityOf(name) {
  const q = QUALITY[name]
  if (!q) throw new Error(`unknown quality '${name}'`)
  return q
}
