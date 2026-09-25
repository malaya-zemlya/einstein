import { createNoise2D, createNoise3D } from 'simplex-noise'

// Seeded PRNG: returns a function yielding uniform floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Independent 32-bit seed for a named sub-stream of `seed`.
export function subSeed(seed, stream) {
  let h = Math.imul((seed >>> 0) ^ Math.imul(stream + 1, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

export const noise2D = (seed) => createNoise2D(mulberry32(seed))
export const noise3D = (seed) => createNoise3D(mulberry32(seed))

// Fractal sum of simplex octaves, normalised to roughly [-1, 1].
export function fbm(noise, x, z, octaves = 4, gain = 0.5, lacunarity = 2) {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, z * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

// Uniform float in [a, b).
export const range = (rand, a, b) => a + (b - a) * rand()
