// Shared declarations: frame uniforms, per-object params, LUT access and colour pipeline.

struct Frame {
  proj: mat4x4f,
  invProj: mat4x4f,
  viewRot: mat4x4f,        // world → view rotation (3×3 used)
  obsPos: vec3f, c: f32,
  obsVel: vec3f, obsGamma: f32,
  sunDir: vec3f, ambSky: f32,
  flags: vec4f,            // aberration, delay, doppler, searchlight (0/1)
  sunBands: array<vec4f, 3>,
  skyBands: array<vec4f, 3>,
  hazeBands: array<vec4f, 3>,
  ambGround: f32, thermalT: f32, thermalEps: f32, sunDiskScale: f32,
  nLights: u32, nTargets: u32, shadowOn: u32, pad0: u32,
  shadowViewProj: mat4x4f,
}

struct Obj {
  origin: vec3f, dt0: f32,
  vel: vec3f, birthRel: f32,
  hitLocal: vec3f, deathRel: f32,
  emitScale: f32, hasHit: u32, burstBase: u32, aSrc: f32,   // aSrc = C² − |vel|², precomputed in double
}

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> objs: array<Obj>;
@group(0) @binding(2) var<storage, read> burstVel: array<vec4f>;
@group(0) @binding(3) var bandTex: texture_2d<f32>;
@group(0) @binding(4) var bbTex: texture_2d<f32>;
@group(0) @binding(5) var bbBandsTex: texture_2d<f32>;

const LUT_N: f32 = 1025.0;
const LOG2T_MIN: f32 = 6.643856189774724;   // log2(100)
const LOG2T_MAX: f32 = 16.609640474436812;  // log2(100000)
const PI: f32 = 3.141592653589793;

fn lutLerp(tex: texture_2d<f32>, x: f32, row: u32) -> vec4f {
  let xc = clamp(x, 0.0, LUT_N - 1.0);
  let x0 = u32(floor(xc));
  let x1 = min(x0 + 1u, 1024u);
  let f = xc - f32(x0);
  return mix(textureLoad(tex, vec2u(x0, row), 0), textureLoad(tex, vec2u(x1, row), 0), f);
}

fn bandXYZ(i: u32, log2S: f32) -> vec3f {
  return lutLerp(bandTex, (clamp(log2S, -4.0, 4.0) + 4.0) / 8.0 * (LUT_N - 1.0), i).xyz;
}

fn bbXYZ(T: f32) -> vec3f {
  let x = (log2(max(T, 1e-3)) - LOG2T_MIN) / (LOG2T_MAX - LOG2T_MIN) * (LUT_N - 1.0);
  if (x < 0.0 || x > LUT_N - 1.0) { return vec3f(0.0); }
  return lutLerp(bbTex, x, 0u).xyz;
}

// Planck radiance at the 12 band centres for temperature T (normalised by K), packed in 3 vec4.
fn bbBands(T: f32, row: u32) -> vec4f {
  let x = (log2(max(T, 1e-3)) - LOG2T_MIN) / (LOG2T_MAX - LOG2T_MIN) * (LUT_N - 1.0);
  if (x < 0.0 || x > LUT_N - 1.0) { return vec4f(0.0); }
  return lutLerp(bbBandsTex, x, row);
}

const XYZ_TO_SRGB = mat3x3f(
  vec3f(3.2404542, -0.9692660, 0.0556434),
  vec3f(-1.5371385, 1.8760108, -0.2040259),
  vec3f(-0.4985314, 0.0415560, 1.0572252),
);

// Observed linear sRGB radiance (unexposed) for band weights w, thermal and emitter terms.
fn shadeColour(w0: vec4f, w1: vec4f, w2: vec4f, D: f32, emitT: f32, emitScale: f32, thermal: bool) -> vec3f {
  let S = select(1.0, D, F.flags.z > 0.5);
  let A = select(1.0, D * D * D * D, F.flags.w > 0.5) * S;
  let s = log2(S);
  var xyz = vec3f(0.0);
  var w = array<vec4f, 3>(w0, w1, w2);
  for (var j = 0u; j < 3u; j++) {
    for (var k = 0u; k < 4u; k++) {
      let wk = w[j][k];
      if (wk != 0.0) { xyz += wk * bandXYZ(j * 4u + k, s); }
    }
  }
  let s5 = 1.0 / (S * S * S * S * S);
  if (thermal) { xyz += F.thermalEps * s5 * bbXYZ(F.thermalT * S); }
  if (emitT > 0.0) { xyz += emitScale * s5 * bbXYZ(emitT * S); }
  return min(XYZ_TO_SRGB * (xyz * A), vec3f(6e4));
}
