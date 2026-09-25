import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { retardedDelay } from '../../src/physics/lightcone.js'
import { step } from '../../src/game/step.js'
import { viewOf } from '../../src/game/view.js'
import { createRecorder } from '../../src/record/recorder.js'
import { readLog } from '../../src/record/reader.js'
import { loadReplay } from '../../src/replay/state.js'
import { replayStep } from '../../src/replay/step.js'
import { viewAt, replayEmissions } from '../../src/replay/view.js'
import { vec3, sub, length } from '../../src/math/vec3.js'
import { makeGame, target, idle } from '../game/helpers.js'

const DT = 1 / 120
const fakeHash = () => 'x'
const noKeys = (extra = {}) => ({ keys: [], ...extra })

function recordRound() {
  const g = makeGame({ targets: [target('t0', [0, 1.6, 30])], shore: 1e6 })
  const rec = createRecorder(7, g.island, { shapeHash: fakeHash })
  const live = []
  for (let i = 0; i < 600; i++) {
    const input = { ...idle(), moveF: i > 100 ? 1 : 0, boost: i > 300 && i < 450, fire: i === 20, keys: i === 200 ? ['Digit3'] : [] }
    step(g, input, DT)
    rec.observe(g)
    if (i % 2 === 1) live.push({ t: g.worldTime, view: viewOf(g) })
  }
  const log = readLog(JSON.parse(JSON.stringify(rec.exportLog())), { shapeHash: fakeHash })
  return { log, live }
}

describe('replay', () => {
  const { log, live } = recordRound()

  it('recorded camera reproduces the live observer (60 Hz samples, interpolated)', () => {
    const rs = loadReplay(log)
    for (const { t, view } of live.slice(10, 200)) {
      rs.t = t
      const v = viewAt(rs)
      // between 60 Hz samples the pose is linearly interpolated: sub-millimetre error
      expect(length(sub(v.observer.pos, view.observer.pos))).toBeLessThan(1e-3)
      expect(length(sub(v.observer.vel, view.observer.vel))).toBeLessThan(1e-2)
    }
  })

  it('clock rule: 1 real second at 1× advances t by γ of the recorded motion', () => {
    const rs = loadReplay(log)
    const i = live.findIndex((l) => length(l.view.observer.vel) / C > 0.9)
    rs.tauRec = log.frames.tau[Math.floor(log.frames.length * 0.6)]
    replayStep(rs, noKeys(), 0)
    const t0 = rs.t
    replayStep(rs, noKeys(), 0.01)
    const v = viewAt(rs).observer.vel
    const g = 1 / Math.sqrt(1 - (length(v) / C) ** 2)
    expect((rs.t - t0) / 0.01).toBeCloseTo(g, 1)
    expect(i).toBeGreaterThan(0)
  })

  it('is exactly reversible with the recorded camera, through a boost', () => {
    const rs = loadReplay(log)
    for (let k = 0; k < 60; k++) replayStep(rs, noKeys(), 1 / 60)
    const t1 = rs.t
    rs.rate = -1
    for (let k = 0; k < 60; k++) replayStep(rs, noKeys(), 1 / 60)
    rs.rate = 1
    for (let k = 0; k < 60; k++) replayStep(rs, noKeys(), 1 / 60)
    expect(rs.t).toBeCloseTo(t1, 9)
  })

  it('follows recorded flag changes until the user toggles', () => {
    const rs = loadReplay(log)
    const change = log.flagChanges.find((fc) => fc.flags.doppler === false)
    expect(change).toBeTruthy()
    rs.tauRec = log.frames.tau[log.frames.length - 1]
    replayStep(rs, noKeys(), 0)
    expect(rs.flags.doppler).toBe(false)
    replayStep(rs, noKeys({ keys: ['Digit3'] }), 0)
    expect(rs.flags.doppler).toBe(true)
    expect(rs.followRecordedFlags).toBe(false)
  })

  it('free camera moves forward in real time even at rate −1', () => {
    const rs = loadReplay(log)
    replayStep(rs, noKeys({ keys: ['KeyC'] }), 0)
    rs.rate = -1
    const z0 = rs.free.pos.z
    for (let k = 0; k < 30; k++) replayStep(rs, noKeys({ moveF: 1 }), 1 / 60)
    expect(rs.free.pos.z).toBeGreaterThan(z0)
  })

  it('avatar retarded time matches retardedDelay for straight motion', () => {
    const rs = loadReplay(log)
    replayStep(rs, noKeys({ keys: ['KeyC'] }), 0)
    rs.free.pos = vec3(20, 1.6, 0)
    rs.t = log.frames.t[Math.floor(log.frames.length * 0.4)]
    const v = viewAt(rs)
    expect(v.avatar).toBeTruthy()
    const a = v.avatar.line
    const lag = rs.t - a.t0
    expect(Math.abs(C * lag - length(sub(rs.free.pos, a.p)))).toBeLessThan(0.05)
    expect(retardedDelay(sub(a.p, rs.free.pos), vec3())).toBeGreaterThan(0)
  })

  it('derives hit sounds from the log', () => {
    const em = replayEmissions(log)
    expect(em.some((e) => e.kind === 'boom')).toBe(true)
  })
})
