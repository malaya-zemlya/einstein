import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { retardedDelay, boostEvent, dopplerFactor, apparent } from '../../src/physics/lightcone.js'
import { vec3, length, sub, scale, addScaled, dot } from '../../src/math/vec3.js'
import { mulberry32, randomDir } from './rng.js'

const ON = { aberration: true, delay: true }
const OFF = { aberration: false, delay: false }
const staticVertex = (p) => ({ p, local: vec3(), u: vec3(), dt0: 0, birthRel: -1e30, deathRel: 1e30, hitLocal: null })
const observer = (beta) => ({ x: vec3(), v: vec3(beta * C, 0, 0) })

describe('retardedDelay', () => {
  it('equals |r|/C for a static point', () => {
    expect(retardedDelay(vec3(3, 4, 0), vec3())).toBeCloseTo(5 / C, 14)
  })
  it('satisfies the light-cone equation for 1000 random cases up to 0.9995C', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const r = scale(randomDir(rand), 0.1 + 300 * rand())
      const u = scale(randomDir(rand), 0.9995 * C * rand())
      const d = retardedDelay(r, u)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(Math.abs(length(addScaled(r, u, -d)) - C * d)).toBeLessThan(1e-9 * length(r))
    }
  })
  it('keeps float32 relative error < 1e-5 when a = C² − u² comes precomputed in double (guards the WGSL port)', () => {
    const f = Math.fround
    const delayF32 = (r, u, aDouble) => {
      const c = f(f(f(r.x * r.x) + f(r.y * r.y)) + f(r.z * r.z))
      if (c === 0) return 0
      const a = f(aDouble)
      const b = f(f(f(r.x * u.x) + f(r.y * u.y)) + f(r.z * u.z))
      const disc = f(Math.sqrt(f(f(b * b) + f(a * c))))
      return b >= 0 ? f(c / f(b + disc)) : f(f(-b + disc) / a)
    }
    const rand = mulberry32(11)
    for (let i = 0; i < 1000; i++) {
      const r = scale(randomDir(rand), 0.5 + 200 * rand())
      const u = scale(randomDir(rand), 0.9995 * C * rand())
      const exact = retardedDelay(r, u)
      const fr = { x: f(r.x), y: f(r.y), z: f(r.z) }
      const fu = { x: f(u.x), y: f(u.y), z: f(u.z) }
      expect(Math.abs(delayF32(fr, fu, C * C - dot(u, u)) - exact) / exact).toBeLessThan(1e-5)
    }
  })
})

describe('boostEvent', () => {
  it('preserves the spacetime interval and inverts with −v', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      const v = scale(randomDir(rand), 0.99 * C * rand())
      const dx = scale(randomDir(rand), 100 * rand())
      const dt = 10 * (rand() - 0.5)
      const b = boostEvent(dt, dx, v)
      const s1 = C * C * dt * dt - dot(dx, dx)
      const s2 = C * C * b.dt * b.dt - dot(b.dx, b.dx)
      expect(Math.abs(s1 - s2)).toBeLessThan(1e-9 * (C * C * dt * dt + dot(dx, dx)))
      const back = boostEvent(b.dt, b.dx, scale(v, -1))
      expect(back.dt).toBeCloseTo(dt, 8)
      expect(length(sub(back.dx, dx))).toBeLessThan(1e-8 * (1 + length(dx)))
    }
  })
})

describe('dopplerFactor', () => {
  it('is γ(1+β) head-on and γ transverse in the world frame', () => {
    const v = vec3(0.9 * C, 0, 0)
    expect(dopplerFactor(vec3(-1, 0, 0), v, vec3())).toBeCloseTo(2.2941573 * 1.9, 6)
    expect(dopplerFactor(vec3(0, -1, 0), v, vec3())).toBeCloseTo(2.2941573, 6)
  })
})

describe('apparent (JS reference for the vertex shader)', () => {
  it('worked example: static vertex dead ahead appears at 43.59 m, D = 4.359', () => {
    const a = apparent(staticVertex(vec3(10, 0, 0)), observer(0.9), ON)
    expect(a.pos.x).toBeCloseTo(43.5890, 3)
    expect(a.pos.y).toBeCloseTo(0, 12)
    expect(a.D).toBeCloseTo(4.35890, 4)
  })
  it('worked example: abeam vertex appears 25.84° off forward, D = γ', () => {
    const a = apparent(staticVertex(vec3(0, 10, 0)), observer(0.9), ON)
    expect(a.pos.x).toBeCloseTo(20.6474, 3)
    expect(a.pos.y).toBeCloseTo(10, 9)
    expect((Math.atan2(a.pos.y, a.pos.x) * 180) / Math.PI).toBeCloseTo(25.84, 2)
    expect(a.D).toBeCloseTo(2.2941573, 6)
  })
  it('matches the aberration formula over an angle sweep (criterion 3)', () => {
    for (const beta of [0.5, 0.9]) {
      for (let deg = 0; deg <= 180; deg += 5) {
        const th = (deg * Math.PI) / 180
        const a = apparent(staticVertex(vec3(50 * Math.cos(th), 50 * Math.sin(th), 0)), observer(beta), ON)
        const expected = Math.acos((Math.cos(th) + beta) / (1 + beta * Math.cos(th)))
        expect(Math.atan2(a.pos.y, a.pos.x)).toBeCloseTo(expected, 9)
      }
      // swing-forward boundary: world angle acos(−β) appears at exactly 90°
      const th = Math.acos(-beta)
      const a = apparent(staticVertex(vec3(Math.cos(th), Math.sin(th), 0)), observer(beta), ON)
      expect(a.pos.x).toBeCloseTo(0, 9)
    }
  })
  it('with both flags off, pos equals the true relative position and D is still computed', () => {
    const v = { ...staticVertex(vec3(10, 0, 0)), u: vec3(0, 5, 0), dt0: 2 }
    const a = apparent(v, observer(0.5), OFF)
    expect(a.pos).toEqual(vec3(10, 10, 0))
    expect(a.D).toBeGreaterThan(1)
  })
  it('static vertex seen by a static observer has D = 1', () => {
    const a = apparent(staticVertex(vec3(4, 5, 6)), { x: vec3(), v: vec3() }, ON)
    expect(a.D).toBe(1)
  })
  it('birth boundary: a vertex born after its retarded time is invisible', () => {
    const v = { ...staticVertex(vec3(20, 0, 0)), birthRel: -0.5 } // light takes 1 s
    expect(apparent(v, observer(0), ON).visible).toBe(false)
    expect(apparent({ ...v, birthRel: -1.5 }, observer(0), ON).visible).toBe(true)
  })
  it('dissolve: death is delayed by the vertex distance from the hit point', () => {
    // vertex 20 m away (retarded time −1 s), died at −1.05 s, but 2 m from the hit → dissolves at −0.95 s
    const v = { ...staticVertex(vec3(20, 0, 0)), local: vec3(2, 0, 0), hitLocal: vec3(), deathRel: -1.05 }
    expect(apparent(v, observer(0), ON).visible).toBe(true)
    expect(apparent({ ...v, hitLocal: null }, observer(0), ON).visible).toBe(false)
  })
})
