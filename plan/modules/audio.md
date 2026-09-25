# Module: audio

Physically modelled sound. The island's air is at rest in the world frame, and sound travels through it at `C_SOUND` = C/2 (10 m/s at the default c; read live from `physics/constants.js`). Sound is a second, much slower "light": you see an event first and hear it later. When you move faster than sound you outrun your own noises. All sounds are synthesised in Web Audio, with no asset files. This module reads `GameState` and never writes to it.

## Setup (`audio/engine.js`)
- `createAudio()` builds an `AudioContext` on the first canvas click (browser autoplay policy), with a master gain and a `DynamicsCompressorNode`. `KeyV` mutes (handled in `ui.input`; the flag lives in `state.ui.sound`).
- **Synth voices**, each a function that builds a short node graph:
  - `boom(distance)`: a filtered noise burst plus a sine thump at 50 Hz.
  - `whoosh()`: a band-passed noise sweep.
  - `thud()`: short, low-passed noise, used for ground hits.
  - `buffet`: persistent low-passed noise with slow amplitude modulation, the transonic rumble.
  - `boostWhine`: a persistent sawtooth plus a resonant low-pass.
  - `ambience`: persistent pink noise through a low-pass, the sea and wind.

## Sound events
`audio.update(state)` scans `state.events` and queues **world-frame sound emissions** `{kind, pos, t}`:
- `impact` events → `boom` (kind target) or `thud` (kind ground) at the event's `pos` and `t`.
- `fire` → `whoosh`, played immediately. The source is at the player, so there is no delay.

On each update, a queued emission is **heard** once `C_SOUND·(worldTime − t) ≥ |player.pos − pos|` (the sound front has reached you). Emissions older than 30 s of world time are dropped. You may have outrun them, which is part of the lesson.

When an emission is heard:
- `k̂ = normalize(player.pos − pos)`, the direction the sound travels, world frame.
- **Pitch.** `playbackRate = gamma(player.vel)·(1 − player.vel·k̂/C_SOUND)`, clamped to [0.25, 4]. This is the Doppler formula for a listener moving through a medium (sources are at rest), multiplied by γ because your clock runs slow, so every sound reaches you sped up. The rate is computed for the arrival moment and held constant for the voice's duration (voices are under 1.5 s).
- **Loudness.** `gain = 1/(1 + d/15)`, where d is the emission distance.
- **Panning.** A `StereoPannerNode` with `pan = sin(azimuth of −k̂ relative to yaw)`. This is the world-frame direction; sound aberration is not modelled.

## Continuous sound
- **Boost whine.** Frequency `70 Hz·γ`, gain ramps up while boosting. This is your own ship's sound, so it has no delay.
- **No self-heard boom.** A listener never hears their own sonic boom; the boom is heard only by places the Mach cone sweeps over.
- **Transonic buffet.** The gain of `buffet` is `exp(−((|v| − C_SOUND)/(0.12·C_SOUND))²)`: it peaks right at the sound speed, where your own noise piles up ahead of you. It fades on either side.
- **Barrier crossing.** `game.step` pushes a `sonic` event when `|vel|` crosses `C_SOUND` upward (game.md step 10), and captions read it from `state.events` like any other. Audio plays nothing for it: the silence behind you is the cue.
- **Catch-up.** No special code. Emissions you outran stay queued (up to 30 s), and are heard naturally when you slow down and their wavefronts reach you.
- **Ambience while supersonic.** Sound reaches you only from directions satisfying `cos θ > −C_SOUND/|v|`, where θ is measured from your direction of motion. The audible fraction of the sphere is `f = |v| ≤ C_SOUND ? 1 : (1 + C_SOUND/|v|)/2`. Ambience gain is scaled by `f`, and its low-pass cutoff is scaled by the average forward Doppler, so it gets quieter and higher as you outrun the air behind you.

The Mach cone on the mini-map is specified in game.md § Map overlay.

## Replay (`updateReplay(rs, view)`)
- On replay entry, emissions are derived from the log: each target death → `boom` at its `hitPos`, and each small burst → `thud` at its origin. They form one list sorted by t.
- Each frame, an emission not yet heard is heard once `C_SOUND·(view.worldTime − t) ≥ |view.observer.pos − pos|`. Pitch is `rate × playbackRate(observer.vel, k̂)`.
- Sounds play only while `0 < rs.rate ≤ 2`. A clock jump of more than 0.5 s (a scrub, or reversing) marks every emission whose front has already passed the observer as heard, without playing it.
- The continuous voices follow the observer: the boost whine only with the recorded camera (when the recorded β is rising toward the cap); buffet and ambience from the observer's speed.

## Captions added (see game.md § Captions)
| id | trigger | text |
|---|---|---|
| sonic | `sonic` event | You just passed the speed of sound ({cs} m/s here). Sounds from behind can't catch you now. Your sonic boom is trailing behind you as a cone (see the map). You never hear your own. |
| seehear | first heard hit with (heard − seen) > 1 s | You saw that hit {Δ} s before you heard it. Light: {c} m/s. Sound: {cs} m/s. |

## Tests (`test/audio/*.test.js`, pure functions extracted to `audio/model.js`)
- `hearTime(pos, t, observerPath)`: at rest 30 m away, the sound is heard at t + 3.0 s.
- `playbackRate`: 1 at rest; approaching at 0.5·C_SOUND gives γ(0.25c)·1.5 = 1.549; `gamma` uses light's C.
- Receding faster than sound: an emission behind a player moving at 2·C_SOUND is never heard, and is dropped after 30 s.
- `audibleFraction(v)`: 1 at and below C_SOUND; 0.75 at 2·C_SOUND.
- The `sonic` event fires exactly once per upward crossing, and no boom voice exists.
- `buffetGain` is 1 at |v| = C_SOUND and < 0.01 at 0.6·C_SOUND and 1.4·C_SOUND.
- Catch-up: a hit emitted 20 m behind a player at 1.5·C_SOUND who then stops is heard at the analytic catch-up time.
