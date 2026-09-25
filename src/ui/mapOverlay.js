import { C, C_SOUND } from '../physics/constants.js'
import { length } from '../math/vec3.js'

// Mini-map: precomputed island image + 2D markers at true world-frame positions (decision 19).
export function createMapOverlay(canvas, renderer) {
  const ctx = canvas.getContext('2d')
  const colours = { balloonRed: '#ff6b6b', balloonYellow: '#ffd93d', balloonBlue: '#4d96ff' }

  const draw = ({ player, worldTime, targets, fireballs, hits, ui }) => {
    canvas.hidden = !ui.map
    if (!ui.map) return
    const size = canvas.clientWidth * devicePixelRatio
    if (canvas.width !== size) { canvas.width = size; canvas.height = size }
    const px = (p) => {
      const [u, v] = renderer.mapProject(p.x, p.z)
      return [u * size, v * size]
    }
    const s = size / 200 // pixels per metre
    ctx.clearRect(0, 0, size, size)
    if (renderer.mapImage) ctx.drawImage(renderer.mapImage, 0, 0, size, size)

    // light rings: slice of each unseen hit's light sphere at the player's eye height
    for (const hit of hits) {
      if (hit.seen) continue
      const R = C * (worldTime - hit.t)
      const dy = player.pos.y - hit.pos.y
      if (R < Math.abs(dy)) continue
      const [x, y] = px(hit.pos)
      ctx.strokeStyle = 'rgba(255, 240, 160, 0.9)'
      ctx.lineWidth = 2 * devicePixelRatio
      ctx.beginPath()
      ctx.arc(x, y, Math.sqrt(R * R - dy * dy) * s, 0, 2 * Math.PI)
      ctx.stroke()
    }

    for (const t of targets) {
      if (t.line.tDeath <= worldTime) continue
      const [x, y] = px(t.line.p)
      ctx.fillStyle = colours[t.spec.colour] ?? '#fff'
      ctx.beginPath()
      ctx.arc(x, y, 3.5 * devicePixelRatio, 0, 2 * Math.PI)
      ctx.fill()
    }

    for (const f of fireballs) {
      const alive = f.line.tDeath > worldTime
      const te = f.line.retardedTime(player.pos, worldTime)
      const [tx, ty] = px(f.line.positionAt(Math.min(worldTime, f.line.tDeath)))
      if (te !== null) {
        const [gx, gy] = px(f.line.positionAt(te))
        ctx.strokeStyle = 'rgba(255, 200, 140, 0.5)'
        ctx.lineWidth = 1 * devicePixelRatio
        ctx.beginPath()
        ctx.moveTo(gx, gy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.strokeStyle = '#ffc890'
        ctx.beginPath()
        ctx.arc(gx, gy, 4 * devicePixelRatio, 0, 2 * Math.PI)
        ctx.stroke()
      }
      if (alive) {
        ctx.fillStyle = '#fff4d0'
        ctx.shadowColor = '#ffb060'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(tx, ty, 3 * devicePixelRatio, 0, 2 * Math.PI)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    const [x, y] = px(player.pos)
    const speed = length(player.vel)
    if (speed > C_SOUND) {
      const half = Math.asin(C_SOUND / speed)
      const back = Math.atan2(-player.vel.z, -player.vel.x)
      ctx.fillStyle = 'rgba(255, 95, 210, 0.22)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.arc(x, y, 40 * s, back - half, back + half)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 95, 210, 0.9)'
      ctx.font = `${10 * devicePixelRatio}px ui-monospace, monospace`
      ctx.fillText('boom', x + Math.cos(back) * 30 * s, y + Math.sin(back) * 30 * s)
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.atan2(Math.cos(player.yaw), Math.sin(player.yaw)))
    ctx.fillStyle = '#5ff4ff'
    ctx.shadowColor = '#5ff4ff'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(8 * devicePixelRatio, 0)
    ctx.lineTo(-5 * devicePixelRatio, 5 * devicePixelRatio)
    ctx.lineTo(-5 * devicePixelRatio, -5 * devicePixelRatio)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  return {
    update: (state) => draw({ ...state, targets: state.targets }),
    draw,
  }
}
