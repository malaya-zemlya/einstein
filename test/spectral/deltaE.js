// CIEDE2000 colour difference and linear sRGB → CIELAB (D65), for tests.

import { linearSrgbToXyz } from '../../src/spectral/lut.js'

const WHITE = linearSrgbToXyz([1, 1, 1])

export function linearSrgbToLab(rgb) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const [fx, fy, fz] = linearSrgbToXyz(rgb).map((v, i) => f(v / WHITE[i]))
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

// Sharma, Wu & Dalal (2005) formulation.
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360)
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))
  const Lmp = (L1 + L2) / 2
  const Cmp = (C1p + C2p) / 2
  let hmp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hmp /= 2
    else hmp = h1p + h2p < 360 ? (hmp + 360) / 2 : (hmp - 360) / 2
  }
  const T = 1 - 0.17 * Math.cos(rad(hmp - 30)) + 0.24 * Math.cos(rad(2 * hmp)) +
    0.32 * Math.cos(rad(3 * hmp + 6)) - 0.2 * Math.cos(rad(4 * hmp - 63))
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2))
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2)
  const SC = 1 + 0.045 * Cmp
  const SH = 1 + 0.015 * Cmp * T
  const RT = -Math.sin(rad(2 * dTheta)) * RC
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH))
}
