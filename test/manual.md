# Manual visual checks

Run `npm run dev` and open each URL in Chrome or Safari (WebGPU). Scenarios freeze the simulation at a
fixed observer velocity; press 1–4 / N to toggle effects on the frozen frame. Add `&quality=low` on
slower machines.

| # | URL | What to look for | Criteria |
|---|---|---|---|
| 1 | `/?scenario=aberration90` | At 0.9c the world crowds toward the centre; objects at 90° appear ~26° off-axis. Press N: ordinary view. | 1, 2, 9 |
| 2 | `/?scenario=boost` | 0.99c: everything truly ahead within ~8° of centre; blazing forward glow; dark rim. Look around (unfreeze by removing the scenario and boosting) to see things behind swing forward. | 3, 7 |
| 3 | `/?scenario=delaySideways` | A fireball crosses sideways; on the mini-map its hollow ghost trails the solid dot; in view it is drawn at the ghost. Press 2 (delay off): drawn at the true position. | 5 |
| 4 | `/?scenario=foliage` | 0.3c toward trees: canopies gain red (IR blueshifted). Press 3 to compare. | 6b |
| 5 | `/?scenario=heatGlow` | 0.96c: ground ahead glows red-orange (thermal). With `&c=` unchanged, compare `boost` (warm white). | 6c |
| 6 | `/?scenario=sunAhead` / `sunBehind` | Sun bluish-white ahead, orange-red/amber sky behind. | 8 |
| 7 | `/?scenario=shadows` | Trees and balloons cast soft shadows; hit a balloon and its shadow vanishes with the dissolve. | 26 |
| 8 | `/?scenario=fireballLight` | The fireball's light pool trails it on the ground and keeps fading after impact. Press 2 then 3 to compare. | 24 |
| 9 | `/?scenario=stress` + F | 40 fireballs; frame time readout ≤ 8.3 ms (120 fps) at high quality on the M4 Max. | 20 |
| 10 | normal play | Boost toward the heat glow: flash, then eye adaptation settles in ~1.5 s; turn around: dark, then slowly brightens. | 22 |
| 11 | normal play | Hit a balloon 60 m away: see the burst, hear the boom ~3 s later; cross 10 m/s: rumble peaks, captions explain, Mach cone on the map. | 13, 25 |
| 12 | normal play + K, then L | Download a recording, load it back: pause (Space), rewind (←), step (, .), free camera (C), return (Backspace). | 18, 28–31 |
| 13 | XDR display | Forward glare at boost is visibly brighter than UI white (HDR); HUD stays normal brightness. | 21 |
