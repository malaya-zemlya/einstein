import { C, LIGHT_HORIZON } from './constants.js'
import { retardedDelay } from './lightcone.js'
import { addScaled, distance, sub } from '../math/vec3.js'

// A straight worldline x(t) = p + u·(t − t0), alive on [tBirth, tDeath].
export class Worldline {
  constructor({ p, t0, u, tBirth = -Infinity, tDeath = Infinity, hitPos = null }) {
    this.p = p
    this.t0 = t0
    this.u = u
    this.tBirth = tBirth
    this.tDeath = tDeath
    this.hitPos = hitPos
  }

  positionAt(t) {
    return addScaled(this.p, this.u, t - this.t0)
  }

  retardedTime(xObs, tObs) {
    const te = tObs - retardedDelay(sub(this.positionAt(tObs), xObs), this.u)
    return te >= this.tBirth && te <= this.tDeath ? te : null
  }

  hasBeenSeenDead(xObs, tObs, extent = 0) {
    if (this.tDeath === Infinity) return false
    return C * (tObs - this.tDeath) >= distance(xObs, this.positionAt(this.tDeath)) + 2 * extent
  }

  lightHasPassed(tObs) {
    if (this.tDeath === Infinity) return false
    return C * (tObs - this.tDeath) >= LIGHT_HORIZON
  }
}
