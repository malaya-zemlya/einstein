// Depth-only pass from the sun for the static shadow map (terrain and props).
@vertex
fn vs(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return F.shadowViewProj * vec4f(position, 1.0);
}
