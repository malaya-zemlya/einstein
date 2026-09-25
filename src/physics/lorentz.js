import { C, C2 } from './constants.js'
import { add, addScaled, dot, isZero, length, lengthSq, normalize, scale, sub, vec3 } from '../math/vec3.js'

export function gamma(v) {
  const b2 = lengthSq(v) / C2
  if (b2 >= 1) throw new RangeError('superluminal')
  return 1 / Math.sqrt(1 - b2)
}

// World velocity of an object moving at w in a frame that moves at v relative to the world.
export function velocityAdd(v, w) {
  if (isZero(v)) return w
  const g = gamma(v)
  const n = normalize(v)
  const wPar = scale(n, dot(w, n))
  const wPerp = sub(w, wPar)
  const num = add(add(v, wPar), scale(wPerp, 1 / g))
  return scale(num, 1 / (1 + dot(v, w) / C2))
}

// Rapidity vector: atanh(|v|/C) along the direction of motion.
export function velocityToRapidity(v) {
  const s = length(v)
  if (s === 0) return vec3()
  return scale(v, Math.atanh(s / C) / s)
}

export function rapidityToVelocity(phi) {
  const p = length(phi)
  if (p === 0) return vec3()
  return scale(phi, (C * Math.tanh(p)) / p)
}

// Move the rapidity vector toward its target by at most rate·dτ.
// In straight-line motion this is exactly constant proper acceleration C·rate.
export function stepRapidity(phi, phiTarget, rate, dTau) {
  const d = sub(phiTarget, phi)
  const dl = length(d)
  const step = rate * dTau
  if (dl <= step) return phiTarget
  return addScaled(phi, d, step / dl)
}
