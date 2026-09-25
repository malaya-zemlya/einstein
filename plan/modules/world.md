# Module: world

A deterministic procedural island. `GENERATOR_VERSION` (an integer constant) is bumped whenever a change would alter any output for a given seed.

**Mesh density** comes from `quality` (`'high'` by default, `'low'` via `?quality=low`). It changes only tessellation, never shapes or placements: every height, prop transform and target position is identical at both qualities.

| | high | low |
|---|---|---|
| terrain grid spacing | 0.25 m | 0.8 m |
| props and targets, maximum edge | 0.1 m | 0.25 m |
| water, maximum edge within r < 100 m | 0.15 m | 0.4 m |
| total vertices | ≈ 2.5M | ≈ 245k |

The numbers below are for `low`; `high` subdivides the same shapes further.

Everything is derived from one integer `seed` through a seeded pseudo-random number generator (PRNG): `mulberry32(seed)`, from `src/world/noise.js`. Noise comes from the `simplex-noise` npm package (v4, ES module), seeded with that PRNG. The module outputs plain typed arrays (`GeometrySpec`) and has no GPU objects, so it is unit-testable in Node.

`GeometrySpec = {positions: Float32Array, normals: Float32Array, indices: Uint32Array, bands0, bands1, bands2: Float32Array (4 per vertex), emitTemp: Float32Array (1 per vertex), particle: Uint32Array (1 per vertex; burst particle index 0–15, else 0)}`

## Terrain (`island.js`)
- **Land radius** `R = 90` m; `SHORE_RADIUS = 85` m (the player clamp).
- **Height field.** `h(x,z) = mask(r)·(5·fbm(x/70, z/70) + 3) − (1 − mask(r))·2`, where `r = √(x²+z²)`, `mask = smoothstep(R, 0.55R, r)`, and `fbm` is 4 octaves of simplex noise (gain 0.5, lacunarity 2). The sea level is y = 0. The result is rolling hills up to about 8 m that slope into the sea at the shore.
- `heightAt(x,z)` evaluates the formula directly. `normalAt` uses central differences with ε = 0.1 m.
- **Mesh.** A 301×301 vertex grid over a 240 m square (spacing 0.8 m; triangle diagonals 1.13 m). Triangles whose vertices are all beyond r > R + 10 are dropped, leaving about 49k vertices.
- **Material rule.** `materialAt(x,z)` is exported (the UI's foliage caption uses it): water if h < 0, sand if h < 1.0, rock if the slope (1 − normal.y) > 0.35, grass otherwise. Per-vertex band vectors are blended across a 0.5 m height band by lerping.
- `SHORE_RADIUS = 85` is exported on the `Island` object.
- **Water.** A flat polar grid at y = 0, from R − 10 out to 400 m. Near the shore, where the player looks closely, the edges are ≤ 0.4 m. Rings are spaced geometrically, starting at 0.4 m and growing by ×1.06 per ring (about 70 rings). The segment count per ring is 1600 inside r < 150 m (≤ 0.4 m at r = 100) and 512 beyond. About 74k vertices in total.

## Props (`props.js`)
- **Placement.** Poisson-disc sampling on grass vertices, with a minimum spacing of 5 m, seeded, keeping at least 8 m clear around the spawn point (0, ·, 0).
- **Counts.** 120 trees and 60 rocks.
- **Trees.** One of three variants: round tree (a cylinder trunk plus an icosphere canopy at detail 3), cone pine (a cylinder plus 3 stacked cones), or cherry (a round tree with a pink canopy). Every mesh is tessellated to a maximum edge of 0.25 m, and canopies get a mild noise displacement so they look cute and lumpy.
- **Rocks.** Icospheres at detail 3 with noise displacement, scaled 0.5–1.5 m.
- All props are merged into one static `GeometrySpec`.

## Targets (`targets.js`)
- `placeTargets(seed, island, 12)`. Positions are rejection-sampled on land with h > 1.0, at least 15 m apart, and 20–80 m from the spawn point.
- **Each target** is a balloon (an icosphere of radius 0.8 m at detail 4) on a thin white stick 1.7 m tall, with its centre 2.5 m above the ground. The hit sphere is centred on the balloon with a radius of 1.0 m.
- **Colours** cycle through balloon red, yellow and blue from the palette.
- `TargetSpec = {id: 't0'..'t11', pos: [x,y,z] (balloon centre), radius: 1.0, geometry: GeometrySpec (local coordinates, centred on pos)}`.

## Palette (`palette.js`)

Each entry is `{rgb, uv, ir}` → `rgbToBands`. The IR values follow real surface behaviour where it teaches something (leaves reflect strongly in the near-IR, the "Wood effect"; water absorbs IR).

| material | rgb | uv | ir |
|---|---|---|---|
| grass | #8fd16a | .05 | .90 |
| sand | #f2dca0 | .30 | .60 |
| rock | #a9a3b8 | .20 | .40 |
| water | #5fb3d9 | .10 | .02 |
| trunk | #9b6b4a | .05 | .50 |
| canopy | #7fcf8a | .05 | .85 |
| cherry | #f7a8c4 | .10 | .85 |
| balloon red / yellow / blue | #ff6b6b / #ffd93d / #4d96ff | .10 | .30 |
| stick | #f5f5f5 | .30 | .60 |
| sea haze (sky, below horizon) | #9fc4d8 | .20 | .10 |

## Vertex budget
Terrain ≈ 49k, water ≈ 74k, props ≈ 90k, targets ≈ 12k, and live bursts ≤ 20 × 1k. The total is about 245k, within plan criterion 20's budget.

## Tests
- Same seed → byte-identical `GeometrySpec`s and target positions.
- `shapeHash(seed)` (used by record) depends only on the height field sampled on a fixed 64×64 grid, the prop transforms and the target specs. It is the same for both qualities. A different seed → different outputs.
- `heightAt` is < 0 for every r > R and > 0 at the spawn point.
- The maximum edge length, checked over all triangles, is ≤ 1.14 m on terrain, ≤ 0.25 m on props and targets, and ≤ 0.4 m on water within r < 100 m.
- Target constraints (spacing, distance from spawn, on land) hold for 50 seeds.
- The array lengths of every attribute agree with the vertex count.
