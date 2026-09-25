import { vec3 } from './vec3.js'

// Look direction for yaw (0 faces +z, positive turns toward +x) and pitch (positive looks up).
export function lookDirection(yaw, pitch) {
  const cp = Math.cos(pitch)
  return vec3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp)
}
