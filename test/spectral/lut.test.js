import { bandShape } from '../../src/spectral/bands.js'
import { describe, it, expect } from 'vitest'
import { BANDS, NUM_BANDS } from '../../src/spectral/bands.js'
import { xyzBar } from '../../src/spectral/cmf.js'
import {
  K, LUT_SIZE, SUN_BANDS, bandXYZ, bbBand, bbXYZ, buildBandLUT, buildBbBandsLUT, buildBlackbodyLUT,
  chromaticity, lutLog2S, lutLog2T, planck,
} from '../../src/spectral/lut.js'

// Independent direct integration of G_i(Sλ)·x̄ȳz̄(λ) over 360..830 nm, 1 nm steps.
function directBand(i, S) {
  const { mu, sigma } = BANDS[i]
  const acc = [0, 0, 0]
  for (let l = 360; l <= 830; l++) {
    const g = Math.exp(-((S * l - mu) ** 2) / (2 * sigma * sigma))
    const c = xyzBar(l)
    for (let k = 0; k < 3; k++) acc[k] += g * c[k]
  }
  return acc
}

const close = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b) + 1e-30

describe('bands', () => {
  it('has the band table (2 UV, 6 visible, 4 IR)', () => {
    expect(NUM_BANDS).toBe(12)
    expect(BANDS.map((b) => b.mu)).toEqual([260, 355, 420, 470, 520, 570, 620, 680, 790, 960, 1300, 2000])
    expect(BANDS.map((b) => b.sigma)).toEqual([55, 40, 26, 26, 26, 26, 26, 30, 60, 95, 190, 380])
  })

  it('overlaps into a smooth continuum from 230 to 2300 nm (no spectral holes)', () => {
    for (let l = 230; l <= 2300; l += 5) {
      const sum = BANDS.reduce((acc, _, i) => acc + bandShape(i, l), 0)
      expect(sum).toBeGreaterThan(0.7)
      expect(sum).toBeLessThan(1.5)
    }
  })
})

describe('band LUT', () => {
  const lut = buildBandLUT()
  const cell = (i, j) => [0, 1, 2].map((c) => lut[(i * LUT_SIZE + j) * 4 + c])

  it('has LUT_SIZE × 12 RGBA texels', () => {
    expect(lut).toBeInstanceOf(Float32Array)
    expect(lut.length).toBe(LUT_SIZE * 12 * 4)
  })

  it('at S = 1 equals direct numeric integration to 1e-6 relative', () => {
    for (let i = 0; i < NUM_BANDS; i++) {
      const got = bandXYZ(i, 1), want = directBand(i, 1)
      for (let c = 0; c < 3; c++) expect(close(got[c], want[c], 1e-6)).toBe(true)
    }
  })

  it('at 10 other S values equals direct integration of G_i(Sλ)', () => {
    const cols = [0, 80, 240, 400, 511, 512, 513, 600, 760, 1024]
    for (const j of cols) {
      const S = 2 ** lutLog2S(j)
      for (let i = 0; i < NUM_BANDS; i++) {
        const got = cell(i, j), want = directBand(i, S)
        for (let c = 0; c < 3; c++) expect(close(got[c], want[c], 1e-6)).toBe(true)
      }
    }
  })

  it('spans log2 S from −4 to 4', () => {
    expect(lutLog2S(0)).toBe(-4)
    expect(lutLog2S(LUT_SIZE - 1)).toBe(4)
    expect(lutLog2S((LUT_SIZE - 1) / 2)).toBe(0)
  })
})

describe('K and SUN_BANDS', () => {
  it('white paper under SUN_BANDS has Y = 1 at S = 1', () => {
    let y = 0
    for (let i = 0; i < NUM_BANDS; i++) y += SUN_BANDS[i] * bandXYZ(i, 1)[1]
    expect(y).toBeCloseTo(1, 12)
  })

  it('SUN_BANDS_i = B_λ(mu_i, 5778 K)·2.16e-5 / K', () => {
    for (let i = 0; i < NUM_BANDS; i++) {
      expect(close(SUN_BANDS[i], (planck(BANDS[i].mu * 1e-9, 5778) * 2.16e-5) / K, 1e-12)).toBe(true)
    }
  })
})

