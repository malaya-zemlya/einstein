# Module: replay

This module plays a recorded spacetime log (record.md) back through the live renderer. It supports pause, rewind, scrubbing, any playback rate, effect toggles, and a free camera that can watch the recorded player from anywhere. Rendering is a pure function of (moment, observer), so none of these features need to undo any state.

## Entering and leaving
- **L** opens a file picker (a hidden `<input type=file accept=.json>`), and a `.json` file dropped on the page does the same. The file goes through `record.readLog`. If it fails (bad format, version, or generator mismatch), a caption explains why and the game continues.
- On success, `main` switches `mode` from `'play'` to `'replay'` and calls `setC(meta.c)`. If `meta.seed` differs from the loaded island, it rebuilds the island (at the current quality) and calls `renderer.setIsland`. The live game state is set aside. **Backspace** returns to it, restoring the game's c and island.

## ReplayState (`replay/state.js`)
```
ReplayState = {
  log,                          // readLog result: meta, frames (columnar), objects (Worldlines + extras)
  t,                            // replay clock, world time
  tauRec,                       // recorded proper time (the clock variable in recorded-camera mode)
  followRecordedFlags,          // true until the user toggles an effect; re-armed when switching back to the recorded camera
  rate,                         // −8 … 8; 0 = paused
  camera: 'recorded' | 'free',
  free: { pos, rapidity (3D vector), yaw, pitch },   // the free camera's own kinematics
  flags, ui                     // effect flags and map/captions/sound, toggled as in play
}
```

## replay.step(rs, input, dReal) — the only mutator of ReplayState
1. **Toggles and controls:**
   - `1–4` and `N` work as in play (and set `followRecordedFlags = false`), and so do `M`, `H`, `V`.
   - Space pauses and resumes. `←`/`→` (no modifiers, since Ctrl+arrows switch desktops on macOS) step the rate through [−8, −4, −2, −1, −½, −¼, 0, ¼, ½, 1, 2, 4, 8].
   - `,` and `.` step one recorded frame while paused.
   - **C** switches between the recorded and free camera. Switching to free starts the free camera at the recorded camera's current pose, at rest.
2. **The clock rule: real time is the current camera's proper time**, the same rule as play (decision 6).
   - With the recorded camera, the clock variable is recorded proper time: `tauRec += rate·dReal`, then `t = interpolate(frames.tau → frames.t, tauRec)`. `frames.tau` is strictly increasing, so this is exact and reversible (+1 s then −1 s returns to the same t), and at 1× it runs exactly as the original felt.
   - With the free camera, `t += rate·γ_free·dReal`. Switching cameras converts between the two clocks at the current t.
   - While `followRecordedFlags`, `rs.flags` = the last `flagChanges` entry at or before t.
   - `t` is clamped to [first frame t, last frame t + 30 s]. The extra 30 s lets the last light and sound still arrive.
3. **Free-camera movement** (when free):
   - WASD plus E/Q (up/down; `input.moveU`) set a 3D wish direction. Shift boosts.
   - The rapidity ramps as in play (same settings), but in free 3D flight with no terrain following or shore clamp.
   - Mouse look as in play.
   - `free.pos += v·dReal·γ_free`: the camera always moves in real time, regardless of the playback rate or its sign. So you can fly around a paused or rewinding moment, and W always moves forward. Its velocity still sets the aberration of the view.
4. The Esc panel shows a **timeline scrubber** (a slider over the t range). Dragging it sets `t` directly.

## Producing the render view (`replay/view.js`)
`viewAt(rs) → RenderView`:
- **Observer.**
  - Recorded camera: binary-search `frames.t` for `t`, then interpolate `pos`, `vel`, `yaw` and `pitch` linearly (angles along the shortest arc).
  - Free camera: `{free.pos, rapidityToVelocity(free.rapidity), free.yaw, free.pitch}`.
- **Objects.** Every log object, as-is. Birth, death and dissolve visibility are handled by the shader. Objects whose `hasBeenSeenDead` is true for this observer and moment, or whose `tBirth` is after `t`, are skipped for efficiency.
- **Avatar** (free camera only). The recorded player is drawn as a glowing orb, radius 0.4 m, emitTemp 6000 K, so you can watch yourself fly past.
  - Its path is curved (accelerated), which the per-vertex shader can't handle.
  - Instead, the CPU finds the avatar-centre retarded time along the recorded path: bisect on `f(τ) = C·(t − t_frame(τ)) − |x_obs − pos(τ)|` over the frames.
  - The avatar is then drawn as a small rigid object on the straight worldline that is tangent to its path at that retarded time (position and velocity at that frame).
  - Across the orb's 0.8 m size the tangent approximation is off by at most a few millimetres, which is invisible.
- **Flags and ui** come from `rs`.

## Sound in replay
- **Emissions** are derived from the log: every target death gives a `boom` at its `hitPos`, and every small burst gives a `thud`.
- `audio.update` gets these as a precomputed emission list plus the current observer. An emission is heard when its sound front reaches the observer's position at `t`, the same rule as play.
- **Playback** happens only while `0 < rate ≤ 2`. Pitch uses the playback rate × the physical Doppler.
- **Scrubbing** (a jump of more than 0.5 s) marks the emissions before the new `t` as already heard, to avoid a burst of sound.

## HUD in replay
- A **REPLAY** badge, the clock `t`, the rate, the camera mode, and the recorded player's β and γ at `t`.
- Captions are limited to toggle captions.
- **Mini-map extras:** the recorded path as a faint trail, and a free-camera marker.

## Tests (`test/replay/*.test.js`)
- **Recorded camera fidelity.** For a scripted recorded round, `viewAt` at each recorded frame's t equals the live `viewOf(state)` captured at that frame: observer to 1e-6, and the object set equal.
- **Clock rule.** With the recorded camera at 1× and the recorded β = 0.9, one real second advances t by 2.294 s. With the free camera at rest, it advances by 1 s. Rate −1 goes backwards by the same amounts.
- **Reversibility (recorded camera).** Stepping +1 s then −1 s of real time at rates 1 and −1 returns to the same t (to 1e-9) and the same view, including through a recorded boost where γ changes.
- **Recorded flags.** A log with two toggles reproduces them at their recorded t. A user toggle stops following until the camera is switched back to recorded.
- **Free-camera motion.** At rate −1 with W held, the camera moves forward.
- **Avatar retarded time.** For a recorded straight-line path at constant velocity, the bisection result matches `retardedDelay` to 1e-6.
- **Scrub silence.** A scrub past 3 hits queues no sounds.
