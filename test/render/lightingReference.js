// JS reference for lighting.wgsl fireballLight() (render.md § Fireball lighting), in double precision.
// A light is the renderer's Light record: {origin, dt0, vel, birthRel, deathRel, temp, scale}, with
// origin + vel·(dt0 + t) the fireball's position at observer-relative world time t.

import { C } from '../../src/physics/constants.js'
import { retardedDelay } from '../../src/physics/lightcone.js'
import { gamma } from '../../src/physics/lorentz.js'
import { NUM_BANDS } from '../../src/spectral/bands.js'
import { LOG2T_MAX, LOG2T_MIN, bbBand } from '../../src/spectral/lut.js'

export const FIREBALL_R = 0.3

// Planck radiance at band i's centre, zero outside the LUT's temperature range (as the shader samples it).
export function bbBandSampled(i, T) {
  const l = Math.log2(T)
  return l < LOG2T_MIN || l > LOG2T_MAX ? 0 : bbBand(i, T)
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const addScaled = (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s })
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z

// Band irradiance (12 values) on a surface with normal n at the emission event (xe, tRel).
export function fireballLight(lights, xe, tRel, n, { delay = true, doppler = true } = {}, band = bbBandSampled) {
  const E = new Float64Array(NUM_BANDS)
  for (const L of lights) {
    const u = L.vel
    const q = addScaled(L.origin, u, L.dt0 + tRel) // fireball position at the surface's emission time
    const r = sub(q, xe)
    const delta = delay ? retardedDelay(r, u) : 0
    const tL = tRel - delta // when the illuminating light left the fireball
    if (tL < (L.birthRel ?? -Infinity) || tL > (L.deathRel ?? Infinity)) continue
    const s = addScaled(r, u, -delta) // surface → fireball at emission
    const dist = Math.sqrt(dot(s, s))
    if (dist < 1e-4) continue
    const l = { x: s.x / dist, y: s.y / dist, z: s.z / dist }
    const ndl = dot(n, l)
    if (ndl <= 0) continue
    // doppler(−l̂, 0, u): a surface at rest receiving light travelling along −l̂ from a source moving at u.
    const D = doppler ? 1 / (gamma(u) * (1 + dot(u, l) / C)) : 1
    const d = Math.max(dist, FIREBALL_R)
    const k = Math.PI * L.scale * (FIREBALL_R / d) ** 2 * ndl
    for (let i = 0; i < NUM_BANDS; i++) E[i] += k * band(i, L.temp * D)
  }
  return E
}
