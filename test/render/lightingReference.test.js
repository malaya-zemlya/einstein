// Unit tests of the fireball lighting JS reference (render.md § Tests, Lighting parity).
import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { FIREBALL_T, bbBand } from '../../src/spectral/lut.js'
import { fireballLight } from './lightingReference.js'

const UP = { x: 0, y: 1, z: 0 }
const light = (over) => ({ origin: { x: 0, y: 2, z: 0 }, dt0: 0, vel: { x: 0, y: 0, z: 0 }, temp: FIREBALL_T, scale: 3, ...over })

describe('lightingReference.fireballLight', () => {
  it('a fireball at rest 2 m above flat ground lights the point below at π·scale·bb(T)·(0.3/2)²', () => {
    const E = fireballLight([light()], { x: 0, y: 0, z: 0 }, -5, UP)
    for (let i = 0; i < 12; i++) expect(E[i]).toBeCloseTo(Math.PI * 3 * bbBand(i, FIREBALL_T) * 0.0225, 12)
  })

  it('a fireball at 0.9C lights the ground behind its current position, bluer ahead than behind', () => {
    const L = light({ origin: { x: 0, y: 1, z: 0 }, vel: { x: 0.9 * C, y: 0, z: 0 } })
    const at = (x) => fireballLight([L], { x, y: 0, z: 0 }, 0, UP)
    let best = 0
    let bestY = -1
    for (let x = -10; x <= 10; x += 0.05) {
      const y = at(x)[5]
      if (y > bestY) { bestY = y; best = x }
    }
    expect(best).toBeLessThan(-0.1)
    const blueRed = (E) => E[2] / E[7]
    expect(blueRed(at(2))).toBeGreaterThan(blueRed(at(-2)))
  })

  it('switching delay off uses the current position; doppler off keeps the rest temperature', () => {
    const L = light({ origin: { x: 0, y: 1, z: 0 }, vel: { x: 0.9 * C, y: 0, z: 0 } })
    const E = fireballLight([L], { x: 0, y: 0, z: 0 }, 0, UP, { delay: false, doppler: false })
    expect(E[4]).toBeCloseTo(Math.PI * 3 * bbBand(4, FIREBALL_T) * 0.09, 12)
  })

  it('light emitted outside [birthRel, deathRel] does not count', () => {
    const E = fireballLight([light({ deathRel: -5.15 })], { x: 0, y: 0, z: 0 }, -5, UP) // light left at −5.1, after death
    expect(E.every((v) => v === 0)).toBe(true)
  })
})
