# Module: game (and UI)

## GameState (`state.js`)

```
GameState = {
  island,                         // world.buildIsland result (heightAt, normalAt, materialAt, SHORE_RADIUS, geometry)
  player: { pos: Vector3,         // eye position, world frame
            vel: Vector3,         // world velocity, derived each step (read by render and HUD)
            rapidity: Vector3,    // horizontal rapidity vector atanh(β)·direction (y = 0)
            yaw, pitch,           // radians; pitch clamped to ±85°
            tau, boosting },      // proper time, s; boosting = boost held and moving
  worldTime,                      // s
  flags: { aberration, delay, doppler, searchlight },   // all true at start
  ui:    { map: true, captions: true, frameTime: false, sound: true },
  settings: { cruiseBeta: .4, boostBeta: .99, rampCruiseTime: 1.0, rampBoostTime: 2.5, volume: .8,
              headroom: 8, adaptation: true, devC: 20,     // configurable (plan decisions 1, 30)
              fireballBeta: .7, fireCooldown: .25, maxFireballs: 40,
              eyeHeight: 1.6, lookSens: .002 },
  fireballs: [{ id, line: Worldline, radius: .3, emitTemp: 3000 }],
  targets:   [{ id, spec: TargetSpec, line: Worldline }],   // u = 0; on hit: line.tDeath, line.hitPos
  bursts:    [{ id, big: bool, particleVels: Vector3[16], line: Worldline }],   // u = 0; particle velocities are world frame
  hits:      [{ pos, t, targetId, seen: false }],
  round: { status: 'ready'|'running'|'finished', startTau, startWorld, endTau, endWorld, score,
           best },            // best proper-time round this session, or null; survives resetRound
  lastFireTau, nextId,
  events: []                      // one-shot notices for ui, cleared at the start of each step
}
```

`createGame({seed, island?, targets?})`. `island` and `targets` default to `world.buildIsland(seed)` and `world.placeTargets(seed, island, 12)`. Tests pass a flat stub island (`heightAt = () => 0`, normal +y, `materialAt = () => 'grass'`, `SHORE_RADIUS = 85`) and hand-placed targets. The player spawns at (0, heightAt(0,0) + eyeHeight, 0) at rest, facing +z.

