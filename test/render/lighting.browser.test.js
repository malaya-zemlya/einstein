// Lighting parity: lighting.wgsl fireballLight() on the GPU vs test/render/lightingReference.js in double.
import { describe, it, expect } from 'vitest'
import commonWgsl from '../../src/render/wgsl/common.wgsl?raw'
import relativityWgsl from '../../src/render/wgsl/relativity.wgsl?raw'
import lightingWgsl from '../../src/render/wgsl/lighting.wgsl?raw'
import { C } from '../../src/physics/constants.js'
import { retardedDelay } from '../../src/physics/lightcone.js'
import { LUT_SIZE, LOG2T_MIN, LOG2T_MAX, FIREBALL_T, EMIT_FIREBALL } from '../../src/spectral/lut.js'
import { mulberry32, randomDir } from '../physics/rng.js'
import { fireballLight } from './lightingReference.js'
import { getDevice, lutTextures, packFrame, packLights, runCompute, uniform, storage } from './gpuHarness.js'

// fireballLight uses only F, bbBandsTex and lights; the auto layout drops shadowMap/shadowSamp/objs.
const entry = /* wgsl */ `
struct LCase { xe: vec3f, tRel: f32, n: vec3f, pad: f32 }
@group(1) @binding(0) var<storage, read> cases: array<LCase>;
@group(1) @binding(1) var<storage, read_write> out: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&cases)) { return; }
  let E = fireballLight(cases[i].xe, cases[i].tRel, cases[i].n);
  out[3u * i] = E[0];
  out[3u * i + 1u] = E[1];
  out[3u * i + 2u] = E[2];
}
`
const code = commonWgsl + relativityWgsl + lightingWgsl + entry

const N = 100
const f = Math.fround
const fv = (v) => ({ x: f(v.x), y: f(v.y), z: f(v.z) })
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const SCALE = f(EMIT_FIREBALL * 0.3) // renderer: EMIT_FIREBALL · LIGHT_GAIN

// Six fireballs: at rest, slow, and up to 0.9C (fireball speeds come from velocityAdd, |u| < C); some
// born recently or already dead, so their light is still crossing the ground.
function makeScene(seed) {
  const rand = mulberry32(seed)
  const lights = [0, 0.3, 0.6, 0.8, 0.9, 0.9].map((beta, k) => {
    const windowed = k >= 3
    return {
      origin: fv({ x: 30 * rand() - 15, y: 0.5 + 3 * rand(), z: 30 * rand() - 15 }),
      dt0: f(beta ? 2 * rand() - 1 : 0),
      vel: fv(mul(randomDir(rand), beta * C)),
      birthRel: windowed ? f(-3 * rand()) : -1e30,
      deathRel: windowed && k !== 4 ? f(-1.5 * rand()) : 1e30,
      temp: FIREBALL_T,
      scale: SCALE,
    }
  })
  const cases = []
  for (let i = 0; i < N; i++) {
    const L = lights[i % lights.length]
    const near = add(L.origin, mul(randomDir(rand), 0.1 + 12 * rand()))
    const up = randomDir(rand)
    cases.push({
      xe: fv({ x: near.x, y: Math.min(near.y, 0.5 * rand()), z: near.z }),
      tRel: f(-4 * rand()),
      n: fv(mul(add(up, { x: 0, y: 1.5, z: 0 }), 1 / Math.hypot(up.x, up.y + 1.5, up.z))),
    })
  }
  return { lights, cases }
}

// The bbBands LUT sampled exactly as common.wgsl bbBands() does, in double.
const lutBand = (data) => (i, T) => {
  const x = ((Math.log2(T) - LOG2T_MIN) / (LOG2T_MAX - LOG2T_MIN)) * (LUT_SIZE - 1)
  if (x < 0 || x > LUT_SIZE - 1) return 0
  const x0 = Math.floor(x)
  const x1 = Math.min(x0 + 1, LUT_SIZE - 1)
  const at = (j) => data[(((i >> 2) * LUT_SIZE) + j) * 4 + (i & 3)]
  return at(x0) + (at(x1) - at(x0)) * (x - x0)
}

