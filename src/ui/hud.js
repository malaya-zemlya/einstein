import { C } from '../physics/constants.js'
import { length } from '../math/vec3.js'

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—')
const effect = (key, name, on) => `<span class="${on ? 'on' : 'off'}">[${key}] ${name} ${on ? '●' : '○'}</span>`

export function createHud(root) {
  let frameMs = 16.7
  let last = performance.now()
  return {
    update(state) {
      const now = performance.now()
      frameMs = 0.95 * frameMs + 0.05 * (now - last)
      last = now
      const { player, round, flags, ui } = state
      const beta = length(player.vel) / C
      const gamma = 1 / Math.sqrt(1 - beta * beta)
      const mode = player.boosting ? '<span class="boost">BOOST</span>' : beta > 0.01 ? 'CRUISE' : 'STOPPED'
      const roundTau = round.status === 'running' ? player.tau - round.startTau : round.endTau - round.startTau
      const roundT = round.status === 'running' ? state.worldTime - round.startWorld : round.endWorld - round.startWorld
      const n = state.targetSpecs.length
      root.innerHTML = [
        `<div class="big">β ${fmt(beta, 3)} &nbsp; γ ${fmt(gamma, 2)} &nbsp; ${mode}</div>`,
        `τ (you) ${fmt(player.tau)} s &nbsp; t (island) ${fmt(state.worldTime)} s`,
        `Targets ${round.score}/${n} &nbsp; Round τ ${round.status === 'ready' ? '—' : fmt(roundTau)} s / t ${round.status === 'ready' ? '—' : fmt(roundT)} s &nbsp; Best τ ${round.best === null ? '—' : fmt(round.best)} s`,
        [effect(1, 'Aberration', flags.aberration), effect(2, 'Light delay', flags.delay), effect(3, 'Doppler', flags.doppler), effect(4, 'Searchlight', flags.searchlight)].join(' '),
        ui.frameTime ? `${fmt(frameMs, 1)} ms` : '',
      ].filter(Boolean).join('<br>')
    },
  }
}
