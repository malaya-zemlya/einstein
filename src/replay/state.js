import { vec3 } from '../math/vec3.js'
import { frameAt } from '../record/reader.js'

export const RATES = [-8, -4, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 4, 8]
export const TAIL = 30 // seconds of world time after the last sample, so the last light and sound arrive

// log: readLog() result. Starts at the first sample, recorded camera, 1×, following recorded flags.
export function loadReplay(log) {
  const { frames } = log
  const first = frameAt(frames, frames.t[0])
  return {
    log,
    t: frames.t[0],
    tauRec: frames.tau[0],
    rate: 1,
    lastRate: 1,
    camera: 'recorded',
    free: { pos: first.pos, rapidity: vec3(), yaw: first.yaw, pitch: first.pitch },
    flags: { ...(log.flagChanges[0]?.flags ?? { aberration: true, delay: true, doppler: true, searchlight: true }) },
    followRecordedFlags: true,
    ui: { map: true, captions: true, frameTime: false, sound: true },
    resetAdaptation: true,
    jumped: true,
  }
}
