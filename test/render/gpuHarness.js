// Minimal WebGPU compute harness for shader parity tests (browser project only).
// Buffer packing mirrors src/render/renderer.js exactly: Frame (FRAME_BYTES 496), Obj (64 B, writeObject),
// Light (48 B, writeLights) and the three rgba32float LUT textures.

import { C } from '../../src/physics/constants.js'
import { LUT_SIZE, buildBandLUT, buildBlackbodyLUT, buildBbBandsLUT, THERMAL_T, THERMAL_EPS } from '../../src/spectral/lut.js'

export const FRAME_BYTES = 496
export const OBJ_BYTES = 64
export const LIGHT_BYTES = 48
export const BIG = 1e30
export const NO_BURST = 0xffffffff

let devicePromise
export function getDevice() {
  devicePromise ??= (async () => {
    if (!navigator.gpu) throw new Error('navigator.gpu is missing: WebGPU unavailable in this browser')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('no WebGPU adapter')
    return adapter.requestDevice()
  })()
  return devicePromise
}

const v3 = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z])

// Float offsets as documented in renderer.js (proj 0, invProj 16, viewRot 32, obsPos 48, c 51, obsVel 52,
// obsGamma 55, sunDir 56, ambSky 59, flags 60, sun/sky/haze bands 64/76/88, ambGround 100, thermalT 101,
// thermalEps 102, sunDiskScale 103, nLights 104, nTargets 105, shadowOn 106, shadowViewProj 108).
export function packFrame({
  obsPos = [0, 0, 0], obsVel = [0, 0, 0], c = C,
  flags = {}, thermalT = THERMAL_T, thermalEps = THERMAL_EPS, nLights = 0, nTargets = 0,
} = {}) {
  const buf = new ArrayBuffer(FRAME_BYTES)
  const fd = new Float32Array(buf)
  const fu = new Uint32Array(buf)
  const [vx, vy, vz] = v3(obsVel)
  fd.set(v3(obsPos), 48)
  fd[51] = c
  fd.set([vx, vy, vz], 52)
  fd[55] = 1 / Math.sqrt(1 - (vx * vx + vy * vy + vz * vz) / (c * c))
  fd.set([flags.aberration, flags.delay, flags.doppler, flags.searchlight].map((f) => (f ? 1 : 0)), 60)
  fd[101] = thermalT
  fd[102] = thermalEps
  fu[104] = nLights
  fu[105] = nTargets
  return buf
}

// Same field layout and CPU-side derivations as renderer.writeObject: aSrc = C² − |u|² in double.
export function packObjects(objs) {
  const buf = new ArrayBuffer(OBJ_BYTES * objs.length)
  const od = new Float32Array(buf)
  const ou = new Uint32Array(buf)
  objs.forEach((ob, i) => {
    const o = i * 16
    const u = v3(ob.vel)
    od.set(v3(ob.origin), o)
    od[o + 3] = ob.dt0
    od.set(u, o + 4)
    od[o + 7] = ob.birthRel ?? -BIG
    od.set(ob.hitLocal ? v3(ob.hitLocal) : [0, 0, 0], o + 8)
    od[o + 11] = ob.deathRel ?? BIG
    od[o + 12] = ob.emitScale ?? 0
    ou[o + 13] = ob.hitLocal ? 1 : 0
    ou[o + 14] = ob.burstBase ?? NO_BURST
    od[o + 15] = C * C - (u[0] * u[0] + u[1] * u[1] + u[2] * u[2])
  })
  return buf
}

// Same order as renderer.writeLights: origin, dt0, vel, birthRel, temp, scale, aSrc, deathRel.
export function packLights(lights) {
  const buf = new ArrayBuffer(LIGHT_BYTES * lights.length)
  const ld = new Float32Array(buf)
  lights.forEach((L, i) => {
    const u = v3(L.vel)
    ld.set([...v3(L.origin), L.dt0, ...u, L.birthRel ?? -BIG, L.temp, L.scale,
      C * C - (u[0] * u[0] + u[1] * u[1] + u[2] * u[2]), L.deathRel ?? BIG], (i * LIGHT_BYTES) / 4)
  })
  return buf
}

// The three LUT textures, created exactly as renderer.lutTexture does. Also returns the raw Float32 data.
export function lutTextures(device) {
  const data = { band: buildBandLUT(), bb: buildBlackbodyLUT(), bbBands: buildBbBandsLUT() }
  const tex = (d, height) => {
    const t = device.createTexture({ size: [LUT_SIZE, height], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
    device.queue.writeTexture({ texture: t }, d, { bytesPerRow: LUT_SIZE * 16 }, [LUT_SIZE, height])
    return t
  }
  return { data, band: tex(data.band, 12), bb: tex(data.bb, 1), bbBands: tex(data.bbBands, 3) }
}

export function makeBuffer(device, data, usage) {
  const buf = device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 16) * 16), usage: usage | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(buf, 0, data)
  return buf
}
export const uniform = (device, data) => ({ buffer: makeBuffer(device, data, GPUBufferUsage.UNIFORM) })
export const storage = (device, data) => ({ buffer: makeBuffer(device, data, GPUBufferUsage.STORAGE) })

const pipelines = new Map()
async function pipelineFor(device, code) {
  if (!pipelines.has(code)) {
    const module = device.createShaderModule({ code })
    const info = await module.getCompilationInfo()
    const errors = info.messages.filter((m) => m.type === 'error')
    if (errors.length) throw new Error(errors.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'))
    pipelines.set(code, device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } }))
  }
  return pipelines.get(code)
}

// Runs `main` (@workgroup_size(64)) over `count` invocations.
// group0: [{binding, resource}] for the production bindings the entry point actually uses (auto layout
// strips the rest). inputs: ArrayBuffers bound read-only at @group(1) @binding(0..k-1); the read_write
// output buffer of outBytes is @group(1) @binding(k). Returns the output as an ArrayBuffer.
export async function runCompute({ code, group0, inputs = [], outBytes, count }) {
  const device = await getDevice()
  device.pushErrorScope('validation')
  const pipeline = await pipelineFor(device, code)
  const out = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const read = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const g0 = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: group0 })
  const g1 = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [...inputs.map((d, i) => ({ binding: i, resource: storage(device, d) })), { binding: inputs.length, resource: { buffer: out } }],
  })
  const enc = device.createCommandEncoder()
  const pass = enc.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, g0)
  pass.setBindGroup(1, g1)
  pass.dispatchWorkgroups(Math.ceil(count / 64))
  pass.end()
  enc.copyBufferToBuffer(out, 0, read, 0, outBytes)
  device.queue.submit([enc.finish()])
  const err = await device.popErrorScope()
  if (err) throw new Error(`WebGPU validation: ${err.message}`)
  await read.mapAsync(GPUMapMode.READ)
  const result = read.getMappedRange().slice(0)
  read.unmap()
  out.destroy()
  read.destroy()
  return result
}
