import { C, C_SOUND } from '../physics/constants.js'
import { length } from '../math/vec3.js'

const fmt = (x, d = 1) => x.toFixed(d)

// Contextual "ship computer" captions (game.md § Captions, audio.md). One at a time, 6 s each,
// each id at most once per 60 s of wall time, typewriter reveal.
const RULES = [
  { id: 'aberration', event: (e) => e.type === 'toggle' && e.name === 'aberration' && e.value,
    text: () => ['Aberration: your motion tilts incoming light forward.', "cos θ' = (cos θ + β) / (1 + β cos θ)"] },
  { id: 'delay', event: (e) => e.type === 'toggle' && e.name === 'delay' && e.value,
    text: () => ['Light delay: you see each point where it was when its light left.', 'c·(t_now − t_emit) = distance'] },
  { id: 'doppler', event: (e) => e.type === 'toggle' && e.name === 'doppler' && e.value,
    text: () => ['Doppler shift: light from ahead is bluer, from behind redder.', 'D = γ(1 + β cos θ)   (θ: your motion vs the source, island frame)'] },
  { id: 'searchlight', event: (e) => e.type === 'toggle' && e.name === 'searchlight' && e.value,
    text: () => ['Searchlight: brightness scales as D⁴, so the view ahead blazes and the view behind fades.'] },
  { id: 'newtonian', event: (e) => e.type === 'toggle' && e.name === 'newtonian' && !e.value,
    text: () => ["Newtonian view: what you'd see if light were infinitely fast."] },
  { id: 'swing', when: (s, b) => b > 0.5 && s.flags.aberration,
    text: () => ['Look around: things beside and behind you have swung into your forward view.', 'Only a shrinking cone directly behind stays behind.'] },
  { id: 'foliage', when: (s, b, ahead) => b > 0.2 && b < 0.5 && s.flags.doppler && ahead === 'grass',
    text: () => ['Leaves reflect lots of invisible near-infrared.', 'Approach fast and it blueshifts into visible red.'] },
  { id: 'irglow', when: (s, b) => b > 0.85 && b < 0.94 && s.flags.doppler,
    text: () => ['The bright ground ahead is reflected sunlight — its infrared part, blueshifted into view.', 'The visible part has shifted into the ultraviolet.'] },
  { id: 'heatglow', when: (s, b) => b > 0.95 && s.flags.doppler,
    text: () => ["Now the ground's own heat (~10 µm, invisible) is blueshifted into view and outshines the sunlight:", 'red-orange here, white-hot near 0.99c.'] },
  { id: 'backward', event: (e) => e.type === 'fire' && e.backward,
    text: () => ['You fired backwards — but it still moves forward in the world.', 'u = (v + w) / (1 + v·w / c²)'] },
  { id: 'aimoff', event: (e) => e.type === 'fire' && e.aberrationOff,
    text: () => ["Shots fly along what you'd really see. With aberration off, the screen shows a false picture, so the shot veers."] },
  { id: 'hitdelay', event: (e) => e.type === 'hitSeen' && e.delayWorld > 0.5,
    text: (e) => [`That hit happened ${fmt(e.delayWorld)} s ago in island time. Its light just reached you.`] },
  { id: 'sonic', event: (e) => e.type === 'sonic',
    text: () => [`You just passed the speed of sound (${fmt(C_SOUND, 0)} m/s here). Sounds from behind can't catch you now.`,
      'Your sonic boom trails behind you as a cone (see the map). You never hear your own.'] },
  { id: 'clockahead', when: (s) => s.worldTime - s.player.tau > 3,
    text: () => ['The clock tower keeps island time; your watch keeps your own (proper) time.',
      'Every boost puts the island further ahead: Δt = ∫(γ − 1) dτ. That lost time never comes back.'] },
  { id: 'clockdoppler', when: (s, b) => b > 0.5 && s.flags.doppler && s.flags.delay,
    text: () => ['Watch the tower clock while you fly: approaching, its hands race; receding, they crawl.',
      'That is Doppler (light delay changing). Stop and compare with your watch: what remains is time dilation.'] },
  { id: 'twins', event: (e) => e.type === 'roundFinished',
    text: (e) => [`Your clock: ${fmt(e.tau)} s. The island's clock: ${fmt(e.world)} s. Moving fast, you aged less.${e.record ? '  ★ New record!' : ''}`] },
]

export function createCaptions(root, island) {
  const lastShown = new Map()
  const queue = []
  let current = null
  let shownAt = 0

  const enqueue = (rule, payload) => {
    const now = performance.now()
    if (now - (lastShown.get(rule.id) ?? -Infinity) < 60000) return
    if (queue.some((q) => q.rule.id === rule.id) || current?.rule.id === rule.id) return
    lastShown.set(rule.id, now)
    queue.push({ rule, lines: rule.text(payload) })
  }

  const materialAhead = (state) => {
    const v = state.player.vel
    const s = length(v)
    if (s === 0) return null
    return island.materialAt(state.player.pos.x + (v.x / s) * 20, state.player.pos.z + (v.z / s) * 20)
  }

  return {
    notify: (lines, id = 'custom') => enqueue({ id, text: () => lines }),
    update(state) {
      if (!state.ui.captions) { root.innerHTML = ''; current = null; return }
      for (const e of state.events) for (const r of RULES) if (r.event?.(e)) enqueue(r, e)
      const beta = length(state.player.vel) / C
      const ahead = materialAhead(state)
      for (const r of RULES) if (r.when?.(state, beta, ahead)) enqueue(r)
      const now = performance.now()
      if (current && now - shownAt > 6000) current = null
      if (!current && queue.length) { current = queue.shift(); shownAt = now }
      if (!current) { root.innerHTML = ''; return }
      const [head, ...rest] = current.lines
      const chars = Math.floor(((now - shownAt) / 1000) * 60)
      root.innerHTML = `${head.slice(0, chars)}${rest.map((l) => `<code>${l}</code>`).join('')}`
    },
  }
}
