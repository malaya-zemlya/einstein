# Module: physics

Pure special-relativity maths in JS. Every function is side-effect-free, takes and returns `Vec3` values from the project's small `src/math/vec3.js` (plain `{x, y, z}` objects with pure helpers: add, sub, scale, dot, length, normalize), and never mutates its arguments. `render/wgsl/relativity.wgsl` is a line-for-line port of `lightcone.js#apparent` (same names, same branch structure), and the parity tests keep the two in sync.

## Files
- `constants.js`: live bindings `export let C = 20, C2 = 400, C_SOUND = 10`, and `setC(c)`, which sets all three (C_SOUND = C/2). Callers are listed in plan decision 1. All functions read these at call time, never caching them.
- `lorentz.js`: `gamma`, `velocityAdd`, `stepRapidity`, `rapidityToVelocity`.
- `lightcone.js`: `retardedDelay`, `boostEvent`, `dopplerFactor`, `apparent`.
- `worldline.js`: `Worldline`.
- `lighting.js`: `fireballIrradiance(light, xe, tRel, n, flags) → Float64Array(12)`. This is the JS reference for `render/lighting.wgsl`, and its steps are exactly those listed in render.md § Fireball lighting.

## lorentz.js
- `gamma(v)`: `b2 = v.lengthSq()/C2`. If `b2 >= 1` it throws `RangeError('superluminal')`. Otherwise it returns `1/sqrt(1−b2)`.
- `velocityAdd(v, w)`. `v` is the frame's velocity in the world and `w` is the object's velocity in that frame. If |v| = 0 it returns `w`. Otherwise, with `g = gamma(v)` and `n = v̂`:
  `u = (v + w_par + w_perp/g) / (1 + v·w/C2)`, where `w_par = (w·n)n` and `w_perp = w − w_par`.
- **The rapidity vector** is `phiVec = atanh(|v|/C)·v̂`.
- `rapidityToVelocity(phiVec) = C·tanh(|phiVec|)·phiVec/|phiVec|` (zero if |phiVec| = 0). This is always subluminal.
- `stepRapidity(phiVec, phiTarget, rate, dτ)`: `d = phiTarget − phiVec`. If `|d| <= rate·dτ` it returns `phiTarget`, otherwise `phiVec + d̂·rate·dτ`. In straight-line motion this is exactly constant proper acceleration `α = C·rate`, because rapidity grows linearly in proper time.

## lightcone.js

### retardedDelay(r, u)
`r` is the point's position at the observer's current world time, relative to the observer; `u` is its constant world velocity. The function finds Δ ≥ 0 with `|r − uΔ| = CΔ`. With `a = C2 − u·u` (> 0), `b = r·u` and `c = r·r`, the non-negative root is written without cancellation:

```
if c == 0:           Δ = 0
else if b >= 0:      Δ = c / (b + sqrt(b² + a·c))
else:                Δ = (−b + sqrt(b² + a·c)) / a
```

When `u = 0` this reduces to `|r|/C`. The two forms are algebraically identical, and the choice keeps float32 accurate for |u| up to 0.9995C (the fastest fireball).

### boostEvent(dt, dx, v)
With `g = gamma(v)` and `n = v̂` (identity if v = 0):
```
dt' = g·(dt − (v·dx)/C2)
dx' = dx + (g−1)(dx·n)n − g·v·dt
```

### dopplerFactor(kHat, vObs, vSrc)
`kHat` is the unit direction the photon travels in the world frame, from the source to the observer.
`D = gamma(vObs)·(1 − vObs·kHat/C) / (gamma(vSrc)·(1 − vSrc·kHat/C))`. D > 1 means a blueshift.

### apparent(vertex, observer, flags) → {pos, D, visible}
The inputs:
- `vertex = {p, local, u, dt0, birthRel, deathRel, hitLocal}`.
  - `p` is the world position at t0, and `local` is the vertex's position in its mesh's own coordinates.
  - `dt0 = t_o − t0`, `birthRel = tBirth − t_o`, `deathRel = tDeath − t_o`. The caller computes these in double precision.
  - `hitLocal` is the impact point in mesh coordinates, or null.
- `observer = {x, v}`, `flags = {aberration, delay}`.

