// Records a round as a spacetime log: camera samples plus live worldline references (record.md).
import { C } from '../physics/constants.js'
import { GENERATOR_VERSION, shapeHash as worldShapeHash } from '../world/island.js'
import { BURST_RADIUS, BURST_TEMP } from '../world/targets.js'
import {
  FORMAT, VERSION, FLAG_NAMES, Q_TIME, Q_POS, Q_VEL, Q_ANGLE,
  quantize, encodeInf, encodeVec, encodeVecOrNull,
} from './schema.js'

const SAMPLE_DTAU = 1 / 60
const SAMPLE_EPS = 1e-9 // float slack so 120 steps/s keeps exactly every other step
const FLAG_EVENTS = new Set([...FLAG_NAMES, 'newtonian']) // N flips all four effects

// Growable Float64Array columns; stride 3 for pos/vel.
function createFrames() {
  let cap = 1024
  let n = 0
  const alloc = (k) => new Float64Array(cap * k)
  let cols = { t: alloc(1), tau: alloc(1), pos: alloc(3), vel: alloc(3), yaw: alloc(1), pitch: alloc(1) }
  const grow = () => {
    cap *= 2
    const next = { t: alloc(1), tau: alloc(1), pos: alloc(3), vel: alloc(3), yaw: alloc(1), pitch: alloc(1) }
    for (const k of Object.keys(cols)) next[k].set(cols[k])
    cols = next
  }
  return {
    get length() { return n },
    lastTau: () => cols.tau[n - 1],
    push(s) {
      if (n === cap) grow()
      const { t, tau, pos, vel, yaw, pitch } = cols
      t[n] = s.t
      tau[n] = s.tau
      pos[3 * n] = s.pos.x; pos[3 * n + 1] = s.pos.y; pos[3 * n + 2] = s.pos.z
      vel[3 * n] = s.vel.x; vel[3 * n + 1] = s.vel.y; vel[3 * n + 2] = s.vel.z
      yaw[n] = s.yaw
      pitch[n] = s.pitch
      n++
    },
    // Rounded plain arrays, plus an optional trailing sample not stored.
    export(extra) {
      const out = { t: [], tau: [], pos: [], vel: [], yaw: [], pitch: [] }
      const add = (t, tau, px, py, pz, vx, vy, vz, yaw, pitch) => {
        out.t.push(quantize(t, Q_TIME))
        out.tau.push(quantize(tau, Q_TIME))
        out.pos.push(quantize(px, Q_POS), quantize(py, Q_POS), quantize(pz, Q_POS))
        out.vel.push(quantize(vx, Q_VEL), quantize(vy, Q_VEL), quantize(vz, Q_VEL))
        out.yaw.push(quantize(yaw, Q_ANGLE))
        out.pitch.push(quantize(pitch, Q_ANGLE))
      }
      const { t, tau, pos, vel, yaw, pitch } = cols
      for (let i = 0; i < n; i++) {
        add(t[i], tau[i], pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], vel[3 * i], vel[3 * i + 1], vel[3 * i + 2], yaw[i], pitch[i])
      }
      if (extra) add(extra.t, extra.tau, extra.pos.x, extra.pos.y, extra.pos.z, extra.vel.x, extra.vel.y, extra.vel.z, extra.yaw, extra.pitch)
      return out
    },
  }
}

const sampleOf = (state) => {
  const { pos, vel, yaw, pitch, tau } = state.player
  return { t: state.worldTime, tau, pos: { ...pos }, vel: { ...vel }, yaw, pitch }
}

const pickFlags = (flags) => Object.fromEntries(FLAG_NAMES.map((k) => [k, Boolean(flags[k])]))

// opts.shapeHash and opts.now are injectable for tests.
export function createRecorder(seed, island, { shapeHash = worldShapeHash, now = () => new Date() } = {}) {
  const geometryHash = shapeHash(seed)
  let frames, objects, flagChanges, latest, round, meta

  function clear() {
    frames = createFrames()
    objects = new Map()
    flagChanges = []
    latest = null
    round = null
    meta = { format: FORMAT, version: VERSION, seed, generatorVersion: GENERATOR_VERSION, geometryHash, c: C, settings: null, createdAt: now().toISOString() }
  }

  function register(id, kind, line, extra) {
    if (!objects.has(id)) objects.set(id, { kind, line, extra })
  }

  function observe(state) {
    if (state.round.status === 'ready' && state.worldTime === 0 && frames.length > 0) clear()
    const first = frames.length === 0
    const s = sampleOf(state)
    latest = s
    round = state.round
    if (first || s.tau - frames.lastTau() >= SAMPLE_DTAU - SAMPLE_EPS) frames.push(s)

    if (first) {
      meta.c = C
      meta.settings = { ...state.settings }
      meta.createdAt = now().toISOString()
      flagChanges.push({ t: 0, flags: pickFlags(state.flags) })
      state.targets.forEach((tg) => register(tg.id, 'target', tg.line, { specIndex: state.targetSpecs.indexOf(tg.spec) }))
    } else if (state.events.some((e) => e.type === 'toggle' && FLAG_EVENTS.has(e.name))) {
      const entry = { t: state.worldTime, flags: pickFlags(state.flags) }
      if (flagChanges[flagChanges.length - 1].t === entry.t) flagChanges[flagChanges.length - 1] = entry
      else flagChanges.push(entry)
    }

    for (const fb of state.fireballs) register(fb.id, 'fireball', fb.line, { radius: fb.radius, emitTemp: fb.emitTemp })
    for (const b of state.bursts) {
      register(b.id, 'burst', b.line, { big: b.big, particleVels: b.particleVels, particleRadius: BURST_RADIUS, emitTemp: BURST_TEMP })
    }
  }

  function exportLog() {
    const trailing = latest && frames.length > 0 && quantize(latest.tau, Q_TIME) > quantize(frames.lastTau(), Q_TIME) ? latest : null
    const objs = []
    for (const [id, { kind, line, extra }] of objects) {
      const ex = kind === 'burst' ? { ...extra, particleVels: extra.particleVels.map(encodeVec) } : { ...extra }
      objs.push({
        id, kind,
        p: encodeVec(line.p), t0: line.t0, u: encodeVec(line.u),
        tBirth: encodeInf(line.tBirth), tDeath: encodeInf(line.tDeath), hitPos: encodeVecOrNull(line.hitPos),
        ...ex,
      })
    }
    const r = round ?? { status: 'ready', startTau: 0, startWorld: 0, endTau: 0, endWorld: 0, score: 0 }
    return {
      meta: { ...meta, settings: meta.settings && { ...meta.settings } },
      frames: frames.export(trailing),
      objects: objs,
      flagChanges: flagChanges.map((f) => ({ t: f.t, flags: { ...f.flags } })),
      round: { status: r.status, startTau: r.startTau, startWorld: r.startWorld, endTau: r.endTau, endWorld: r.endWorld, score: r.score },
    }
  }

  clear()
  return { observe, exportLog, clear }
}
