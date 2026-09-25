import commonWgsl from './wgsl/common.wgsl?raw'
import relativityWgsl from './wgsl/relativity.wgsl?raw'
import lightingWgsl from './wgsl/lighting.wgsl?raw'
import objectWgsl from './wgsl/object.wgsl?raw'
import skyWgsl from './wgsl/sky.wgsl?raw'
import presentWgsl from './wgsl/present.wgsl?raw'
import { C } from '../physics/constants.js'
import { dot, sub, lengthSq } from '../math/vec3.js'
import { lookDirection } from '../math/orient.js'
import { perspectiveReversedInfinite, invert, viewRotation } from '../math/mat4.js'
import {
  LUT_SIZE, SUN_BANDS, EMIT_FIREBALL, EMIT_BURST, SUN_DISK_SCALE, THERMAL_EPS, THERMAL_T,
  buildBandLUT, buildBlackbodyLUT, buildBbBandsLUT, skyBands,
} from '../spectral/lut.js'
import { rgbToBands } from '../spectral/rgb.js'
import { PALETTE } from '../world/palette.js'
import { makeFireballGeometry, makeBurstGeometry } from '../world/targets.js'

const MSAA = 4
const HDR_FORMAT = 'rgba16float'
const VERTEX_STRIDE = 80
const FRAME_BYTES = 496
const OBJ_BYTES = 64
const MAX_OBJECTS = 2048
const MAX_BURST_VELS = 256 * 16
const FOV_Y = (75 * Math.PI) / 180
const NEAR = 0.05
const SUN_DIR = (() => {
  const v = [0.55, 0.766, 0.33]
  const l = Math.hypot(...v)
  return v.map((x) => x / l)
})()
const BIG = 1e30
const NO_BURST = 0xffffffff

export class WebGPUUnavailableError extends Error {}

