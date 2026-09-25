import { C } from '../physics/constants.js'
import { Worldline } from '../physics/worldline.js'
import { vec3, add, sub, scale, dot, normalize, length } from '../math/vec3.js'
import { mulberry32 } from '../math/random.js'

const FIREBALL_RADIUS = 0.3
const OUT_OF_RANGE = 400

// Earliest t in [t0, t1] where the fireball centre is at distance R from centre, or null.
function sphereHitTime(line, centre, R, t0, t1) {
  const d = sub(line.positionAt(t0), centre)
  const a = dot(line.u, line.u)
  const b = 2 * dot(d, line.u)
  const c = dot(d, d) - R * R
  if (c <= 0) return t0
  const disc = b * b - 4 * a * c
  if (a === 0 || disc < 0) return null
  const s = (-b - Math.sqrt(disc)) / (2 * a)
  return s >= 0 && t0 + s <= t1 ? t0 + s : null
}

function groundHitTime(line, heightAt, t0, t1) {
  const below = (t) => {
    const p = line.positionAt(t)
    return p.y < heightAt(p.x, p.z)
  }
  const span = length(scale(line.u, t1 - t0))
  const n = Math.max(1, Math.ceil(span / 0.5))
  let prev = t0
  for (let i = 1; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    if (below(t)) {
      let lo = prev
      let hi = t
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2
        if (below(mid)) hi = mid
        else lo = mid
      }
      return hi
    }
    prev = t
  }
  return null
}

export function makeBurst(state, point, t, big) {
  const rand = mulberry32((state.nextId * 2654435761) >>> 0)
  const speed = (big ? 0.3 : 0.15) * C
  const particleVels = Array.from({ length: 16 }, () => {
    const z = 2 * rand() - 1
    const a = 2 * Math.PI * rand()
    const s = Math.sqrt(1 - z * z)
    return vec3(s * Math.cos(a) * speed, z * speed, s * Math.sin(a) * speed)
  })
  state.bursts.push({
    id: `b${state.nextId++}`,
    big,
    particleVels,
    line: new Worldline({ p: point, t0: t, u: vec3(), tBirth: t, tDeath: t + 1.5 }),
  })
}

export function runCollisions(state, dt) {
  const tNow = state.worldTime
  const candidates = []
  for (const fb of state.fireballs) {
    if (fb.line.tDeath !== Infinity) continue
    const t0 = Math.max(fb.line.t0, tNow - dt)
    for (const tg of state.targets) {
      if (tg.line.tDeath !== Infinity) continue
      const t = sphereHitTime(fb.line, tg.line.p, tg.spec.radius + FIREBALL_RADIUS, t0, tNow)
      if (t !== null) candidates.push({ t, fb, tg })
    }
    const tGround = groundHitTime(fb.line, state.island.heightAt, t0, tNow)
    if (tGround !== null) candidates.push({ t: tGround, fb, tg: null })
    const pNow = fb.line.positionAt(tNow)
    if (Math.hypot(pNow.x, pNow.z) > OUT_OF_RANGE) candidates.push({ t: tNow, fb, tg: null, silent: true })
  }
  candidates.sort((a, b) => a.t - b.t)
  for (const { t, fb, tg, silent } of candidates) {
    if (fb.line.tDeath !== Infinity) continue
    if (tg && tg.line.tDeath !== Infinity) continue
    const centre = fb.line.positionAt(t)
    fb.line.tDeath = t
    fb.line.hitPos = centre
    if (silent) continue
    if (tg) {
      const hitPos = add(tg.line.p, scale(normalize(sub(centre, tg.line.p)), tg.spec.radius))
      tg.line.tDeath = t
      tg.line.hitPos = hitPos
      state.hits.push({ pos: hitPos, t, targetId: tg.id, seen: false })
      makeBurst(state, hitPos, t, true)
      state.events.push({ type: 'impact', kind: 'target', pos: hitPos, t })
    } else {
      makeBurst(state, centre, t, false)
      state.events.push({ type: 'impact', kind: 'ground', pos: centre, t })
    }
  }
}

