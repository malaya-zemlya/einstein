import { vec3, fromArray } from '../math/vec3.js'
import { Worldline } from '../physics/worldline.js'

export const DEFAULT_SETTINGS = Object.freeze({
  cruiseBeta: 0.4,
  boostBeta: 0.99,
  rampCruiseTime: 1.0,
  rampBoostTime: 2.5,
  fireballBeta: 0.7,
  volume: 0.8,
  headroom: 8,
  adaptation: true,
  devC: 20,
  fireCooldown: 0.25,
  maxFireballs: 40,
  eyeHeight: 1.6,
  lookSens: 0.002,
})

export const SETTING_RANGES = Object.freeze({
  rampCruiseTime: [0.2, 10],
  rampBoostTime: [0.2, 10],
  cruiseBeta: [0.05, 0.9],
  boostBeta: [0.06, 0.999],
  fireballBeta: [0.1, 0.99],
  volume: [0, 1],
  headroom: [1, 16],
  devC: [5, 80],
})

const makeTarget = (spec) => ({
  id: spec.id,
  spec,
  line: new Worldline({ p: fromArray(spec.pos), t0: 0, u: vec3() }),
})

export function spawnPlayer(island, settings) {
  return {
    pos: vec3(0, island.heightAt(0, 0) + settings.eyeHeight, 0),
    vel: vec3(),
    rapidity: vec3(),
    yaw: 0, // facing +z
    pitch: 0,
    tau: 0,
    boosting: false,
  }
}

export function createGameState({ island, targets, settings = {} }) {
  const s = { ...DEFAULT_SETTINGS, ...settings }
  return {
    island,
    targetSpecs: targets,
    player: spawnPlayer(island, s),
    worldTime: 0,
    flags: { aberration: true, delay: true, doppler: true, searchlight: true },
    ui: { map: true, captions: true, frameTime: false, sound: true },
    settings: s,
    fireballs: [],
    targets: targets.map(makeTarget),
    bursts: [],
    hits: [],
    round: { status: 'ready', startTau: 0, startWorld: 0, endTau: 0, endWorld: 0, score: 0, best: null },
    lastFireTau: -Infinity,
    nextId: 1,
    events: [],
    flagsDirty: { adaptation: true },
  }
}

export function resetTargets(state) {
  state.targets = state.targetSpecs.map(makeTarget)
}
