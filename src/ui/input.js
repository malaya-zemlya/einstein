// Keyboard, mouse and pointer lock → one input snapshot per frame.

const ONE_SHOT = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyN', 'KeyM', 'KeyH', 'KeyF', 'KeyV', 'KeyK', 'KeyL',
  'Space', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period', 'KeyC', 'Backspace'])

export function createInput(canvas, { freeze = false } = {}) {
  const held = new Set()
  const queued = []
  let lookDX = 0
  let lookDY = 0
  let restart = false
  let mouseDown = false
  let settings = null
  const locked = () => document.pointerLockElement === canvas

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !e.repeat) restart = true
    if (ONE_SHOT.has(e.code) && !e.repeat) queued.push(e.code)
    held.add(e.code)
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
  })
  addEventListener('keyup', (e) => held.delete(e.code))
  addEventListener('blur', () => held.clear())
  canvas.addEventListener('mousedown', (e) => {
    if (!locked()) return
    if (e.button === 0) mouseDown = true
  })
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false })
  addEventListener('mousemove', (e) => {
    if (!locked()) return
    lookDX += e.movementX
    lookDY += e.movementY
  })

  const axis = (pos, neg) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0)

  return {
    locked,
    requestLock: () => canvas.requestPointerLock(),
    pushSettings: (patch) => { settings = { ...(settings ?? {}), ...patch } },
    queueKey: (code) => queued.push(code),
    snapshot() {
      if (freeze) return { moveF: 0, moveR: 0, moveU: 0, turn: 0, boost: false, lookDX: 0, lookDY: 0, fire: false, keys: [], restart: false }
      const snap = {
        moveF: Math.max(-1, Math.min(1, axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown'))),
        turn: axis('ArrowRight', 'ArrowLeft'), // arrow-key steering, radians/s scaled in step
        moveR: axis('KeyD', 'KeyA'),
        moveU: axis('KeyE', 'KeyQ'),
        boost: held.has('ShiftLeft') || held.has('ShiftRight'),
        lookDX,
        lookDY,
        fire: mouseDown && locked(),
        keys: queued.splice(0),
        restart,
        settings,
      }
      lookDX = 0
      lookDY = 0
      restart = false
      settings = null
      return snap
    },
  }
}
