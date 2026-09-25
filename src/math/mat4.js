// Column-major 4×4 matrices as Float32Array(16), WebGPU clip conventions (z in [0, 1]).

// Reversed-Z infinite perspective, looking down −z: depth = near / −z_view.
export function perspectiveReversedInfinite(fovY, aspect, near) {
  const f = 1 / Math.tan(fovY / 2)
  return Float32Array.from([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, 0, -1, 0, 0, near, 0])
}

// Orthographic box, reversed Z (near → 1, far → 0).
export function orthoReversed(left, right, bottom, top, near, far) {
  const rl = right - left
  const tb = top - bottom
  const fn = far - near
  return Float32Array.from([2 / rl, 0, 0, 0, 0, 2 / tb, 0, 0, 0, 0, 1 / fn, 0, -(right + left) / rl, -(top + bottom) / tb, far / fn, 1])
}

export function invert(m) {
  const inv = new Float32Array(16)
  const a = Array.from(m)
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a
  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  const d = 1 / det
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d
  inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d
  inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d
  inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d
  inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d
  return inv
}

// World → view rotation for a camera looking along `forward` with +y up (view looks down −z).
export function viewRotation(forward) {
  const f = forward
  const rl = Math.hypot(f.z, f.x) || 1
  const r = { x: -f.z / rl, y: 0, z: f.x / rl } // normalize(cross(f, up))
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x } // cross(r, f)
  // rows are r, u, −f; stored column-major
  return Float32Array.from([r.x, u.x, -f.x, 0, r.y, u.y, -f.y, 0, r.z, u.z, -f.z, 0, 0, 0, 0, 1])
}

export function multiply(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = s
    }
  }
  return out
}
