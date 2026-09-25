// Sun shadow and fireball lighting in the world frame at the emission event (xe, tRel).
// Milestone 2: sun without shadows, no fireball lights (filled in by the spectacle milestone).

fn sunLight(xe: vec3f, tRel: f32, n: vec3f) -> f32 {
  return max(dot(n, F.sunDir), 0.0);
}

fn fireballLight(xe: vec3f, tRel: f32, n: vec3f) -> array<vec4f, 3> {
  return array<vec4f, 3>(vec4f(0.0), vec4f(0.0), vec4f(0.0));
}
