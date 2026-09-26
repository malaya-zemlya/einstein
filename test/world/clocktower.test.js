import { describe, it, expect } from 'vitest'
import { C } from '../../src/physics/constants.js'
import { buildClockTower, clockHands, handAngle, clockSeconds, formatClock, towerTimeSeen, towerFaces } from '../../src/world/clocktower.js'
import { maxEdgeLength } from '../../src/world/geometry.js'

const stubBands = () => new Float32Array(12)

describe('clock tower', () => {
  it('builds within the prop edge limit at low quality', () => {
    const { spec, faces } = buildClockTower(() => 3, 'low', stubBands)
    expect(maxEdgeLength(spec)).toBeLessThanOrEqual(0.25 + 1e-9)
    expect(faces).toHaveLength(4)
  })

  it('hands point up at 12:00:00; the hour hand is at 3 o\'clock at 15:00', () => {
    const south = towerFaces(0).find((f) => f.normal[2] === -1) // seen from spawn (south, looking north)
    const spec = clockHands([south], [12 * 3600], stubBands)
    let far = [0, 0]
    for (let i = 0; i < spec.positions.length / 3; i++) {
      const d = [spec.positions[3 * i] - south.centre[0], spec.positions[3 * i + 1] - south.centre[1]]
      if (Math.hypot(...d) > Math.hypot(...far)) far = d
    }
    expect(Math.abs(far[0])).toBeLessThan(0.05)
    expect(far[1]).toBeGreaterThan(1.2)
    expect(handAngle(15 * 3600, 43200)).toBeCloseTo(Math.PI / 2, 12)
    expect(handAngle(15 * 3600 + 30, 60)).toBeCloseTo(Math.PI, 12)
    // seen from the south looking north, the viewer's right is +x: 3 o'clock points +x
    expect(south.right).toEqual([1, 0, 0])
  })

  it('shows island time delayed by the light travel time', () => {
    expect(towerTimeSeen([0, 10, 0], { x: 0, y: 10, z: 40 }, 100, true)).toBeCloseTo(100 - 40 / C, 12)
    expect(towerTimeSeen([0, 10, 0], { x: 0, y: 10, z: 40 }, 100, false)).toBe(100)
  })

  it('formats and wraps local clock time', () => {
    const start = new Date(2026, 8, 25, 23, 59, 50).getTime()
    expect(formatClock(clockSeconds(start, 0))).toBe('23:59:50')
    expect(formatClock(clockSeconds(start, 15))).toBe('00:00:05')
  })
})
