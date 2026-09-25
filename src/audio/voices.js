// Web Audio synthesis. No sample files: every voice is oscillators and filtered noise.
// One-shots take {rate, gain, pan}: rate scales every frequency and divides every duration
// (a sped-up recording), and durations are capped so a voice never outlasts 1.5 s.

const MAX_DUR = 1.5
const noiseCache = new WeakMap()

// Two seconds of looped white and pink noise per context.
function noiseBuffers(ctx) {
  let b = noiseCache.get(ctx)
  if (b) return b
  const n = Math.floor(ctx.sampleRate * 2)
  const white = ctx.createBuffer(1, n, ctx.sampleRate)
  const pink = ctx.createBuffer(1, n, ctx.sampleRate)
  const w = white.getChannelData(0)
  const p = pink.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1
    w[i] = x
    // Paul Kellet's pink filter.
    b0 = 0.99886 * b0 + x * 0.0555179
    b1 = 0.99332 * b1 + x * 0.0750759
    b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856
    b4 = 0.55 * b4 + x * 0.5329522
    b5 = -0.7616 * b5 - x * 0.016898
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11
    b6 = x * 0.115926
  }
  b = { white, pink }
  noiseCache.set(ctx, b)
  return b
}

function noise(ctx, kind = 'white', rate = 1) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffers(ctx)[kind]
  src.loop = true
  src.playbackRate.value = rate
  return src
}

const filter = (ctx, type, freq, q = 1) => {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

const gainNode = (ctx, g = 0) => {
  const n = ctx.createGain()
  n.gain.value = g
  return n
}

// Exponential attack–decay on a gain param. Peak at t0 + atk, ~silent by t0 + dur.
function envelope(param, t0, peak, atk, dur) {
  param.cancelScheduledValues(t0)
  param.setValueAtTime(0.0001, t0)
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + atk)
  param.exponentialRampToValueAtTime(0.0001, t0 + dur)
}

function sweep(param, t0, from, to, dur) {
  param.setValueAtTime(from, t0)
  param.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur)
}

// Output stage shared by the one-shots: pan → gain → dest. Tears itself down after `dur`.
function outStage(ctx, dest, { gain = 1, pan = 0 }, dur) {
  const out = gainNode(ctx, gain)
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (p) {
    p.pan.value = Math.max(-1, Math.min(1, pan))
    p.connect(out)
  }
  out.connect(dest)
  const input = p || out
  const t0 = ctx.currentTime
  const start = (src) => {
    src.start(t0)
    src.stop(t0 + dur + 0.05)
  }
  setTimeout(() => out.disconnect(), (dur + 0.3) * 1000)
  return { input, start, t0 }
}

const durFor = (base, rate) => Math.min(MAX_DUR, base / rate)

// Target hit: sub thump, a crackling noise blast, and a falling sci-fi zap.
export function boom(ctx, dest, opts = {}) {
  const rate = opts.rate || 1
  const dur = durFor(1.2, rate)
  const { input, start, t0 } = outStage(ctx, dest, opts, dur)

  const thump = ctx.createOscillator()
  thump.type = 'sine'
  sweep(thump.frequency, t0, 110 * rate, 38 * rate, dur * 0.5)
  const tg = gainNode(ctx)
  envelope(tg.gain, t0, 0.9, 0.005, dur * 0.8)
  thump.connect(tg).connect(input)
  start(thump)

  const n = noise(ctx, 'white', rate)
  const lp = filter(ctx, 'lowpass', 4000 * rate, 0.7)
  sweep(lp.frequency, t0, 5000 * rate, 150 * rate, dur)
  const ng = gainNode(ctx)
  envelope(ng.gain, t0, 0.7, 0.004, dur)
  n.connect(lp).connect(ng).connect(input)
  start(n)

  const zap = ctx.createOscillator()
  zap.type = 'square'
  sweep(zap.frequency, t0, 1400 * rate, 90 * rate, dur * 0.35)
  const zf = filter(ctx, 'bandpass', 900 * rate, 4)
  sweep(zf.frequency, t0, 2400 * rate, 200 * rate, dur * 0.35)
  const zg = gainNode(ctx)
  envelope(zg.gain, t0, 0.18, 0.003, dur * 0.4)
  zap.connect(zf).connect(zg).connect(input)
  start(zap)

  // A shimmering ring-down tail: two detuned sines a fifth apart.
  for (const [f, d] of [[220, 0], [330, 4]]) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f * rate
    o.detune.value = d
    const g = gainNode(ctx)
    envelope(g.gain, t0 + 0.02 / rate, 0.06, 0.03 / rate, dur)
    o.connect(g).connect(input)
    start(o)
  }
}

