import { C } from './physics/constants.js'
import { vec3, normalize, scale } from './math/vec3.js'
import { velocityToRapidity } from './physics/lorentz.js'

// ?scenario=<name> presets for the visual checks in test/manual.md. Each sets a pose and a fixed
// observer velocity; the simulation is frozen so the view holds still.
const SUN = normalize(vec3(0.55, 0.766, 0.33))
const SUN_AZ = normalize(vec3(SUN.x, 0, SUN.z))
const moving = (dir, beta) => ({ vel: scale(normalize(dir), beta * C) })

const SCENARIOS = {
  aberration90: { yaw: 0, pitch: 0, ...moving(vec3(0, 0, 1), 0.9) },
  sunAhead: { yaw: Math.atan2(SUN.x, SUN.z), pitch: 0.6, ...moving(SUN_AZ, 0.5) },
  sunBehind: { yaw: Math.atan2(SUN.x, SUN.z), pitch: 0.6, ...moving(scale(SUN_AZ, -1), 0.5) },
  foliage: { yaw: 0.6, pitch: -0.05, ...moving(vec3(Math.sin(0.6), 0, Math.cos(0.6)), 0.3) },
  heatGlow: { yaw: 0, pitch: -0.25, ...moving(vec3(0, 0, 1), 0.96) },
  boost: { yaw: 0, pitch: 0, ...moving(vec3(0, 0, 1), 0.99) },
  shadows: { yaw: Math.atan2(-SUN.x, -SUN.z) + 0.4, pitch: -0.35, vel: vec3() },
  delaySideways: { yaw: 0, pitch: 0, vel: vec3(), live: true, fire: { yaw: Math.PI / 2 } },
  fireballLight: { yaw: 2.2, pitch: -0.08, vel: vec3(), live: true, fire: { yaw: 2.2 + 0.35 } },
  stress: { yaw: 0, pitch: 0.1, vel: vec3(), live: true, ring: 40 },
}

export const SCENARIO_NAMES = Object.keys(SCENARIOS)

// Returns {view(v), live}: `view` pins the observer velocity; `live` scenarios keep time running.
export function applyScenario(state, name, fireAt) {
  const sc = SCENARIOS[name]
  if (!sc) {
    console.warn(`unknown scenario ${name}`)
    return null
  }
  state.player.yaw = sc.yaw
  state.player.pitch = sc.pitch
  state.player.rapidity = velocityToRapidity(vec3(sc.vel.x, 0, sc.vel.z))
  state.player.vel = sc.vel
  if (sc.fire) fireAt(sc.fire.yaw)
  if (sc.ring) for (let i = 0; i < sc.ring; i++) fireAt((2 * Math.PI * i) / sc.ring)
  return { live: Boolean(sc.live), view: (v) => ({ ...v, observer: { ...v.observer, vel: sc.vel } }) }
}
