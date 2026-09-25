# Einstein Island — implementation plan

Status: consolidated for approval · 2026-09-25 · 32 decisions, 31 acceptance criteria, 0 open questions

## 1. Goal and scope

A desktop-browser first-person game on a small, cute, procedurally generated island. The speed of light is slowed to a game-scale constant (c = 20 m/s, decision 1), so ordinary running speeds are a large fraction of c. The player walks the island and shoots fireballs at 12 static targets, and a round ends once all targets have been seen hit. Every object on screen is drawn as a real observer moving at that speed would see it, using the special-relativity effects below. There are two equal priorities. The first is **teaching the physics**: every effect can be switched on and off, a mini-map shows where things "really" are, and short on-screen captions explain what the player is seeing. The second is **spectacle**: HDR brightness on capable displays, bloom, fireballs that light the terrain, a sci-fi HUD, and physically modelled sound. The rule joining them is that the spectacle comes from the real physics, and purely cosmetic flourishes touch only the HUD, the sound and screen-space effects, never the world's geometry or colours.

Terms used throughout:

- **β and γ.** β is speed as a fraction of c. γ = 1/√(1−β²) is the Lorentz factor: how much faster the island's clock runs than yours.
- **Proper time (τ)**: time as measured by the player's own clock. **World time (t)**: time as measured by the island's clocks.
- **Celerity** (proper velocity) is γ·v. **Rapidity** is φ = atanh(β). Rapidity adds linearly when you speed up in a straight line, and it grows at a constant rate under constant felt acceleration.
- **Light-travel delay (retardation)**: you see each point of an object where it was when the light now reaching your eye left it. That moment is its *retarded time*.
- **Aberration**: your own motion bends the apparent directions of incoming light toward your direction of travel. Things beside and behind you swing forward; only a shrinking cone directly behind stays behind.
- **Doppler shift**: light from sources you approach arrives at higher frequency (blueshift), and from sources you recede from at lower frequency (redshift). The *Doppler factor* D is the ratio of received to emitted frequency. At high speeds this moves invisible infrared (IR) and ultraviolet (UV) light into the visible range, and moves visible light out of it.
- **Searchlight effect**: received brightness scales with D⁴, so the view ahead brightens and the view behind dims.

*Lorentz contraction* is not drawn as its own effect. Delay and aberration together produce what a real camera would see, including the apparent rotation of fast objects (*Terrell rotation*).

Settled in requirements (phase 0):
- c is slow and fixed (not adjustable in the game).
- Movement uses arcade controls. WASD moves at a fixed **cruise** speed. Holding **Shift** boosts toward a high **boost cap**. Speed changes along a visible acceleration ramp of about 1 to 3 seconds.
- Doppler colour is spectral: surfaces are described by spectral bands (UV, visible and IR), and fireballs and the sun are blackbodies.
- Content is target practice: 12 static targets, a hit counter and a round timer. The fireballs are the only moving objects, apart from short-lived burst particles.
- Fireballs fly in straight lines at a fixed speed relative to the player, and their world velocity comes from relativistic velocity addition.
- Teaching aids: a toggle for each effect, a "Newtonian" key that turns all four off, a HUD (β, γ, proper time, world time), a top-down mini-map of true world positions, and short contextual captions. There are no guided levels and no help screen.
- The world is a procedural island, with every mesh generated in code.
- **Core mechanic (intended):** boosting is both the reward and the challenge. The round clock counts proper time, which runs up to 7× slower at boost, so boosting gives the best times. But the boosted view (squeezed forward, Doppler-shifted, glaring ahead and dark behind) is hard to navigate. Learning to read the relativistic view is the skill the game teaches.
- When options are close, pick the most educational one. The game must also be flashy and snazzy ("we are simulating sci-fi abilities"), under the rule above.
- **Target hardware:** a MacBook Pro with an M4 Max (40-core GPU) and a Liquid Retina XDR display. The game uses WebGPU, with HDR output where the display supports it. There is no WebGL fallback.
- **Spectacle features:** precomputed sun shadows; physically-based bloom; fireballs as moving light sources, with delayed, Doppler-shifted light on the terrain; a sci-fi HUD; and sound.
- **Sound travels through the island's air at 0.5c (10 m/s).** Hits are seen before they are heard, approaching the sound speed produces a transonic rumble, above it sounds from behind can't reach you (you never hear your own boom; your Mach cone is drawn on the mini-map), and sounds you outran catch up when you slow down.
- **Recording** (added during review): the game records each round as a self-contained *spacetime log*: the island seed, the camera path, and every object's worldline. K downloads it as a `.json` file. **Replay** (added during review): L loads a recording back into the live renderer, with pause, rewind, scrubbing, playback rates from −8× to 8×, effect toggles on a frozen moment, and a free camera that can watch the recorded player fly past. A later phase will add an offline, fully ray-traced movie renderer that reads these logs, so the log must contain everything that renderer needs.

Non-goals:
- Guided tutorial levels, or any help screen beyond captions.
- Moving targets or creatures, and curved (accelerated) paths for anything except the player.
- Gravity: fireballs fly straight and do not fall.
- Mobile or touch support, gamepads and multiplayer.
- Browsers without WebGPU.
- Imported 3D assets (glTF) and an asset pipeline.
- The player colliding with trees, rocks or targets. The player walks through them and is only kept on the island.
- The ray-traced movie renderer itself (next phase). This phase only guarantees the recording format it will consume.
- Recording while replaying; editing recordings.

## 2. Architecture

Nine modules plus a thin `main`. In play, the only runtime data flow is `ui/input → game.step → GameState → (viewOf → render; ui; audio; record)`. In replay, it is `ui/input → replay.step → ReplayState → (viewAt → render; ui; audio)`.

