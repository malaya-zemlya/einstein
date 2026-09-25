# Module: render

A raw WebGPU renderer with WGSL shaders and no 3D engine. It uses an HDR canvas where the display supports it. Its only input is a `RenderView` (plan § 2), produced by `game.viewOf(state)` in play and by `replay.viewAt(rs)` in replay. It never sees `GameState`.

## Device and canvas (`gpu.js`)

- `navigator.gpu.requestAdapter({powerPreference: 'high-performance'})`, then `requestDevice()`. If WebGPU is unavailable, the page shows a message naming the supported browsers (current Chrome and Safari; Firefox where WebGPU is enabled) and stops. There is no WebGL fallback (decision 25).
- **HDR mode** is used when `matchMedia('(dynamic-range: high)').matches`. The context is configured with `{format: 'rgba16float', colorSpace: 'srgb', toneMapping: {mode: 'extended'}, alphaMode: 'opaque'}`. Values above 1.0 are then brighter than SDR white on screen (EDR on the XDR display).
- **SDR mode** otherwise: `{format: navigator.gpu.getPreferredCanvasFormat(), toneMapping: {mode: 'standard'}}`.
- The canvas backing size is the CSS size × `devicePixelRatio` (native Retina: 3456×2234 full-screen on the target machine). `?quality=low` renders at DPR 1.
- **Main pass.** Colour target `rgba16float` (the HDR scene), depth `depth32float` with a **reversed-Z** projection (near = 0.05, far = ∞). Reversed-Z gives uniform precision out to the ~5.6 km apparent distances of the stretched forward view, with no log-depth tricks. MSAA is 4× in both quality modes.

## Resources

- **`meshes`**: static GPU buffers for terrain, water and props, built once from `GeometrySpec`s. There is a vertex buffer (interleaved: position vec3, normal vec3, bands 3×vec4, emitTemp f32, particle u32; 84 bytes per vertex; `particle` is the particle index 0–15 in the burst mesh and 0 elsewhere) and an index buffer (u32).
- **Dynamic objects** (targets, fireballs, bursts) use **instancing**. There is one mesh per kind: a fireball icosphere (r = 0.3 m); one balloon-plus-stick target mesh per colour, shared by all targets of that colour; and one burst mesh containing 16 particles. Per-instance data lives in a storage buffer of `ObjectParams`. Burst particle velocities live in a separate storage buffer `burstVel: array<vec4>`, 16 entries per burst instance, filled by `sync()` from each burst's own seeded `particleVels` (so big and small bursts, and every individual burst, differ).
- `ObjectParams` (WGSL struct, 64 bytes): `origin vec3, dt0 f32, vel vec3, birthRel f32, hitLocal vec3, deathRel f32, emitScale f32, hasHit u32, burstBase u32 (index into burstVel, or 0xFFFFFFFF), pad`. Static meshes use a single params record with zeros and `birthRel = −1e30`, `deathRel = +1e30`.
- **Frame uniforms** (one uniform buffer): `obsPos, obsVel, gamma, flags (4×u32), viewRot (mat3), proj (mat4), sunDir, sunBands[12], ambSky, ambGround, thermalT, thermalEps, c, headroom, adaptationOn, resetAdaptation`.
- **LUTs**: the band LUT is a 256×12 `rgba32float` texture, the blackbody LUT is 256×1, and the blackbody band LUT (`bbBands`, used for fireball lighting) is 256×3. Both are sampled with manual linear interpolation (`textureLoad` of two texels plus a mix), because float32 textures aren't filterable without an optional feature.
- `sync(view)` rewrites the instance storage buffers each frame from `view.objects` (plus `view.avatar` in replay), grouped by `kind`. Times are made relative to `t_o` in double precision on the CPU, so the GPU only ever sees small numbers.

## Invariants
- A vertex's world velocity is `params.vel + burstVel[burstBase + particle]` (the second term only when `burstBase` is set), and at most one of the two is non-zero. Fireballs set `params.vel` (from `velocityAdd`, |u| < C), burst particles use `burstVel` (≤ 0.3C, world frame), and everything else has both zero. So |u| < C holds without adding velocities on the GPU, and `sync()` asserts it in development builds.
- Every time on the GPU is relative to the observer's current world time.

## Shaders

`relativity.wgsl` holds `retardedDelay`, `boost`, `doppler` and `apparent`. It is a line-for-line port of `physics/lightcone.js` (same names, same branch order), and is shared by `object.wgsl`, the parity-test compute shader, and the future ray tracer. `colour.wgsl` holds the band and blackbody colour pipeline, shared by the object and sky shaders.

