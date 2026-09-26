import { vec3 } from '../../src/math/vec3.js'
import { createGameState } from '../../src/game/state.js'

export function flatIsland({ slope = 0, shore = 85 } = {}) {
  const n = vec3(-slope, 1, 0)
  const l = Math.hypot(n.x, n.y, n.z)
  return {
    heightAt: (x) => slope * x,
    normalAt: () => vec3(n.x / l, n.y / l, n.z / l),
    materialAt: () => 'grass',
    SHORE_RADIUS: shore,
    spawn: { x: 0, z: 0 },
  }
}

export const target = (id, pos) => ({ id, pos, radius: 1.0, visualRadius: 0.8, geometry: null })

export function makeGame({ targets = [], slope = 0, shore = 85, settings } = {}) {
  return createGameState({ island: flatIsland({ slope, shore }), targets, settings })
}

export const idle = () => ({ moveF: 0, moveR: 0, boost: false, lookDX: 0, lookDY: 0, fire: false, keys: [], restart: false })