export async function createRenderer(canvas, island, { quality = 'high', targets = [] } = {}) {
  if (!navigator.gpu) throw new WebGPUUnavailableError('WebGPU is not available in this browser')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new WebGPUUnavailableError('No WebGPU adapter')
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  const hdr = matchMedia('(dynamic-range: high)').matches
  const canvasFormat = hdr ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device,
    format: canvasFormat,
    colorSpace: 'srgb',
    toneMapping: { mode: hdr ? 'extended' : 'standard' },
    alphaMode: 'opaque',
  })

  const lutTexture = (data, width, height) => {
    const tex = device.createTexture({ size: [width, height], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
    device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: width * 16 }, [width, height])
    return tex
  }
  const bandTex = lutTexture(buildBandLUT(), LUT_SIZE, 12)
  const bbTex = lutTexture(buildBlackbodyLUT(), LUT_SIZE, 1)
  const bbBandsTex = lutTexture(buildBbBandsLUT(), LUT_SIZE, 3)

  const frameBuf = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const objBuf = device.createBuffer({ size: OBJ_BYTES * MAX_OBJECTS, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  const burstBuf = device.createBuffer({ size: 16 * MAX_BURST_VELS, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  const presentBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

  const sceneLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
    ],
  })
  const sceneGroup = device.createBindGroup({
    layout: sceneLayout,
    entries: [
      { binding: 0, resource: { buffer: frameBuf } },
      { binding: 1, resource: { buffer: objBuf } },
      { binding: 2, resource: { buffer: burstBuf } },
      { binding: 3, resource: bandTex.createView() },
      { binding: 4, resource: bbTex.createView() },
      { binding: 5, resource: bbBandsTex.createView() },
    ],
  })
  const scenePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] })

  const module = (code, label) => {
    const m = device.createShaderModule({ code, label })
    m.getCompilationInfo().then((info) => {
      for (const msg of info.messages) if (msg.type === 'error') console.error(`${label}:${msg.lineNum}:${msg.linePos} ${msg.message}`)
    })
    return m
  }
  const objectModule = module(commonWgsl + relativityWgsl + lightingWgsl + objectWgsl, 'object')
  const skyModule = module(commonWgsl + relativityWgsl + skyWgsl, 'sky')
  const presentModule = module(presentWgsl, 'present')

  const vertexLayout = {
    arrayStride: VERTEX_STRIDE,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x4' },
      { shaderLocation: 3, offset: 40, format: 'float32x4' },
      { shaderLocation: 4, offset: 56, format: 'float32x4' },
      { shaderLocation: 5, offset: 72, format: 'float32' },
      { shaderLocation: 6, offset: 76, format: 'uint32' },
    ],
  }
  const objectPipeline = device.createRenderPipeline({
    layout: scenePipelineLayout,
    vertex: { module: objectModule, entryPoint: 'vs', buffers: [vertexLayout] },
    fragment: { module: objectModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    multisample: { count: MSAA },
  })
  const skyPipeline = device.createRenderPipeline({
    layout: scenePipelineLayout,
    vertex: { module: skyModule, entryPoint: 'vs' },
    fragment: { module: skyModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
    multisample: { count: MSAA },
  })
  const presentLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
    ],
  })
  const presentPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [presentLayout] }),
    vertex: { module: presentModule, entryPoint: 'vs' },
    fragment: { module: presentModule, entryPoint: 'fs', targets: [{ format: canvasFormat }] },
  })

  // --- geometry ---
  const uploadMesh = (spec) => {
    const n = spec.positions.length / 3
    const buf = new ArrayBuffer(n * VERTEX_STRIDE)
    const f = new Float32Array(buf)
    const u = new Uint32Array(buf)
    const w = VERTEX_STRIDE / 4
    for (let i = 0; i < n; i++) {
      const o = i * w
      f[o] = spec.positions[3 * i]
      f[o + 1] = spec.positions[3 * i + 1]
      f[o + 2] = spec.positions[3 * i + 2]
      f[o + 3] = spec.normals[3 * i]
      f[o + 4] = spec.normals[3 * i + 1]
      f[o + 5] = spec.normals[3 * i + 2]
      for (let k = 0; k < 4; k++) {
        f[o + 6 + k] = spec.bands0[4 * i + k]
        f[o + 10 + k] = spec.bands1[4 * i + k]
        f[o + 14 + k] = spec.bands2[4 * i + k]
      }
      f[o + 18] = spec.emitTemp ? spec.emitTemp[i] : 0
      u[o + 19] = spec.particle ? spec.particle[i] : 0
    }
    const vbuf = device.createBuffer({ size: buf.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(vbuf, 0, buf)
    const ibuf = device.createBuffer({ size: spec.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(ibuf, 0, spec.indices)
    return { vbuf, ibuf, count: spec.indices.length, destroy: () => { vbuf.destroy(); ibuf.destroy() } }
  }

  let staticMeshes = []
  let targetMeshes = new Map()
  const setIsland = (isl, tgts) => {
    for (const m of staticMeshes) m.destroy()
    for (const m of targetMeshes.values()) m.destroy()
    staticMeshes = [isl.terrain, isl.water, isl.props].filter(Boolean).map(uploadMesh)
    targetMeshes = new Map(tgts.map((t) => [t.id, uploadMesh(t.geometry)]))
  }
  setIsland(island, targets)
  const fireballMesh = uploadMesh(makeFireballGeometry(quality))
  const burstMesh = uploadMesh(makeBurstGeometry(quality))

  // --- constant frame data ---
  const frameData = new ArrayBuffer(FRAME_BYTES)
  const fd = new Float32Array(frameData)
  const fu = new Uint32Array(frameData)
  const putBands = (offsetFloats, bands) => { for (let i = 0; i < 12; i++) fd[offsetFloats + i] = bands[i] }
  fd.set(SUN_DIR, 56)
  putBands(64, SUN_BANDS)
  putBands(76, skyBands())
  const haze = PALETTE.seaHaze ?? { rgb: '#9fc4d8', uv: 0.2, ir: 0.1 }
  putBands(88, rgbToBands(haze.rgb, { uv: haze.uv, ir: haze.ir }))
  fd[59] = 0.25 // ambSky
  fd[100] = 0.08 // ambGround
  fd[101] = THERMAL_T
  fd[102] = THERMAL_EPS
  fd[103] = SUN_DISK_SCALE

  // --- render targets ---
  let size = [0, 0]
  let msaaTex, depthTex, hdrTex, presentGroup
  const ensureTargets = () => {
    const dpr = quality === 'low' ? 1 : devicePixelRatio
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (w === size[0] && h === size[1]) return
    size = [w, h]
    canvas.width = w
    canvas.height = h
    for (const t of [msaaTex, depthTex, hdrTex]) t?.destroy()
    msaaTex = device.createTexture({ size, format: HDR_FORMAT, sampleCount: MSAA, usage: GPUTextureUsage.RENDER_ATTACHMENT })
    depthTex = device.createTexture({ size, format: 'depth32float', sampleCount: MSAA, usage: GPUTextureUsage.RENDER_ATTACHMENT })
    hdrTex = device.createTexture({ size, format: HDR_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    presentGroup = device.createBindGroup({
      layout: presentLayout,
      entries: [{ binding: 0, resource: { buffer: presentBuf } }, { binding: 1, resource: hdrTex.createView() }],
    })
  }

  // --- per-frame object records ---
  const objData = new ArrayBuffer(OBJ_BYTES * MAX_OBJECTS)
  const od = new Float32Array(objData)
  const ou = new Uint32Array(objData)
  const burstData = new Float32Array(MAX_BURST_VELS * 4)

  const writeStatic = () => {
    od.fill(0, 0, 16)
    od[7] = -BIG
    od[11] = BIG
    ou[14] = NO_BURST
    od[15] = C * C
  }

  const writeObject = (index, obj, tObs, burstBase) => {
    const { line } = obj
    const o = index * 16
    const u = line.u
    od[o] = line.p.x
    od[o + 1] = line.p.y
    od[o + 2] = line.p.z
    od[o + 3] = tObs - line.t0
    od[o + 4] = u.x
    od[o + 5] = u.y
    od[o + 6] = u.z
    od[o + 7] = Number.isFinite(line.tBirth) ? line.tBirth - tObs : -BIG
    const hasHit = Boolean(line.hitPos) && Number.isFinite(line.tDeath)
    const hitLocal = hasHit ? sub(line.hitPos, line.positionAt(line.tDeath)) : { x: 0, y: 0, z: 0 }
    od[o + 8] = hitLocal.x
    od[o + 9] = hitLocal.y
    od[o + 10] = hitLocal.z
    od[o + 11] = Number.isFinite(line.tDeath) ? line.tDeath - tObs : BIG
    od[o + 12] = obj.kind === 'fireball' ? EMIT_FIREBALL : obj.kind === 'burst' ? EMIT_BURST : 0
    ou[o + 13] = hasHit ? 1 : 0
    ou[o + 14] = burstBase
    od[o + 15] = C * C - lengthSq(u)
  }

  const render = (view) => {
    ensureTargets()
    const tObs = view.worldTime
    const { observer } = view
    writeStatic()
    let next = 1
    const draws = []
    const targetsObj = view.objects.filter((o) => o.kind === 'target')
    for (const t of targetsObj) {
      const mesh = targetMeshes.get(t.id)
      if (!mesh) continue
      writeObject(next, t, tObs, NO_BURST)
      draws.push([mesh, next, 1])
      next++
    }
    const fireballs = view.objects.filter((o) => o.kind === 'fireball')
    const fbBase = next
    for (const f of fireballs) writeObject(next++, f, tObs, NO_BURST)
    if (fireballs.length) draws.push([fireballMesh, fbBase, fireballs.length])
    const bursts = view.objects.filter((o) => o.kind === 'burst').slice(0, MAX_BURST_VELS / 16)
    const bBase = next
    bursts.forEach((b, k) => {
      writeObject(next++, b, tObs, k * 16)
      b.extra.particleVels.forEach((pv, j) => burstData.set([pv.x, pv.y, pv.z, 0], (k * 16 + j) * 4))
    })
    if (bursts.length) draws.push([burstMesh, bBase, bursts.length])
    device.queue.writeBuffer(objBuf, 0, objData, 0, next * OBJ_BYTES)
    if (bursts.length) device.queue.writeBuffer(burstBuf, 0, burstData, 0, bursts.length * 16 * 16)

    const aspect = size[0] / size[1]
    const proj = perspectiveReversedInfinite(FOV_Y, aspect, NEAR)
    fd.set(proj, 0)
    fd.set(invert(proj), 16)
    fd.set(viewRotation(lookDirection(observer.yaw, observer.pitch)), 32)
    fd[48] = observer.pos.x
    fd[49] = observer.pos.y
    fd[50] = observer.pos.z
    fd[51] = C
    fd[52] = observer.vel.x
    fd[53] = observer.vel.y
    fd[54] = observer.vel.z
    fd[55] = 1 / Math.sqrt(1 - dot(observer.vel, observer.vel) / (C * C))
    const fl = view.flags
    fd.set([fl.aberration ? 1 : 0, fl.delay ? 1 : 0, fl.doppler ? 1 : 0, fl.searchlight ? 1 : 0], 60)
    fu[104] = 0
    fu[105] = 0
    fu[106] = 0
    device.queue.writeBuffer(frameBuf, 0, frameData)

    const headroom = hdr ? view.settings?.headroom ?? 8 : 1
    device.queue.writeBuffer(presentBuf, 0, new Float32Array([0.8, headroom, hdr ? 0 : 1, 0.15, 0, 0, 0, 0]))

    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: msaaTex.createView(), resolveTarget: hdrTex.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: depthTex.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 0 },
    })
    pass.setBindGroup(0, sceneGroup)
    pass.setPipeline(skyPipeline)
    pass.draw(3)
    pass.setPipeline(objectPipeline)
    for (const mesh of staticMeshes) {
      pass.setVertexBuffer(0, mesh.vbuf)
      pass.setIndexBuffer(mesh.ibuf, 'uint32')
      pass.drawIndexed(mesh.count, 1, 0, 0, 0)
    }
    for (const [mesh, first, count] of draws) {
      pass.setVertexBuffer(0, mesh.vbuf)
      pass.setIndexBuffer(mesh.ibuf, 'uint32')
      pass.drawIndexed(mesh.count, count, 0, 0, first)
    }
    pass.end()
    const out = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    })
    out.setPipeline(presentPipeline)
    out.setBindGroup(0, presentGroup)
    out.draw(3)
    out.end()
    device.queue.submit([encoder.finish()])
  }

  return { device, hdr, render, setIsland, get size() { return size } }
}