### object.wgsl: vertex stage
1. `p = params.origin + position`, `u = params.vel + (burstBase set ? burstVel[burstBase + particle].xyz : 0)`.
2. `r = p + u*params.dt0 − obsPos`.
3. If delay is on, `Δ = retardedDelay(r, u)` (the cancellation-free form); otherwise `Δ = 0`. Then `dx = r − u*Δ`, `tRel = −Δ`.
4. `death = params.deathRel + select(0, length(position − params.hitLocal)/C, params.hasHit == 1)`, and `visible = birthRel <= tRel && tRel <= death`.
5. `dt = −length(dx)/C`. If aberration is on, `dx = boost(dt, dx, obsVel)`.
6. `clip = proj * vec4(viewRot * dx, 1)`, with reversed-Z.
7. `D = doppler(−normalize(r − u*Δ), obsVel, u)`.
8. **Outputs** to the fragment stage: the band albedos (three vec4s), the world normal, the emission point `xe = dx_unboosted + obsPos` (world position at emission) with its time `tRel`, then `emitT`, `emitScale`, `D` and `visible`. Lighting moves to the fragment stage, because fireball light varies over short distances.


### object.wgsl: fragment stage (the `colour.wgsl` pipeline)
**Lighting, in the world frame at the emission event (xe, tRel):**
- **Sun.** `lambert = max(dot(n, sunDir), 0) * shadow(xe, tRel)` and `amb = mix(ambGround, ambSky, 0.5 + 0.5*n.y)`, so `w[i] = albedo[i]*sunBands[i]*(lambert + amb)`.
- **Fireball light.** For each of the `nLights` (≤ 16) fireball lights, `w[i] += albedo[i]*fireballIrradiance(light, xe, tRel, n)[i]/π`. See § Fireball lighting.

```
if (!visible) discard
S = doppler ? D : 1                       // wavelength scale
A = (searchlight ? D⁴ : 1) * S               // radiance scale
s = clamp(log2(S), −4, 4)
XYZ  = Σ_i w[i] * bandLUT(i, s)                       // reflected sunlight
XYZ += thermalEps * S⁻⁵ * bb(thermalT * S)            // 290 K thermal glow
XYZ += (emitT > 0) ? emitScale * S⁻⁵ * bb(emitT * S) : 0   // fireballs, bursts
out = min(XYZ_to_linear_sRGB * XYZ * A, 6e4)        // unexposed radiance; exposure is applied only in present
```
- `bb(T)` samples the blackbody LUT at log₂T and returns 0 outside its range.
- The blackbody terms use `B_λ(Sλ, T) = S⁻⁵·B_λ(λ, S·T)`, which is exact.
- **Why A = D⁴·S.** Radiance obeys `I_obs(λ) = A·I_emit(Sλ)`. With Doppler and searchlight both on, this gives the invariance law A = D⁵ (I_ν/ν³ is Lorentz-invariant). With Doppler alone, A = S keeps the total brightness unchanged. With the searchlight alone, A = D⁴ scales brightness without changing colour.

### sky.wgsl
This is a full-screen triangle drawn first, at depth 0 (the far plane under reversed-Z).
- **Direction.** `d'` is the player-frame view direction (the inverse projection, then `viewRotᵀ`). If aberration is on, `d` = boost of the light-like `(−1/C, d')` by `−obsVel`, normalised; otherwise `d = d'`.
- **Doppler.** `D = 1/(γ(1 − β·d'))` with aberration on, and `γ(1 + β·d)` with it off. These are the same quantity, written from whichever direction is available.
- **Sky.** Above the horizon: `skyBands·(0.5 + 0.5·max(d.y, 0))`. Below it: the sea-haze bands at 0.5.
- **Sun disk.** Within 1.5° of `sunDir`, a 5778 K blackbody at the stylised sun brightness.
- Then the `colour.wgsl` pipeline, without the thermal term.

### Sun shadows (`shadow.wgsl`)
- **Static map.** At startup, render terrain and props depth-only from the sun direction with an orthographic projection covering the island radius plus 20 m. The map is `depth32float` at 8192² (high quality) or 2048² (low), with a `comparison` sampler and slope-scaled bias. It is never re-rendered.
- **Balloon shadows.** A storage buffer holds the 12 targets' `{centre, radius = 0.8 (the visible balloon, not the 1.0 m hit sphere), deathRel, hitPos, hasHit}`, refreshed by `sync()` from every target in `view.objects`, including dead ones still present (the game keeps them until `lightHasPassed`; physics.md). For each target: intersect the ray `xe + sunDir·s` (s > 0) with the balloon sphere, taking the entry point p_s at distance s. On a hit the sunlight arriving at xe at `tRel` passed the balloon at `tRel − s/C`. The balloon blocks that light if `tRel − s/C ≤ deathRel + (hasHit ? |p_s − hitPos|/C : 0)`. The sticks cast no shadow.
- `shadow(xe, tRel) = pcf3x3(staticMap, xe) · Π_targets (blocked ? 0 : 1)`. Ambient light is not shadowed.
- The one-time map image uses the static map but no balloon term.
- **Test.** A JS reference (`render/shadowModel.js`) computes the balloon term, checked by compute parity. A unit test checks that after a hit at t_hit, a ground point 5 m from the balloon along the sun ray is unshadowed exactly from `t_hit + 5/C` onward (at the emission time of that point).

