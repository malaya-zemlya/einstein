// Esc settings panel: sliders for the tunables and effect switches (plan decision 30, 22).
// Slider changes become a partial settings patch; switches queue the same key codes as the keyboard.

const SLIDERS = [
  { key: 'cruiseBeta', label: 'Cruise speed', unit: 'c', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'boostBeta', label: 'Boost cap', unit: 'c', min: 0.5, max: 0.999, step: 0.001 },
  { key: 'rampCruiseTime', label: 'Time to cruise', unit: 's', min: 0.2, max: 5, step: 0.1 },
  { key: 'rampBoostTime', label: 'Cruise → cap', unit: 's', min: 0.2, max: 10, step: 0.1 },
  { key: 'fireballBeta', label: 'Fireball speed', unit: 'c', min: 0.1, max: 0.99, step: 0.01 },
  { key: 'volume', label: 'Volume', unit: '', min: 0, max: 1, step: 0.05 },
  { key: 'headroom', label: 'HDR headroom', unit: '×', min: 1, max: 16, step: 0.5 },
]
const DEV_SLIDER = { key: 'devC', label: 'Island size (light-seconds across; applies on restart)', unit: 'ls', min: 5, max: 80, step: 1, toDisplay: (c) => (180 / c).toFixed(1) }
const EFFECTS = [['Digit1', 'aberration', 'Aberration'], ['Digit2', 'delay', 'Light delay'], ['Digit3', 'doppler', 'Doppler'], ['Digit4', 'searchlight', 'Searchlight']]
const URL_KEYS = { rampCruise: 'rampCruiseTime', rampBoost: 'rampBoostTime', cruise: 'cruiseBeta', cap: 'boostBeta', fireball: 'fireballBeta', volume: 'volume', headroom: 'headroom', adapt: 'adaptation', c: 'devC' }

export function settingsFromUrl(params) {
  const patch = {}
  for (const [q, key] of Object.entries(URL_KEYS)) {
    if (!params.has(q)) continue
    patch[key] = key === 'adaptation' ? params.get(q) !== '0' : Number(params.get(q))
  }
  return Object.keys(patch).length ? patch : null
}

export function createSettings(root, input, { devMode = false } = {}) {
  const sliders = devMode ? [...SLIDERS, DEV_SLIDER] : SLIDERS
  root.innerHTML = `
    <div class="panel-title">Ship settings</div>
    <div class="switches">${EFFECTS.map(([code, , label]) => `<button data-key="${code}">${label}</button>`).join('')}
      <button data-key="KeyN">Newtonian</button></div>
    <label class="check"><input type="checkbox" data-setting="adaptation"> Eye adaptation</label>
    ${sliders.map((s) => `<label class="slider"><span>${s.label}</span>
      <input type="range" data-setting="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">
      <output data-for="${s.key}"></output></label>`).join('')}`
  root.addEventListener('click', (e) => e.stopPropagation())
  for (const b of root.querySelectorAll('button[data-key]')) b.addEventListener('click', () => input.queueKey(b.dataset.key))
  for (const el of root.querySelectorAll('input[data-setting]')) {
    el.addEventListener('input', () => {
      const key = el.dataset.setting
      input.pushSettings({ [key]: el.type === 'checkbox' ? el.checked : Number(el.value) })
    })
  }
  return {
    update(state) {
      if (root.closest('[hidden]')) return
      for (const el of root.querySelectorAll('input[data-setting]')) {
        const key = el.dataset.setting
        if (document.activeElement === el) continue
        if (el.type === 'checkbox') el.checked = Boolean(state.settings[key])
        else el.value = state.settings[key]
      }
      for (const out of root.querySelectorAll('output[data-for]')) {
        const s = sliders.find((x) => x.key === out.dataset.for)
        const v = state.settings[s.key]
        out.textContent = `${s.toDisplay ? s.toDisplay(v) : Number(v).toFixed(s.step < 0.01 ? 3 : 2)} ${s.unit}`
      }
      for (const b of root.querySelectorAll('button[data-key]')) {
        const eff = EFFECTS.find(([code]) => code === b.dataset.key)
        if (eff) b.classList.toggle('on', state.flags[eff[1]])
      }
    },
  }
}
