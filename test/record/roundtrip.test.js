import { describe, it, expect } from 'vitest'
import { apparent } from '../../src/physics/lightcone.js'
import { mulberry32 } from '../../src/math/random.js'
import { vec3, add, sub, distance } from '../../src/math/vec3.js'
import { FORMAT, VERSION } from '../../src/record/schema.js'
import { recordedGame, roundTrip, target, SEED, fakeHash } from './helpers.js'

const DT = 1 / 120
const FLAGS = { aberration: true, delay: true }

const copyLine = (l) => ({ p: l.p, t0: l.t0, u: l.u, tBirth: l.tBirth, tDeath: l.tDeath, hitPos: l.hitPos })

function snapshot(g) {
  const objs = new Map()
  for (const f of g.fireballs) objs.set(f.id, { kind: 'fireball', line: copyLine(f.line) })
  for (const t of g.targets) objs.set(t.id, { kind: 'target', line: copyLine(t.line) })
  for (const b of g.bursts) objs.set(b.id, { kind: 'burst', line: copyLine(b.line), particleVels: b.particleVels })
  return { tau: g.player.tau, t: g.worldTime, x: { ...g.player.pos }, v: { ...g.player.vel }, objs }
}

// Scripted round: idle, move + fire, boost + turn + fire, pitch down + fire, idle; two flag toggles.
function scriptRound() {
  const targets = [target('t0', [0, 1.6, 25]), target('t1', [0, 1.6, 35]), target('t2', [0, 1.6, 45]), target('t3', [30, 1.6, 30])]
  const { game, rec, tick } = recordedGame({ targets })
  const snaps = []
  let shots = 0
  const run = (seconds, input, extra = () => ({})) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      tick({ ...input, ...extra(i), fire: Boolean(input.fire) && shots < 20 }, DT)
      shots += game.events.filter((e) => e.type === 'fire').length
      snaps.push(snapshot(game))
    }
  }
  rec.observe(game)
  snaps.push(snapshot(game))
  run(0.5, {})
  run(1.0, { moveF: 1, fire: true }, (i) => (i === 60 ? { keys: ['Digit3'] } : {}))
  run(1.5, { moveF: 1, boost: true, fire: true, lookDX: 2 })
  run(2.5, { fire: true, lookDY: 3 }, (i) => (i === 100 ? { keys: ['Digit3'] } : {}))
  run(4.0, {})
  return { game, rec, snaps, shots }
}

const vertexOf = (line, local, u, t) => ({
  p: add(line.p, local),
  local,
  u,
  dt0: t - line.t0,
  birthRel: line.tBirth - t,
  deathRel: line.tDeath - t,
  hitLocal: hitLocalOf(line),
})

const positionAt = (l, t) => add(l.p, vec3(l.u.x * (t - l.t0), l.u.y * (t - l.t0), l.u.z * (t - l.t0)))
const hitLocalOf = (l) => (l.hitPos && Number.isFinite(l.tDeath) ? sub(l.hitPos, positionAt(l, l.tDeath)) : null)

describe('round trip', () => {
  const { game, rec, snaps, shots } = scriptRound()
  const log = roundTrip(rec)

  it('records the scripted round', () => {
    expect(shots).toBe(20)
    expect(log.meta).toMatchObject({ format: FORMAT, version: VERSION, seed: SEED, geometryHash: fakeHash(SEED), c: 20 })
    expect(log.objects.filter((o) => o.kind === 'fireball')).toHaveLength(20)
    expect(log.objects.filter((o) => o.kind === 'target' && o.line.tDeath < Infinity).length).toBeGreaterThanOrEqual(3)
    expect(log.objects.filter((o) => o.kind === 'burst').length).toBeGreaterThanOrEqual(3)
    expect(log.flagChanges.map((f) => f.flags.doppler)).toEqual([true, false, true])
    expect(log.frames.tau[log.frames.length - 1]).toBeCloseTo(game.player.tau, 6)
    expect(log.round.status).toBe(game.round.status)
    expect(log.round.score).toBe(game.round.score)
    for (let i = 1; i < log.frames.length; i++) {
      expect(log.frames.tau[i]).toBeGreaterThan(log.frames.tau[i - 1])
      expect(log.frames.t[i]).toBeGreaterThan(log.frames.t[i - 1])
    }
  })

  it('apparent() from the log matches the live state within 1e-4 m', () => {
    const byTau = new Map(snaps.map((s) => [Math.round(s.tau * 1e6), s]))
    const logObjs = new Map(log.objects.map((o) => [o.id, o]))
    const rand = mulberry32(1234)
    let checked = 0
    let maxErr = 0
    while (checked < 50) {
      const j = Math.floor(rand() * log.frames.length)
      const live = byTau.get(Math.round(log.frames.tau[j] * 1e6))
      expect(live).toBeDefined()
      const ids = [...live.objs.keys()]
      if (ids.length === 0) continue
      const id = ids[Math.floor(rand() * ids.length)]
      const liveObj = live.objs.get(id)
      const logObj = logObjs.get(id)
      expect(logObj.kind).toBe(liveObj.kind)
      const t = log.frames.t[j]
      const f = log.frames
      const obsLog = { x: vec3(f.pos[3 * j], f.pos[3 * j + 1], f.pos[3 * j + 2]), v: vec3(f.vel[3 * j], f.vel[3 * j + 1], f.vel[3 * j + 2]) }
      const obsLive = { x: live.x, v: live.v }
      const a = 2 * Math.PI * rand()
      const local = vec3(0.3 * Math.cos(a), 0.3 * Math.sin(a), 0.1)
      let k = 0
      if (liveObj.kind === 'burst') k = Math.floor(rand() * 16)
      const uLog = liveObj.kind === 'burst' ? logObj.extra.particleVels[k] : logObj.line.u
      const uLive = liveObj.kind === 'burst' ? liveObj.particleVels[k] : liveObj.line.u
      const vLog = vertexOf(logObj.line, local, uLog, t)
      const vLive = vertexOf(liveObj.line, local, uLive, live.t)
      const rLog = apparent(vLog, obsLog, FLAGS)
      const rLive = apparent(vLive, obsLive, FLAGS)
      const err = distance(rLog.pos, rLive.pos)
      maxErr = Math.max(maxErr, err)
      expect(err).toBeLessThan(1e-4)
      expect(rLog.D).toBeCloseTo(rLive.D, 5)
      expect(rLog.visible).toBe(rLive.visible)
      checked++
    }
    expect(maxErr).toBeLessThan(1e-4)
    console.log("max apparent error", maxErr)
  })
})