### Fireball lighting (`lighting.wgsl`, JS reference `physics/lighting.js`)
Each live fireball is a moving light source. The light that hits a surface point was emitted *earlier*, from where the fireball *was*, and it is Doppler-shifted by the fireball's motion. Everything is computed at the surface point's own emission event `(xe, tRel)`, because that is the moment the viewer sees.

- **Light list.** Each frame, `sync()` picks ≤ 16 fireballs nearest the player by retarded distance, from all fireballs in `view.objects`. Dead ones are included (the game keeps them until `lightHasPassed`), because their light is still travelling outward across the ground. It writes `{p (position at t_o), u, birthRel, deathRel, T = 3000 K}` into a storage buffer.
- **Per fragment and light:**
  1. `q = p + u·tRel` is the fireball's position at the surface's emission time.
  2. If delay is on, `Δ2 = retardedDelay(q − xe, u)`, otherwise 0. The illuminating light left the fireball at `tRel − Δ2`, and it counts only if that time lies within the fireball's `[birthRel, deathRel]`.
  3. `s = q − u·Δ2 − xe` is the vector from the surface to the fireball's position at emission, `d = |s|` and `l̂ = s/d`.
  4. If Doppler is on, `Dfg = doppler(−l̂, 0, u)` (a surface at rest seeing a moving source); otherwise 1.
  5. `E_i = π·EMIT_FIREBALL·LIGHT_GAIN·bbBands_i(Dfg·T)·(0.3/d)²·max(dot(n, l̂), 0)`.
     - `bbBands` is a LUT of Planck radiance at the 12 band centres over log₂T.
     - `B(λ, D·T)` already contains the D⁴ flux gain of a moving source, because it is the same blackbody identity used in the colour pipeline.
     - `LIGHT_GAIN = 10` is a labelled stylisation (decision 10): real fireball light at these sizes would be faint beside sunlight.
- **The visible consequence.** A fast fireball's light pool on the ground **lags behind** the fireball. It is **bluer ahead** of the fireball's motion and **redder behind** it. When the fireball dies, its light keeps travelling outward and fades from the ground on the light cone.
- The one-time map image has no fireballs, so no fireball lighting.

### Bloom (`bloom.wgsl`)
This is physically-based lens bloom on the HDR scene, before presenting. It has a 6-level mip chain: 13-tap downsample (with a Karis average on the first level, to stop fireflies) and 9-tap tent upsample. The result is `scene = mix(scene, bloom, 0.04)`: energy-conserving, with no threshold, so every bright thing (fireballs, the sun, the forward glow at boost) glows in proportion to its real brightness. Bloom is a camera effect, so it never changes relative brightness: the dark view behind stays dark.

### Screen effects (cosmetic, `present.wgsl` only)
- **Vignette.** Radial darkening of 15% at the corners.
- **Boost kick.** For 0.25 s after boost starts: the vignette pulses to 35%, and there is a 2-pixel screen shake, decaying.
- These operate on final screen pixels only. They never alter the world's geometry or its spectral colours, and there are no speed lines or star streaks (decision 28).

### Eye adaptation (`adapt.wgsl`, JS reference `render/adaptModel.js`)
- **Measure.** A compute pass reads the unexposed HDR scene (after bloom) at 1/8 resolution and computes the centre-weighted mean of `log2(max(L, 1e-4))`, using a Gaussian weight with σ = 0.35 of the screen height. It uses a two-stage workgroup reduction into `adaptBuf.measured`.
- **Adapt.** A single-thread compute pass does:
  - `target = log2(0.18) − measured`.
  - `τ = (target < current) ? 0.4 : 4.0` s. A darker exposure target means the scene got brighter, which adapts fast; the reverse adapts slowly.
  - `current += (target − current)·(1 − exp(−dτ/τ))`, clamped to [−6, 3].
  - `dτ` is the frame's proper time: these are *your* eyes.
- `present.wgsl` uses `exposure = exp2(current)` when adaptation is on, and the constant 0.8 when it is off.
- `adaptBuf` is copied to a mappable buffer and read with `mapAsync`, 2–3 frames late, only for the HUD's iris indicator. The frame never waits for it.
- Reset when `view.resetAdaptation` is true (set by the view producers on restart, adaptation toggle and replay entry): `current = log2(0.8)`.

