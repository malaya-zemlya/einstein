import { C } from '../physics/constants.js'
import { Worldline } from '../physics/worldline.js'
import { rapidityToVelocity } from '../physics/lorentz.js'
import { vec3, distance, length } from '../math/vec3.js'
import { frameAt } from '../record/reader.js'

// The recorded player's pose at the moment its light reaching xObs left it (bisection over samples).
function avatarRetarded(frames, xObs, tObs) {
  const f = (i) => C * (tObs - frames.t[i]) - distance(xObs, vec3(frames.pos[3 * i], frames.pos[3 * i + 1], frames.pos[3 * i + 2]))
  let lo = 0
  let hi = frames.length - 1
  if (f(lo) < 0) return null // light from the start hasn't arrived yet
  if (f(hi) >= 0) return frameAt(frames, frames.t[hi])
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (f(mid) >= 0) lo = mid
    else hi = mid
  }
  const a = f(lo)
  const b = f(hi)
  return frameAt(frames, frames.t[lo] + ((frames.t[hi] - frames.t[lo]) * a) / (a - b))
}

// ReplayState → RenderView (the renderer's entire input).
export function viewAt(rs) {
  const { frames } = rs.log
  let observer
  let boost = false
  if (rs.camera === 'recorded') {
    const f = frameAt(frames, rs.t)
    const cap = rs.log.meta.settings?.boostBeta ?? 0.99
    boost = length(f.vel) / C > (rs.log.meta.settings?.cruiseBeta ?? 0.4) + 0.02 && length(f.vel) / C < cap
    observer = { pos: f.pos, vel: rs.t > frames.t[frames.length - 1] ? vec3() : f.vel, yaw: f.yaw, pitch: f.pitch }
  } else {
    observer = { pos: rs.free.pos, vel: rapidityToVelocity(rs.free.rapidity), yaw: rs.free.yaw, pitch: rs.free.pitch }
  }
  const objects = rs.log.objects.filter((o) => o.line.tBirth <= rs.t && !o.line.lightHasPassed(rs.t))
  let avatar = null
  if (rs.camera === 'free') {
    const a = avatarRetarded(frames, observer.pos, rs.t)
    if (a) {
      avatar = { id: 'avatar', kind: 'fireball', line: new Worldline({ p: a.pos, t0: a.t, u: a.vel }), extra: { radius: 0.4 } }
      objects.push(avatar)
    }
  }
  return {
    observer: { ...observer, boosting: boost },
    worldTime: rs.t,
    flags: rs.flags,
    ui: rs.ui,
    settings: { adaptation: true, headroom: 8 },
    resetAdaptation: rs.resetAdaptation,
    objects,
    avatar,
    boost,
    clockStart: rs.log.meta.clockStart ?? Date.parse(rs.log.meta.createdAt),
  }
}

// Sound emissions derived from the log (audio.md § Replay).
export function replayEmissions(log) {
  const out = []
  for (const o of log.objects) {
    if (o.kind === 'target' && Number.isFinite(o.line.tDeath) && o.line.hitPos) out.push({ kind: 'boom', pos: o.line.hitPos, t: o.line.tDeath })
    if (o.kind === 'burst' && !o.extra.big) out.push({ kind: 'thud', pos: o.line.p, t: o.line.t0 })
  }
  return out.sort((a, b) => a.t - b.t)
}
