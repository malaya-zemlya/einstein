// Physically-based bloom: 13-tap downsample (Karis average on the first level), 9-tap tent upsample.

struct BloomParams { texel: vec2f, karis: f32, radius: f32 }
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> B: BloomParams;

struct BOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f }

@vertex
fn vs(@builtin(vertex_index) i: u32) -> BOut {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return BOut(vec4f(xy, 0.0, 1.0), vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5));
}

fn tap(uv: vec2f, o: vec2f) -> vec3f { return textureSampleLevel(src, samp, uv + o * B.texel, 0.0).rgb; }
fn karis(c: vec3f) -> f32 { return 1.0 / (1.0 + dot(c, vec3f(0.2126, 0.7152, 0.0722))); }

@fragment
fn down(i: BOut) -> @location(0) vec4f {
  let a = tap(i.uv, vec2f(-2.0, 2.0)); let b = tap(i.uv, vec2f(0.0, 2.0)); let c = tap(i.uv, vec2f(2.0, 2.0));
  let d = tap(i.uv, vec2f(-2.0, 0.0)); let e = tap(i.uv, vec2f(0.0, 0.0)); let f = tap(i.uv, vec2f(2.0, 0.0));
  let g = tap(i.uv, vec2f(-2.0, -2.0)); let h = tap(i.uv, vec2f(0.0, -2.0)); let k = tap(i.uv, vec2f(2.0, -2.0));
  let j = tap(i.uv, vec2f(-1.0, 1.0)); let l = tap(i.uv, vec2f(1.0, 1.0));
  let m = tap(i.uv, vec2f(-1.0, -1.0)); let n = tap(i.uv, vec2f(1.0, -1.0));
  // five overlapping 2×2 boxes, weighted 0.5 (centre) and 0.125 × 4
  let g0 = (j + l + m + n) * 0.25;
  let g1 = (a + b + d + e) * 0.25;
  let g2 = (b + c + e + f) * 0.25;
  let g3 = (d + e + g + h) * 0.25;
  let g4 = (e + f + h + k) * 0.25;
  if (B.karis > 0.5) {
    let w0 = karis(g0) * 0.5; let w1 = karis(g1) * 0.125; let w2 = karis(g2) * 0.125;
    let w3 = karis(g3) * 0.125; let w4 = karis(g4) * 0.125;
    let s = g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4;
    return vec4f(min(s / (w0 + w1 + w2 + w3 + w4), vec3f(6e4)), 1.0);
  }
  return vec4f(g0 * 0.5 + (g1 + g2 + g3 + g4) * 0.125, 1.0);
}

@fragment
fn up(i: BOut) -> @location(0) vec4f {
  let r = B.radius;
  var s = tap(i.uv, vec2f(0.0, 0.0)) * 4.0;
  s += (tap(i.uv, vec2f(-r, 0.0)) + tap(i.uv, vec2f(r, 0.0)) + tap(i.uv, vec2f(0.0, -r)) + tap(i.uv, vec2f(0.0, r))) * 2.0;
  s += tap(i.uv, vec2f(-r, -r)) + tap(i.uv, vec2f(r, -r)) + tap(i.uv, vec2f(-r, r)) + tap(i.uv, vec2f(r, r));
  return vec4f(s / 16.0, 1.0);
}
