// Clock tower at the island centre. It is at rest in the island frame, so it keeps island (world)
// time; the player's watch keeps proper time. Both start at the browser's wall-clock time.
// Faces are static geometry; hands are rebuilt each frame from the time the face's light left it.

import { C } from '../physics/constants.js'
import { MeshBuilder, mergeSpecs, lathe, sphere, placeSpec, qualityOf } from './geometry.js'
import { materialBands } from './palette.js'

export const TOWER_POS = Object.freeze({ x: 0, z: 0 })
const SHAFT = 3.2 // shaft width
const BAND = 3.6 // clock-band width
const FACE_R = 1.45
const FACE_Y = 12.8 // face centre above ground
const HANDS = Object.freeze([
  { name: 'hour', length: 0.85, width: 0.14, lift: 0.05, period: 43200, colour: 'clockHand' },
  { name: 'minute', length: 1.25, width: 0.09, lift: 0.07, period: 3600, colour: 'clockHand' },
  { name: 'second', length: 1.35, width: 0.035, lift: 0.09, period: 60, colour: 'clockSecond' },
])

// Axis-aligned box [x0,x1]×[y0,y1]×[z0,z1], each face gridded to maxEdge.
function box(b, [x0, x1], [y0, y1], [z0, z1], maxEdge, bands) {
  const faces = [
    [[1, 0, 0], (u, v) => [x1, y0 + (y1 - y0) * v, z0 + (z1 - z0) * u]],
    [[-1, 0, 0], (u, v) => [x0, y0 + (y1 - y0) * v, z0 + (z1 - z0) * u]],
    [[0, 0, 1], (u, v) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, z1]],
    [[0, 0, -1], (u, v) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, z0]],
    [[0, 1, 0], (u, v) => [x0 + (x1 - x0) * u, y1, z0 + (z1 - z0) * v]],
    [[0, -1, 0], (u, v) => [x0 + (x1 - x0) * u, y0, z0 + (z1 - z0) * v]],
  ]
  for (const [n, at] of faces) {
    const [p00, p11] = [at(0, 0), at(1, 1)]
    const span = Math.max(...[0, 1, 2].map((k) => Math.abs(p11[k] - p00[k])))
    const m = Math.max(1, Math.ceil(span / (0.6 * maxEdge))) // square cells: diagonal 0.85·maxEdge
    const idx = []
    for (let j = 0; j <= m; j++) for (let i = 0; i <= m; i++) idx.push(b.vertex(...at(i / m, j / m), ...n, bands))
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const a = j * (m + 1) + i
        b.tri(idx[a], idx[a + 1], idx[a + m + 2])
        b.tri(idx[a], idx[a + m + 2], idx[a + m + 1])
      }
    }
  }
}

// Tapered strip from r0 to r1 (half-width w), split so no edge exceeds maxEdge. p(r, s) → point.
function strip(b, p, r0, r1, w, maxEdge, normal, bands) {
  const m = Math.max(1, Math.ceil((r1 - r0) / (0.6 * maxEdge)))
  let prev = null
  for (let k = 0; k <= m; k++) {
    const r = r0 + ((r1 - r0) * k) / m
    const row = [-w, 0, w].map((s) => b.vertex(...p(r, s), ...normal, bands)) // centre column keeps cross edges ≤ w
    if (prev) {
      for (let c = 0; c < 2; c++) {
        b.tri(prev[c], row[c], row[c + 1])
        b.tri(prev[c], row[c + 1], prev[c + 1])
      }
    }
    prev = row
  }
}

// Flat disc facing `normal`, centred at c, spanned by right/up.
function disc(b, c, normal, right, up, r, maxEdge, bands) {
  const rings = Math.max(1, Math.ceil(r / (0.6 * maxEdge)))
  const at = (rr, a) => [0, 1, 2].map((k) => c[k] + (right[k] * Math.cos(a) + up[k] * Math.sin(a)) * rr)
  const centre = b.vertex(...c, ...normal, bands)
  let prev = [centre]
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / rings
    const n = Math.max(12, Math.ceil((2 * Math.PI * rr) / (0.6 * maxEdge)))
    const ring = Array.from({ length: n }, (_, s) => b.vertex(...at(rr, (2 * Math.PI * s) / n), ...normal, bands))
    if (prev.length === 1) for (let s = 0; s < n; s++) b.tri(prev[0], ring[s], ring[(s + 1) % n])
    else {
      // simple fan stitch between rings of different counts
      let i = 0
      let j = 0
      while (i < prev.length || j < n) {
        const ai = (i + 1) / prev.length
        const bj = (j + 1) / n
        if (j >= n || (i < prev.length && ai <= bj)) {
          b.tri(prev[i % prev.length], prev[(i + 1) % prev.length], ring[j % n])
          i++
        } else {
          b.tri(prev[i % prev.length], ring[(j + 1) % n], ring[j % n])
          j++
        }
      }
    }
    prev = ring
  }
}

