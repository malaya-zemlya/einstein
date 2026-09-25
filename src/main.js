import { createGame, step, viewOf } from './game/index.js'
import { createRenderer, WebGPUUnavailableError } from './render/renderer.js'
import { createInput } from './ui/input.js'
import { createHud } from './ui/hud.js'
import { createCaptions } from './ui/captions.js'
import { createMapOverlay } from './ui/mapOverlay.js'
import { createSettings, settingsFromUrl } from './ui/settings.js'
import { applyScenario } from './scenarios.js'
import { createAudio } from './audio/engine.js'

const params = new URLSearchParams(location.search)
const quality = params.get('quality') === 'low' ? 'low' : 'high'
const seed = Number(params.get('seed') ?? 7)
const devMode = params.get('dev') === '1'

const canvas = document.getElementById('view')
const overlay = document.getElementById('overlay')
const status = document.getElementById('status')

async function boot() {
  await new Promise((r) => setTimeout(r, 0))
  const t0 = performance.now()
  const state = createGame({ seed, quality })
  status.textContent = `Island built in ${((performance.now() - t0) / 1000).toFixed(1)} s. Starting GPU…`
  let renderer
  try {
    renderer = await createRenderer(canvas, state.island, { quality, targets: state.targetSpecs })
  } catch (err) {
    status.textContent = err instanceof WebGPUUnavailableError
      ? 'This game needs WebGPU: use a current Chrome or Safari.'
      : `GPU error: ${err.message}`
    throw err
  }
  const scenarioName = params.get('scenario')
  const freeze = params.get('freeze') === '1' || Boolean(scenarioName)
  const input = createInput(canvas, { freeze })
  const hud = createHud(document.getElementById('hud'), renderer)
  const captions = createCaptions(document.getElementById('captions'), state.island)
  const minimap = createMapOverlay(document.getElementById('minimap'), renderer)
  const settingsPanel = createSettings(document.getElementById('settings'), input, { devMode })
  const urlSettings = settingsFromUrl(params)
  if (urlSettings) input.pushSettings(urlSettings)
  status.textContent = 'Click to play'
  const audio = createAudio()
  overlay.addEventListener('click', () => { audio.start(); input.requestLock() })
  canvas.addEventListener('click', () => audio.start())
  document.addEventListener('pointerlockchange', () => { overlay.hidden = input.locked() || freeze })
  if (freeze) overlay.hidden = true

  const debug = { pause: false, view: null, input: null }
  if (scenarioName) {
    const fireAt = (yaw) => {
      const keep = state.player.yaw
      state.player.yaw = yaw
      state.lastFireTau = -Infinity
      step(state, { fire: true, keys: [] }, 1e-6)
      state.player.yaw = keep
    }
    const sc = applyScenario(state, scenarioName, fireAt)
    if (sc) {
      debug.view = sc.view
      debug.pause = !sc.live
    }
  }
  let last = performance.now()
  const frame = (now) => {
    const dReal = Math.min((now - last) / 1000, 1 / 30)
    last = now
    const snap = { ...input.snapshot(), ...(debug.input ?? {}) }
    if (!debug.pause) step(state, snap, dReal, { devMode })
    renderer.render(debug.view ? debug.view(viewOf(state)) : viewOf(state))
    state.flagsDirty.adaptation = false
    hud.update(state)
    captions.update(state)
    minimap.update(state)
    settingsPanel.update(state)
    audio.update(state)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  window.__einstein = { state, renderer, debug }
}

boot()