Steps:
1. `r = p + u·dt0 − observer.x`.
2. If `flags.delay`, `Δ = retardedDelay(r, u)`, otherwise `Δ = 0`. Then `dx = r − u·Δ` and `tRel = −Δ`.
3. `death = deathRel + (hitLocal ? |local − hitLocal|/C : 0)`. This is the light-cone dissolve from plan § 2. `visible = birthRel <= tRel && tRel <= death`.
4. `dt = −|dx|/C` (a light-like separation). With delay off this is a construction: `dx` is the instantaneous position, and `dt` gives the direction that light from there would arrive along.
5. If `flags.aberration`, `dx' = boostEvent(dt, dx, observer.v).dx`, otherwise `dx' = dx`. `pos = dx'`: player frame, relative to the eye. Its length is the apparent distance.
6. `kHat = −dx/|dx|`. `D = dopplerFactor(kHat, observer.v, u)`. D is always computed; the fragment stage decides whether to use it.

If |dx| < 1e-4 m, it returns `pos = dx`, D = 1.

### Worked examples (also test fixtures)
c = 20; the observer is at the origin moving along +x at β = 0.9 (v = 18 m/s, γ = 2.2942).
- **Static vertex dead ahead at (10, 0, 0).** Δ = 0.5 s. dx′ₓ = γ(10 + 18·0.5) = 43.59: it appears straight ahead at 43.59 m. D = γ(1 + 0.9) = 4.359.
- **Static vertex abeam at (0, 10, 0).** dx′ = (20.65, 10, 0), so it appears 25.84° off the forward axis. This agrees with cos θ′ = (cos θ + β)/(1 + β cos θ) = 0.9. D = γ = 2.294.
- **Swing-forward boundary.** A source at world angle θ from the direction of travel appears at 90° exactly when cos θ = −β. For β = 0.5 that is 120°; for β = 0.9 it is 154.2°.
- **Backward fireball.** Observer v = (0.99C, 0, 0), w = (−0.9C, 0, 0). velocityAdd gives uₓ = 0.8257C.
- **Ramp** (defaults: cruise 0.4c in 1.0 s, cap 0.99c 2.5 s later). The cruise rate is atanh(0.4)/1.0 = 0.4236/s, a felt acceleration of 8.5 m/s². The boost rate is (2.6467 − 0.4236)/2.5 = 0.889/s, which is 17.8 m/s².

## worldline.js
`class Worldline { constructor({p, t0, u, tBirth = −Infinity, tDeath = Infinity, hitPos = null}) }`:
- `positionAt(t) = p + u·(t − t0)`.
- `retardedTime(xObs, tObs)`: `te = tObs − retardedDelay(positionAt(tObs) − xObs, u)`. It returns `te` if `tBirth <= te <= tDeath`, otherwise null. It is used for the mini-map ghosts, and uses the object's centre (no dissolve).
- `hasBeenSeenDead(xObs, tObs, extent = 0)` is true when `C·(tObs − tDeath) >= |xObs − positionAt(tDeath)| + 2·extent`. `extent` bounds the distance from the dissolve origin (`hitPos`) to any vertex. The dissolve reaches the farthest vertex at most `extent/C` later, and that vertex is at most `extent` farther from the observer. Used by the minimap and HUD logic.
- `lightHasPassed(tObs)` is true when `C·(tObs − tDeath) >= LIGHT_HORIZON` (1000 m, more than any island-point-to-observer path via the 400 m sea). After that, neither the object, its light on the ground, nor its shadow can still be seen anywhere. The game removes dead objects only then.

## Tests (`test/physics/*.test.js`)
- `gamma`: 1 at rest; 2.2942 at 0.9c; throws at C and above.
- `velocityAdd`: collinear addition matches (a+b)/(1+ab); |u| < C for 1000 random pairs; `velocityAdd(v, 0) == v`; the backward-fireball fixture.
- `stepRapidity`: no overshoot; the ramp fixture; |v| < C after 10 s of boost at 0.999c.
- `retardedDelay`: a property test over 1000 seeded `r` and `u` with |u| ≤ 0.9995C: `||r − uΔ| − CΔ| < 1e-9·|r|`, and Δ ≥ 0. It also evaluates the formula in `Math.fround` (float32) arithmetic and checks it keeps a relative error < 1e-5, which guards the WGSL port.
- `boostEvent`: preserves the interval to 1e-9 relative; boosting by v then by −v is the identity.
- `apparent`: the worked examples; an angle sweep at β ∈ {0.5, 0.9} against the aberration formula (criterion 3); with both flags off `pos == r`; with v = 0 and u = 0, D = 1; birth and death visibility boundaries, including the dissolve term.
- `Worldline.hasBeenSeenDead`: flips at the analytic time for a stationary observer, with extent 0 and extent 1.
