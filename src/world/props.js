import { lathe, mergeSpecs, placeSpec, sphere } from './geometry.js'
import { mulberry32, noise3D, range, subSeed } from './noise.js'

export const TREE_COUNT = 120
export const ROCK_COUNT = 60
export const PROP_SPACING = 5
export const SPAWN_CLEAR = 8
export const TREE_KINDS = Object.freeze(['round', 'pine', 'cherry'])

// Quality-independent prop transforms: Poisson-disc (dart throwing) on grass, 5 m apart,
// 8 m clear of spawn. First TREE_COUNT sites are trees, the rest rocks.
// Site = {kind, x, y (ground), z, yaw, scale, squash, lump [ox, oy, oz]}.
export function placePropSites(seed, field) {
  const rand = mulberry32(subSeed(seed, 1))
  const total = TREE_COUNT + ROCK_COUNT
  const pts = []
  const R = field.R
  for (let attempt = 0; pts.length < total; attempt++) {
    if (attempt > 200000) throw new Error(`prop placement failed for seed ${seed}`)
    const a = rand() * 2 * Math.PI
    const r = R * Math.sqrt(rand())
    const x = r * Math.cos(a)
    const z = r * Math.sin(a)
    if (r < SPAWN_CLEAR) continue
    if (pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < PROP_SPACING * PROP_SPACING)) continue
    if (field.materialAt(x, z) !== 'grass') continue
    pts.push({ x, z })
  }
  return pts.map(({ x, z }, i) => {
    const tree = i < TREE_COUNT
    return {
      kind: tree ? TREE_KINDS[Math.floor(rand() * 3)] : 'rock',
      x,
      y: field.heightAt(x, z),
      z,
      yaw: rand() * 2 * Math.PI,
      scale: tree ? range(rand, 0.85, 1.2) : range(rand, 0.5, 1.5),
      squash: tree ? 0.88 : range(rand, 0.6, 0.85),
      lump: [range(rand, -100, 100), range(rand, -100, 100), range(rand, -100, 100)],
    }
  })
}

// Merge all props into one static GeometrySpec at the given maximum edge.
export function buildProps(seed, sites, maxEdge, bandsFor) {
  const n3 = noise3D(subSeed(seed, 3))
  const parts = sites.map((s) => placeSpec(propMesh(s, maxEdge, bandsFor, n3), s.x, s.y, s.z, s.yaw))
  return mergeSpecs(parts)
}

const lumpy = (n3, [ox, oy, oz], amp) => (dx, dy, dz) =>
  1 + amp * n3(dx * 1.2 + ox, dy * 1.2 + oy, dz * 1.2 + oz) + amp * 0.35 * n3(dx * 2.4 + oy, dy * 2.4 + oz, dz * 2.4 + ox)

// One prop in local coordinates (origin on the ground under it).
function propMesh(site, e, bandsFor, n3) {
  const s = site.scale
  const trunk = bandsFor('trunk')
  if (site.kind === 'rock') {
    return sphere(s, e, {
      center: [0, 0.35 * s * site.squash, 0],
      radiusAt: lumpy(n3, site.lump, 0.16),
      squashY: site.squash,
      bands: bandsFor('rock'),
    })
  }
  if (site.kind === 'pine') {
    const cones = [[1.5, 0.9, 1.9], [1.15, 1.9, 1.6], [0.8, 2.8, 1.4]].map(([R, yb, h]) =>
      lathe([[0, yb * s], [R * s, yb * s], [0, (yb + h) * s]], e, { bands: bandsFor('canopy') }))
    return mergeSpecs([lathe([[0.18 * s, -0.4], [0.18 * s, 1.4 * s]], e, { bands: trunk }), ...cones])
  }
  // Round tree or cherry: trunk plus a lumpy canopy ball.
  const R = (site.kind === 'cherry' ? 1.55 : 1.5) * s
  return mergeSpecs([
    lathe([[0.22 * s, -0.4], [0.22 * s, 2.0 * s]], e, { bands: trunk }),
    sphere(R, e, {
      center: [0, 2.9 * s, 0],
      radiusAt: lumpy(n3, site.lump, 0.09),
      squashY: site.squash,
      bands: bandsFor(site.kind === 'cherry' ? 'cherry' : 'canopy'),
    }),
  ])
}
