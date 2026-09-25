// Small seeded PRNG for property tests.
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

export function randomDir(rand) {
  const z = 2 * rand() - 1
  const a = 2 * Math.PI * rand()
  const s = Math.sqrt(1 - z * z)
  return { x: s * Math.cos(a), y: s * Math.sin(a), z }
}