### present.wgsl (tone mapping to the canvas)
- Read the HDR `rgb`. `L = luminance(rgb)`. If L ≤ 0, output black.
- `H = headroom`: 8.0 in HDR mode (the brightest output is 8× SDR white; the XDR display shows up to about 1600 nits against about 200-nit SDR white), and 1.0 in SDR mode. `?headroom=` overrides it.
- `Lt = L / (1 + L/H)`. This is nearly linear for dim scenes and rolls off smoothly toward H. `rgb *= Lt/L`.
- **Gamut.** Mix toward `vec3(Lt)` by the smallest t that makes every channel ≥ 0. In SDR mode, also mix by the smallest t that makes every channel ≤ 1.
- Encode with the sRGB transfer function, extended symmetrically above 1.
- Present is the **only** place exposure is applied: `rgb = hdr · exposure` before the curve. The exposure comes from eye adaptation (above), or the constant 0.8 when adaptation is off. At 0.8, sunlit white paper at rest shows at about 0.73 of SDR white with H = 8, or 0.44 with H = 1 (SDR). With adaptation on, exposure settles so the scene's centre-weighted average maps to 0.18. In HDR mode the searchlight's forward glare really is up to 8× brighter than paper on screen, and the view behind really is dark.

## Frame sequence in `render(view)`
1. `sync(view)`: rewrite the instance buffers for each kind, dropping ids that are gone and adding new ones.
2. Write the frame uniforms from `view.observer`, `view.worldTime`, `view.flags`, and c (a uniform, since the dev slider can change it between rounds).
3. **Main pass:** sky, static meshes, then instanced targets, fireballs and bursts, into the HDR target.
4. **Bloom pass** on the HDR target, then the **adaptation** measure and adapt compute passes.
5. **Present pass:** `present.wgsl` to the canvas (tone map, vignette, and the boost kick when `view.boost` has just turned on).

**One-time map image (`renderMapImage`, at startup).** Render the static meshes (terrain, water, props, no sky) with all four flags off, `obsPos` 150 m above the island centre, `viewRot` looking straight down, an orthographic `proj` of half-extent `MAP_HALF_EXTENT`, and fixed exposure 0.8 applied in a simple present-to-texture step, with no bloom or adaptation. The target is a 1024×1024 texture, read back once and turned into an `ImageBitmap`. With the flags off, the vertex stage outputs true positions and rest-frame colours, so no special shader mode exists.
- The module also exports `MAP_HALF_EXTENT = 100` and `mapProject(x, z) → [px, py]` for the `ui` overlay.

## Performance targets (criterion 20)
- **`quality=high`** (default): native resolution (3456×2234 on the target MacBook Pro), 4× MSAA, about 2.5M vertices. It must hold 120 fps on an Apple M4 Max.
- **`quality=low`**: DPR 1 and the coarse mesh densities from world.md. It must hold 60 fps at 1920×1080 on an Apple M1.
- GPU time is measured with `timestamp-query` when the adapter supports it (shown by the F readout), falling back to CPU frame intervals.

## Tests
- **Vertex parity (Vitest browser mode, Playwright Chromium with WebGPU enabled; runs on the development Mac).** A compute shader includes `relativity.wgsl` and writes `{dx', D, visible}` for 200 seeded vertices × 4 combinations of aberration and delay into a storage buffer. The test reads it back and compares against `physics.apparent` (relative tolerance 1e-4, or absolute 1e-3 m within 1 m of the eye). Cases include sources moving at up to 0.9995C, and hits.
- **Lighting parity.** A compute shader including `lighting.wgsl` evaluates 100 (surface point, fireball, flags) cases against `physics/lighting.js`. The JS reference is also unit-tested: a fireball at rest 2 m above flat ground lights the point straight below at `π·EMIT·GAIN·bb(3000 K)·0.0225`. For a fireball moving at 0.9c, 1 m above the ground, the brightest ground point at a fixed world time lies *behind* the fireball's current position, and the illumination colour temperature ahead of it is higher than behind it.
- **Colour parity.** A compute shader includes `colour.wgsl` and evaluates 20 cases (bands, D, doppler, searchlight, emitters). The results are compared with `test/render/colourReference.js`, a JS port that uses the `spectral` arrays. The same reference drives spectral.md's foliage test.
- **Present curve.** A JS unit test of `Lt = L/(1 + L/H)` and the gamut mix (both modes).
- **Adaptation model.** JS unit tests of `adaptModel.step`: after a step up in scene luminance of 2⁶, 95% settled within 1.2 s (3τ); after an equal step down, 95% settled within 12 s. It clamps at −6 and 3. A compute-parity test checks `adapt.wgsl` against the model over a scripted luminance sequence.
- **Sun colour.** A JS unit test: the sun's implied temperature is 8800 ± 100 K for `sunAhead` and 4530 ± 100 K for `sunBehind`.
- **Manual scenarios.** `test/manual.md`, including checking HDR on the XDR display.
