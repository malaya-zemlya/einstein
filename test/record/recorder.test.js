import { describe, it, expect } from 'vitest'
import { createRecorder } from '../../src/record/recorder.js'
import { readLog, frameAt, frameAtTau, tauToT, tToTau } from '../../src/record/reader.js'
import { shapeHash } from '../../src/world/island.js'
import { recordedGame, roundTrip, fakeHash, makeGame, idle, SEED } from './helpers.js'

const DT = 1 / 60

describe('recorder', () => {
  it('survives cleanup: a fireball the game removed is still exported with tDeath and hitPos', () => {
    const r = recordedGame()
    r.tick({ fire: true, lookDY: 300 }, DT) // look down: ground hit
    const id = r.game.fireballs[0].id
    let steps = 0
    while (r.game.fireballs.some((f) => f.id === id) && steps++ < 10000) r.tick({}, DT)
    expect(r.game.fireballs).toHaveLength(0)
    const fb = roundTrip(r.rec).objects.find((o) => o.id === id)
    expect(fb.kind).toBe('fireball')
    expect(Number.isFinite(fb.line.tDeath)).toBe(true)
    expect(fb.line.hitPos).not.toBeNull()
    expect(fb.line.hitPos.y).toBeCloseTo(0, 1)
    expect(fb.extra).toMatchObject({ radius: 0.3 })
    const burst = roundTrip(r.rec).objects.find((o) => o.kind === 'burst')
    expect(burst.extra.particleVels).toHaveLength(16)
    expect(burst.extra.particleRadius).toBe(0.12)
    expect(burst.extra.big).toBe(false)
  })

  it('restart clears: the export holds only the new round', () => {
    const { game, rec, tick } = recordedGame()
    for (let i = 0; i < 60; i++) tick({ moveF: 1, fire: true, keys: i === 10 ? ['Digit1'] : [] }, DT)
    const oldIds = new Set(game.fireballs.map((f) => f.id))
    expect(oldIds.size).toBeGreaterThan(0)
    tick({ restart: true }, DT)
    for (let i = 0; i < 30; i++) tick({ moveF: 1, fire: i === 5 }, DT)
    const log = rec.exportLog()
    expect(log.frames.t[0]).toBe(0)
    expect(log.frames.tau[0]).toBe(0)
    expect(log.frames.t).toHaveLength(31)
    expect(log.objects.filter((o) => o.kind === 'fireball')).toHaveLength(1)
    expect(log.objects.some((o) => oldIds.has(o.id))).toBe(false)
    expect(log.flagChanges).toEqual([{ t: 0, flags: { aberration: false, delay: true, doppler: true, searchlight: true } }])
    expect(log.round).toMatchObject({ status: game.round.status, score: 0 })
  })

  it('records targets once with their spec index, and N as a flag change', () => {
    const { rec, tick } = recordedGame({ targets: [{ id: 'a', pos: [0, 1.6, 30], radius: 1 }, { id: 'b', pos: [5, 1.6, 30], radius: 1 }] })
    tick({}, DT)
    tick({ keys: ['KeyN'] }, DT)
    tick({ keys: ['KeyM'] }, DT) // ui toggle: not recorded
    const log = roundTrip(rec)
    expect(log.objects.map((o) => [o.id, o.kind, o.extra.specIndex])).toEqual([['a', 'target', 0], ['b', 'target', 1]])
    expect(log.objects[0].line.tBirth).toBe(-Infinity)
    expect(log.objects[0].line.tDeath).toBe(Infinity)
    expect(log.flagChanges).toHaveLength(2)
    expect(log.flagChanges[1].flags).toEqual({ aberration: false, delay: false, doppler: false, searchlight: false })
  })

  it('decimates 120 steps/s to 60 samples/s and keeps the latest sample', () => {
    const { game, rec, tick } = recordedGame()
    for (let i = 0; i < 120; i++) tick({ moveF: 1 }, 1 / 120)
    const log = rec.exportLog()
    expect(log.frames.t).toHaveLength(61) // 60 decimated samples plus the latest
    for (let i = 1; i < 60; i++) expect(log.frames.tau[i] - log.frames.tau[i - 1]).toBeCloseTo(1 / 60, 5)
    expect(log.frames.tau[60]).toBeCloseTo(game.player.tau, 6)
    tick({ moveF: 1 }, 1 / 120)
    expect(rec.exportLog().frames.t).toHaveLength(61) // latest is now a regular sample
    tick({ moveF: 1 }, 1 / 120)
    expect(rec.exportLog().frames.t).toHaveLength(62)
    expect(rec.exportLog().frames.t).toHaveLength(62) // export does not mutate
  })

  it('stores meta and rounds frame columns', () => {
    const { game, rec, tick } = recordedGame({ settings: { cruiseBeta: 0.3 } })
    tick({ moveF: 1, lookDX: 123 }, DT)
    const log = rec.exportLog()
    expect(log.meta).toMatchObject({ format: 'einstein-spacetime', version: 1, seed: SEED, generatorVersion: 1, geometryHash: fakeHash(SEED), c: 20 })
    expect(log.meta.settings.cruiseBeta).toBe(0.3)
    expect(Number.isNaN(Date.parse(log.meta.createdAt))).toBe(false)
    expect(log.frames.pos[2]).toBe(Math.round(game.player.pos.z * 1e5) / 1e5)
    expect(log.frames.yaw[0]).toBe(Math.round(game.player.yaw * 1e6) / 1e6)
    expect(JSON.stringify(log)).not.toMatch(/Infinity/)
  })
})

