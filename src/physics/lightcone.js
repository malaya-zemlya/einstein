import { C, C2 } from './constants.js'
import { gamma } from './lorentz.js'
import { addScaled, dot, isZero, length, lengthSq, normalize, scale, sub } from '../math/vec3.js'

// Δ ≥ 0 with |r − uΔ| = CΔ, written without catastrophic cancellation.
// r: point's position at the observer's current world time, relative to the observer.
// u: the point's constant world velocity.
export function retardedDelay(r, u) {
  const c = lengthSq(r)
  if (c === 0) return 0
  const a = C2 - lengthSq(u)
  const b = dot(r, u)
  const disc = Math.sqrt(b * b + a * c)
  return b >= 0 ? c / (b + disc) : (-b + disc) / a
}

// Pure Lorentz boost of an event separation into the frame moving at v.
export function boostEvent(dt, dx, v) {
  if (isZero(v)) return { dt, dx }
  const g = gamma(v)
  const n = normalize(v)
  const dtp = g * (dt - dot(v, dx) / C2)
  const dxp = addScaled(addScaled(dx, n, (g - 1) * dot(dx, n)), v, -g * dt)
  return { dt: dtp, dx: dxp }
}

// Received / emitted frequency. kHat: photon direction of travel (source → observer), world frame.
export function dopplerFactor(kHat, vObs, vSrc) {
  const num = gamma(vObs) * (1 - dot(vObs, kHat) / C)
  const den = gamma(vSrc) * (1 - dot(vSrc, kHat) / C)
  return num / den
}

// JS reference for the vertex shader (render/wgsl/relativity.wgsl mirrors it line for line).
// vertex: {p, local, u, dt0, birthRel, deathRel, hitLocal}; observer: {x, v}; flags: {aberration, delay}
export function apparent(vertex, observer, flags) {
  const { p, local, u, dt0, birthRel, deathRel, hitLocal } = vertex
  const r = sub(addScaled(p, u, dt0), observer.x)
  const delta = flags.delay ? retardedDelay(r, u) : 0
  const dx = addScaled(r, u, -delta)
  const tRel = -delta
  const death = deathRel + (hitLocal ? length(sub(local, hitLocal)) / C : 0)
  const visible = birthRel <= tRel && tRel <= death
  const dist = length(dx)
  if (dist < 1e-4) return { pos: dx, D: 1, visible }
  const dt = -dist / C
  const pos = flags.aberration ? boostEvent(dt, dx, observer.v).dx : dx
  const kHat = scale(dx, -1 / dist)
  const D = dopplerFactor(kHat, observer.v, u)
  return { pos, D, visible }
}