// Emission times within 1e-5 s of a light's birth/death flip that light on or off; skip such cases.
const emissionTimes = (lights, c, delay) => lights.map((L) => {
  const r = add(add(L.origin, mul(L.vel, L.dt0 + c.tRel)), mul(c.xe, -1))
  return c.tRel - (delay ? retardedDelay(r, L.vel) : 0)
})
const nearWindowEdge = (lights, c, delay) => emissionTimes(lights, c, delay)
  .some((tL, k) => Math.abs(tL - lights[k].birthRel) < 1e-5 || Math.abs(tL - lights[k].deathRel) < 1e-5)
const gatedCount = (lights, c, delay) => emissionTimes(lights, c, delay)
  .filter((tL, k) => tL < lights[k].birthRel || tL > lights[k].deathRel).length

const maxAbs = (a) => Math.max(...Array.from(a, Math.abs))
const relErr = (gpu, ref) => maxAbs(ref.map((v, k) => gpu[k] - v)) / Math.max(1e-6, maxAbs(ref))

describe('lighting.wgsl fireballLight() parity with lightingReference.js', () => {
  const { lights, cases } = makeScene(2024)
  const caseData = new Float32Array(N * 8)
  cases.forEach((c, i) => caseData.set([c.xe.x, c.xe.y, c.xe.z, c.tRel, c.n.x, c.n.y, c.n.z, 0], i * 8))

  for (const delay of [false, true]) {
    for (const doppler of [false, true]) {
      it(`delay=${delay}, doppler=${doppler}`, async () => {
        const device = await getDevice()
        const lut = lutTextures(device)
        const frame = packFrame({ flags: { aberration: true, delay, doppler, searchlight: true }, nLights: lights.length })
        const out = new Float32Array(await runCompute({
          code,
          group0: [
            { binding: 0, resource: uniform(device, frame) },
            { binding: 5, resource: lut.bbBands.createView() },
            { binding: 8, resource: storage(device, packLights(lights)) },
          ],
          inputs: [caseData],
          outBytes: N * 48,
          count: N,
        }))
        let lit = 0
        let gated = 0
        let worstShader = 0
        let worstRef = 0
        for (const [i, c] of cases.entries()) {
          if (nearWindowEdge(lights, c, delay)) continue
          const gpu = out.subarray(i * 12, i * 12 + 12)
          const ref = fireballLight(lights, c.xe, c.tRel, c.n, { delay, doppler })
          const emu = fireballLight(lights, c.xe, c.tRel, c.n, { delay, doppler }, lutBand(lut.data.bbBands))
          if (maxAbs(ref) > 1e-6) lit++
          gated += gatedCount(lights, c, delay)
          const eShader = relErr(gpu, emu)
          const eRef = relErr(gpu, ref)
          worstShader = Math.max(worstShader, eShader)
          worstRef = Math.max(worstRef, eRef)
          const ctx = `case ${i} ${JSON.stringify(c)}\n gpu ${Array.from(gpu)}\n ref ${Array.from(ref)}`
          // float32 shader arithmetic vs the same LUT path in double.
          expect(eShader, ctx).toBeLessThan(1e-4)
          // vs the exact Planck reference: the gap is bbBands' linear interpolation in log2 T (see colour
          // test; the dominant band of a 10000·D K source is far from the steep Wien tail).
          expect(eRef, ctx).toBeLessThan(2e-3)
        }
        expect(lit).toBeGreaterThan(N / 3)
        expect(gated).toBeGreaterThan(N / 4) // plenty of (case, light) pairs switched off by birth/death
        console.log(`delay=${delay} doppler=${doppler}: ${lit} lit cases, ${gated} gated pairs, worst vs LUT-emulation ${worstShader.toExponential(2)}, vs reference ${worstRef.toExponential(2)}`)
      })
    }
  }
})
