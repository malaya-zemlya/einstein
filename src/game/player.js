import { C, C_SOUND } from '../physics/constants.js'
import { gamma, stepRapidity } from '../physics/lorentz.js'
import { vec3, add, scale, length, normalize, addScaled, dot } from '../math/vec3.js'

// Horizontal unit vectors for a yaw angle (yaw 0 faces +z).
export const forwardOf = (yaw) => vec3(Math.sin(yaw), 0, Math.cos(yaw))
export const rightOf = (yaw) => vec3(-Math.cos(yaw), 0, Math.sin(yaw))

export { lookDirection } from '../math/orient.js'

export function wishDirection(input, yaw) {
  const w = add(scale(forwardOf(yaw), input.moveF || 0), scale(rightOf(yaw), input.moveR || 0))
  return normalize(w)
}

// Advances rapidity, velocity, proper and world time, and position for one step. Returns {dt, wish}.
export function movePlayer(state, input, dTau) {
  const { player, settings, island } = state
  const wish = wishDirection(input, player.yaw)
  const moving = length(wish) > 0
  const betaStar = moving ? (input.boost ? settings.boostBeta : settings.cruiseBeta) : 0
  const phiTarget = scale(wish, Math.atanh(betaStar))
  const phiCruise = Math.atanh(settings.cruiseBeta)
  const cruiseRate = phiCruise / settings.rampCruiseTime
  const boostRate = (Math.atanh(settings.boostBeta) - phiCruise) / settings.rampBoostTime
  const rate = input.boost || length(player.rapidity) > phiCruise + 1e-6 ? boostRate : cruiseRate
  player.rapidity = stepRapidity(player.rapidity, phiTarget, rate, dTau)
  player.boosting = Boolean(input.boost && moving)

  const phi = length(player.rapidity)
  const speedBefore = length(player.vel)
  if (phi === 0) {
    player.vel = vec3()
  } else {
    const s = C * Math.tanh(phi)
    const c = scale(player.rapidity, 1 / phi)
    const n = island.normalAt(player.pos.x, player.pos.z)
    const g = -(n.x * c.x + n.z * c.z) / n.y
    player.vel = scale(normalize(vec3(c.x, g, c.z)), s)
  }
  const dt = gamma(player.vel) * dTau
  state.worldTime += dt
  player.tau += dTau
  const p = addScaled(player.pos, player.vel, dt)
  player.pos = vec3(p.x, island.heightAt(p.x, p.z) + settings.eyeHeight, p.z)
  clampToShore(state)
  if (speedBefore <= C_SOUND && length(player.vel) > C_SOUND) state.events.push({ type: 'sonic' })
  return { dt, wish }
}

function clampToShore(state) {
  const { player, island, settings } = state
  const r = Math.hypot(player.pos.x, player.pos.z)
  if (r <= island.SHORE_RADIUS) return
  const k = island.SHORE_RADIUS / r
  const x = player.pos.x * k
  const z = player.pos.z * k
  player.pos = vec3(x, island.heightAt(x, z) + settings.eyeHeight, z)
  const out = vec3(x / island.SHORE_RADIUS, 0, z / island.SHORE_RADIUS)
  const radial = dot(player.rapidity, out)
  if (radial > 0) player.rapidity = addScaled(player.rapidity, out, -radial)
}