## viewOf(state) → RenderView (`view.js`)
- `observer`: `{pos: player.pos, vel: player.vel, yaw, pitch}`.
- `worldTime`, `flags`, `ui`.
- `boost`: `player.boosting`.
- `settings`: `{adaptation, headroom}` from `state.settings`.
- `resetAdaptation`: true for one frame after `resetRound` or an adaptation toggle (`state.flagsDirty.adaptation`, cleared by `viewOf`'s caller after rendering).
- `objects`: every fireball, target and burst as `{id, kind, line, extra}`, where extra is radius/emitTemp, the target spec index, or the particle velocities.
- No avatar.

It is pure and allocation-light, called once per frame by `main`.

## step(state, input, dτ) (`step.js`)

This is the only mutator. `dτ` is clamped to (0, 1/30]. Steps, in this order:

1. `events = []`. If `input.settings` is present, merge it into `state.settings`: clamp each value to its slider range (ramp times 0.2–10 s, cruise β 0.05–0.9, cap β between cruise+0.01 and 0.999, fireball β 0.1–0.99, volume 0–1, headroom 1–16, adaptation boolean, devC 5–80 m/s and only with `?dev=1`) and push `{type: 'settings'}`. A changed `devC` takes effect at the next `resetRound` (which calls `setC(settings.devC)`). Settings changes never affect the round or its best time (plan § 7, item 11).
2. **Toggles.** `input.toggles` holds key codes:
   - `Digit1..4` flips aberration, delay, doppler or searchlight.
   - `KeyN`: if any flag is on, set all to off; otherwise set all to on.
   - `KeyM`, `KeyH`, `KeyF` and `KeyV` flip `ui.map`, `ui.captions`, `ui.frameTime` and `ui.sound`.
   - Each change pushes `{type: 'toggle', name, value}`.
   - If `input.restart`, call `resetRound(state)` and return.
3. **Look.** `yaw −= lookDX·lookSens`; `pitch = clamp(pitch − lookDY·lookSens, ±85°)`.
4. **Movement (player.js).**
   - `wish = moveF·fwd(yaw) + moveR·right(yaw)` (horizontal, normalised if non-zero).
   - `β* = wish ≠ 0 ? (input.boost ? boostBeta : cruiseBeta) : 0`, and `phiTarget = wish·atanh(β*)`.
   - `cruiseRate = atanh(cruiseBeta)/rampCruiseTime`, `boostRate = (atanh(boostBeta) − atanh(cruiseBeta))/rampBoostTime`; `rate = (input.boost || |rapidity| > atanh(cruiseBeta) + 1e-6) ? boostRate : cruiseRate`. The boost rate therefore applies both while boosting and while coming back down to cruise.
   - `rapidity = stepRapidity(rapidity, phiTarget, rate, dτ)`.
   - **Surface velocity.**
     - `s = C·tanh(|rapidity|)` and `ĉ = rapidity/|rapidity|`.
     - `n = normalAt(pos.x, pos.z)`, and `g = −(n.x·ĉ.x + n.z·ĉ.z)/n.y` is the terrain slope along ĉ.
     - `vel = s·normalize(ĉ.x, g, ĉ.z)`, so |vel| = s < C holds exactly, including on slopes.
   - `dt = gamma(vel)·dτ`; `worldTime += dt`; `tau += dτ`; `pos += vel·dt`; `pos.y = heightAt(pos.x, pos.z) + eyeHeight`.
   - **Shore clamp.** If `|pos.xz| > SHORE_RADIUS`, project pos.xz back onto the circle, re-snap y, and remove the outward radial component of `rapidity`.
5. **Round start.** If `round.status == 'ready'` and (`wish ≠ 0` or `input.fire`): set status to `'running'`, `startTau = tau − dτ` and `startWorld = worldTime − dt`.
6. **Fire (fireballs.js).**
   - This happens if `input.fire` and `tau − lastFireTau ≥ fireCooldown`. It sets `lastFireTau = tau`.
   - `f̂` = the look direction from yaw and pitch, a player-frame direction (the true aberrated view; plan Open Question 8 resolved).
   - `u = velocityAdd(vel, f̂·fireballBeta·C)`.
   - Spawn `Worldline{p: pos + f̂·0.5, t0: worldTime, u, tBirth: worldTime}`. Offsetting the spawn point along f̂ in world coordinates is a negligible inconsistency.
   - If more than `maxFireballs` fireballs are alive (`tDeath = ∞`), set `tDeath = worldTime` on the oldest.
   - Push `{type: 'fire', backward: f̂·vel < 0 && u·vel > 0, aberrationOff: !flags.aberration && |vel| > 0.5C}`.
7. **Collisions (collision.js).** These run in the world frame over `[worldTime − dt, worldTime]`. For each live fireball, over its segment from `max(t0, worldTime − dt)` to `worldTime`:
   - **Target test.** For each live target, find the earliest t in the segment with `|line.positionAt(t) − target.pos| = target.radius + 0.3`. This is a quadratic in t, since the fireball moves linearly and the target is static.
   - **Ground test.** March the segment in 0.5 m steps and take the first sample with y < heightAt. Bisect 8 times for t.
   - **Out of range.** If `|positionAt(worldTime).xz| > 400`, kill the fireball at worldTime with no burst.
   - Collect every candidate across all fireballs, sort by t, and apply them in order. Skip any whose fireball or target has already died.
   - **Target hit.** The impact point is `hitPos = target.pos + target.radius·normalize(fireballCentre(t) − target.pos)`: the point on the hit sphere facing the fireball. Then:
     - `fireball.line.tDeath = target.line.tDeath = t`.
     - `fireball.line.hitPos = fireballCentre(t)` (a fireball dissolves from its centre), and `target.line.hitPos = hitPos`.
     - Push `hits {pos: hitPos, t, targetId}`, push a big burst at hitPos, and push the event `{type: 'impact', kind: 'target', pos: hitPos, t}` (for audio).
   - **Ground hit.** Set `fireball.line.tDeath = t` and `hitPos = centre`, push a small burst at the centre, and push `{type: 'impact', kind: 'ground', pos: centre, t}`.
   - **Bursts** are world-frame explosions (decision 16).
     - The worldline is `Worldline{p: point, t0: t, u: 0, tBirth: t, tDeath: t + 1.5}`.
     - There are 16 particles with seeded random directions and speed 0.3C (big) or 0.15C (small). The velocities are stored as the burst's `particleVels` and uploaded per instance (render.md `burstVel`).
     - Each particle is an icosphere of radius 0.12 m at detail 2, with `emitTemp` 2500 K.
8. **Hit visibility.**
   - For each hit where `seen` is false and `C·(worldTime − hit.t) ≥ |pos − hit.pos|`: set `seen = true`, `score += 1`, and push `{type: 'hitSeen', delayWorld: worldTime − hit.t}`.
   - If `score == targets.length` and the status is `'running'`: set status to `'finished'`, `endTau = tau`, `endWorld = worldTime`, `best = min(best ?? ∞, endTau − startTau)`, and push `{type: 'roundFinished', tau: endTau − startTau, world: endWorld − startWorld, record: <true if best improved>}`.
   - The impact point is the first vertex to dissolve (its dissolve offset is 0), so the score changes on the step the target starts vanishing. The rest of the target vanishes within `2·3.5 m / C = 0.35 s` of world time (criterion 13). 3.5 m is the largest distance from an impact point on the 1.0 m hit sphere to the stick's base, 2.5 m below the centre.
9. **Cleanup.** Remove dead fireballs, bursts and targets once `line.lightHasPassed(worldTime)` (C·(t − tDeath) ≥ 1000 m; physics.md). Until then they stay in `view.objects`, so their dissolve, their light on the ground and their shadows play out fully. The shader hides them once they are dead, so keeping them costs only list entries.
10. **Sonic crossing.** If `|vel|` crossed `C_SOUND` upward during this step, push `{type: 'sonic'}`.

`resetRound(state)` rebuilds targets from their specs; clears fireballs, bursts and hits; resets the player to spawn at rest; sets `worldTime = tau = 0`, `lastFireTau = −∞` and `round = {status: 'ready', score: 0, best: <kept>}`; calls `setC(settings.devC)`; sets `flagsDirty.adaptation = true`; and keeps `flags`, `ui` and `settings`.

State machine for `round.status`:

| state | movement or fire | last hit seen | R |
|---|---|---|---|
| ready | → running (timing starts) | n/a | reset → ready |
| running | — | → finished (timing ends) | reset → ready |
| finished | play continues, clocks shown frozen | n/a | reset → ready |

## Tests (`test/game/*.test.js`, flat stub island unless noted)
- **Hit timing.**
  - Setup: player at rest at the origin (eye y = 1.6); target at (0, 1.6, 60); fire along +z on the first step. Step with dτ = 1/60.
  - Assert `hits[0].t − fireballs[0].line.t0 = (60 − 1.3 − 0.5)/(0.7·C) = 4.1571 s` to 1e-6, and `hits[0].pos = (0, 1.6, 59)`.
  - `seen` flips on the first step where `worldTime ≥ hits[0].t + |hits[0].pos − player.pos|/C` (= t + 2.95 s), and `score` becomes 1 on that step.
- **Dissolve bound.** For the same scenario, `apparent(...).visible` becomes false for every target vertex within 0.35 s of world time after the score step (the test geometry gives about 0.19 s; a second case hits the balloon's top so the stick base is 3.5 m away).
- **Backward fireball.** Player at rapidity atanh(0.99) along +x fires along −x. The spawned `u.x` = (0.99 − 0.7)/(1 − 0.693)·C = 0.94463C ± 1e-5 (with fireballBeta 0.7; physics.md's fixture checks the 0.9 case).
- **Ramp (criterion 10).** From rest with cruise held, β = 0.4 ± 0.01 at τ = 1.0 ± 0.1 s. With boost held from cruise, β reaches 0.99 at 2.5 ± 0.2 s. After release, back at cruise within 2.5 ± 0.2 s. `gamma` never throws over 20 s of boost.
- **Time dilation.** A steady 0.9c for 1 s of τ advances worldTime by 2.294 s.
- **Terrain (criterion 11).** On a sloped stub (`heightAt = 0.3x`): the eye stays at heightAt + 1.6 to 1e-9 every step, and |vel| = C·tanh(|rapidity|). After driving outward for 20 s, `|pos.xz| ≤ SHORE_RADIUS`.
- **Cooldown (criterion 12).** Holding fire for 1 s of τ spawns exactly 4 fireballs.
- **Burst velocities.** Every burst particle speed is < C, and every fireball `u` is < C, over a 1000-shot seeded fuzz at random player velocities up to 0.99c.
- **Hit order.** Two fireballs reach one target in the same step: the earlier t wins, and the second fireball flies on.
- **Toggle N.** From all-on it turns all off; from partially-on it turns all off; from all-off it turns all on.
- **Round machine.** Each cell of the table.
- **Cleanup.** A dead target stays in state until `lightHasPassed`, and is removed on the first step after.
- **Events.** Each target and ground hit pushes exactly one `impact` event. Crossing C_SOUND upward pushes one `sonic` event; crossing downward pushes none.

## UI

### Input (`ui/input.js`)
- `keydown`/`keyup` maintain a held-keys set. W/S → moveF ±1; D/A → moveR ±1; Shift → boost.
- Toggle keys (`Digit1–4`, `KeyN`, `KeyM`, `KeyH`, `KeyF`, `KeyV`) are queued on keydown, excluding auto-repeat. `KeyR` sets `restart`.
- A click on the canvas requests pointer lock. While locked, mouse movement accumulates into `lookDX` and `lookDY`, and a held left button sets `fire = true`. The click that acquires the lock does not fire.
- **Settings panel** (`ui/settings.js`). Esc (pointer-lock loss) shows it; clicking the canvas resumes. It also shows four effect switches and a Newtonian button. Clicking one queues the same key code (`Digit1–4`, `KeyN`) into `toggles`. Slider changes queue a partial `settings` object, and URL parameters are parsed once at startup into the first snapshot's `settings`.
- `snapshot()` returns the current values and clears the accumulated look, the queued toggles and `restart`. With `&freeze=1`, it returns neutral input.

### HUD (`ui/hud.js`)
A sci-fi "ship display", DOM and SVG over the canvas, updated each frame:
- **Style.** A translucent dark glass panel (`backdrop-filter: blur`), with cyan/magenta neon text and borders (`text-shadow` glow) and tabular monospace digits. The panels are angled with `clip-path`.
- **γ gauge.** An SVG ring gauge showing γ on a log scale from 1 to 10. Its arc fills and changes colour cyan → magenta, and it pulses (a CSS animation) while boosting.
- **Captions** appear as "ship computer" messages with a typewriter reveal (30 chars/s), in the same style.
- **Content** (same data as before):
- **Speed.** `β 0.93  γ 2.72  CRUISE|BOOST|STOPPED`.
- **Clocks.** `τ (you) 41.2 s   t (island) 88.9 s`.
- **Round.** `Targets 5/12   Round τ 23.4 s / t 51.0 s   Best τ 19.8 s`. A "new record" flourish appears on `roundFinished` with `record`.
- **Effects.** `[1] Aberration ●  [2] Light delay ●  [3] Doppler ○  [4] Searchlight ●   [N] Newtonian`.
- **Frame time** (when `ui.frameTime` is on): a 60-frame average in ms.
- **Iris.** A small animated iris icon whose aperture shows the current eye-adaptation exposure.
- **Aim.** A centred crosshair.

### Captions (`ui/captions.js`)
`update(state)` scans `state.events` and the conditions below. Captions go into a queue:
- One is visible at a time, for 6 s, at the bottom centre.
- Each id shows at most once per 60 s of wall time.
- Nothing shows when `ui.captions` is off.

"Ahead material" means `island.materialAt` sampled 20 m ahead along `vel`, plus a check that a tree lies within 20 m in a 30° cone ahead.

| id | trigger | text (the formula shows as a monospace line) |
|---|---|---|
| aberration | toggle aberration on | Aberration: your motion tilts incoming light forward. `cos θ' = (cos θ + β) / (1 + β cos θ)` |
| delay | toggle delay on | Light delay: you see each point where it was when its light left. `c·(t_now − t_emit) = distance` |
| doppler | toggle doppler on | Doppler shift: light from ahead is bluer, from behind redder. `D = γ(1 + β cos θ)`, where θ is the angle between your motion and the source, island frame |
| searchlight | toggle searchlight on | Searchlight: brightness scales as D⁴, so the view ahead blazes and the view behind fades. |
| newtonian | N turns all off | Newtonian view: what you'd see if light were infinitely fast. |
| swing | β > 0.5 with aberration on | Look around: things beside and behind you have swung into your forward view. Only a shrinking cone directly behind stays behind. |
| foliage | 0.2 < β < 0.5, doppler on, grass or tree ahead | Leaves reflect lots of invisible near-infrared. Approach fast and it blueshifts into visible red. |
| irglow | 0.85 < β < 0.94, doppler on | The bright ground ahead is reflected sunlight, but from the *infrared* part the ground reflects, blueshifted into view. The visible part has shifted into the ultraviolet. |
| heatglow | β > 0.95, doppler on | Now the ground's *own heat* (about 10 µm, invisible) is blueshifted into view and outshines the reflected sunlight: red-orange here, white-hot near 0.99c. |
| backward | event `fire` with `backward` | You fired backwards, but it still moves forward in the world. `u = (v + w)/(1 + vw/c²)` |
| aimoff | event `fire` with `aberrationOff` | Shots fly along what you'd *really* see. With aberration off, the screen shows a false picture, so the shot veers. |
| hitdelay | first `hitSeen` with delayWorld > 0.5 s | That hit happened {delayWorld} s ago in island time. Its light just reached you. |
| twins | event `roundFinished` | Your clock: {tau} s. The island's clock: {world} s. Moving fast, you aged less. |

### Map overlay (`ui/mapOverlay.js`)
- A 2D canvas (bottom-right square, 28% of the window height), hidden when `ui.map` is off. Each frame it draws `renderMapImage()`'s bitmap as the background, then the markers, using `render.mapProject` for coordinates.
- **Targets.** A coloured dot for each target whose `line.tDeath > worldTime` (the true state: it vanishes at the hit instant).
- **Fireballs.** A solid glowing dot at `positionAt(worldTime)` for each fireball alive now.
- **Player.** A triangle at the true position, pointing along yaw.
- **Light rings.** For each unseen hit, draw the slice of the light sphere at the player's eye height: radius `√(R² − Δy²)`, where `R = C·(worldTime − hit.t)` and `Δy = pos.y − hit.pos.y`. Draw nothing while R < |Δy|. The ring reaches the player marker on the step the hit becomes seen.
- **Mach cone.** While `|vel| > C_SOUND`, shade a wedge behind the player with half-angle `asin(C_SOUND/|vel|)` and length 40 m, labelled "boom". It shows where your sonic boom is currently being heard.
- **Ghosts.** For each fireball, `te = line.retardedTime(player.pos, worldTime)`. If it isn't null, draw a hollow circle at `positionAt(te)` and a faint line to its solid true-position dot.
