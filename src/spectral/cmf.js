// CIE 1931 2° colour-matching functions: Wyman, Sloan & Shirley 2013, multi-lobe
// piecewise-Gaussian fit (JCGT 2(2), eqs. 2–4). λ in nm.

// Piecewise Gaussian: inverse widths a (left of mu) and b (right of mu), as published.
const g = (l, mu, a, b) => {
  const t = (l - mu) * (l < mu ? a : b)
  return Math.exp(-0.5 * t * t)
}

export const xBar = (l) =>
  1.056 * g(l, 599.8, 0.0264, 0.0323) + 0.362 * g(l, 442.0, 0.0624, 0.0374) - 0.065 * g(l, 501.1, 0.049, 0.0382)
export const yBar = (l) => 0.821 * g(l, 568.8, 0.0213, 0.0247) + 0.286 * g(l, 530.9, 0.0613, 0.0322)
export const zBar = (l) => 1.217 * g(l, 437.0, 0.0845, 0.0278) + 0.681 * g(l, 459.0, 0.0385, 0.0725)

export const xyzBar = (l) => [xBar(l), yBar(l), zBar(l)]

// Integration grid shared by every LUT: 360..830 nm in 1 nm steps (Δλ = 1 nm).
export const LAMBDA_MIN = 360
export const LAMBDA_MAX = 830
export const NUM_LAMBDA = LAMBDA_MAX - LAMBDA_MIN + 1

// Tabulated x̄ȳz̄ on the grid, interleaved [x, y, z] per nm.
export const CMF_TABLE = (() => {
  const t = new Float64Array(NUM_LAMBDA * 3)
  for (let k = 0; k < NUM_LAMBDA; k++) t.set(xyzBar(LAMBDA_MIN + k), k * 3)
  return t
})()
