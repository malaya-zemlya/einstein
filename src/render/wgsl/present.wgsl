// Tone map the HDR scene to the canvas: exposure, roll-off to headroom H, gamut, sRGB encode, vignette.

struct Present { exposure: f32, headroom: f32, sdr: f32, vignette: f32, shake: vec2f, pad: vec2f }
@group(0) @binding(0) var<uniform> P: Present;
@group(0) @binding(1) var hdr: texture_2d<f32>;

struct POut { @builtin(position) clip: vec4f }

@vertex
fn vs(@builtin(vertex_index) i: u32) -> POut {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return POut(vec4f(xy, 0.0, 1.0));
}

fn encode(x: f32) -> f32 {
  let a = abs(x);
  let e = select(1.055 * pow(a, 1.0 / 2.4) - 0.055, 12.92 * a, a <= 0.0031308);
  return sign(x) * e;
}

@fragment
fn fs(i: POut) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(hdr));
  let px = clamp(i.clip.xy + P.shake, vec2f(0.0), dims - 1.0);
  var rgb = textureLoad(hdr, vec2u(px), 0).rgb * P.exposure;
  let L = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  if (L <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let H = P.headroom;
  let Lt = L / (1.0 + L / H);
  rgb *= Lt / L;
  let mn = min(rgb.r, min(rgb.g, rgb.b));
  if (mn < 0.0) { rgb = mix(rgb, vec3f(Lt), -mn / (Lt - mn)); }
  if (P.sdr > 0.5) {
    let mx = max(rgb.r, max(rgb.g, rgb.b));
    if (mx > 1.0) { rgb = mix(rgb, vec3f(Lt), (mx - 1.0) / max(mx - Lt, 1e-6)); }
  }
  let uv = i.clip.xy / dims - 0.5;
  rgb *= 1.0 - P.vignette * dot(uv, uv) * 2.0;
  return vec4f(encode(rgb.r), encode(rgb.g), encode(rgb.b), 1.0);
}
