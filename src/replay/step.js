import { gamma, stepRapidity, rapidityToVelocity } from '../physics/lorentz.js'
import { vec3, add, scale, normalize, length, addScaled } from '../math/vec3.js'
import { frameAt, frameAtTau, tToTau } from '../record/reader.js'
import { RATES, TAIL } from './state.js'

const FLAG_KEYS = { Digit1: 'aberration', Digit2: 'delay', Digit3: 'doppler', Digit4: 'searchlight' }
const UI_KEYS = { KeyM: 'map', KeyH: 'captions', KeyV: 'sound' }
const PITCH_LIMIT = (85 * Math.PI) / 180
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

const lastT = (f) => f.t[f.length - 1]
const lastTau = (f) => f.tau[f.length - 1]

// World time for recorded proper time; past the end the camera rests, so t and τ advance together.
function tAtTau(frames, tau) {
  return tau <= lastTau(frames) ? frameAtTau(frames, tau).t : lastT(frames) + (tau - lastTau(frames))
}

function recordedFlags(rs) {
  let flags = rs.log.flagChanges[0]?.flags
  for (const fc of rs.log.flagChanges) if (fc.t <= rs.t) flags = fc.flags
  return flags ? { ...flags } : rs.flags
}

function stepRate(rs, dir) {
  const i = RATES.indexOf(rs.rate)
  rs.rate = RATES[clamp((i < 0 ? RATES.indexOf(1) : i) + dir, 0, RATES.length - 1)]
}

// The only mutator of ReplayState. Real time is the current camera's proper time.
export function replayStep(rs, input, dReal) {
  const { frames } = rs.log
  const tBefore = rs.t
  rs.resetAdaptation = false
  for (const code of input.keys || []) {
    if (code in FLAG_KEYS) {
      rs.flags[FLAG_KEYS[code]] = !rs.flags[FLAG_KEYS[code]]
      rs.followRecordedFlags = false
    } else if (code === 'KeyN') {
      const anyOn = Object.values(rs.flags).some(Boolean)
      for (const k of Object.keys(rs.flags)) rs.flags[k] = !anyOn
      rs.followRecordedFlags = false
    } else if (code in UI_KEYS) rs.ui[UI_KEYS[code]] = !rs.ui[UI_KEYS[code]]
    else if (code === 'Space') {
      if (rs.rate === 0) rs.rate = rs.lastRate || 1
      else { rs.lastRate = rs.rate; rs.rate = 0 }
    } else if (code === 'ArrowLeft') stepRate(rs, -1)
    else if (code === 'ArrowRight') stepRate(rs, 1)
    else if ((code === 'Comma' || code === 'Period') && rs.rate === 0) {
      rs.tauRec = clamp(rs.tauRec + (code === 'Period' ? 1 : -1) / 60, frames.tau[0], lastTau(frames) + TAIL)
      if (rs.camera === 'recorded') rs.t = tAtTau(frames, rs.tauRec)
      else rs.t = clamp(rs.t + (code === 'Period' ? 1 : -1) / 60, frames.t[0], lastT(frames) + TAIL)
    } else if (code === 'KeyC') {
      if (rs.camera === 'recorded') {
        const f = frameAt(frames, rs.t)
        rs.free = { pos: f.pos, rapidity: vec3(), yaw: f.yaw, pitch: f.pitch }
        rs.camera = 'free'
      } else {
        rs.camera = 'recorded'
        rs.tauRec = rs.t <= lastT(frames) ? tToTau(frames, rs.t) : lastTau(frames) + (rs.t - lastT(frames))
        rs.followRecordedFlags = true
      }
    }
  }
  if (input.scrubT !== undefined) {
    rs.t = clamp(input.scrubT, frames.t[0], lastT(frames) + TAIL)
    rs.tauRec = rs.t <= lastT(frames) ? tToTau(frames, rs.t) : lastTau(frames) + (rs.t - lastT(frames))
  }

  if (rs.camera === 'recorded') {
    rs.tauRec = clamp(rs.tauRec + rs.rate * dReal, frames.tau[0], lastTau(frames) + TAIL)
    rs.t = tAtTau(frames, rs.tauRec)
  } else {
    const fr = rs.free
    fr.yaw -= (input.lookDX || 0) * 0.002
    fr.pitch = clamp(fr.pitch - (input.lookDY || 0) * 0.002, -PITCH_LIMIT, PITCH_LIMIT)
    const fwd = vec3(Math.sin(fr.yaw) * Math.cos(fr.pitch), Math.sin(fr.pitch), Math.cos(fr.yaw) * Math.cos(fr.pitch))
    const right = vec3(-Math.cos(fr.yaw), 0, Math.sin(fr.yaw))
    const wish = normalize(add(add(scale(fwd, input.moveF || 0), scale(right, input.moveR || 0)), vec3(0, input.moveU || 0, 0)))
    const s = rs.log.meta.settings ?? {}
    const cruise = s.cruiseBeta ?? 0.4
    const cap = s.boostBeta ?? 0.99
    const beta = length(wish) > 0 ? (input.boost ? cap : cruise) : 0
    fr.rapidity = stepRapidity(fr.rapidity, scale(wish, Math.atanh(beta)), Math.atanh(cap) / 2.5, dReal)
    const v = rapidityToVelocity(fr.rapidity)
    const g = gamma(v)
    fr.pos = addScaled(fr.pos, v, g * dReal) // camera moves in real time, whatever the playback rate
    rs.t = clamp(rs.t + rs.rate * g * dReal, frames.t[0], lastT(frames) + TAIL)
  }
  if (rs.followRecordedFlags) rs.flags = recordedFlags(rs)
  rs.jumped = Math.abs(rs.t - tBefore) > 0.5 || (rs.rate < 0)
}
