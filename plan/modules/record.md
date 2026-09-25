# Module: record

Records each round as a **spacetime log**: a self-contained, versioned JSON document that is enough to re-render the round from any camera, at any time, with any renderer. Its first consumer is the tests; a later phase adds an offline ray-traced movie renderer. The module reads `GameState` and never writes to it. `main` handles the file download.

## Why the log is small and exact
Every object in the game moves on a straight worldline `x(t) = p + u·(t − t0)`, with a birth time and a death time. An object's entire history is therefore a handful of numbers. Only the player's path is curved, and it is sampled once per frame.

## Recorder (`recorder.js`)

`createRecorder(seed, island)` stores `meta` and `geometryHash = world.shapeHash(seed)`. This hash is independent of mesh quality, so a log recorded at low quality replays at high. `meta = {format: 'einstein-spacetime', version: 1, seed, generatorVersion: GENERATOR_VERSION (a constant exported by world, bumped whenever generation changes), geometryHash, c: C, settings, createdAt (ISO string)}`.

It keeps:
- `frames`: columnar growable Float64Arrays: `t`, `tau`, `pos` (×3), `vel` (×3), `yaw`, `pitch`. At most one sample per 1/60 s of proper time (§ Size), plus always the latest sample at export.
- `objects: Map<id, {kind: 'fireball'|'burst'|'target', line: Worldline (a reference to the live object), extra}>`.
  - `extra` for a fireball: `{radius, emitTemp}`.
  - For a burst: `{big, particleVels, particleRadius, emitTemp}`.
  - For a target: `{specIndex}`.
- `flagChanges: [{t, flags}]`, taken from `toggle` events. The initial flags are stored at t = 0.

`observe(state)`:
- If `state.round.status == 'ready'` and `worldTime == 0`, and the recorder already has frames, clear everything, because a restart happened. Recording covers everything from the reset onward, including the `ready` period and play after `finished`, until the next restart.
- Append the camera sample.
- Register any fireball, burst or target id not already in `objects`. Targets are registered once, at the first `observe`.
- Append `flagChanges` for `toggle` events whose name is one of the four effects.

Because `objects` holds references to the live `Worldline`s, later changes to them (tDeath, hitPos) are captured automatically. Objects the game has already cleaned up remain in the map.

`exportLog()` returns:

```
{ meta,
  frames: { t: number[], tau: number[], pos: number[] /*flat xyz*/, vel: number[], yaw: number[], pitch: number[] },
  objects: [ { id, kind, p:[x,y,z], t0, u:[x,y,z], tBirth, tDeath, hitPos:[x,y,z]|null, ...extra } ],
  flagChanges: [ { t, flags: {aberration, delay, doppler, searchlight} } ],
  round: { status, startTau, startWorld, endTau, endWorld, score } }
```

`meta.c` holds the c in force during the round; replay calls `setC(meta.c)` on entry.

- ±Infinity is encoded as `null`. `readLog` maps `null` back to −∞ for `tBirth` and +∞ for `tDeath`.
- Object fields keep full double precision. Frame columns are rounded as described in § Size.

`readLog(json)` checks `format` and `version`, decodes the nulls, and returns `{meta, frames, objects}` with each object's `line` rebuilt as a `Worldline`. If `meta.geometryHash` doesn't match `world.shapeHash(meta.seed)`, it throws `Error('generator mismatch')`, so a renderer never silently draws the wrong island.

## Download (`main.js`)
On K: `const blob = new Blob([JSON.stringify(recorder.exportLog())], {type: 'application/json'})`. An `<a download="einstein-<seed>-<YYYYMMDD-HHMMSS>.json">` is clicked, and its object URL is revoked afterwards. A caption confirms "Recording saved". The file goes only to the user's own downloads folder.

## Size
- **Frame rate.** Camera samples are **decimated to 60 Hz**. `observe` appends a sample only when at least 1/60 s of proper time has passed since the last one. Every flag change and every object registration is still captured, because those are separate lists. Replay interpolates between samples anyway, and at 60 Hz the interpolation error is far below a millimetre at cruise.
- **Per frame.** Each sample is 11 numbers, written rounded: times to 1e-6 s, positions to 1e-5 m, velocities to 1e-6 m/s, angles to 1e-6 rad. That's about 110 bytes of JSON.
- **Total.** 10 minutes gives 36,000 samples (independent of the render frame rate), about 4 MB. Objects are negligible (at most a few thousand at about 250 bytes each).
- The round-trip test uses tolerances matching the rounding.

## Tests (`test/record/*.test.js`)
- **Round trip.** Script a round on a stub island (move, boost, fire 20 shots, 3 hits, toggle flags twice), observing every step. Then `readLog(JSON.parse(JSON.stringify(exportLog())))`. For 50 random (recorded sample, object vertex) pairs, `physics.apparent` computed from the log equals `apparent` computed from the live state saved at that step, within 1e-4 m. Observing at 120 steps/s keeps 60 samples/s.
- **Survives cleanup.** A fireball removed by game cleanup is still in the export, with its tDeath and hitPos.
- **Restart clears.** After R, the export contains only the new round.
- **Generator mismatch.** A log with a tampered `geometryHash` makes `readLog` throw.
- **Size.** Simulate 10 minutes of observe calls at 120 steps/s (72,000 calls) with 2000 fireballs. The export has ≤ 36,001 samples and serialises to < 5 MB.
