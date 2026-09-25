// Line-for-line port of src/physics/lightcone.js.

fn retardedDelay(r: vec3f, u: vec3f, a: f32) -> f32 {
  let cc = dot(r, r);
  if (cc == 0.0) { return 0.0; }
  let b = dot(r, u);
  let disc = sqrt(b * b + a * cc);
  if (b >= 0.0) { return cc / (b + disc); }
  return (-b + disc) / a;
}

fn boostDx(dt: f32, dx: vec3f, v: vec3f, g: f32) -> vec3f {
  let s = length(v);
  if (s == 0.0) { return dx; }
  let n = v / s;
  return dx + (g - 1.0) * dot(dx, n) * n - g * v * dt;
}

// 1 − v·k̂/c without cancellation for |v| → c: equals (a + |v×k̂|²) / (c(c + v·k̂)), a = c² − |v|² = c²/γ².
fn oneMinusBetaK(v: vec3f, kHat: vec3f, a: f32, c: f32) -> f32 {
  let vk = dot(v, kHat);
  if (vk <= 0.0) { return 1.0 - vk / c; }
  let x = cross(v, kHat);
  return (a + dot(x, x)) / (c * (c + vk));
}

fn dopplerD(kHat: vec3f, vObs: vec3f, gObs: f32, vSrc: vec3f, gSrc: f32, c: f32) -> f32 {
  let aObs = c * c / (gObs * gObs);
  let aSrc = c * c / (gSrc * gSrc);
  return gObs * oneMinusBetaK(vObs, kHat, aObs, c) / (gSrc * oneMinusBetaK(vSrc, kHat, aSrc, c));
}

struct Apparent { pos: vec3f, D: f32, visible: f32, dxWorld: vec3f, tRel: f32 }

// p: world position at t0; local: mesh-local position; u: world velocity; a = C² − |u|².
fn apparent(p: vec3f, local: vec3f, u: vec3f, a: f32, dt0: f32, birthRel: f32, deathRel: f32,
            hitLocal: vec3f, hasHit: bool, obsPos: vec3f, obsVel: vec3f, gObs: f32, c: f32,
            aberration: bool, delay: bool) -> Apparent {
  let r = p + u * dt0 - obsPos;
  let delta = select(0.0, retardedDelay(r, u, a), delay);
  let dx = r - u * delta;
  let tRel = -delta;
  let death = deathRel + select(0.0, length(local - hitLocal) / c, hasHit);
  let visible = select(0.0, 1.0, birthRel <= tRel && tRel <= death);
  let dist = length(dx);
  if (dist < 1e-4) { return Apparent(dx, 1.0, visible, dx, tRel); }
  let dt = -dist / c;
  let pos = select(dx, boostDx(dt, dx, obsVel, gObs), aberration);
  let gSrc = c / sqrt(a);
  let D = dopplerD(-dx / dist, obsVel, gObs, u, gSrc, c);
  return Apparent(pos, D, visible, dx, tRel);
}
