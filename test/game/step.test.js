import { describe, it, expect } from 'vitest'
import { C, C_SOUND } from '../../src/physics/constants.js'
import { step } from '../../src/game/step.js'
import { apparent } from '../../src/physics/lightcone.js'
import { vec3, length, distance, sub } from '../../src/math/vec3.js'
import { makeGame, target, idle } from './helpers.js'

const DT = 1 / 60
const run = (state, input, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(state, input, DT)
}

describe('hit timing (criterion 13)', () => {
  it('hits at the analytic time and scores when the impact light arrives', () => {
    const g = makeGame({ targets: [target('t0', [0, 1.6, 60])] })
    step(g, { ...idle(), fire: true }, DT)
    const t0 = g.fireballs[0].line.t0
    let scoredAt = null
    for (let i = 0; i < 1000 && scoredAt === null; i++) {
      step(g, idle(), DT)
      if (g.round.score === 1) scoredAt = g.worldTime
    }
    const hit = g.hits[0]
    expect(hit.t - t0).toBeCloseTo((60 - 1.3 - 0.5) / (0.7 * C), 6)
    expect(hit.pos.x).toBeCloseTo(0, 9)
    expect(hit.pos.y).toBeCloseTo(1.6, 9)
    expect(hit.pos.z).toBeCloseTo(59, 9)
    const arrival = hit.t + distance(hit.pos, g.player.pos) / C
    expect(scoredAt).toBeGreaterThanOrEqual(arrival)
    expect(scoredAt - DT).toBeLessThan(arrival)
  })

  it('dissolve bound: every target vertex vanishes within 0.35 s of world time after scoring', () => {
    const g = makeGame({ targets: [target('t0', [0, 1.6, 60])] })
    step(g, { ...idle(), fire: true }, DT)
    while (g.round.score === 0) step(g, idle(), DT)
    const tg = g.targets[0]
    const scoreTime = g.worldTime
    // stick base 2.5 m below the centre, plus points on the balloon
    const locals = [vec3(0, -2.5, 0), vec3(0, 0.8, 0), vec3(0, 0, 0.8), vec3(0.8, 0, 0)]
    const hitLocal = sub(tg.line.hitPos, tg.line.p)
    const visibleAt = (t) => locals.some((local) => apparent(
      { p: vec3(local.x, 1.6 + local.y, 60 + local.z), local, u: vec3(), dt0: 0, birthRel: -1e30, deathRel: tg.line.tDeath - t, hitLocal },
      { x: g.player.pos, v: vec3() }, { aberration: true, delay: true }).visible)
    expect(visibleAt(scoreTime)).toBe(true)
    expect(visibleAt(scoreTime + 0.35)).toBe(false)
  })
})

describe('fireballs', () => {
  it('backward fireball at 0.99c moves forward at ≈0.9446c (criterion 4)', () => {
    const g = makeGame()
    g.player.rapidity = vec3(Math.atanh(0.99), 0, 0)
    g.player.yaw = -Math.PI / 2 // facing −x
    step(g, { ...idle(), fire: true, moveR: 0 }, DT)
    // player keeps rapidity target 0 but decelerates only slightly in one step
    const u = g.fireballs[0].line.u
    const v = g.player.vel.x / C
    expect(u.x / C).toBeCloseTo((v - 0.7) / (1 - v * 0.7), 9)
    expect(u.x / C).toBeGreaterThan(0.93)
  })

  it('cooldown: holding fire for 1 s of proper time spawns exactly 4 fireballs (criterion 12)', () => {
    const g = makeGame()
    for (let i = 0; i < 60; i++) step(g, { ...idle(), fire: true }, DT)
    expect(g.fireballs.length).toBe(4)
  })

  it('every fireball and burst velocity stays below C (1000-shot fuzz)', () => {
    const g = makeGame()
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 1000; i++) {
      g.player.rapidity = vec3(Math.atanh(0.99 * rand()), 0, Math.atanh(0.5 * rand()))
      g.player.yaw = 2 * Math.PI * rand()
      g.player.pitch = -0.4 * rand()
      g.lastFireTau = -Infinity
      step(g, { ...idle(), fire: true }, DT)
    }
    for (const f of g.fireballs) expect(length(f.line.u)).toBeLessThan(C)
    for (const b of g.bursts) for (const pv of b.particleVels) expect(length(pv)).toBeLessThan(C)
    expect(g.bursts.length).toBeGreaterThan(0)
  })

  it('the earlier of two simultaneous hits wins; the second fireball flies on', () => {
    const g = makeGame({ targets: [target('t0', [0, 1.6, 30])] })
    step(g, { ...idle(), fire: true }, DT)
    g.lastFireTau = -Infinity
    step(g, { ...idle(), fire: true }, DT)
    run(g, idle(), 3)
    expect(g.hits.length).toBe(1)
    expect(g.fireballs[0].line.tDeath).toBe(g.hits[0].t)
    expect(g.fireballs[1].line.tDeath).toBe(Infinity)
  })
})

