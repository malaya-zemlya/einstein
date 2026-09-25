// Relativistic object shader. Prepended at build time: common.wgsl, relativity.wgsl, lighting.wgsl.

struct VIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) bands0: vec4f,
  @location(3) bands1: vec4f,
  @location(4) bands2: vec4f,
  @location(5) emitTemp: f32,
  @location(6) particle: u32,
  @builtin(instance_index) inst: u32,
}

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) a0: vec4f,
  @location(1) a1: vec4f,
  @location(2) a2: vec4f,
  @location(3) normal: vec3f,
  @location(4) xe: vec3f,          // world position at emission
  @location(5) tRel: f32,          // emission time relative to observer time
  @location(6) emitT: f32,
  @location(7) emitScale: f32,
  @location(8) D: f32,
  @location(9) visible: f32,
}

@vertex
fn vs(v: VIn) -> VOut {
  let o = objs[v.inst];
  var u = o.vel;
  var a = o.aSrc;
  if (o.burstBase != 0xffffffffu) {
    u = burstVel[o.burstBase + v.particle].xyz;
    a = F.c * F.c - dot(u, u);
  }
  let p = o.origin + v.position;
  let ap = apparent(p, v.position, u, a, o.dt0, o.birthRel, o.deathRel, o.hitLocal, o.hasHit == 1u,
                    F.obsPos, F.obsVel, F.obsGamma, F.c, F.flags.x > 0.5, F.flags.y > 0.5);
  var out: VOut;
  let viewPos = (F.viewRot * vec4f(ap.pos, 0.0)).xyz;
  out.clip = F.proj * vec4f(viewPos, 1.0);
  out.a0 = v.bands0;
  out.a1 = v.bands1;
  out.a2 = v.bands2;
  out.normal = v.normal;
  out.xe = ap.dxWorld + F.obsPos;
  out.tRel = ap.tRel;
  out.emitT = v.emitTemp;
  out.emitScale = o.emitScale;
  out.D = ap.D;
  out.visible = ap.visible;
  return out;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  if (i.visible < 0.5) { discard; }
  let n = normalize(i.normal);
  let lit = sunLight(i.xe, i.tRel, n) + mix(F.ambGround, F.ambSky, 0.5 + 0.5 * n.y);
  var w0 = i.a0 * F.sunBands[0] * lit;
  var w1 = i.a1 * F.sunBands[1] * lit;
  var w2 = i.a2 * F.sunBands[2] * lit;
  let fl = fireballLight(i.xe, i.tRel, n);
  w0 += i.a0 * fl[0] / PI;
  w1 += i.a1 * fl[1] / PI;
  w2 += i.a2 * fl[2] / PI;
  let thermal = i.emitT <= 0.0;
  let rgb = shadeColour(w0, w1, w2, i.D, i.emitT, i.emitScale, thermal);
  return vec4f(rgb, 1.0);
}