describe('Planck', () => {
  it('shift identity: D⁵·B_λ(Dλ, T) == B_λ(λ, D·T) to 1e-12', () => {
    for (const D of [0.1, 0.5, 1.25, 3, 7, 14]) {
      for (const lnm of [200, 420, 555, 800, 2200]) {
        for (const T of [290, 1000, 3000, 5778]) {
          const l = lnm * 1e-9
          const lhs = D ** 5 * planck(D * l, T), rhs = planck(l, D * T)
          if (rhs === 0) expect(lhs).toBe(0)
          else expect(Math.abs(lhs / rhs - 1)).toBeLessThan(1e-12)
        }
      }
    }
  })

  it('peaks at Wien’s law', () => {
    let best = 0, arg = 0
    for (let l = 300; l < 700; l += 0.1) {
      const b = planck(l * 1e-9, 5778)
      if (b > best) [best, arg] = [b, l]
    }
    expect(Math.abs(arg - 2.897771955e6 / 5778)).toBeLessThan(0.2)
  })
})

describe('blackbody LUT', () => {
  const lut = buildBlackbodyLUT()

  it('has LUT_SIZE RGBA texels over log2 T in [log2 100, log2 1e5]', () => {
    expect(lut.length).toBe(LUT_SIZE * 4)
    expect(2 ** lutLog2T(0)).toBeCloseTo(100, 9)
    expect(2 ** lutLog2T(LUT_SIZE - 1)).toBeCloseTo(100000, 6)
    const j = 200
    const want = bbXYZ(2 ** lutLog2T(j))
    for (let c = 0; c < 3; c++) expect(close(lut[j * 4 + c], want[c], 1e-6)).toBe(true)
  })

  it('6500 K lies within 0.002 of the Planckian locus point (0.3135, 0.3236)', () => {
    const [x, y] = chromaticity(bbXYZ(6500))
    expect(Math.abs(x - 0.3135)).toBeLessThan(0.002)
    expect(Math.abs(y - 0.3236)).toBeLessThan(0.002)
  })

  // Below ~650 K the WSS fit's ȳ tail (decays slower than x̄ past 700 nm, unlike the CIE table)
  // turns chromaticity green; those temperatures are 1e-6 of paper or dimmer. Test from 700 K.
  const J700 = Math.ceil(((Math.log2(700) - lutLog2T(0)) / (lutLog2T(LUT_SIZE - 1) - lutLog2T(0))) * (LUT_SIZE - 1))

  it('x decreases monotonically with T (T ≥ 700 K)', () => {
    let prev = Infinity
    for (let j = J700; j < LUT_SIZE; j++) {
      const [x] = chromaticity(bbXYZ(2 ** lutLog2T(j)))
      expect(x).toBeLessThan(prev)
      prev = x
    }
    // and in the stored float32 LUT wherever it has not underflowed
    prev = Infinity
    for (let j = J700; j < LUT_SIZE; j++) {
      const v = [lut[j * 4], lut[j * 4 + 1], lut[j * 4 + 2]]
      if (v[0] + v[1] + v[2] < 1e-30) continue
      const [x] = chromaticity(v)
      expect(x).toBeLessThanOrEqual(prev)
      prev = x
    }
  })
})

describe('blackbody band LUT', () => {
  it('packs 12 band radiances per T in 3 rows of RGBA', () => {
    const lut = buildBbBandsLUT()
    expect(lut.length).toBe(LUT_SIZE * 3 * 4)
    for (const j of [0, 400, 720, LUT_SIZE - 1]) {
      const T = 2 ** lutLog2T(j)
      for (let i = 0; i < NUM_BANDS; i++) {
        const got = lut[(Math.floor(i / 4) * LUT_SIZE + j) * 4 + (i % 4)]
        expect(close(got, bbBand(i, T), 1e-6)).toBe(true)
      }
    }
  })

  it('at 5778 K, times the solar dilution, equals SUN_BANDS', () => {
    for (let i = 0; i < NUM_BANDS; i++) expect(close(bbBand(i, 5778) * 2.16e-5, SUN_BANDS[i], 1e-12)).toBe(true)
  })
})
