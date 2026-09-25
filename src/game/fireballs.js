import { FIREBALL_TEMP } from '../world/targets.js'
import { C } from '../physics/constants.js'
import { velocityAdd } from '../physics/lorentz.js'
import { Worldline } from '../physics/worldline.js'
import { addScaled, dot, scale } from '../math/vec3.js'
import { lookDirection } from '../math/orient.js'

// Launches along the true (aberrated) crosshair direction in the player frame.
export function tryFire(state, input) {
  const { player, settings } = state
  if (!input.fire || player.tau - state.lastFireTau < settings.fireCooldown) return
  state.lastFireTau = player.tau
  const f = lookDirection(player.yaw, player.pitch)
  const u = velocityAdd(player.vel, scale(f, settings.fireballBeta * C))
  const line = new Worldline({ p: addScaled(player.pos, f, 0.5), t0: state.worldTime, u, tBirth: state.worldTime })
  state.fireballs.push({ id: `f${state.nextId++}`, line, radius: 0.3, emitTemp: FIREBALL_TEMP })
  const alive = state.fireballs.filter((fb) => fb.line.tDeath === Infinity)
  if (alive.length > settings.maxFireballs) alive[0].line.tDeath = state.worldTime
  state.events.push({
    type: 'fire',
    backward: dot(f, player.vel) < 0 && dot(u, player.vel) > 0,
    aberrationOff: !state.flags.aberration && Math.hypot(player.vel.x, player.vel.y, player.vel.z) > 0.5 * C,
  })
}
