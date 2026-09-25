// Vertex parity: relativity.wgsl apparent() on the GPU vs physics/lightcone.js apparent() in double.
import { describe, it, expect } from 'vitest'
import commonWgsl from '../../src/render/wgsl/common.wgsl?raw'
import relativityWgsl from '../../src/render/wgsl/relativity.wgsl?raw'
import { C } from '../../src/physics/constants.js'
import { apparent } from '../../src/physics/lightcone.js'
import { mulberry32, randomDir } from '../physics/rng.js'
import { getDevice, packFrame, packObjects, runCompute, uniform, storage } from './gpuHarness.js'

// One invocation per vertex: objs[i] is its Obj record, locals[i].xyz its mesh-local position (as object.wgsl:
// p = origin + position). Observer and flags come from the Frame uniform, as in the vertex stage.
const entry = /* wgsl */ `
@group(1) @binding(0) var<storage, read> locals: array<vec4f>;
@group(1) @binding(1) var<storage, read_write> out: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&locals)) { return; }
  let o = objs[i];
  let local = locals[i].xyz;
  let a = apparent(o.origin + local, local, o.vel, o.aSrc, o.dt0, o.birthRel, o.deathRel, o.hitLocal,
                   o.hasHit == 1u, F.obsPos, F.obsVel, F.obsGamma, F.c, F.flags.x > 0.5, F.flags.y > 0.5);
  out[2u * i] = vec4f(a.pos, a.D);
  out[2u * i + 1u] = vec4f(a.visible, a.tRel, 0.0, 0.0);
}
`
const code = commonWgsl + relativityWgsl + entry

const N = 200
const f = Math.fround
const fv = (v) => ({ x: f(v.x), y: f(v.y), z: f(v.z) })
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s })

// Seeded vertices; every input is rounded to float32 first so the JS reference and the GPU see identical data.
function makeVertices(seed, obsPos) {
  const rand = mulberry32(seed)
  const vs = []
  for (let i = 0; i < N; i++) {
    const kind = rand()
    const speed = kind < 0.25 ? 0 : kind < 0.35 ? 0.9995 * C : 0.9995 * C * rand() ** 0.3
    const vel = fv(mul(randomDir(rand), speed))
    const near = i % 20 === 0 // a few within ~1 m of the eye
    const origin = fv(add(obsPos, mul(randomDir(rand), near ? 0.2 + 0.8 * rand() : 1 + 150 * rand())))
    const local = fv(mul(randomDir(rand), near ? 0.05 * rand() : 2 * rand()))
    const dt0 = f(speed === 0 ? 0 : 6 * rand() - 3)
    const windowed = rand() < 0.4
    const birthRel = windowed ? f(-12 * rand()) : -1e30
    const deathRel = windowed ? f(birthRel + 10 * rand()) : 1e30
    const hitLocal = windowed && rand() < 0.5 ? fv(mul(randomDir(rand), 1.5 * rand())) : null
    vs.push({ origin, local, vel, dt0, birthRel: f(birthRel), deathRel: f(deathRel), hitLocal })
  }
  // The eye itself (the dist < 1e-4 early-out) and a vertex 0.5 mm in front of it.
  vs[1] = { ...vs[1], origin: fv(obsPos), local: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, dt0: 0 }
  vs[2] = { ...vs[2], origin: fv(add(obsPos, { x: 0, y: 0, z: -5e-4 })), local: { x: 0, y: 0, z: 0 } }
  return vs
}

const OBSERVERS = [
  { name: 'observer at rest', pos: { x: 12.5, y: 1.75, z: -30.25 }, vel: { x: 0, y: 0, z: 0 } },
  { name: 'observer at 0.8C', pos: { x: -40, y: 2, z: 7.5 }, vel: fv(mul({ x: 0.6, y: 0, z: -0.8 }, 0.8 * C)) },
]
const COMBOS = [
  { aberration: false, delay: false },
  { aberration: true, delay: false },
  { aberration: false, delay: true },
  { aberration: true, delay: true },
]

describe('relativity.wgsl apparent() parity with lightcone.js', () => {
  for (const obs of OBSERVERS) {
    const verts = makeVertices(obs.name.length * 7919, obs.pos)
    const objBytes = packObjects(verts)
    const locals = new Float32Array(N * 4)
    verts.forEach((v, i) => locals.set([v.local.x, v.local.y, v.local.z, 0], i * 4))
    for (const flags of COMBOS) {
      it(`${obs.name}, aberration=${flags.aberration}, delay=${flags.delay}`, async () => {
        const device = await getDevice()
        const frame = packFrame({ obsPos: obs.pos, obsVel: obs.vel, flags })
        const out = new Float32Array(await runCompute({
          code,
          group0: [{ binding: 0, resource: uniform(device, frame) }, { binding: 1, resource: storage(device, objBytes) }],
          inputs: [locals],
          outBytes: N * 32,
          count: N,
        }))
        const observer = { x: obs.pos, v: obs.vel }
        let visibleChecked = 0
        let worstPos = 0
        let worstD = 0
        for (let i = 0; i < N; i++) {
          const v = verts[i]
          const ref = apparent({ ...v, p: add(v.origin, v.local), u: v.vel }, observer, flags)
          const g = out.subarray(i * 8, i * 8 + 8)
          const ctx = `vertex ${i} ${JSON.stringify(v)}`

          // Position: relative 1e-4, or absolute 1e-3 m within 1 m of the eye.
          const refLen = Math.hypot(ref.pos.x, ref.pos.y, ref.pos.z)
          const err = Math.hypot(g[0] - ref.pos.x, g[1] - ref.pos.y, g[2] - ref.pos.z)
          const tol = refLen < 1 ? 1e-3 : 1e-4 * refLen
          worstPos = Math.max(worstPos, err / tol)
          expect(err, `pos ${ctx}`).toBeLessThanOrEqual(tol)

          // Doppler factor: relative 1e-4.
          const dErr = Math.abs(g[3] - ref.D) / ref.D
          worstD = Math.max(worstD, dErr / 1e-4)
          expect(dErr, `D gpu=${g[3]} ref=${ref.D} ${ctx}`).toBeLessThanOrEqual(1e-4)

          // Visibility: exact, unless tRel is within 1e-5 s of a window edge.
          const tRel = g[5]
          const death = v.deathRel + (v.hitLocal ? Math.hypot(v.local.x - v.hitLocal.x, v.local.y - v.hitLocal.y, v.local.z - v.hitLocal.z) / C : 0)
          if (Math.abs(tRel - v.birthRel) > 1e-5 && Math.abs(tRel - death) > 1e-5) {
            expect(g[4] === 1, `visible ${ctx}`).toBe(ref.visible)
            visibleChecked++
          }
        }
        expect(visibleChecked).toBeGreaterThan(N - 5)
        console.log(`${obs.name} ${JSON.stringify(flags)}: worst pos err/tol ${worstPos.toFixed(3)}, worst D err/tol ${worstD.toFixed(3)}`)
      })
    }
  }

  it('the seeded set covers the intended mix', () => {
    const verts = makeVertices(1, OBSERVERS[1].pos)
    const speeds = verts.map((v) => Math.hypot(v.vel.x, v.vel.y, v.vel.z) / C)
    expect(speeds.filter((s) => s === 0).length).toBeGreaterThan(20)
    expect(Math.max(...speeds)).toBeGreaterThan(0.999)
    expect(verts.filter((v) => v.hitLocal).length).toBeGreaterThan(10)
    expect(verts.filter((v) => v.birthRel > -1e30).length).toBeGreaterThan(40)
  })
})
