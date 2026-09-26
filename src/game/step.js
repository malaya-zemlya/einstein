import { setC } from '../physics/constants.js'
import { length } from '../math/vec3.js'
import { SETTING_RANGES, resetTargets, spawnPlayer } from './state.js'
import { movePlayer } from './player.js'
import { tryFire } from './fireballs.js'
import { runCollisions } from './collision.js'
import { startRoundIfNeeded, updateHitVisibility } from './round.js'

const FLAG_KEYS = { Digit1: 'aberration', Digit2: 'delay', Digit3: 'doppler', Digit4: 'searchlight' }
const UI_KEYS = { KeyM: 'map', KeyH: 'captions', KeyF: 'frameTime', KeyV: 'sound' }
const PITCH_LIMIT = (85 * Math.PI) / 180
const TURN_RATE = 2.2 // rad/s of proper time for arrow-key turning
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

function mergeSettings(state, patch, devMode) {
  const s = state.settings
  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in s)) continue
    if (key === 'devC' && !devMode) continue
    if (key === 'adaptation') {
      if (s.adaptation !== Boolean(raw)) state.flagsDirty.adaptation = true
      s.adaptation = Boolean(raw)
      continue
    }
    const range = SETTING_RANGES[key]
    s[key] = range ? clamp(Number(raw), range[0], range[1]) : raw
  }
  s.boostBeta = clamp(s.boostBeta, s.cruiseBeta + 0.01, 0.999)
  state.events.push({ type: 'settings' })
}

function applyKeys(state, keys) {
  for (const code of keys) {
    if (code in FLAG_KEYS) {
      const name = FLAG_KEYS[code]
      state.flags[name] = !state.flags[name]
      state.events.push({ type: 'toggle', name, value: state.flags[name] })
    } else if (code === 'KeyN') {
      const anyOn = Object.values(state.flags).some(Boolean)
      for (const name of Object.keys(state.flags)) state.flags[name] = !anyOn
      state.events.push({ type: 'toggle', name: 'newtonian', value: anyOn })
    } else if (code in UI_KEYS) {
      const name = UI_KEYS[code]
      state.ui[name] = !state.ui[name]
      state.events.push({ type: 'toggle', name, value: state.ui[name] })
    }
  }
}

export function resetRound(state) {
  setC(state.settings.devC)
  resetTargets(state)
  state.fireballs = []
  state.bursts = []
  state.hits = []
  state.player = spawnPlayer(state.island, state.settings)
  state.worldTime = 0
  state.lastFireTau = -Infinity
  state.round = { status: 'ready', startTau: 0, startWorld: 0, endTau: 0, endWorld: 0, score: 0, best: state.round.best }
  state.flagsDirty.adaptation = true
}

// The only function that mutates GameState.
export function step(state, input, dTauRaw, { devMode = false } = {}) {
  const dTau = clamp(dTauRaw, 1e-6, 1 / 30)
  state.events = []
  if (input.settings) mergeSettings(state, input.settings, devMode)
  applyKeys(state, input.keys || [])
  if (input.restart) {
    resetRound(state)
    state.events.push({ type: 'restart' })
    return
  }
  const { player, settings } = state
  player.yaw -= (input.lookDX || 0) * settings.lookSens + (input.turn || 0) * TURN_RATE * dTau
  player.pitch = clamp(player.pitch - (input.lookDY || 0) * settings.lookSens, -PITCH_LIMIT, PITCH_LIMIT)

  const { dt, wish } = movePlayer(state, input, dTau)
  startRoundIfNeeded(state, length(wish) > 0, Boolean(input.fire), dTau, dt)
  tryFire(state, input)
  runCollisions(state, dt)
  updateHitVisibility(state)

  const t = state.worldTime
  const keep = (o) => !o.line.lightHasPassed(t)
  state.fireballs = state.fireballs.filter(keep)
  state.bursts = state.bursts.filter(keep)
  state.targets = state.targets.filter(keep)
}