// Four faces: centre (world), outward normal, right and up (for hand rotation, clockwise seen from outside).
export function towerFaces(ground) {
  const y = ground + FACE_Y
  const d = BAND / 2 + 0.02
  const { x, z } = TOWER_POS
  return [
    { centre: [x, y, z + d], normal: [0, 0, 1], right: [-1, 0, 0], up: [0, 1, 0] },
    { centre: [x, y, z - d], normal: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] },
    { centre: [x + d, y, z], normal: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
    { centre: [x - d, y, z], normal: [-1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  ]
}

export function buildClockTower(heightAt, quality = 'high', bandsFor = materialBands) {
  const e = qualityOf(quality).propEdge
  const g = heightAt(TOWER_POS.x, TOWER_POS.z)
  const stone = bandsFor('towerStone')
  const trim = bandsFor('towerTrim')
  const b = new MeshBuilder()
  const h = (w) => [-w / 2, w / 2]
  box(b, h(4.4), [g - 2.5, g + 1.2], h(4.4), e, trim)
  box(b, h(SHAFT), [g + 1.2, g + 10.8], h(SHAFT), e, stone)
  box(b, h(BAND + 0.3), [g + 10.8, g + 11.1], h(BAND + 0.3), e, trim)
  box(b, h(BAND), [g + 11.1, g + 14.5], h(BAND), e, stone)
  box(b, h(BAND + 0.3), [g + 14.5, g + 14.8], h(BAND + 0.3), e, trim)
  const faces = towerFaces(g)
  const faceBands = bandsFor('clockFace')
  const tick = bandsFor('clockHand')
  for (const f of faces) {
    disc(b, f.centre, f.normal, f.right, f.up, FACE_R, e, faceBands)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI
      const long = k % 3 === 0
      const r0 = FACE_R * (long ? 0.78 : 0.86)
      const r1 = FACE_R * 0.95
      const w = long ? 0.07 : 0.04
      const dir = [0, 1, 2].map((i) => f.right[i] * Math.sin(a) + f.up[i] * Math.cos(a))
      const side = [0, 1, 2].map((i) => f.right[i] * Math.cos(a) - f.up[i] * Math.sin(a))
      const lift = f.normal.map((v) => v * 0.02)
      const p = (r, s) => [0, 1, 2].map((i) => f.centre[i] + dir[i] * r + side[i] * s + lift[i])
      strip(b, p, r0, r1, w, e, f.normal, tick)
    }
  }
  const roof = lathe([[BAND / 2 + 0.55, 0], [0.05, 3.6], [0, 3.6]], e, { bands: bandsFor('towerRoof'), minSegments: 24 })
  const finial = sphere(0.28, e, { bands: bandsFor('towerGold'), minFreq: 4 })
  const spec = mergeSpecs([b.toSpec(), placeSpec(roof, TOWER_POS.x, g + 14.8, TOWER_POS.z), placeSpec(finial, TOWER_POS.x, g + 18.6, TOWER_POS.z)])
  return { spec, faces, ground: g }
}

// Clockwise angle from 12 o'clock for a hand with the given period (43200, 3600 or 60 s).
export const handAngle = (seconds, period) => ((((seconds % period) + period) % period) / period) * 2 * Math.PI

// Hands for each face, pointing at the time (seconds since local midnight) that face shows.
export function clockHands(faces, secondsPerFace, bandsFor = materialBands) {
  const b = new MeshBuilder()
  faces.forEach((f, i) => {
    const s = secondsPerFace[i]
    for (const hand of HANDS) {
      const a = handAngle(s, hand.period)
      const dir = [0, 1, 2].map((k) => f.right[k] * Math.sin(a) + f.up[k] * Math.cos(a))
      const side = [0, 1, 2].map((k) => f.right[k] * Math.cos(a) - f.up[k] * Math.sin(a))
      const p = (r, w) => [0, 1, 2].map((k) => f.centre[k] + dir[k] * r + side[k] * w + f.normal[k] * hand.lift)
      const bands = bandsFor(hand.colour)
      const w = hand.width / 2
      strip(b, (r, s) => p(r, s * (1 - 0.6 * Math.max(0, r) / hand.length)), -0.15, hand.length, w, 0.1, f.normal, bands)
    }
  })
  return b.toSpec()
}

// Island time the player currently sees on a face: light left it |x_obs − face|/C ago (delay on).
export function towerTimeSeen(faceCentre, obsPos, tObs, delay = true) {
  if (!delay) return tObs
  const d = Math.hypot(faceCentre[0] - obsPos.x, faceCentre[1] - obsPos.y, faceCentre[2] - obsPos.z)
  return tObs - d / C
}

// Seconds since local midnight for an epoch-ms start plus elapsed seconds.
export function clockSeconds(startMs, elapsed) {
  const d = new Date(startMs)
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000 + elapsed
}

export function formatClock(seconds) {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
