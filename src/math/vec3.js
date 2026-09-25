// Minimal immutable 3-vector helpers over plain {x, y, z} objects.
// Every function returns a new object and never mutates its arguments.

export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z })
export const ZERO = Object.freeze(vec3())

export const add = (a, b) => vec3(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a, b) => vec3(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a, s) => vec3(a.x * s, a.y * s, a.z * s)
export const addScaled = (a, b, s) => vec3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s)
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a, b) => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const lengthSq = (a) => dot(a, a)
export const length = (a) => Math.sqrt(dot(a, a))
export const distance = (a, b) => length(sub(a, b))
export const isZero = (a) => a.x === 0 && a.y === 0 && a.z === 0

export const normalize = (a) => {
  const l = length(a)
  return l === 0 ? vec3() : scale(a, 1 / l)
}

export const toArray = (a) => [a.x, a.y, a.z]
export const fromArray = (arr) => vec3(arr[0], arr[1], arr[2])
