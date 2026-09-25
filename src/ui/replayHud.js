import { C } from '../physics/constants.js'
import { length } from '../math/vec3.js'
import { TAIL } from '../replay/state.js'

// Replay badge, clock, rate, camera mode and a timeline scrubber (usable while the pointer is free).
export function createReplayHud(root) {
  root.innerHTML = `<div class="badge">REPLAY</div><div class="info"></div>
    <input type="range" class="scrub" min="0" max="1" step="0.001">`
  const info = root.querySelector('.info')
  const scrub = root.querySelector('.scrub')
  let pending = null
  scrub.addEventListener('input', () => { pending = Number(scrub.value) })
  scrub.addEventListener('click', (e) => e.stopPropagation())
  return {
    takeScrub() {
      const v = pending
      pending = null
      return v
    },
    update(rs, view) {
      document.body.classList.toggle('replaying', Boolean(rs))
      root.hidden = !rs
      if (!rs) return
      const f = rs.log.frames
      scrub.min = f.t[0]
      scrub.max = f.t[f.length - 1] + TAIL
      if (document.activeElement !== scrub) scrub.value = rs.t
      const beta = length(view.observer.vel) / C
      const rate = rs.rate === 0 ? '⏸ paused' : `${rs.rate > 0 ? '▶' : '◀'} ${Math.abs(rs.rate)}×`
      info.innerHTML = `t ${rs.t.toFixed(2)} s &nbsp; ${rate} &nbsp; camera: ${rs.camera} &nbsp; β ${beta.toFixed(3)} &nbsp; γ ${(1 / Math.sqrt(1 - beta * beta)).toFixed(2)}`
    },
  }
}
