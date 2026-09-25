import { C } from '../physics/constants.js'
import { length } from '../math/vec3.js'

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—')
const effect = (key, name, on) => `<span class="${on ? 'on' : 'off'}">[${key}] ${name} ${on ? '●' : '○'}</span>`

const RING = 2 * Math.PI * 26

function gauge(gamma, boosting) {
  const f = Math.min(1, Math.log10(gamma)) // γ from 1 to 10 on a log scale
  const hue = 185 + (320 - 185) * f
  return `<svg class="gauge${boosting ? ' boosting' : ''}" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(95,244,255,0.15)" stroke-width="5"/>
    <circle class="arc" cx="32" cy="32" r="26" fill="none" stroke="hsl(${hue} 100% 65%)" stroke-width="5"
      stroke-dasharray="${RING * f} ${RING}" transform="rotate(-90 32 32)" stroke-linecap="round"/>
    <text x="32" y="30" text-anchor="middle" fill="#dff8ff" font-size="9">γ</text>
    <text x="32" y="42" text-anchor="middle" fill="hsl(${hue} 100% 70%)" font-size="11">${gamma.toFixed(2)}</text>
  </svg>`
}

export function createHud(root, renderer) {
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
        gauge(gamma, player.boosting),
        `<div class="big">β ${fmt(beta, 3)} &nbsp; ${mode}</div>`,
        `τ (you) ${fmt(player.tau)} s &nbsp; t (island) ${fmt(state.worldTime)} s`,
        `Targets ${round.score}/${n} &nbsp; Round τ ${round.status === 'ready' ? '—' : fmt(roundTau)} s / t ${round.status === 'ready' ? '—' : fmt(roundT)} s &nbsp; Best τ ${round.best === null ? '—' : fmt(round.best)} s`,
        [effect(1, 'Aberration', flags.aberration), effect(2, 'Light delay', flags.delay), effect(3, 'Doppler', flags.doppler), effect(4, 'Searchlight', flags.searchlight)].join(' '),
        `Eye <span class="iris" style="transform: scale(${Math.min(2, Math.max(0.3, Math.sqrt(renderer?.exposure?.() ?? 0.8) * 1.1)).toFixed(2)})"></span>${ui.sound ? '' : ' &nbsp; 🔇'}`,
        ui.frameTime ? `${fmt(frameMs, 1)} ms` : '',
      ].filter(Boolean).join('<br>')
    },
  }
}
