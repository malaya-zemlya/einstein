// Sky and sun disk at infinity: aberration of direction only, then the same colour pipeline.

struct SOut { @builtin(position) clip: vec4f, @location(0) ndc: vec2f }

@vertex
fn vs(@builtin(vertex_index) i: u32) -> SOut {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var o: SOut;
  o.clip = vec4f(xy, 0.0, 1.0);
  o.ndc = xy;
  return o;
}

@fragment
fn fs(i: SOut) -> @location(0) vec4f {
  let vp = F.invProj * vec4f(i.ndc, 1.0, 1.0);
  let dirView = normalize(vp.xyz / vp.w);
  let dp = normalize((transpose(F.viewRot) * vec4f(dirView, 0.0)).xyz);   // player-frame direction
  let beta = F.obsVel / F.c;
  var d = dp;
  var D: f32;
  if (F.flags.x > 0.5) {
    d = normalize(boostDx(-1.0 / F.c, dp, -F.obsVel, F.obsGamma));
    D = 1.0 / (F.obsGamma * (1.0 - dot(beta, dp)));
  } else {
    D = F.obsGamma * (1.0 + dot(beta, d));
  }
  var w0: vec4f; var w1: vec4f; var w2: vec4f;
  if (d.y >= 0.0) {
    let k = 0.5 + 0.5 * d.y;
    w0 = F.skyBands[0] * k; w1 = F.skyBands[1] * k; w2 = F.skyBands[2] * k;
  } else {
    w0 = F.hazeBands[0] * F.sunBands[0] * 0.5;
    w1 = F.hazeBands[1] * F.sunBands[1] * 0.5;
    w2 = F.hazeBands[2] * F.sunBands[2] * 0.5;
  }
  var emitT = 0.0;
  if (acos(clamp(dot(d, F.sunDir), -1.0, 1.0)) < 0.0261799) { emitT = 5778.0; }
  let rgb = shadeColour(w0, w1, w2, D, emitT, F.sunDiskScale, false);
  return vec4f(rgb, 1.0);
}