describe('readLog', () => {
  it('generator mismatch: a tampered geometryHash throws', () => {
    const game = makeGame()
    const rec = createRecorder(SEED, game.island) // real shapeHash
    rec.observe(game)
    const json = JSON.parse(JSON.stringify(rec.exportLog()))
    expect(json.meta.geometryHash).toBe(shapeHash(SEED))
    expect(() => readLog(json)).not.toThrow()
    json.meta.geometryHash = 'deadbeef'
    expect(() => readLog(json)).toThrow('generator mismatch')
  })

  it('rejects a wrong format or version', () => {
    const { rec, tick } = recordedGame()
    tick(idle(), DT)
    const json = rec.exportLog()
    expect(() => readLog({ ...json, meta: { ...json.meta, format: 'x' } }, { shapeHash: fakeHash })).toThrow()
    expect(() => readLog({ ...json, meta: { ...json.meta, version: 2 } }, { shapeHash: fakeHash })).toThrow()
  })

  it('frameAt / tauToT interpolate between samples', () => {
    const { rec, tick } = recordedGame()
    for (let i = 0; i < 120; i++) tick({ moveF: 1, boost: true, lookDX: 50 }, 1 / 120)
    const { frames } = roundTrip(rec)
    const i = 40
    const tMid = (frames.t[i] + frames.t[i + 1]) / 2
    const f = frameAt(frames, tMid)
    expect(f.t).toBeCloseTo(tMid, 12)
    expect(f.tau).toBeCloseTo((frames.tau[i] + frames.tau[i + 1]) / 2, 12)
    expect(f.pos.z).toBeCloseTo((frames.pos[3 * i + 2] + frames.pos[3 * i + 5]) / 2, 12)
    expect(frameAt(frames, frames.t[i]).yaw).toBe(frames.yaw[i])
    expect(tauToT(frames, frames.tau[i])).toBeCloseTo(frames.t[i], 12)
    expect(tToTau(frames, tauToT(frames, 0.3))).toBeCloseTo(0.3, 12)
    expect(frameAtTau(frames, 1e9).t).toBe(frames.t[frames.length - 1]) // clamped
    expect(frameAt(frames, -5).t).toBe(frames.t[0])
  })

  it('interpolates yaw along the shortest arc', () => {
    const frames = {
      length: 2,
      t: Float64Array.of(0, 1), tau: Float64Array.of(0, 1),
      pos: new Float64Array(6), vel: new Float64Array(6),
      yaw: Float64Array.of(Math.PI - 0.1, -Math.PI + 0.1), pitch: Float64Array.of(0, 0.2),
    }
    const f = frameAt(frames, 0.5)
    expect(Math.cos(f.yaw)).toBeCloseTo(-1, 12)
    expect(f.pitch).toBeCloseTo(0.1, 12)
  })
})
