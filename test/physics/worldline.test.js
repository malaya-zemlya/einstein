import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { Worldline } from '../../src/physics/worldline.js'
import { vec3 } from '../../src/math/vec3.js'

describe('Worldline', () => {
  const line = new Worldline({ p: vec3(40, 0, 0), t0: 0, u: vec3(), tBirth: 0, tDeath: 1 })
  it('retardedTime respects the life interval', () => {
    expect(line.retardedTime(vec3(), 2.5)).toBeCloseTo(0.5, 12)
    expect(line.retardedTime(vec3(), 3.5)).toBeNull()
  })
  it('hasBeenSeenDead flips at the analytic time (extent 0 and 1)', () => {
    expect(line.hasBeenSeenDead(vec3(), 1 + 40 / C - 1e-9)).toBe(false)
    expect(line.hasBeenSeenDead(vec3(), 1 + 40 / C)).toBe(true)
    expect(line.hasBeenSeenDead(vec3(), 1 + 41 / C, 1)).toBe(false)
    expect(line.hasBeenSeenDead(vec3(), 1 + 42 / C, 1)).toBe(true)
  })
  it('lightHasPassed after 1000 m of light travel', () => {
    expect(line.lightHasPassed(1 + 999 / C)).toBe(false)
    expect(line.lightHasPassed(1 + 1000 / C)).toBe(true)
  })
})