// Ground hit: a short low-passed thud with a soft sub.
export function thud(ctx, dest, opts = {}) {
  const rate = opts.rate || 1
  const dur = durFor(0.35, rate)
  const { input, start, t0 } = outStage(ctx, dest, opts, dur)

  const n = noise(ctx, 'white', rate)
  const lp = filter(ctx, 'lowpass', 700 * rate, 1.2)
  sweep(lp.frequency, t0, 900 * rate, 120 * rate, dur)
  const ng = gainNode(ctx)
  envelope(ng.gain, t0, 0.6, 0.003, dur)
  n.connect(lp).connect(ng).connect(input)
  start(n)

  const o = ctx.createOscillator()
  o.type = 'sine'
  sweep(o.frequency, t0, 95 * rate, 45 * rate, dur * 0.7)
  const og = gainNode(ctx)
  envelope(og.gain, t0, 0.5, 0.004, dur * 0.8)
  o.connect(og).connect(input)
  start(o)
}

// Fireball launch: band-passed noise swept upward plus a descending "pew".
export function whoosh(ctx, dest, opts = {}) {
  const rate = opts.rate || 1
  const dur = durFor(0.45, rate)
  const { input, start, t0 } = outStage(ctx, dest, opts, dur)

  const n = noise(ctx, 'white', rate)
  const bp = filter(ctx, 'bandpass', 500 * rate, 2.5)
  sweep(bp.frequency, t0, 350 * rate, 3500 * rate, dur * 0.8)
  const ng = gainNode(ctx)
  envelope(ng.gain, t0, 0.5, dur * 0.25, dur)
  n.connect(bp).connect(ng).connect(input)
  start(n)

  const pew = ctx.createOscillator()
  pew.type = 'triangle'
  sweep(pew.frequency, t0, 1800 * rate, 260 * rate, dur * 0.6)
  const pg = gainNode(ctx)
  envelope(pg.gain, t0, 0.14, 0.004, dur * 0.6)
  pew.connect(pg).connect(input)
  start(pew)
}

// Persistent voices: built once, driven every frame with set(...). Each ramps smoothly.
const TC = 0.06 // s, smoothing time constant for per-frame parameter changes

const glide = (param, value, t, tc = TC) => param.setTargetAtTime(value, t, tc)

// Ship's boost whine: detuned sawtooths and a sub square through a resonant low-pass, with vibrato.
export function boostWhine(ctx, dest) {
  const level = gainNode(ctx, 0)
  const lp = filter(ctx, 'lowpass', 600, 14)
  lp.connect(level).connect(dest)
  const oscs = [
    ['sawtooth', 1, -8],
    ['sawtooth', 1, 8],
    ['sawtooth', 2, 3],
    ['square', 0.5, 0],
  ].map(([type, mult, detune]) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = 70 * mult
    o.detune.value = detune
    const g = gainNode(ctx, type === 'square' ? 0.25 : 0.35)
    o.connect(g).connect(lp)
    o.start()
    return { o, mult }
  })
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 5.5
  const lfoDepth = gainNode(ctx, 6) // cents
  lfo.connect(lfoDepth)
  for (const { o } of oscs) lfoDepth.connect(o.detune)
  lfo.start()
  return {
    // freq in Hz (70·γ), level 0..1.
    set({ freq, level: l }) {
      const t = ctx.currentTime
      for (const { o, mult } of oscs) glide(o.frequency, freq * mult, t)
      glide(lp.frequency, Math.min(freq * 9, 12000), t)
      glide(level.gain, l * 0.12, t, l > 0 ? 0.08 : 0.2)
    },
  }
}

// Transonic buffet: low-passed noise, amplitude-modulated by a slow, uneven LFO pair.
export function buffet(ctx, dest) {
  const level = gainNode(ctx, 0)
  const am = gainNode(ctx, 0.6)
  const n = noise(ctx, 'white')
  const lp = filter(ctx, 'lowpass', 160, 3)
  const lp2 = filter(ctx, 'lowpass', 400, 0.7)
  n.connect(lp).connect(lp2).connect(am).connect(level).connect(dest)
  for (const [f, d] of [[6.3, 0.3], [2.1, 0.15]]) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = f
    const depth = gainNode(ctx, d)
    lfo.connect(depth).connect(am.gain)
    lfo.start()
  }
  n.start()
  return {
    set({ level: l }) {
      const t = ctx.currentTime
      glide(level.gain, l * 0.9, t)
      glide(lp.frequency, 120 + 120 * l, t)
    },
  }
}

// Sea and wind: pink noise through a low-pass, with a slow swell.
export function ambience(ctx, dest) {
  const level = gainNode(ctx, 0)
  const swell = gainNode(ctx, 0.8)
  const n = noise(ctx, 'pink')
  const lp = filter(ctx, 'lowpass', 700, 0.5)
  n.connect(lp).connect(swell).connect(level).connect(dest)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.09
  const depth = gainNode(ctx, 0.2)
  lfo.connect(depth).connect(swell.gain)
  lfo.start()
  n.start()
  return {
    // level 0..1; cutoffScale multiplies the resting 700 Hz cutoff.
    set({ level: l, cutoffScale = 1 }) {
      const t = ctx.currentTime
      glide(level.gain, l * 0.22, t, 0.15)
      glide(lp.frequency, Math.min(700 * cutoffScale, 16000), t, 0.15)
    },
  }
}
