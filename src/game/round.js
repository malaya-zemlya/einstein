import { C } from '../physics/constants.js'
import { distance } from '../math/vec3.js'

export function startRoundIfNeeded(state, moved, fired, dTau, dt) {
  const { round, player } = state
  if (round.status !== 'ready' || !(moved || fired)) return
  round.status = 'running'
  round.startTau = player.tau - dTau
  round.startWorld = state.worldTime - dt
}

// A hit counts when light from the impact point reaches the eye.
export function updateHitVisibility(state) {
  const { round, player } = state
  for (const hit of state.hits) {
    if (hit.seen || C * (state.worldTime - hit.t) < distance(player.pos, hit.pos)) continue
    hit.seen = true
    round.score += 1
    state.events.push({ type: 'hitSeen', delayWorld: state.worldTime - hit.t })
  }
  if (round.status === 'running' && round.score === state.targetSpecs.length) {
    round.status = 'finished'
    round.endTau = player.tau
    round.endWorld = state.worldTime
    const tau = round.endTau - round.startTau
    const record = round.best === null || tau < round.best
    if (record) round.best = tau
    state.events.push({ type: 'roundFinished', tau, world: round.endWorld - round.startWorld, record })
  }
}
