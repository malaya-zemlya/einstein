// Validates a spacetime log and rebuilds its worldlines; frame interpolation for replay.
import { Worldline } from '../physics/worldline.js'
import { shapeHash as worldShapeHash } from '../world/island.js'
import { vec3 } from '../math/vec3.js'
import { FORMAT, VERSION, decodeInf, decodeVec, decodeVecOrNull } from './schema.js'

const COLUMNS = ['t', 'tau', 'pos', 'vel', 'yaw', 'pitch']
const STRIDE = { t: 1, tau: 1, pos: 3, vel: 3, yaw: 1, pitch: 1 }
const BASE_FIELDS = new Set(['id', 'kind', 'p', 't0', 'u', 'tBirth', 'tDeath', 'hitPos'])

function readFrames(f) {
  if (!f || !Array.isArray(f.t)) throw new Error('bad log: frames')
  const n = f.t.length
  const out = { length: n }
  for (const k of COLUMNS) {
    if (!Array.isArray(f[k]) || f[k].length !== n * STRIDE[k]) throw new Error(`bad log: frames.${k}`)
    out[k] = Float64Array.from(f[k])
  }
  return out
}

function readObject(o) {
  const line = new Worldline({
    p: decodeVec(o.p),
    t0: o.t0,
    u: decodeVec(o.u),
    tBirth: decodeInf(o.tBirth, -Infinity),
    tDeath: decodeInf(o.tDeath, Infinity),
    hitPos: decodeVecOrNull(o.hitPos),
  })
  const extra = {}
  for (const [k, v] of Object.entries(o)) if (!BASE_FIELDS.has(k)) extra[k] = v
  if (o.kind === 'burst') extra.particleVels = o.particleVels.map(decodeVec)
  return { id: o.id, kind: o.kind, line, extra }
}

// json: a parsed log object. Returns {meta, frames (columnar Float64Arrays), objects, flagChanges, round}.
export function readLog(json, { shapeHash = worldShapeHash } = {}) {
  const meta = json?.meta
  if (!meta || meta.format !== FORMAT) throw new Error('not a spacetime log')
  if (meta.version !== VERSION) throw new Error(`unsupported log version ${meta.version}`)
  if (shapeHash(meta.seed) !== meta.geometryHash) throw new Error('generator mismatch')
  return {
    meta: { ...meta },
    frames: readFrames(json.frames),
    objects: (json.objects || []).map(readObject),
    flagChanges: (json.flagChanges || []).map((f) => ({ t: f.t, flags: { ...f.flags } })),
    round: json.round ? { ...json.round } : null,
  }
}

// Largest i with col[i] ≤ x, clamped to [0, n − 2] (n ≥ 2), or 0.
function bracket(col, n, x) {
  if (n < 2 || x <= col[0]) return 0
  if (x >= col[n - 1]) return n - 2
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (col[mid] <= x) lo = mid
    else hi = mid
  }
  return lo
}

const lerp = (a, b, s) => a + (b - a) * s
const lerpAngle = (a, b, s) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * s

// Pose at index i blended toward i + 1 by s ∈ [0, 1].
function blend(frames, i, s) {
  const j = Math.min(i + 1, frames.length - 1)
  const { t, tau, pos, vel, yaw, pitch } = frames
  const v3 = (col) => vec3(lerp(col[3 * i], col[3 * j], s), lerp(col[3 * i + 1], col[3 * j + 1], s), lerp(col[3 * i + 2], col[3 * j + 2], s))
  return {
    t: lerp(t[i], t[j], s),
    tau: lerp(tau[i], tau[j], s),
    pos: v3(pos),
    vel: v3(vel),
    yaw: lerpAngle(yaw[i], yaw[j], s),
    pitch: lerp(pitch[i], pitch[j], s),
  }
}

function sampleBy(frames, key, x) {
  const n = frames.length
  if (n === 0) return null
  const col = frames[key]
  const i = bracket(col, n, x)
  if (n === 1) return blend(frames, 0, 0)
  const s = Math.min(1, Math.max(0, (x - col[i]) / (col[i + 1] - col[i])))
  return blend(frames, i, s)
}

// Camera pose at world time t (clamped to the recorded range).
export const frameAt = (frames, t) => sampleBy(frames, 't', t)
// Camera pose at recorded proper time tau (frames.tau is strictly increasing).
export const frameAtTau = (frames, tau) => sampleBy(frames, 'tau', tau)
// World time at recorded proper time tau, and its inverse.
export const tauToT = (frames, tau) => frameAtTau(frames, tau)?.t ?? 0
export const tToTau = (frames, t) => frameAt(frames, t)?.tau ?? 0
