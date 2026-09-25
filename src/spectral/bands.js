// Twelve unit-height Gaussian bands G_i(λ) = exp(−(λ−mu)²/(2σ²)), λ in nm.
// 0–1 UV, 2–7 visible, 8–11 IR. Neighbours overlap (σ ≈ half the spacing) so a flat weight vector is a
// smooth continuum with no spectral holes: a hole would sweep through the visible as a rainbow ring
// when Doppler-shifted. G_i(Sλ) is a Gaussian at mu/S with width σ/S.

export const BANDS = Object.freeze([
  { mu: 260, sigma: 55 },
  { mu: 355, sigma: 40 },
  { mu: 420, sigma: 26 },
  { mu: 470, sigma: 26 },
  { mu: 520, sigma: 26 },
  { mu: 570, sigma: 26 },
  { mu: 620, sigma: 26 },
  { mu: 680, sigma: 30 },
  { mu: 790, sigma: 60 },
  { mu: 960, sigma: 95 },
  { mu: 1300, sigma: 190 },
  { mu: 2000, sigma: 380 },
].map(Object.freeze))

export const NUM_BANDS = BANDS.length
export const UV_BANDS = [0, 1]
export const VISIBLE_BANDS = [2, 3, 4, 5, 6, 7]
export const IR_BANDS = [8, 9, 10, 11]

export function bandShape(i, lambdaNm) {
  const { mu, sigma } = BANDS[i]
  const t = (lambdaNm - mu) / sigma
  return Math.exp(-0.5 * t * t)
}
