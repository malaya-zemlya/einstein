// Fireball flame: the plasma is the object, so its puffy, tailed shape goes through the same relativistic
// vertex transform, and its colour is blackbody emission from a noise-driven temperature field, Doppler-
// shifted like everything else. Optically thin gas: additive blending, no depth writes.

fn hash3(p: vec3f) -> f32 {
  let q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  let r = q + dot(q, q.yzx + 33.33);
  return fract((r.x + r.y) * r.z);
}

fn vnoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash3(i), hash3(i + vec3f(1, 0, 0)), u.x), mix(hash3(i + vec3f(0, 1, 0)), hash3(i + vec3f(1, 1, 0)), u.x), u.y);
  let b = mix(mix(hash3(i + vec3f(0, 0, 1)), hash3(i + vec3f(1, 0, 1)), u.x), mix(hash3(i + vec3f(0, 1, 1)), hash3(i + vec3f(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}

fn flameNoise(p: vec3f, t: f32) -> f32 {
  var s = 0.0;
  var amp = 0.55;
  var q = p * 4.0 + vec3f(0.0, -t * 3.0, t * 1.3);
  for (var k = 0; k < 4; k++) {
    s += amp * vnoise(q);
    q = q * 2.03 + vec3f(1.7, -t * 2.0, 3.1);
    amp *= 0.5;
  }
  return s; // ~0..1
}

struct FOut {
  @builtin(position) clip: vec4f,
  @location(0) local: vec3f,
  @location(1) nLocal: vec3f,
  @location(2) toEye: vec3f,
  @location(3) D: f32,
  @location(4) visible: f32,
  @location(5) emitScale: f32,
  @location(6) seed: f32,
}

@vertex
fn vs_fire(v: VIn) -> FOut {
  let o = objs[v.inst];
  let u = o.vel;
  let speed = length(u);
  let back = select(vec3f(0.0, 1.0, 0.0), -u / max(speed, 1e-6), speed > 1e-3);
  let n = normalize(v.position);
  let seed = f32(v.inst) * 17.31;
  let wob = flameNoise(n * 0.6 + seed, F.fireTime);
  let tail = max(dot(n, back), 0.0);
  let local = n * FIREBALL_R * (0.85 + 0.45 * wob) + back * FIREBALL_R * 2.2 * tail * tail * (0.6 + 0.8 * wob);
  let p = o.origin + local;
  let ap = apparent(p, local, u, o.aSrc, o.dt0, o.birthRel, o.deathRel, o.hitLocal, o.hasHit == 1u,
                    F.obsPos, F.obsVel, F.obsGamma, F.c, F.flags.x > 0.5, F.flags.y > 0.5);
  var out: FOut;
  out.clip = F.proj * vec4f((F.viewRot * vec4f(ap.pos, 0.0)).xyz, 1.0);
  out.local = local;
  out.nLocal = n;
  out.toEye = normalize(F.obsPos - (ap.dxWorld + F.obsPos));
  out.D = ap.D;
  out.visible = ap.visible;
  out.emitScale = o.emitScale;
  out.seed = seed;
  return out;
}

@fragment
fn fs_fire(i: FOut) -> @location(0) vec4f {
  if (i.visible < 0.5) { discard; }
  let n = normalize(i.nLocal);
  let facing = abs(dot(n, normalize(i.toEye)));
  let turb = flameNoise(i.local / FIREBALL_R * 0.5 + i.seed, F.fireTime);
  // heat: hot dense core facing the viewer, turbulent cooler wisps at the rim and in the tail
  let heat = clamp(pow(facing, 1.4) * (0.55 + 0.9 * turb) - 0.12 * length(i.local) / FIREBALL_R, 0.0, 1.0);
  let density = smoothstep(0.08, 0.55, heat);
  if (density <= 0.001) { discard; }
  let T = mix(2200.0, 12000.0, heat * heat);
  let S = select(1.0, i.D, F.flags.z > 0.5);
  let A = select(1.0, i.D * i.D * i.D * i.D, F.flags.w > 0.5) * S;
  let xyz = i.emitScale * bbXYZ(T * S) / (S * S * S * S * S) * A * density;
  return vec4f(min(XYZ_TO_SRGB * xyz, vec3f(6e4)), 1.0);
}
