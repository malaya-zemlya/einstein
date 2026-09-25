import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { gamma, velocityAdd, stepRapidity, rapidityToVelocity, velocityToRapidity } from '../../src/physics/lorentz.js'
import { vec3, length, scale } from '../../src/math/vec3.js'
import { mulberry32, randomDir } from './rng.js'

describe('gamma', () => {
  it('is 1 at rest and 2.2942 at 0.9c', () => {
    expect(gamma(vec3())).toBe(1)
    expect(gamma(vec3(0.9 * C, 0, 0))).toBeCloseTo(2.2941573, 6)
  })
  it('throws at and above C', () => {
    expect(() => gamma(vec3(C, 0, 0))).toThrow(RangeError)
    expect(() => gamma(vec3(0, 1.1 * C, 0))).toThrow(RangeError)
  })
})

describe('velocityAdd', () => {
  it('matches (a+b)/(1+ab) for collinear velocities', () => {
    const u = velocityAdd(vec3(0.6 * C, 0, 0), vec3(0.7 * C, 0, 0))
    expect(u.x / C).toBeCloseTo((0.6 + 0.7) / (1 + 0.42), 12)
  })
  it('backward fireball fixture: 0.99c frame, −0.9c shot → +0.8257c', () => {
    const u = velocityAdd(vec3(0.99 * C, 0, 0), vec3(-0.9 * C, 0, 0))
    expect(u.x / C).toBeCloseTo(0.09 / 0.109, 9)
    expect(u.x / C).toBeCloseTo(0.8257, 4)
  })
  it('is the identity for a zero shot', () => {
    const v = vec3(3, -4, 5)
    const u = velocityAdd(v, vec3())
    expect(u.x).toBeCloseTo(3, 12)
    expect(u.y).toBeCloseTo(-4, 12)
    expect(u.z).toBeCloseTo(5, 12)
  })
  it('stays subluminal for 1000 random pairs', () => {
    const rand = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const v = scale(randomDir(rand), 0.999 * C * rand())
      const w = scale(randomDir(rand), 0.999 * C * rand())
      expect(length(velocityAdd(v, w))).toBeLessThan(C)
    }
  })
})

describe('rapidity ramp', () => {
  it('round-trips velocity ↔ rapidity', () => {
    const v = vec3(0.3 * C, -0.5 * C, 0.2 * C)
    const back = rapidityToVelocity(velocityToRapidity(v))
    expect(back.x).toBeCloseTo(v.x, 10)
    expect(back.y).toBeCloseTo(v.y, 10)
    expect(back.z).toBeCloseTo(v.z, 10)
  })
  it('never overshoots its target', () => {
    const target = vec3(1, 0, 0)
    const phi = stepRapidity(vec3(0.95, 0, 0), target, 10, 1)
    expect(phi).toEqual(target)
  })
  it('default cruise ramp: 0.4c after 1.0 s at atanh(0.4)/s; cap 0.99c 2.5 s later', () => {
    const cruiseRate = Math.atanh(0.4) / 1.0
    const boostRate = (Math.atanh(0.99) - Math.atanh(0.4)) / 2.5
    expect(cruiseRate).toBeCloseTo(0.4236, 4)
    expect(boostRate).toBeCloseTo(0.8892, 4)
    let phi = vec3()
    for (let i = 0; i < 60; i++) phi = stepRapidity(phi, vec3(Math.atanh(0.4), 0, 0), cruiseRate, 1 / 60)
    expect(length(rapidityToVelocity(phi)) / C).toBeCloseTo(0.4, 6)
    for (let i = 0; i < 150; i++) phi = stepRapidity(phi, vec3(Math.atanh(0.99), 0, 0), boostRate, 1 / 60)
    expect(length(rapidityToVelocity(phi)) / C).toBeCloseTo(0.99, 6)
  })
  it('stays below C after 10 s of boost toward 0.999c', () => {
    let phi = vec3()
    for (let i = 0; i < 600; i++) phi = stepRapidity(phi, vec3(Math.atanh(0.999), 0, 0), 2, 1 / 60)
    expect(length(rapidityToVelocity(phi))).toBeLessThan(C)
  })
})
