import { vec3 } from './math/vec3.js'

// ?scenario=<name> presets: set pose, rapidity and flags for visual checks (see test/manual.md).
const SCENARIOS = {
  aberration90(state) {
    state.player.rapidity = vec3(0, 0, Math.atanh(0.9))
    state.settings.cruiseBeta = 0.9
  },
  sunAhead(state) {
    state.player.yaw = Math.atan2(0.55, 0.33)
    state.player.pitch = 0.6
    state.player.rapidity = vec3(0.55, 0, 0.33 * 0 + 0.33)
  },
  heatGlow(state) {
    state.player.pitch = -0.25
    state.player.rapidity = vec3(0, 0, Math.atanh(0.96))
  },
}

export function applyScenario(state, name) {
  const fn = SCENARIOS[name]
  if (!fn) console.warn(`unknown scenario ${name}`)
  else fn(state)
}
