// Eye adaptation: centre-weighted log-average luminance of the (unexposed) scene, then an
// asymmetric exponential approach: bright 0.4 s, dark 4 s, in the observer's proper time.

struct AdaptState { current: f32, measured: f32, pad0: f32, pad1: f32 }
struct AdaptParams { dTau: f32, reset: f32, aspect: f32, pad: f32 }
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> A: AdaptState;
@group(0) @binding(2) var<uniform> P: AdaptParams;

const KEY: f32 = 0.25; // scene average maps to this after exposure
var<workgroup> sums: array<vec2f, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) li: u32) {
  let dims = textureDimensions(src);
  let n = dims.x * dims.y;
  var acc = vec2f(0.0);
  for (var i = li; i < n; i += 256u) {
    let p = vec2u(i % dims.x, i / dims.x);
    let L = dot(textureLoad(src, p, 0).rgb, vec3f(0.2126, 0.7152, 0.0722));
    let q = ((vec2f(p) + 0.5) / vec2f(dims) - 0.5) * vec2f(P.aspect, 1.0);
    let w = exp(-dot(q, q) / (2.0 * 0.35 * 0.35));
    acc += vec2f(w * log2(max(L, 1e-4)), w);
  }
  sums[li] = acc;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) { sums[li] += sums[li + s]; }
    workgroupBarrier();
  }
  if (li == 0u) {
    let measured = sums[0].x / max(sums[0].y, 1e-6);
    let tgt = clamp(log2(KEY) - measured, -6.0, 3.0);
    A.measured = measured;
    if (P.reset > 0.5 || A.current != A.current) {
      A.current = log2(0.8);
    } else {
      let tau = select(4.0, 0.4, tgt < A.current);
      A.current = clamp(A.current + (tgt - A.current) * (1.0 - exp(-P.dTau / tau)), -6.0, 3.0);
    }
  }
}
