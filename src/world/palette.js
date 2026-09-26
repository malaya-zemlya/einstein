import { rgbToBands } from '../spectral/rgb.js'

// Surface palette (world.md § Palette). uv / ir are the albedos of the UV and IR bands.
export const PALETTE = Object.freeze({
  grass: { rgb: '#8fd16a', uv: 0.05, ir: 0.9 },
  sand: { rgb: '#f2dca0', uv: 0.3, ir: 0.6 },
  rock: { rgb: '#a9a3b8', uv: 0.2, ir: 0.4 },
  water: { rgb: '#5fb3d9', uv: 0.1, ir: 0.02 },
  trunk: { rgb: '#9b6b4a', uv: 0.05, ir: 0.5 },
  canopy: { rgb: '#7fcf8a', uv: 0.05, ir: 0.85 },
  cherry: { rgb: '#f7a8c4', uv: 0.1, ir: 0.85 },
  balloonRed: { rgb: '#ff6b6b', uv: 0.1, ir: 0.3 },
  balloonYellow: { rgb: '#ffd93d', uv: 0.1, ir: 0.3 },
  balloonBlue: { rgb: '#4d96ff', uv: 0.1, ir: 0.3 },
  stick: { rgb: '#f5f5f5', uv: 0.3, ir: 0.6 },
  seaHaze: { rgb: '#9fc4d8', uv: 0.2, ir: 0.1 },
  towerStone: { rgb: '#eadfc8', uv: 0.3, ir: 0.6 },
  towerTrim: { rgb: '#b89b72', uv: 0.2, ir: 0.55 },
  towerRoof: { rgb: '#e0645c', uv: 0.1, ir: 0.4 },
  towerGold: { rgb: '#f2c14e', uv: 0.1, ir: 0.7 },
  clockFace: { rgb: '#fbf6e8', uv: 0.35, ir: 0.6 },
  clockHand: { rgb: '#26262e', uv: 0.05, ir: 0.1 },
  clockSecond: { rgb: '#e63946', uv: 0.05, ir: 0.3 },
})

export const BALLOON_COLOURS = Object.freeze(['balloonRed', 'balloonYellow', 'balloonBlue'])

const cache = new Map()

// 12 band albedos for a palette entry (cached; treat as read-only).
export function materialBands(name) {
  let b = cache.get(name)
  if (!b) {
    const e = PALETTE[name]
    if (!e) throw new Error(`unknown material '${name}'`)
    b = rgbToBands(e.rgb, { uv: e.uv, ir: e.ir })
    cache.set(name, b)
  }
  return b
}
