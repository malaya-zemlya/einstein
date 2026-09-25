import { createGame, step, viewOf } from './game/index.js'
import { createRenderer, WebGPUUnavailableError } from './render/renderer.js'
import { createInput } from './ui/input.js'
import { createHud } from './ui/hud.js'
import { createCaptions } from './ui/captions.js'
import { createMapOverlay } from './ui/mapOverlay.js'
import { createSettings, settingsFromUrl } from './ui/settings.js'
import { createReplayHud } from './ui/replayHud.js'
import { applyScenario } from './scenarios.js'
import { createAudio } from './audio/engine.js'
import { createRecorder } from './record/recorder.js'
import { readLog } from './record/reader.js'
import { loadReplay } from './replay/state.js'
import { replayStep } from './replay/step.js'
import { viewAt, replayEmissions } from './replay/view.js'
import { C, setC } from './physics/constants.js'
import { buildIsland } from './world/island.js'
import { placeTargets } from './world/targets.js'

const params = new URLSearchParams(location.search)
const quality = params.get('quality') === 'low' ? 'low' : 'high'
const seed = Number(params.get('seed') ?? 7)
const devMode = params.get('dev') === '1'

const canvas = document.getElementById('view')
const overlay = document.getElementById('overlay')
const status = document.getElementById('status')

function download(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

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
  const replayHud = createReplayHud(document.getElementById('replaybar'))
  const urlSettings = settingsFromUrl(params)
  if (urlSettings) input.pushSettings(urlSettings)
  const audio = createAudio()
  const recorder = createRecorder(seed, state.island)

  status.textContent = 'Click to play'
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

  // --- replay mode (L or drag-and-drop a recording; Backspace returns to play) ---
  let rs = null
  let playC = C
  let playIsland = { island: state.island, targets: state.targetSpecs, seed }
  const enterReplay = async (text) => {
    let log
    try {
      log = readLog(JSON.parse(text))
    } catch (err) {
      captions.notify([`Could not load recording: ${err.message}`], 'loaderror')
      return
    }
    playC = C
    setC(log.meta.c)
    if (log.meta.seed !== playIsland.seed) {
      const island = buildIsland(log.meta.seed, quality)
      await renderer.setIsland(island, placeTargets(log.meta.seed, island, 12, quality))
    }
    rs = loadReplay(log)
    audio.setReplayEmissions(replayEmissions(log))
    captions.notify(['Replay: Space pause · ←/→ speed · , . step · C free camera · Backspace back to play'], 'replayhelp')
  }
  const exitReplay = async () => {
    if (rs && rs.log.meta.seed !== playIsland.seed) await renderer.setIsland(playIsland.island, playIsland.targets)
    rs = null
    setC(playC)
    state.flagsDirty.adaptation = true
  }
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' })
  picker.addEventListener('change', async () => { if (picker.files[0]) await enterReplay(await picker.files[0].text()) })
  addEventListener('dragover', (e) => e.preventDefault())
  addEventListener('drop', async (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) await enterReplay(await file.text())
  })

  let last = performance.now()
  const frame = (now) => {
    const dReal = Math.min((now - last) / 1000, 1 / 30)
    last = now
    const snap = { ...input.snapshot(), ...(debug.input ?? {}) }
    if (snap.keys.includes('KeyL')) {
      document.exitPointerLock()
      picker.click()
    }
    if (rs) {
      if (snap.keys.includes('Backspace')) exitReplay()
      else {
        const scrubT = replayHud.takeScrub()
        replayStep(rs, scrubT === null ? snap : { ...snap, scrubT }, dReal)
        const view = viewAt(rs)
        renderer.render(view)
        replayHud.update(rs, view)
        minimap.draw({
          player: view.observer, worldTime: view.worldTime, ui: rs.ui, hits: [],
          targets: view.objects.filter((o) => o.kind === 'target').map((o) => ({ line: o.line, spec: state.targetSpecs[o.extra.specIndex] ?? {} })),
          fireballs: view.objects.filter((o) => o.kind === 'fireball' && o.id !== 'avatar'),
        })
        audio.updateReplay(rs, view)
        captions.update({ ...state, events: [], ui: rs.ui, flags: rs.flags, player: { ...state.player, pos: view.observer.pos, vel: view.observer.vel } })
        requestAnimationFrame(frame)
        return
      }
    }
    replayHud.update(null)
    if (snap.keys.includes('KeyK')) {
      download(recorder.exportLog(), `einstein-${seed}-${stamp()}.json`)
      captions.notify(['Recording saved.'], 'saved')
    }
    if (!debug.pause) step(state, snap, dReal, { devMode })
    recorder.observe(state)
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
  window.__einstein = { state, renderer, debug, recorder, enterReplay, get replay() { return rs } }
}

boot()