Dependencies by module:
- `physics` and `spectral` depend on nothing.
- `world` depends on `spectral`.
- `game` depends on `physics` and `world`.
- `render` depends on `physics` and `spectral`, and reads only a `RenderView`.
- `ui` depends on `physics` (Worldline, used for the map ghosts), `world` (`materialAt`, used for a caption) and `render` (map bitmap, `mapProject`, exposure and GPU-time getters), and reads `GameState` or `ReplayState`.
- `record` depends on `physics` and `world` (the shape hash), and reads `GameState`.
- `replay` depends on `physics`, `record` (readLog) and `world`, and owns `ReplayState`.
- `audio` depends on `physics`, and reads `GameState` in play and `ReplayState` in replay.
- Only `render`, `ui`, `audio` and `main` touch the DOM, WebGPU or Web Audio.

| Module | Responsibility | Detail doc |
|---|---|---|
| `physics` | Pure special-relativity maths in JavaScript (JS): Lorentz factor, velocity addition, retarded-time solve, event boost, Doppler factor, rapidity ramp, worldlines. No rendering. | [modules/physics.md](modules/physics.md) |
| `spectral` | Pure colour science: the band basis, CIE colour-matching functions, lookup tables (LUTs), absolute radiance units, and conversion from RGB to bands. | [modules/spectral.md](modules/spectral.md) |
| `world` | Deterministic procedural island: terrain height field, the material rule, props, target placement, and the palette. | [modules/world.md](modules/world.md) |
| `game` | `GameState` and the single `step` function: player kinematics, fireballs, world-frame collisions, hit events, and the round. | [modules/game.md](modules/game.md) |
| `render` | Raw WebGPU with WGSL shaders: the relativistic vertex transform, spectral colour, fireball lighting, the sky, bloom, high-dynamic-range (HDR) presentation, and the one-time mini-map image. It reads `GameState` and never changes it. | [modules/render.md](modules/render.md) |
| `ui` | Input capture (keyboard, mouse, pointer lock), the HUD, captions, and the mini-map overlay (light rings, ghost markers). | [modules/game.md § UI](modules/game.md#ui) |
| `audio` | Web Audio synthesis of hits, shots, the boost whine, transonic rumble and ambience, with sound delay and Doppler computed for sound in air at 0.5c. | [modules/audio.md](modules/audio.md) |
| `replay` | Plays a spacetime log through the live renderer: clock and rate, recorded or free camera, avatar, and log-derived sound. | [modules/replay.md](modules/replay.md) |
| `record` | Records each round as a spacetime log (camera path plus worldlines) and exports it as JSON. It reads `GameState` only. | [modules/record.md](modules/record.md) |
| `main` | Startup; the frame loop and the play/replay mode switch (L loads a log; Backspace returns to play); island rebuild via `renderer.setIsland` when a log's seed differs; `?scenario=` presets (`src/scenarios.js`); the K download. | this document |

The loop in `main.js` has two modes.
- **Play:** `input.snapshot() → game.step(state, input, dτ) → recorder.observe(state) → renderer.render(viewOf(state)) → ui.update(state) → audio.update(state)`.
- **Replay:** `input.snapshot() → replay.step(rs, input, dReal) → view = viewAt(rs) → renderer.render(view) → ui.updateReplay(rs, view) → audio.updateReplay(rs, view)`.

`RenderView = {observer {pos, vel, yaw, pitch}, worldTime, flags, ui, settings {adaptation, headroom}, resetAdaptation: bool, objects: [{id, kind, line: Worldline, extra}], avatar?, boost}` is the renderer's entire input. `game.viewOf(state)` and `replay.viewAt(rs)` are the only two producers.

### Units, frames and time (global invariants)

- SI units throughout, with `C = 20` (m/s) exported from `physics/constants.js`. The y axis points up.
- The **world frame** is the island's rest frame. All game state (positions, velocities, times) is stored in world-frame coordinates.
- The **player frame** is the player's instantaneous rest frame, obtained from the world frame by a *pure boost* (a Lorentz transformation with no rotation). Its axes are parallel to the world axes, and camera yaw and pitch are applied after the boost.
- **The player's clock is the wall clock.** Each frame, real elapsed time is the player's proper time step `dτ` (capped at 1/30 s). World time advances by `dt = γ·dτ`.
- **Every time sent to the GPU is relative to the observer's current world time** `t_o`, computed in double precision on the CPU.
- Every visible vertex lies on a straight **worldline** (its path through space and time) `x(t) = p + u·(t − t0)`, and is visible only while its retarded time lies within its life interval. **Every vertex's velocity has |u| < C**, guaranteed by construction (render.md § Invariants).
- A target or fireball that is destroyed at event (t_hit, x_hit) is destroyed at each of its vertices when light from x_hit could first reach that vertex: `tDeath_vertex = t_hit + |x_vertex − x_hit|/C`. The object dissolves outward from the impact at light speed, because no part of it can "know" about the hit sooner.

### Component interfaces

**`physics`** (pure functions over plain `{x, y, z}` vectors from `src/math/vec3.js`; they never mutate their arguments):
- `gamma(v)`. Throws `RangeError` if |v| ≥ C.
- `velocityAdd(v, w)`: the world velocity of an object moving at `w` in a frame that moves at `v`.
- `retardedDelay(r, u) → Δ ≥ 0` with `|r − uΔ| = CΔ`, computed in a cancellation-free form.
- `boostEvent(dt, dx, v) → {dt, dx}`.
- `dopplerFactor(kHat, vObs, vSrc)`, where `kHat` is the photon's direction of travel in the world frame.
- `stepRapidity(phiVec, phiTarget, rate, dτ) → Vector3` and `rapidityToVelocity(phiVec)`. The rapidity vector is φ·(direction of motion).
- `apparent(vertex, observer, flags) → {pos, D, visible}`: the JS reference for the vertex shader.
- `fireballIrradiance(light, xe, tRel, n, flags) → 12 band irradiances`: the JS reference for fireball lighting.
- `Worldline {p, t0, u, tBirth, tDeath, hitPos}` with `positionAt(t)`, `retardedTime(xObs, tObs) → number | null`, and `hasBeenSeenDead(xObs, tObs, extent = 0) → boolean`.

**`spectral`** (pure; runs once at startup):
- `BANDS` (12 Gaussian bands: 3 UV, 6 visible, 3 IR).
- `buildBandLUT()` and `buildBlackbodyLUT()`: Float32Arrays in radiance units normalised by `K`.
- `SUN_BANDS`: the sun's spectral irradiance on the island per band, in the same units.
- `K` is chosen so that sunlit white paper (every band = 1) has luminance Y = 1.
- `rgbToBands(rgb, {uv, ir}) → Float32Array(12)`.

**`world`**:
- `buildIsland(seed, quality: 'high'|'low') → Island {heightAt(x,z), normalAt(x,z), materialAt(x,z) → 'sand'|'grass'|'rock'|'water', SHORE_RADIUS, terrain: GeometrySpec, water: GeometrySpec, props: GeometrySpec}`.
- `GeometrySpec = {positions, normals, indices, bands0, bands1, bands2, emitTemp, particle}` (typed arrays; `particle` is the burst particle index, 0 elsewhere).
- `shapeHash(seed)`, which does not depend on quality, and the constant `GENERATOR_VERSION`.
- `placeTargets(seed, island, n) → TargetSpec[] {id, pos, radius, geometry}`.

**`game`**:
- `createGame({seed, island?, targets?}) → GameState`. The optional overrides exist for tests.
- `step(state, input, dτ)`: **the only function that mutates `GameState`.**
- `GameState = {island, player {pos, vel, rapidity, yaw, pitch, tau, boosting}, worldTime, flags {aberration, delay, doppler, searchlight}, ui {map, captions, frameTime, sound}, settings, fireballs[], targets[], bursts[], hits[], round {status, startTau, startWorld, endTau, endWorld, score, best}, lastFireTau, nextId, events[]}`. Full field shapes are in game.md.

**`render`**:
- `async createRenderer(canvas, island, spectralTables, {quality}) → Renderer`. `setIsland(island)` swaps static meshes, re-renders the shadow map and the map image. It rejects if WebGPU is unavailable; `main` then shows a browser-support message.
- Getters: `mapImage`, `mapProject(x, z)`, `exposure()`, `gpuFrameMs()`.
- `render(view: RenderView)`: syncs instances to `view.objects` by id, sets uniforms, and draws the main view (HDR → bloom → adaptation → present). It never sees `GameState`.
- `renderMapImage() → ImageBitmap`: a one-time overhead render of the static island, used by the map overlay.
- It exports `MAP_HALF_EXTENT = 100` (m) and `mapProject(x, z) → [px, py]`, which `ui` reuses for the overlay.

**`ui`**:
- `createInput(canvas)`. `snapshot()` returns `{moveF, moveR, moveU, boost, lookDX, lookDY, fire, keys: string[], restart, settings?}` and clears the one-shot fields. `keys` is the queue of one-shot keydown codes (toggles, K, L, replay controls), excluding auto-repeat. `moveU` is E/Q (±1), used only by the replay free camera.
- `ui.sound` is toggled with V.
- `createHud(root, renderer)`, `createCaptions(root, island)`, `createMapOverlay(canvas, renderer)` and `createSettings(root)`. Each has `update(state)` for play and `updateReplay(rs, view)` for replay; `ui.update` and `ui.updateReplay` call them all.
- `ui` reads from the renderer: `mapImage` (the bitmap), `mapProject`, `exposure()` (the latest async readback, for the iris) and `gpuFrameMs()` (for the F readout).

**`audio`**:
- `createAudio()` is started on the first click. `update(state)` turns `impact` and `fire` events into world-frame sound emissions, plays each when the sound front reaches the player, and drives the continuous voices.
- `updateReplay(rs, view)` does the same for replay, taking emissions derived from the log (audio.md § Replay).
- The pure model functions (`hearTime`, `playbackRate`, `audibleFraction`) live in `audio/model.js`.

**`replay`**:
- `loadReplay(json) → ReplayState` (via `record.readLog`); `step(rs, input, dReal)` is the only mutator of `ReplayState`; `viewAt(rs) → RenderView`.
- The clock rule is the same as play: real time is the current camera's proper time.

**`record`**:
- `createRecorder(seed, island)`. `observe(state)` appends one camera sample, registers any new object, and refreshes the death fields of objects it already knows. A `restart` clears it.
- `exportLog() → object`, a versioned JSON-serialisable spacetime log (schema in record.md).
- `readLog(json) → {meta, frames, objects}` validates a log and rebuilds `Worldline`s. It exists for tests now and for the ray tracer later.
- The recorder keeps its own references to worldlines, so objects the game has already cleaned up remain in the log.

**`main` / `scenarios.js`**:
- `SCENARIOS: {[name]: (state) => void}`. Each preset sets the player's position, rapidity, yaw and pitch, the flags, and optionally spawns fireballs.
- `?scenario=<name>` applies a preset after `createGame`, and `&freeze=1` makes `input.snapshot()` return empty input.
- The presets are `aberration90`, `sunAhead`, `sunBehind`, `foliage`, `delaySideways`, `heatGlow`, `fireballLight`, `shadows` and `stress`.

### State and propagation

In play, all mutable state lives in one `GameState`, and `game.step` is its only writer. In replay, `ReplayState` and `replay.step` play the same roles. `render`, `ui`, `audio` and `record` are readers that fully resynchronise every frame. A change becomes visible through one route: input → `step` mutates state → the next `render` and `ui.update` reflect it.

## 3. Per-component implementation

In the module docs: [physics](modules/physics.md), [spectral](modules/spectral.md), [world](modules/world.md), [render](modules/render.md), [game + UI](modules/game.md), [audio](modules/audio.md) [record](modules/record.md) and [replay](modules/replay.md).

Project layout (Vite, ES modules):

```
index.html
src/main.js, src/scenarios.js
src/physics/{constants,lorentz,lightcone,worldline,lighting}.js
src/spectral/{cmf,bands,lut,rgb}.js
src/world/{island,noise,props,targets,palette}.js
src/game/{state,step,view,player,fireballs,collision,round}.js
src/math/{vec3,mat4}.js
src/render/{gpu,renderer,pipelines,sync,map,adaptModel,shadowModel}.js
src/render/wgsl/{relativity,colour,lighting,shadow,object,sky,bloom,adapt,present}.wgsl
src/audio/{engine,model,voices}.js
src/ui/{input,hud,captions,mapOverlay,settings}.js
src/record/{recorder,schema}.js
src/replay/{state,step,view}.js
test/…  (mirrors src/), test/manual.md
```

## 4. Acceptance criteria

Physics and view:
1. **Newtonian view.** With all effects off (Newtonian key), every vertex's apparent position equals its true position at the current world time, relative to the eye. Colours are the rest-frame colours.
2. **Aberration angle.** With aberration on at β = 0.9, a static marker at 90° to the side of the direction of travel appears 25.8° ± 0.5° off the forward axis (worked example in physics.md; scenario `aberration90`).
3. **Swing-forward.** A static marker at 120° from the direction of travel appears in the forward half of the view once β > 0.5. At β = 0.9, everything within 154° of the direction of travel appears forward. A marker directly behind stays directly behind.
4. **Backward fireball.** A fireball fired backwards at 0.7c (relative to the player) while moving forward at β = 0.99 moves *forward* in the world at ≈ 0.945c. The mini-map shows its true dot moving forward.
5. **Light delay.** With delay on and the player at rest, a fireball crossing the view sideways is drawn where the mini-map's hollow ghost marker is (its retarded position), not at its solid true-position dot. With delay off, it is drawn at the true position (scenario `delaySideways`).
6. **Doppler.**
   - (a) At rest, static objects have D = 1, and their colours are identical with Doppler on and off.
   - (b) At a Doppler factor of 1.25, the canopy material (strong near-IR) renders with *more* linear red than at D = 1. A control material with the same visible colour and no IR renders with *less* red. The near-IR has been blueshifted into visible red. This is checked numerically by the colour-reference test and visually in scenario `foliage`.
   - (c) **Two invisible lights appear at two speeds** (scenario `heatGlow`).
     - At β ≈ 0.85–0.93 the ground ahead brightens to a greenish white. This is *reflected sunlight* from the ground's near-IR bands, blueshifted into view.
     - From β ≈ 0.95 the ground's *own 290 K heat radiation* overtakes it and glows red-orange.
     - At β = 0.99 that heat glow is a warm white of about 4000 K, far brighter than sunlit ground.
     - Both are checked numerically by the scale tests in spectral.md.
7. **Searchlight.** With the searchlight on, the region ahead is brighter and the region behind is darker than with it off, in the same frame and position.
8. **Sun colour.** The sun sits at 50° elevation. Moving at β = 0.5 horizontally toward its azimuth, the sun renders as a blackbody of about 8800 K (bluish white). Moving away, it renders at about 4500 K (pale orange) (scenarios `sunAhead` and `sunBehind`).
9. **Toggles.** Every toggle key changes the view on the next frame, and the HUD lists which effects are on.

Gameplay:
10. **Speed ramp.** WASD reaches cruise speed (0.4c) from rest in 1.0 ± 0.1 s of proper time. Holding Shift ramps from cruise to the boost cap in 2.5 ± 0.2 s, and releasing it returns to cruise at the same rate. Holding Shift from rest uses the boost rate throughout (reaching 0.4c in about 0.48 s). The HUD's β never reaches 1.
11. **Terrain.** The player cannot go past the shoreline radius, and their eye stays 1.6 m above the terrain.
12. **Firing.** Click (held) fires along the crosshair direction, at most 4 fireballs per second. Aim is always the true (aberrated) direction, even when aberration display is off.
13. **Seeing a hit.** A fireball that reaches a target in world-frame coordinates destroys it.
    - The score increments on the step when light from the impact point reaches the player's eye.
    - The target visibly dissolves outward from the impact point over the following ≤ 0.35 s of world time, and the burst appears from the impact point.
    - The mini-map shows the target gone immediately, plus an expanding light ring that reaches the player's marker on the step the score changes.
14. **Round.** A round starts at the first movement or shot and ends when all 12 hits have been seen. The final time is shown in proper time and in world time. The best proper time this session is shown on the HUD ("Best τ") and survives restarts, but not page reloads. Nothing is written to storage.
15. **Restart.** R restarts the round with the same island and the same targets.

Teaching aids:
16. **Captions.** Captions appear for the triggers in game.md § Captions, at most one at a time, for 6 s each, and each caption at most once per 60 s. H hides and shows captions.
17. **Mini-map.** M shows and hides the mini-map. It shows true positions (solid) and, for fireballs, where the player currently sees them (hollow ghosts).

Recording:
18. **Download.** Pressing K downloads the current round's spacetime log (`einstein-<seed>-<date>.json`). The log alone, with the same `world` generator, is enough to reconstruct every object's worldline and the camera's position, velocity and orientation on every frame. The test is: recompute the apparent position of any vertex on any frame from the log and compare it with the live game.
19. **Size.** A 10-minute round produces a log under 5 MB.

Performance:
20. **Frame rate.** The game sustains 120 fps at native resolution (3456×2234, 4× MSAA, about 2.5M vertices, 16 fireball lights, bloom) on the M4 Max MacBook Pro, and 60 fps at 1920×1080 with `?quality=low` on an Apple M1. Both are measured with 40 live fireballs (scenario `stress`) using the GPU-timestamp frame readout (F key, a developer aid that exists for this criterion).

Spectacle:
21. **HDR output.** On the XDR display in Chrome or Safari, the searchlight's forward glare at boost is visibly brighter than SDR white (up to 8×), while menus and HUD stay at normal brightness. On an SDR display the same scene tone-maps into [0, 1].
22. **Eye adaptation.** Boosting from cruise toward the heat glow gives a flare that settles to readable within about 1.5 s. Turning to face backwards at boost gives near-black that brightens over about 4–8 s. With adaptation off, exposure is constant.
23. **Bloom.** Fireballs, the sun and the forward glow have bloom in proportion to their brightness. The dark view behind stays dark.
24. **Fireball lighting.** A fireball at 0.9c passing low over the ground lights a pool on the terrain that trails behind it (delay on), is bluer ahead of its motion and redder behind (Doppler on), and keeps fading outward after the fireball dies. With delay off, the pool is centred under the fireball (scenario `fireballLight`).
25. **Sound.**
    - A hit 60 m away is heard 6 s of world time after it happens, and roughly 3 s after it is seen.
    - Near 10 m/s a transonic rumble peaks. Crossing it shows the `sonic` caption and the mini-map's Mach cone, and no self-heard boom plays.
    - Stopping after outrunning a hit's sound makes that sound arrive later, at its physical catch-up time.
    - While faster than sound, emissions from behind are never heard, and the ambience thins.
    - Pitch rises with γ and with approach speed.
    - V mutes.
26. **Shadows.** Trees, rocks and hills cast sun shadows, and each balloon casts a round shadow. When a balloon is hit, its shadow disappears from ground points at the moment the sunlight that passed the balloon's former position reaches them. In practice it vanishes together with the balloon's dissolve, as seen from the player (scenario `shadows`).
27. **Sci-fi HUD.** A glass-and-neon HUD with an animated γ gauge, an iris (eye-adaptation) indicator, and typewriter captions. Screen effects (vignette, boost kick) affect only screen pixels.

Replay:
28. **Loading.** L (or dropping a file on the page) loads a log. An invalid or mismatched log shows a caption and leaves the game running. Backspace returns to play.
29. **Fidelity.** In recorded-camera mode at 1×, the replay shows the same geometry and colours as the original round, including the recorded effect-toggle changes (until you toggle one yourself). Eye adaptation restarts from its reset value, so exposure can differ briefly. Every frame's observer and objects match the live capture.
30. **Controls.** Space pauses; ←/→ step the rate from −8× to 8×; `,`/`.` step single frames while paused; the Esc panel's scrubber jumps anywhere. Effect toggles work while paused. C switches to a free camera that flies freely (its own velocity sets its aberration) and shows the recorded player as a glowing orb.
31. **Replay sound.** Hit sounds play at their physical arrival times while 0 < rate ≤ 2, and scrubbing produces no sound burst.

## 5. Testing plan

- **Unit tests (Vitest, Node).** `physics`, `spectral`, `world` and `game.step` are pure JS with no DOM. Per-module lists are in each module doc. Mapping to criteria:
  - Criteria 2 and 3: `apparent` worked examples, plus an angle sweep.
  - Criterion 4: `velocityAdd` fixture, plus the game backward-fire test.
  - Criterion 6a: `apparent` returns D = 1 for a static vertex with v = 0.
  - Criterion 10: ramp timing tests.
  - Criterion 11: shore clamp and eye height tests.
  - Criterion 12: fire cooldown test.
  - Criterion 13: the hit-timing test, the dissolve-bound test, and the ring radius test.
  - Criteria 14 and 15: round state machine tests.
  - Criteria 18 and 19: the record round-trip test and the size test (record.md).
  - Criterion 25: the audio model tests (audio.md).
  - Criteria 28–31: the replay tests (replay.md).
  - The `retardedDelay` property test and the `gamma` guard.
- **Shader parity tests (Vitest browser mode, Playwright Chromium with WebGPU, run on the development Mac).**
  - Compute shaders include the same `relativity.wgsl`, `colour.wgsl` and `lighting.wgsl` files the game uses, evaluate seeded cases into storage buffers, and compare them with the JS references (`physics.apparent`, the colour reference, `physics.fireballIrradiance`). The cases include fireball-speed sources (|u| up to 0.9995C).
  - This covers criteria 1, 2, 5, 6b, 7, 22 and 24 at the formula level (render.md § Tests).
- **Manual visual checks.** `test/manual.md` lists each scenario URL and what to look for: criteria 3, 5–9, 13, 16, 17, 20–31.

## 6. Decision register

1. **c = 20 m/s.** *Alternatives:* 10 m/s; 40 m/s. *Why:* cruise (0.4c) is then 8 m/s, a brisk run, and boost puts the dramatic regime one key away. The island (180 m across) takes about 9 light-seconds to cross, which makes delay effects visible without being tedious. Flipping to 10 makes every effect stronger at every speed; 40 makes delays half as long. **Developer override:** with `?dev=1`, the settings panel shows an "island size (light-seconds)" slider (2.25–36 light-seconds across, i.e. c from 80 to 5 m/s). Every visual effect depends only on β, so c is purely a pacing knob: it sets how long light and sound delays, crossings and flights take in real seconds. `physics/constants.js` exports `C`, `C2` and `C_SOUND` (= C/2) as live bindings, plus `setC()`. The only callers of `setC` are `resetRound` inside `game.step` (applying `settings.devC` on restart, so c never changes mid-round), replay entry (`setC(meta.c)`), and replay exit (restoring the game's c). The GPU receives c as a frame uniform, captions use `{c}`/`{cs}` templates, and recordings store c in `meta`.
2. **One mechanism for rendering: a light-cone event boost per vertex.** For each vertex: solve the retarded time, form the world-frame separation from the eye (light-like: zero spacetime interval), boost it into the player frame, and place the vertex there. *Alternatives:* (a) separate formulas for aberration, delay and contraction applied in sequence; (b) ray tracing into a 4D scene. *Why:* one boost gives aberration and delay together and exactly, and Terrell rotation falls out of it. Each toggle becomes one obvious substitution. (a) composes the effects only approximately; (b) won't run at 60 fps in a browser.
3. **All relativistic work runs per vertex on the GPU.** *Alternatives:* compute on the CPU and upload positions each frame. *Why:* there are about 2.5M vertices at high quality and the solve is closed-form. Flipping it caps the scene at roughly 20k vertices.
4. **Uniformly fine meshes, sized for the M4 Max.** At high quality: terrain 0.25 m, props and targets 0.1 m, water 0.15 m, about 2.5M vertices. `?quality=low` keeps the original 0.8/0.25/0.4 m (about 245k). There is no adaptive tessellation. *Alternatives:* level of detail by distance. *Why:* aberration bends straight lines, so curved edges need dense vertices, and at high β "far" objects fill a large part of the view, so distance-based detail helps less than usual. The GPU has ample headroom. Flipping it adds a level-of-detail system.
5. **Frustum culling is off for relativistic meshes.** *Alternatives:* culling with bounds expanded by aberration. *Why:* aberration pulls objects from outside the true field of view into it, so default culling would drop visible objects. Flipping it means computing the conservative expanded bounds per object each frame, which is fiddly, for a saving the budget doesn't need.
6. **The player's proper time is the wall clock, and world time runs γ times faster.** *Alternatives:* make world time the wall clock. *Why:* the HUD and round timer then show time dilation honestly. Flipping it makes the world feel slowed while boosting.
7. **Speed ramp with constant proper (felt) acceleration, implemented as a rapidity vector stepped toward its target at a fixed rate.** By default the rate is 0.42/s up to cruise (0 → 0.4c in 1.0 s, a felt acceleration of 8.5 m/s²) and 0.89/s while boosting (0.4c → 0.99c in 2.5 s, 17.8 m/s²). *Alternatives:* (a) step celerity at a fixed rate (felt acceleration then falls as 1/γ); (b) ease β directly. *Why:* in straight-line motion this is exactly constant felt acceleration, which is the textbook "rocket" case, and β never reaches 1. **The ramp is configurable** as two times ("time to cruise", default 1.0 s; "time from cruise to cap", default 2.5 s) in the settings panel (decision 30), and converted to rates as `rate = Δφ / time`. (a) makes the high-speed end drag on; (b) has no physical meaning. When turning while at speed, stepping the rapidity *vector* is an approximation, acceptable for a game.
8. **Ground-following velocity is directed along the terrain surface, with |v| fixed by the ramp.** *Alternatives:* horizontal velocity, with height snapped afterwards. *Why:* snapping adds a vertical speed that could push the true speed past c on slopes. Flipping it risks invalid physics (γ throws) on hills.
9. **Twelve fixed spectral bands with precomputed Doppler LUTs; blackbody sources use a blackbody LUT.** *Alternatives:* (a) sample 16 wavelengths per fragment; (b) an RGB hue shift. *Why:* a Gaussian band shifted by S is still a Gaussian band, so its visible response is one LUT lookup. A blackbody shifted by D is exactly a blackbody at temperature D·T. (a) costs about 10× as much; (b) is not physical.
10. **All light is on one absolute radiance scale.** Reflected sunlight uses the sun's real irradiance, and emission uses real Planck radiance, both divided by the same constant. *Alternatives:* separately normalised "artistic" scales. *Why:* only a shared scale makes the thermal glow (decision 11) appear at the right speeds with the right brightness. Exceptions are stylised and labelled as such: the fireballs (about 4× white paper) and the sun disk (20× white paper; the real ratio is about 46,000×).
11. **Surfaces emit 290 K thermal radiation.** *Alternatives:* reflected sunlight only. *Why:* ahead of the player, the ground's 10 µm heat glow is blueshifted. It overtakes reflected (IR-blueshifted) sunlight near β ≈ 0.95, where it glows red-orange (about 1800 K), and reaches a warm white (about 4000 K) at 0.99. It costs one LUT lookup per fragment. Flipping it makes the forward view simply fade as visible light shifts into the UV.
12. **Lighting is computed in the world frame at emission (Lambert shading plus a two-colour hemispheric ambient); the result is then Doppler-shifted and searchlight-scaled.** *Alternatives:* lighting in the player frame. *Why:* surfaces are lit in their own rest frame. Flipping it would give colours that no real observer sees.
13. **Exposure uses eye-like delayed adaptation with asymmetric time constants (bright: 0.4 s; dark: 4 s), followed by a roll-off to the display's headroom (`L/(1 + L/H)`; H = 8 on HDR, 1 on SDR) and gamut desaturation.** *Alternatives:* fixed exposure; instant automatic exposure. *Why:* global adaptation keeps the within-frame searchlight contrast (ahead blazing, behind dark), and the lag turns each speed change into a visible flare or blackout that then settles, the way real eyes behave. Instant auto-exposure would erase the effect; fixed exposure is kept as the "eye adaptation off" setting. The settings panel also exposes the headroom H.
14. **Collisions are decided in the world frame on true positions (a swept test per step).** *Alternatives:* decide hits on what the player sees. *Why:* physics happens in spacetime, not in the image. Flipping it would let a stale image score hits that never happened.
15. **The score counts a hit when light from the impact point reaches the player, and targets dissolve on the light cone from the impact.** *Alternatives:* update the score immediately. *Why:* this makes information delay tangible, and the HUD agrees with the view. The mini-map shows the true hit at once. Flipping it makes the HUD "know" things faster than light.
16. **Fireballs launch at 0.7c relative to the player (configurable), and their world velocity comes from velocity addition. Burst particles are a world-frame explosion (debris velocities are relative to the island, not the fireball).** *Alternatives:* inherit the fireball's velocity via velocity addition. *Why:* bursts stay at the impact point where the player can see them, and velocities never need adding in the shader. Flipping it makes debris from a fast fireball streak onward at nearly c.
17. **Times on the GPU are relative to observer time; `retardedDelay` uses the cancellation-free root.** *Alternatives:* absolute float32 times; the textbook root formula. *Why:* both of those lose precision (after about 2 h of world time, and for sources above 0.99c respectively), which shows up as jitter.
18. **Shader correctness is checked by compute-shader parity tests that include the production WGSL files and compare them against the JS references.** *Alternatives:* screenshot comparison; no automated shader test. *Why:* it compares numbers, it's deterministic, and it exercises the exact shader code. Screenshots are brittle, and no test leaves the physics core unchecked. These tests need a WebGPU-capable browser, so they run on the development Mac, not on a generic Linux CI runner.
19. **The mini-map background is precomputed once at startup; each frame, only 2D markers are drawn.** The island is rendered once from above, using the normal renderer with every effect off and an orthographic overhead camera, into an image. That image is drawn on the overlay canvas, and targets, fireballs (true positions), ghost markers, light rings and the player are drawn over it in 2D. *Alternatives:* re-render the map in 3D every frame with a special shader mode. *Why:* the island never changes, so this is cheaper and removes the map branch from the shaders. Flipping it would only matter if the terrain became dynamic.
20. **Stack: Vite, Vitest with browser mode (Playwright), and `simplex-noise` (v4); JS ES modules, no TypeScript, and no 3D engine.** *Alternatives:* no build step; TypeScript; in-house noise. *Why:* Vite imports WGSL as strings and serves hot reload, and Vitest shares its configuration. `simplex-noise` is tiny and seedable. TypeScript would add a type-check step; in-house noise is about 100 lines.
21. **The CIE colour-matching functions come from the Wyman–Sloan–Shirley (2013) analytic fit, not tabulated data.** *Alternatives:* ship the CIE 1931 tables. *Why:* no data file, with an error well below what's visible. Flipping it adds a small JSON asset and loader.
22. **Effects toggle with keys 1–4 and N during play, and also as switches in the Esc settings panel.** The HUD always shows their state. *Alternatives:* keys only; clickable on-screen buttons. *Why:* pointer lock hides the cursor during play, so keys are the in-play control, and the panel gives a mouse-friendly view while paused. Panel switches send the same toggle codes through `input.snapshot().toggles`, so `step` handles both paths identically.
23. **Keep the per-vertex renderer for play; ray tracing waits for a later movie renderer.** *Alternatives:* ray trace now. *Why:* per-vertex is exact at vertices and runs at 120 fps. Ray tracing gives pixel-exact curved edges, reflections and shadows, but it is a large separate project. (On the M4 Max it may eventually even run in real time. The static island is ordinary ray tracing with aberrated rays, and the fireballs are moving spheres with analytic intersections. `relativity.wgsl` is written to be shared with it.) Recording (decision 24) keeps the ray-traced movie possible without paying for it now.
24. **Recordings are spacetime logs (camera samples plus worldlines), not input logs.** *Alternatives:* input log with deterministic re-simulation; both. *Why:* every object moves on a straight worldline, so the full history is small and exact. A renderer can then re-render from any camera or time without re-running the game, and it keeps working after the physics code changes. Flipping to an input log shrinks files, but replay breaks whenever the simulation changes.
25. **Raw WebGPU with WGSL, HDR canvas output, and no WebGL fallback.** *Alternatives:* (a) Three.js with WebGL2 (SDR only); (b) Three.js `WebGPURenderer` (shaders in its TSL node system); (c) WebGPU plus a WebGL2 fallback. *Why:* only WebGPU can drive the XDR display's HDR range from a browser (`toneMapping: 'extended'`). Every shader in this game is custom, so a 3D engine adds little, while raw WGSL files can be shared verbatim by the game, the parity tests and the future ray tracer. Costs: about 500 lines of setup code, and browsers without WebGPU are unsupported. (a) loses HDR; (b) hides the HDR canvas configuration and puts the maths in TSL; (c) roughly doubles the rendering work.
26. **Fireball lighting is computed per fragment at the surface's emission event, with its own retarded-time solve and Doppler shift, for the 16 nearest fireballs.** *Alternatives:* lighting at the fireball's current position (instant); no fireball lighting. *Why:* it is the physically correct and most spectacular choice: the light pool lags, and it is colour-shifted. Its cost (16 × a closed-form solve per pixel) fits the M4 Max budget. Flipping to instant lighting is simpler but teaches something false; no lighting loses the most spectacular effect.
27. **Bloom is a physically-based camera effect (mip-chain, energy-conserving, no threshold) applied to the HDR scene.** *Alternatives:* thresholded "glow" bloom. *Why:* without a threshold, bloom tracks real brightness, so it amplifies the searchlight contrast and never invents glow. Flipping it looks more "gamey", but glow no longer means brightness.
28. **Cosmetic effects are confined to the HUD, sound and screen-space vignette or shake. There are no speed lines, star streaks or colour grading.** *Alternatives:* classic "warp speed" effects. *Why:* those effects imitate a *wrong* picture of fast travel and would contradict the correct view right beside them. Flipping it adds flash at the cost of the lesson.
29. **Sound is modelled physically: a medium at rest in the world frame, sound speed 0.5c, delay, medium Doppler × γ, and outrunning sound.** Voices are synthesised with Web Audio, with no sample files. *Alternatives:* ordinary game audio (instant, unpitched); sample files. *Why:* see-then-hear, outrunning sound and the catch-up teach the light-versus-sound analogy, and synthesis keeps the no-assets rule. Flipping to instant audio would contradict the view.
30. **An Esc settings panel plus URL parameters for the tunables.** Esc releases pointer lock and opens a glass-style panel with sliders for: time to cruise, time from cruise to cap, cruise β, boost cap β, fireball β, sound volume, HDR headroom, and an eye-adaptation switch. c is not adjustable, except through the `?dev=1` pacing slider (decision 1). The same keys work as URL parameters (`?rampCruise=…&rampBoost=…&cruise=…&cap=…&fireball=…&volume=…&headroom=…&adapt=0|1`). Values are not persisted. Changes apply through `input.snapshot().settings` (a partial settings object) → `step` merges them into `state.settings`, keeping `step` the only mutator. *Alternatives:* URL parameters only; constants only. *Why:* you asked for a configurable ramp; sliders make experimenting instant, and URLs make a setup shareable. Flipping to URL-only is less work but has no live tweaking.
31. **Sun shadows are precomputed once; balloon shadows are exact per-fragment ray–sphere tests with light-travel timing.** At high quality the static shadow map is 8192² (2048² at low), rendered from the sun direction at startup, and sampled with 3×3 PCF (percentage-closer filtering: averaging 9 depth comparisons for soft edges) at each fragment's emission point. The balloon sphere has the visible radius, 0.8 m. For each of the 12 targets, a fragment tests the ray toward the sun against the balloon sphere. The shadow counts only if the balloon still existed when that sunlight passed it: `tRel − (distance along the ray)/C ≤ death` (with the dissolve term). *Alternatives:* a per-frame shadow map; no shadows; blob decals. *Why:* the sun and island never move, so the static map is free per frame, and 12 analytic sphere tests are cheap and exact, including the light-speed timing when a balloon is destroyed. Fireball lights cast no shadows (16 moving shadow-casters would cost too much).
32. **The renderer takes a narrow `RenderView`, not `GameState`; replay drives it from the log, and real time is always the current camera's proper time.** *Alternatives:* feed replay by re-simulating `GameState`; give replay its own renderer. *Why:* rendering is already a pure function of (moment, observer, worldlines), so a narrow view type gives rewind and scrubbing for free and keeps one renderer. The curved recorded path is drawn as an avatar on the tangent worldline at its CPU-solved retarded time, which is accurate to millimetres at orb size. Flipping to re-simulation would make rewind impossible without snapshots.

## 7. Open questions

None remain. Resolutions from the review walkthrough:
1. **Cruise speed:** 0.4c (just below the 0.5c sound speed).
2. **Boost cap:** 0.99c.
3. **Fireball speed:** 0.7c relative to the player.
4. **IR-only targets:** no.
5. **Thermal glow:** kept (decision 11).
6. **Shadows:** yes (decision 31).
7. **Dev-only pacing slider** (c, shown as island size in light-seconds): yes (decision 1).
8. **Aiming with aberration off:** physical, with a caption.
9. **Best time:** this session only, nothing stored.
10. **Live replay with free camera:** yes (decision 32).

11. **Best τ versus settings changes:** ignored. Any round counts toward the session best, whatever the settings.

All tunables (cruise, cap, fireball speed, ramp times, volume, HDR headroom, eye adaptation) are adjustable in the Esc settings panel.

## 8. Implementation notes (deltas found while building)

Changes made during implementation, each for a reason discovered in testing:

1. **Band layout is 2 UV + 6 visible + 4 IR, with overlapping widths** (260/355 · 420–680 · 790/960/1300/2000 nm). The original 3/6/3 layout had spectral holes (for example between 800 and 1200 nm). Doppler shifts swept those holes through the visible range as hard rainbow rings. Overlap (σ ≈ half the spacing) makes a flat weight vector a smooth continuum from 230 to 2300 nm. The band count stays at 12 (decision 9).
2. **The spectral LUTs have 1025 samples** (odd, so "no shift", log₂S = 0, is an exact node). With 256 samples, rest-frame colours were off by up to 4.6% per band.
3. **Fireballs are 10,000 K plasma** (stylised Y ≈ 200 at rest), and bursts are 6000 K (Y ≈ 60). A fireball always recedes from its shooter at 0.7c (D = 0.42), so a 3000 K fireball looked like a near-black 1260 K ember. At 10,000 K it reads as ~4200 K orange-white when receding and blue-white when approaching, and it blooms. Fireball light on the terrain uses `LIGHT_GAIN = 0.3`.
4. **Eye adaptation measures the scene before the bloom upsample passes**, because the upsamples add blur into the same mips and inflated the measurement about 4×. Its key value is 0.25 (brighter than photographic 0.18, to suit the cartoon look).
5. **Per-object `aSrc = C² − |u|²` is computed in double on the CPU and passed to the GPU.** Computed in float32, it loses about 4 digits at 0.9995c. The Doppler factor uses a cancellation-free form of `1 − v·k̂/c` for the same reason (found by the GPU parity tests).
6. **Low-quality mesh totals are about 390k vertices** (not 245k): the spec's own edge limits need more water and canopy vertices. High quality is 2.52M vertices and builds in about 1.9 s.
7. **Vertical field of view is 75°.** The vertex stride is 80 bytes, with a `particle` index replacing a per-vertex velocity. Burst particle velocities come from a per-instance storage buffer.
8. **The JS colour reference lives in `src/spectral/colourReference.js`**, shared by the tests.
9. **Performance** is measured only in headless Chrome, which is capped at 60 fps: median 15.9 ms at 1728×1117 with 40 fireballs at high quality. The 120 fps target (criterion 20) still needs checking in a real browser on the XDR display.
