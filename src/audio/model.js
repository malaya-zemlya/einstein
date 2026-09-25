// Sound in air at rest in the world frame, speed C_SOUND. Pure functions, no Web Audio.
// Emissions are world-frame events {kind, pos, t}. C and C_SOUND are read at call time.

import { C, C_SOUND } from '../physics/constants.js'
import { gamma } from '../physics/lorentz.js'
import { distance, dot, normalize, sub } from '../math/vec3.js'

export const MAX_EMISSION_AGE = 30 // s of world time; outrun sounds are forgotten after this
export const RATE_MIN = 0.25
export const RATE_MAX = 4

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

// World time at which the front of an emission reaches a static observer at observerPos.
export const hearTime = (emission, observerPos) => emission.t + distance(emission.pos, observerPos) / C_SOUND

// The front has reached the observer: C_SOUND·(t_obs − t) ≥ |x_obs − pos|.
export const isHeard = (emission, observerPos, observerTime) =>
  C_SOUND * (observerTime - emission.t) >= distance(emission.pos, observerPos)

// Direction the sound travels at arrival (source → observer).
export const soundDirection = (emission, observerPos) => normalize(sub(observerPos, emission.pos))

// Listener moving through the medium (source at rest), times γ for the listener's slow clock.
export function playbackRate(vel, kHat) {
  return clamp(gamma(vel) * (1 - dot(vel, kHat) / C_SOUND), RATE_MIN, RATE_MAX)
}

// Fraction of the sphere of directions from which sound can still reach a listener at this speed.
export const audibleFraction = (speed) => (speed <= C_SOUND ? 1 : (1 + C_SOUND / speed) / 2)

// Mean Doppler factor over the audible directions: γ·(1 + (v/c_s)·(1 − a)/2), a = min(1, c_s/v).
export function ambienceDoppler(speed) {
  const g = 1 / Math.sqrt(1 - Math.min(speed / C, 0.999999) ** 2)
  const a = Math.min(1, C_SOUND / Math.max(speed, 1e-9))
  return g * (1 + (speed / C_SOUND) * (1 - a) / 2)
}

// Transonic rumble, peaking at |v| = C_SOUND.
export const buffetGain = (speed) => Math.exp(-(((speed - C_SOUND) / (0.12 * C_SOUND)) ** 2))

export const gain = (d) => 1 / (1 + d / 15)

// Stereo position of a sound travelling along kHat, heard facing yaw. +1 = right.
export function pan(kHat, yaw) {
  const h = Math.hypot(kHat.x, kHat.z)
  if (h < 1e-9) return 0
  // Right vector for yaw is (−cos yaw, 0, sin yaw) (game/player.js rightOf); the source lies along −k̂.
  return clamp((kHat.x * Math.cos(yaw) - kHat.z * Math.sin(yaw)) / h, -1, 1)
}

// Everything needed to play one heard emission.
export function voiceParams(emission, observer) {
  const d = distance(emission.pos, observer.pos)
  const k = soundDirection(emission, observer.pos)
  return { rate: playbackRate(observer.vel, k), gain: gain(d), pan: pan(k, observer.yaw), distance: d }
}

// Splits a queue into emissions heard now and those still travelling. Stale ones (older than
// MAX_EMISSION_AGE, or from the future after a clock reset) are dropped.
export function drainHeard(queue, observerPos, worldTime) {
  const heard = []
  const pending = []
  for (const e of queue) {
    const age = worldTime - e.t
    if (age > MAX_EMISSION_AGE || age < -1e-9) continue
    if (isHeard(e, observerPos, worldTime)) heard.push(e)
    else pending.push(e)
  }
  return { heard, pending }
}
