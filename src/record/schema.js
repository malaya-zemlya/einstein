// Spacetime-log format constants and JSON encode/decode helpers (record.md).
import { vec3 } from '../math/vec3.js'

export const FORMAT = 'einstein-spacetime'
export const VERSION = 1
export const FLAG_NAMES = Object.freeze(['aberration', 'delay', 'doppler', 'searchlight'])

// Frame-column quanta (record.md § Size). Object fields keep full precision.
export const Q_TIME = 1e6 // 1e-6 s
export const Q_POS = 1e5 // 1e-5 m
export const Q_VEL = 1e6 // 1e-6 m/s
export const Q_ANGLE = 1e6 // 1e-6 rad

// Division by a power of ten gives the double nearest the decimal, so JSON prints it short.
export const quantize = (x, q) => Math.round(x * q) / q || 0

// ±Infinity ↔ null. Decoding needs the sign, so the caller supplies the default.
export const encodeInf = (x) => (Number.isFinite(x) ? x : null)
export const decodeInf = (x, inf) => (x === null || x === undefined ? inf : x)

export const encodeVec = (v) => [v.x, v.y, v.z]
export const decodeVec = (a) => vec3(a[0], a[1], a[2])
export const encodeVecOrNull = (v) => (v ? encodeVec(v) : null)
export const decodeVecOrNull = (a) => (a ? decodeVec(a) : null)