describe('movement', () => {
  it('ramp: cruise 0.4c at 1.0 s, cap 0.99c 2.5 s later, back to cruise 2.5 s after release (criterion 10)', () => {
    const g = makeGame({ shore: 1e6 }) // at 0.99c the proper-time speed γv is ~140 m/s
    const fwd = { ...idle(), moveF: 1 }
    run(g, fwd, 1.0)
    expect(length(g.player.vel) / C).toBeCloseTo(0.4, 2)
    run(g, { ...fwd, boost: true }, 2.5)
    expect(length(g.player.vel) / C).toBeCloseTo(0.99, 2)
    run(g, fwd, 2.5)
    expect(length(g.player.vel) / C).toBeCloseTo(0.4, 2)
  })

  it('time dilation: steady 0.9c for 1 s of τ advances world time by 2.294 s', () => {
    const g = makeGame({ shore: 1e6, settings: { cruiseBeta: 0.9 } })
    g.player.rapidity = vec3(0, 0, Math.atanh(0.9))
    const t0 = g.worldTime
    run(g, { ...idle(), moveF: 1 }, 1)
    expect(g.worldTime - t0).toBeCloseTo(2.2941573, 4)
  })

  it('terrain: eye stays 1.6 m above a slope and |v| equals the ramp speed (criterion 11)', () => {
    const g = makeGame({ slope: 0.3 })
    g.player.yaw = Math.PI / 2 // facing +x, uphill
    for (let i = 0; i < 120; i++) {
      step(g, { ...idle(), moveF: 1 }, DT)
      expect(g.player.pos.y - 0.3 * g.player.pos.x).toBeCloseTo(1.6, 9)
      expect(length(g.player.vel)).toBeCloseTo(C * Math.tanh(length(g.player.rapidity)), 9)
    }
  })

  it('shore clamp keeps the player on the island', () => {
    const g = makeGame()
    run(g, { ...idle(), moveF: 1, boost: true }, 20)
    expect(Math.hypot(g.player.pos.x, g.player.pos.z)).toBeLessThanOrEqual(85 + 1e-9)
  })

  it('pushes one sonic event per upward crossing of the sound speed', () => {
    const g = makeGame({ shore: 1e6 })
    const sonic = []
    const fwd = { ...idle(), moveF: 1 }
    for (let i = 0; i < 400; i++) {
      step(g, i < 250 ? { ...fwd, boost: true } : idle(), DT)
      sonic.push(...g.events.filter((e) => e.type === 'sonic'))
    }
    expect(sonic.length).toBe(1)
    expect(C_SOUND).toBe(10)
  })
})

describe('toggles and round', () => {
  it('N: all-on → all-off, partial → all-off, all-off → all-on', () => {
    const g = makeGame()
    step(g, { ...idle(), keys: ['KeyN'] }, DT)
    expect(Object.values(g.flags).every((v) => !v)).toBe(true)
    step(g, { ...idle(), keys: ['KeyN'] }, DT)
    expect(Object.values(g.flags).every(Boolean)).toBe(true)
    step(g, { ...idle(), keys: ['Digit2', 'KeyN'] }, DT)
    expect(Object.values(g.flags).every((v) => !v)).toBe(true)
  })

  it('round state machine: ready → running → finished; R resets but keeps best', () => {
    const g = makeGame({ targets: [target('t0', [0, 1.6, 20])] })
    step(g, idle(), DT)
    expect(g.round.status).toBe('ready')
    step(g, { ...idle(), fire: true }, DT)
    expect(g.round.status).toBe('running')
    run(g, idle(), 5)
    expect(g.round.status).toBe('finished')
    const best = g.round.best
    expect(best).toBeGreaterThan(0)
    step(g, { ...idle(), restart: true }, DT)
    expect(g.round).toMatchObject({ status: 'ready', score: 0, best })
    expect(g.targets[0].line.tDeath).toBe(Infinity)
  })

  it('a dead target stays until its light has passed, then is removed', () => {
    const g = makeGame({ targets: [target('t0', [0, 1.6, 20])] })
    step(g, { ...idle(), fire: true }, DT)
    run(g, idle(), 5)
    expect(g.targets.length).toBe(1)
    run(g, idle(), 50)
    expect(g.targets.length).toBe(0)
    expect(g.round.status).toBe('finished')
  })
})
