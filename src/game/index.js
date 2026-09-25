import { buildIsland } from '../world/island.js'
import { placeTargets } from '../world/targets.js'
import { createGameState } from './state.js'

export { step, resetRound } from './step.js'
export { viewOf } from './view.js'
export { DEFAULT_SETTINGS } from './state.js'

export function createGame({ seed, quality = 'high', island, targets, settings } = {}) {
  const isl = island ?? buildIsland(seed, quality)
  const tg = targets ?? placeTargets(seed, isl, 12, quality)
  return createGameState({ island: isl, targets: tg, settings })
}
