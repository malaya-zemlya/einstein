import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { Worldline } from '../../src/physics/worldline.js'
import { vec3 } from '../../src/math/vec3.js'
import { mulberry32 } from '../../src/math/random.js'
import { DEFAULT_SETTINGS } from '../../src/game/state.js'
import { createRecorder } from '../../src/record/recorder.js'
import { fakeHash } from './helpers.js'

// Synthetic GameState: 10 min at 120 steps/s, player circling at 0.9c, one fireball every 36 steps.
describe('size', () => {
  it('10 minutes with 2000 fireballs: ≤ 36,001 samples and < 5 MB', () => {
    const STEPS = 72000
    const dTau = 1 / 120
    const beta = 0.9
    const gamma = 1 / Math.sqrt(1 - beta * beta)
    const rand = mulberry32(99)
    const state = {
      player: { pos: vec3(), vel: vec3(), yaw: 0, pitch: 0, tau: 0 },
      worldTime: 0,
      round: { status: 'running', startTau: 0, startWorld: 0, endTau: 0, endWorld: 0, score: 0 },
      flags: { aberration: true, delay: true, doppler: true, searchlight: true },
      settings: { ...DEFAULT_SETTINGS },
      targetSpecs: [],
      targets: [],
      fireballs: [],
      bursts: [],
      events: [],
    }
    const rec = createRecorder(1, null, { shapeHash: fakeHash })
    let fired = 0
    for (let i = 1; i <= STEPS; i++) {
      const tau = i * dTau
      const t = gamma * tau
      const w = (beta * C) / 60 // 60 m circle radius
      state.player.tau = tau
      state.worldTime = t
      state.player.pos = vec3(60 * Math.cos(w * t), 1.6 + rand() * 0.2, 60 * Math.sin(w * t))
      state.player.vel = vec3(-beta * C * Math.sin(w * t), 0, beta * C * Math.cos(w * t))
      state.player.yaw += (rand() - 0.5) * 0.02
      state.player.pitch = 0.3 * Math.sin(tau)
      if (i % 36 === 0 && fired < 2000) {
        const u = vec3(0.7 * C * (rand() - 0.5), 0, 0.7 * C)
        const line = new Worldline({ p: { ...state.player.pos }, t0: t, u, tBirth: t })
        state.fireballs.push({ id: `f${fired++}`, line, radius: 0.3, emitTemp: 10000 })
        if (state.fireballs.length > 40) {
          const dead = state.fireballs.shift().line
          dead.tDeath = t
          dead.hitPos = dead.positionAt(t)
        }
      }
      rec.observe(state)
    }
    const log = rec.exportLog()
    expect(fired).toBe(2000)
    expect(log.objects).toHaveLength(2000)
    expect(log.frames.t.length).toBeLessThanOrEqual(36001)
    expect(log.frames.t.length).toBeGreaterThanOrEqual(35999)
    const bytes = JSON.stringify(log).length
    expect(bytes).toBeLessThan(5e6)
  })
})
