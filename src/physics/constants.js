// Speed of light and sound for the island, as live bindings.
// Only resetRound (game), replay entry and replay exit call setC (plan decision 1).

export let C = 20
export let C2 = C * C
export let C_SOUND = C / 2

export const LIGHT_HORIZON = 1000 // m; beyond this, a dead object's light has left the playable world

export function setC(c) {
  C = c
  C2 = c * c
  C_SOUND = c / 2
}
