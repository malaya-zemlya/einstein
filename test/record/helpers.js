import { step } from '../../src/game/step.js'
import { createRecorder } from '../../src/record/recorder.js'
import { readLog } from '../../src/record/reader.js'
import { makeGame, idle } from '../game/helpers.js'

export { makeGame, idle, target } from '../game/helpers.js'

// The stub island has no seed, so tests inject a fake shape hash.
export const fakeHash = (seed) => `stub-${seed}`
export const SEED = 7

export function recordedGame(opts = {}) {
  const game = makeGame(opts)
  const rec = createRecorder(SEED, game.island, { shapeHash: fakeHash })
  const tick = (input, dTau) => {
    step(game, { ...idle(), ...input }, dTau)
    rec.observe(game)
  }
  return { game, rec, tick }
}

export const roundTrip = (rec) => readLog(JSON.parse(JSON.stringify(rec.exportLog())), { shapeHash: fakeHash })
