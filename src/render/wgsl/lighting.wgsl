// Sun (static shadow map + exact balloon shadows with light-travel timing) and fireball lighting,
// all in the world frame at the emission event (xe, tRel). JS references: render/shadowModel.js,
// physics/lighting.js.

struct Light {
  origin: vec3f, dt0: f32,
  vel: vec3f, birthRel: f32,
  temp: f32, scale: f32, aSrc: f32, deathRel: f32,
}

@group(0) @binding(6) var shadowMap: texture_depth_2d;
@group(0) @binding(7) var shadowSamp: sampler_comparison;
@group(0) @binding(8) var<storage, read> lights: array<Light>;

const BALLOON_R: f32 = 0.8;
const FIREBALL_R: f32 = 0.3;

fn staticShadow(xe: vec3f) -> f32 {
  if (F.shadowOn == 0u) { return 1.0; }
  let c = F.shadowViewProj * vec4f(xe, 1.0);
  let ndc = c.xyz / c.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 1.0; }
  let texel = 1.0 / vec2f(textureDimensions(shadowMap));
  var s = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2f(f32(dx), f32(dy)) * texel, ndc.z + 0.0004);
    }
  }
  return s / 9.0;
}

// Targets occupy objs[1 ..= nTargets]. A balloon blocks the sunlight reaching xe at tRel only if it
// still existed when that light passed it.
fn balloonShadow(xe: vec3f, tRel: f32) -> f32 {
  for (var k = 0u; k < F.nTargets; k++) {
    let o = objs[1u + k];
    let oc = xe - o.origin;
    let cc = dot(oc, oc) - BALLOON_R * BALLOON_R;
    if (cc < 1e-3) { continue; }
    let b = dot(oc, F.sunDir);
    let disc = b * b - cc;
    if (disc < 0.0) { continue; }
    let s = -b - sqrt(disc);
    if (s < 0.0) { continue; }
    let ps = xe + F.sunDir * s;
    let death = o.deathRel + select(0.0, length(ps - o.origin - o.hitLocal) / F.c, o.hasHit == 1u);
    if (tRel - s / F.c <= death) { return 0.0; }
  }
  return 1.0;
}

fn sunLight(xe: vec3f, tRel: f32, n: vec3f) -> f32 {
  let lambert = max(dot(n, F.sunDir), 0.0);
  if (lambert == 0.0) { return 0.0; }
  return lambert * staticShadow(xe) * balloonShadow(xe, tRel);
}

// Band irradiance from the fireballs: each light is seen where it was when its light left
// (own retarded-time solve) and Doppler-shifted by its motion relative to the surface.
fn fireballLight(xe: vec3f, tRel: f32, n: vec3f) -> array<vec4f, 3> {
  var E = array<vec4f, 3>(vec4f(0.0), vec4f(0.0), vec4f(0.0));
  for (var i = 0u; i < F.nLights; i++) {
    let L = lights[i];
    let u = L.vel;
    let r = L.origin + u * (L.dt0 + tRel) - xe;
    let delta = select(0.0, retardedDelay(r, u, L.aSrc), F.flags.y > 0.5);
    let tL = tRel - delta;
    if (tL < L.birthRel || tL > L.deathRel) { continue; }
    let s = r - u * delta;
    let dist = length(s);
    if (dist < 1e-4) { continue; }
    let l = s / dist;
    let ndl = dot(n, l);
    if (ndl <= 0.0) { continue; }
    let gSrc = F.c / sqrt(L.aSrc);
    let D = select(1.0, 1.0 / (gSrc * (1.0 + dot(u, l) / F.c)), F.flags.z > 0.5);
    let d = max(dist, FIREBALL_R);
    let k = PI * L.scale * (FIREBALL_R / d) * (FIREBALL_R / d) * ndl;
    let T = L.temp * D;
    E[0] += k * bbBands(T, 0u);
    E[1] += k * bbBands(T, 1u);
    E[2] += k * bbBands(T, 2u);
  }
  return E;
}
