import { lathe, mergeSpecs, qualityOf, sphere } from './geometry.js'
import { mulberry32, subSeed } from './noise.js'
import { BALLOON_COLOURS, materialBands } from './palette.js'

export const TARGET_HEIGHT = 2.5 // balloon centre above ground
export const HIT_RADIUS = 1.0
export const BALLOON_RADIUS = 0.8
export const STICK_LENGTH = 1.7
export const TARGET_SPACING = 15
export const TARGET_MIN_R = 20
export const TARGET_MAX_R = 80
export const TARGET_MIN_HEIGHT = 1.0
export const TARGET_PROP_CLEAR = 3.5 // keeps balloons out of tree canopies
export const FIREBALL_RADIUS = 0.3
export const FIREBALL_TEMP = 10000 // hot plasma: still ~4200 K (orange-white) when receding at 0.7c
export const BURST_PARTICLES = 16
export const BURST_RADIUS = 0.12
export const BURST_TEMP = 6000

// Quality-independent target centres: [{pos, colour}].
export function placeTargetSites(seed, island, n = 12) {
  const rand = mulberry32(subSeed(seed, 4))
  const props = island.propSites ?? []
  const out = []
  for (let attempt = 0; out.length < n; attempt++) {
    if (attempt > 200000) throw new Error(`target placement failed for seed ${seed}`)
    const a = rand() * 2 * Math.PI
    const r = Math.sqrt(TARGET_MIN_R ** 2 + rand() * (TARGET_MAX_R ** 2 - TARGET_MIN_R ** 2))
    const x = r * Math.cos(a)
    const z = r * Math.sin(a)
    const h = island.heightAt(x, z)
    if (h <= TARGET_MIN_HEIGHT) continue
    if (out.some(({ pos }) => (pos[0] - x) ** 2 + (pos[2] - z) ** 2 < TARGET_SPACING ** 2)) continue
    if (props.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < TARGET_PROP_CLEAR ** 2)) continue
    out.push({ pos: [x, h + TARGET_HEIGHT, z], colour: BALLOON_COLOURS[out.length % BALLOON_COLOURS.length] })
  }
  return out
}

// TargetSpec[]: {id, pos, radius, visualRadius, colour, geometry}. Targets of one colour share
// one GeometrySpec object (local coordinates, origin at the balloon centre).
export function placeTargets(seed, island, n = 12, quality = island.quality ?? 'high', { bandsFor = materialBands } = {}) {
  const e = qualityOf(quality).propEdge
  const meshes = new Map()
  const meshFor = (colour) => {
    if (!meshes.has(colour)) meshes.set(colour, makeTargetGeometry(colour, e, bandsFor))
    return meshes.get(colour)
  }
  return placeTargetSites(seed, island, n).map(({ pos, colour }, i) => ({
    id: `t${i}`,
    pos,
    radius: HIT_RADIUS,
    visualRadius: BALLOON_RADIUS,
    colour,
    geometry: meshFor(colour),
  }))
}

// Balloon (smooth icosphere) on a thin white stick reaching 0.1 m into the ground.
export function makeTargetGeometry(colour, maxEdge, bandsFor = materialBands) {
  const top = -BALLOON_RADIUS + 0.05
  const bottom = -TARGET_HEIGHT - 0.1
  return mergeSpecs([
    sphere(BALLOON_RADIUS, maxEdge, { bands: bandsFor(colour), minFreq: 8 }),
    lathe([[0, bottom], [0.025, bottom], [0.025, top]], maxEdge, { bands: bandsFor('stick'), minSegments: 8 }),
  ])
}

// Fireball: icosphere r 0.3, emitting at FIREBALL_TEMP, zero albedo.
export function makeFireballGeometry(quality = 'high') {
  return sphere(FIREBALL_RADIUS, qualityOf(quality).propEdge, { emit: FIREBALL_TEMP, minFreq: 4 })
}

// Burst: 16 small emitting icospheres, all at the origin; `particle` tags each one (0–15).
export function makeBurstGeometry(quality = 'high') {
  const e = qualityOf(quality).propEdge
  const parts = []
  for (let k = 0; k < BURST_PARTICLES; k++) parts.push(sphere(BURST_RADIUS, e, { emit: BURST_TEMP, particle: k, minFreq: 2 }))
  return mergeSpecs(parts)
}
