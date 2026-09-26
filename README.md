# Einstein Island

A small, cute island where the speed of light is 20 m/s. Walk around, boost to 0.99c and shoot plasma
fireballs at balloons — while everything is rendered the way a real observer at that speed would see
it: aberration, light-travel delay, spectral Doppler shift (including infrared and UV shifting into view),
the searchlight effect, time dilation, and sound that travels at half the speed of light.

WebGPU is required (current Chrome or Safari). HDR displays show the searchlight glare at real brightness.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Node)
npm run test:gpu   # WGSL parity tests in headless Chrome (needs WebGPU)
```

Controls: WASD or ↑/↓ move · ←/→ turn · Shift boost · mouse look · click or Space fire · 1–4 toggle aberration / light delay /
Doppler / searchlight · N Newtonian view · M map · H captions · V sound · R restart · K save recording ·
L load recording · Esc settings.

URL parameters: `quality=low`, `seed=`, `scenario=` (see `test/manual.md`), `cruise=`, `cap=`,
`fireball=`, `rampCruise=`, `rampBoost=`, `volume=`, `headroom=`, `adapt=0`, `dev=1` (pacing slider).

The design is in [`plan/plan.md`](plan/plan.md) with module docs in `plan/modules/`.
