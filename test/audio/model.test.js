import { describe, it, expect } from 'vitest'
import { C, C_SOUND } from '../../src/physics/constants.js'
import { vec3 } from '../../src/math/vec3.js'
import {
  MAX_EMISSION_AGE, audibleFraction, buffetGain, drainHeard, gain, hearTime, isHeard, pan, playbackRate,
} from '../../src/audio/model.js'
import { createAudio } from '../../src/audio/engine.js'

describe('constants', () => {
  it('uses the default c = 20, c_s = 10', () => {
    expect(C).toBe(20)
    expect(C_SOUND).toBe(10)
  })
})

describe('hearTime / isHeard', () => {
  const e = { kind: 'boom', pos: vec3(30, 0, 0), t: 2 }
  it('at rest 30 m away, the sound is heard 3.0 s later', () => {
    expect(hearTime(e, vec3())).toBeCloseTo(5.0, 12)
    expect(isHeard(e, vec3(), 4.999)).toBe(false)
    expect(isHeard(e, vec3(), 5.0)).toBe(true)
  })
})

describe('playbackRate', () => {
  it('is 1 at rest', () => {
    expect(playbackRate(vec3(), vec3(1, 0, 0))).toBe(1)
  })
  it('approaching at 0.5·C_SOUND gives γ(0.25c)·1.5 = 1.549', () => {
    // Source ahead at +x; sound travels along −x toward the player moving +x.
    const r = playbackRate(vec3(0.5 * C_SOUND, 0, 0), vec3(-1, 0, 0))
    expect(r).toBeCloseTo(1.5 / Math.sqrt(1 - 0.25 ** 2), 9)
    expect(r).toBeCloseTo(1.549, 3)
  })
  it('receding lowers the pitch and clamps to [0.25, 4]', () => {
    expect(playbackRate(vec3(0.5 * C_SOUND, 0, 0), vec3(1, 0, 0))).toBeLessThan(1)
    expect(playbackRate(vec3(0.99 * C_SOUND, 0, 0), vec3(1, 0, 0))).toBe(0.25)
    expect(playbackRate(vec3(1.9 * C_SOUND, 0, 0), vec3(-1, 0, 0))).toBe(4)
  })
})

describe('outrunning sound', () => {
  it('an emission behind a player receding at 2·C_SOUND is never heard, and is dropped after 30 s', () => {
    const v = 2 * C_SOUND
    const dt = 1 / 60
    let queue = [{ kind: 'boom', pos: vec3(-1, 0, 0), t: 0 }]
    let heardAny = false
    for (let i = 1; i <= 32 * 60; i++) {
      const t = i * dt
      const r = drainHeard(queue, vec3(v * t, 0, 0), t)
      if (r.heard.length) heardAny = true
      queue = r.pending
      if (t < MAX_EMISSION_AGE - dt) expect(queue).toHaveLength(1)
    }
    expect(heardAny).toBe(false)
    expect(queue).toHaveLength(0)
  })

  it('catch-up: a hit 20 m behind a player at 1.5·C_SOUND who then stops is heard at the analytic time', () => {
    const v = 1.5 * C_SOUND
    const tStop = 2
    const path = (t) => vec3(v * Math.min(t, tStop), 0, 0)
    const e = { kind: 'boom', pos: vec3(-20, 0, 0), t: 0 }
    // Front at −20 + c_s·t meets the parked player at v·tStop.
    const analytic = (20 + v * tStop) / C_SOUND
    expect(analytic).toBeCloseTo(5, 12)
    const dt = 1 / 1000
    let heardAt = null
    let queue = [e]
    for (let i = 1; i <= 10000 && heardAt === null; i++) {
      const t = i * dt
      const r = drainHeard(queue, path(t), t)
      queue = r.pending
      if (r.heard.length) heardAt = t
    }
    expect(heardAt).not.toBeNull()
    expect(Math.abs(heardAt - analytic)).toBeLessThanOrEqual(dt + 1e-9)
    expect(hearTime(e, path(heardAt))).toBeCloseTo(analytic, 12)
  })
})

describe('audibleFraction', () => {
  it('is 1 at and below C_SOUND, and 0.75 at 2·C_SOUND', () => {
    expect(audibleFraction(0)).toBe(1)
    expect(audibleFraction(C_SOUND)).toBe(1)
    expect(audibleFraction(2 * C_SOUND)).toBeCloseTo(0.75, 12)
  })
})

describe('buffetGain', () => {
  it('peaks at C_SOUND and fades either side', () => {
    expect(buffetGain(C_SOUND)).toBe(1)
    expect(buffetGain(0.6 * C_SOUND)).toBeLessThan(0.01)
    expect(buffetGain(1.4 * C_SOUND)).toBeLessThan(0.01)
  })
})

describe('gain', () => {
  it('is 1/(1 + d/15)', () => {
    expect(gain(0)).toBe(1)
    expect(gain(15)).toBe(0.5)
  })
})

describe('pan', () => {
  // kHat is the direction the sound travels (source → listener).
  it('facing +z (yaw 0), right is −x', () => {
    expect(pan(vec3(1, 0, 0), 0)).toBeCloseTo(1, 12) // source at −x: right
    expect(pan(vec3(-1, 0, 0), 0)).toBeCloseTo(-1, 12) // source at +x: left
    expect(pan(vec3(0, 0, -1), 0)).toBeCloseTo(0, 12) // source ahead: centre
  })
  it('facing +x (yaw π/2), right is +z (rightOf = (−cos yaw, 0, sin yaw))', () => {
    expect(pan(vec3(0, 0, -1), Math.PI / 2)).toBeCloseTo(1, 12) // source at +z: right
    expect(pan(vec3(0, 0, 1), Math.PI / 2)).toBeCloseTo(-1, 12)
  })
  it('ignores elevation and is 0 straight overhead', () => {
    expect(pan(vec3(0, -1, 0), 0)).toBe(0)
    expect(pan(vec3(0.6, -0.8, 0), 0)).toBeCloseTo(1, 12)
  })
})

describe('engine without Web Audio', () => {
  it('is a silent no-op in Node', () => {
    const audio = createAudio()
    expect(audio.start()).toBe(false)
    const state = {
      events: [{ type: 'impact', kind: 'target', pos: vec3(), t: 0 }, { type: 'fire' }, { type: 'sonic' }],
      player: { pos: vec3(), vel: vec3(), yaw: 0, boosting: true },
      worldTime: 0, ui: { sound: true }, settings: { volume: 0.5 },
    }
    expect(() => audio.update(state)).not.toThrow()
    audio.setReplayEmissions([{ kind: 'boom', pos: vec3(), t: 0 }])
    expect(() => audio.updateReplay({ rate: 1 }, { observer: state.player, worldTime: 1 })).not.toThrow()
    expect(() => audio.setVolume(0.3)).not.toThrow()
  })
})
