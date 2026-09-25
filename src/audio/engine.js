// Audio engine: turns GameState / replay views into sound. Reads state, never writes it.
// Every method is a no-op until start() has created an AudioContext (none in Node).

import { gamma } from '../physics/lorentz.js'
import { length } from '../math/vec3.js'
import { MAX_EMISSION_AGE, ambienceDoppler, audibleFraction, buffetGain, drainHeard, isHeard, voiceParams } from './model.js'
import * as voices from './voices.js'

const ONE_SHOTS = { boom: voices.boom, thud: voices.thud, whoosh: voices.whoosh }
const MAX_PER_FRAME = 6 // heard one-shots played per frame; the rest are skipped
const REPLAY_JUMP = 0.5 // s of world time; a bigger clock jump is a scrub

export function createAudio() {
  let ctx = null
  let master = null // volume
  let mute = null // sound toggle
  let whine = null
  let rumble = null
  let amb = null
  let volume = 1
  let queue = [] // play-mode emissions still travelling
  let lastWorldTime = null
  let replay = { list: [], heard: [], lastTime: null }

  function start() {
    try {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext
        if (!AC) return false
        ctx = new AC()
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.ratio.value = 6
        comp.attack.value = 0.003
        comp.release.value = 0.2
        mute = ctx.createGain()
        master = ctx.createGain()
        master.gain.value = volume
        master.connect(comp).connect(mute).connect(ctx.destination)
        whine = voices.boostWhine(ctx, master)
        rumble = voices.buffet(ctx, master)
        amb = voices.ambience(ctx, master)
      }
      if (ctx.state === 'suspended') ctx.resume()
      return true
    } catch (err) {
      console.warn('audio unavailable', err)
      ctx = null
      return false
    }
  }

  const ready = () => ctx !== null

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v))
    if (ready()) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05)
  }

  function setMuted(off) {
    mute.gain.setTargetAtTime(off ? 0 : 1, ctx.currentTime, 0.03)
  }

  function playShot(kind, params) {
    ONE_SHOTS[kind](ctx, master, params)
  }

  function playHeard(list, observer, rateScale = 1) {
    for (const e of list.slice(0, MAX_PER_FRAME)) {
      const p = voiceParams(e, observer)
      playShot(e.kind, { ...p, rate: p.rate * rateScale })
    }
  }

  // Continuous voices from an observer's velocity.
  function driveContinuous(vel, boosting) {
    const speed = length(vel)
    const g = gamma(vel)
    whine.set({ freq: 70 * g, level: boosting ? 1 : 0 })
    rumble.set({ level: buffetGain(speed) })
    amb.set({ level: audibleFraction(speed), cutoffScale: ambienceDoppler(speed) })
  }

  function update(state) {
    if (!ready()) return
    setMuted(!state.ui.sound)
    if (state.settings.volume !== undefined && state.settings.volume !== volume) setVolume(state.settings.volume)
    const { player, worldTime } = state

    // A clock that ran backwards means a new round: forget what was in flight.
    if (lastWorldTime !== null && worldTime < lastWorldTime) queue = []
    lastWorldTime = worldTime

    for (const ev of state.events) {
      if (ev.type === 'impact') queue.push({ kind: ev.kind === 'target' ? 'boom' : 'thud', pos: ev.pos, t: ev.t })
      else if (ev.type === 'fire') playShot('whoosh', { rate: 1, gain: 0.8, pan: 0 })
      else if (ev.type === 'restart') queue = []
    }
    // No 'sonic' voice: you never hear your own boom.

    const { heard, pending } = drainHeard(queue, player.pos, worldTime)
    queue = pending
    playHeard(heard, player)
    driveContinuous(player.vel, player.boosting)
  }

  // Replay: emissions derived from the log, [{kind: 'boom'|'thud', pos, t}].
  function setReplayEmissions(list) {
    const sorted = [...list].sort((a, b) => a.t - b.t)
    replay = { list: sorted, heard: sorted.map(() => false), lastTime: null }
  }

  function updateReplay(rs, view) {
    if (!ready()) return
    if (rs.ui && rs.ui.sound !== undefined) setMuted(!rs.ui.sound)
    const { observer, worldTime } = view
    const jumped = replay.lastTime === null || Math.abs(worldTime - replay.lastTime) > REPLAY_JUMP || worldTime < replay.lastTime
    replay.lastTime = worldTime
    const playing = rs.rate > 0 && rs.rate <= 2 && !jumped

    const due = []
    replay.list.forEach((e, i) => {
      const passed = isHeard(e, observer.pos, worldTime)
      // Reversing past an emission re-arms it; its front has not reached the observer yet.
      if (!passed) {
        replay.heard[i] = false
        return
      }
      if (replay.heard[i]) return
      replay.heard[i] = true
      if (playing && worldTime - e.t <= MAX_EMISSION_AGE) due.push(e)
    })
    playHeard(due, observer, rs.rate)
    driveContinuous(observer.vel, Boolean(observer.boosting))
  }

  return { start, update, updateReplay, setReplayEmissions, setVolume, get running() { return ready() } }
}
