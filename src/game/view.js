// GameState → RenderView, the renderer's entire input.
export function viewOf(state) {
  const objects = []
  for (const f of state.fireballs) objects.push({ id: f.id, kind: 'fireball', line: f.line, extra: { radius: f.radius, emitTemp: f.emitTemp } })
  for (const t of state.targets) objects.push({ id: t.id, kind: 'target', line: t.line, extra: { spec: t.spec } })
  for (const b of state.bursts) objects.push({ id: b.id, kind: 'burst', line: b.line, extra: { big: b.big, particleVels: b.particleVels } })
  const { player } = state
  return {
    observer: { pos: player.pos, vel: player.vel, yaw: player.yaw, pitch: player.pitch },
    worldTime: state.worldTime,
    flags: state.flags,
    ui: state.ui,
    settings: { adaptation: state.settings.adaptation, headroom: state.settings.headroom },
    resetAdaptation: state.flagsDirty.adaptation,
    objects,
    avatar: null,
    boost: player.boosting,
    clockStart: state.clockStart,
  }
}
