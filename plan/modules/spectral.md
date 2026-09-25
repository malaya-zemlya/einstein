# Module: spectral

Pure colour science that runs once at startup. It outputs typed arrays that `render` uploads as float textures. Nothing here touches the GPU.

## Band basis (`bands.js`)

There are twelve Gaussian bands, `G_i(λ) = exp(−(λ−mu)²/(2σ²))` with λ in nm:

| # | role | mu | sigma |
|---|---|---|---|
| 0 | UV | 200 | 30 |
| 1 | UV | 290 | 30 |
| 2 | UV | 360 | 25 |
| 3–8 | visible | 420, 470, 520, 570, 620, 680 | 25 each |
| 9 | IR | 800 | 60 |
| 10 | IR | 1200 | 150 |
| 11 | IR | 2200 | 400 |

Scaling the wavelength by S gives `G_i(Sλ)`, which is a Gaussian with centre mu/S and width σ/S. This scale-invariance is why the precomputed LUTs are exact within the band model.

## Colour-matching functions (`cmf.js`)
These are the CIE 1931 2° x̄, ȳ and z̄ functions, using the Wyman–Sloan–Shirley 2013 multi-lobe fit (their equations 2–4, coefficients copied verbatim). The module exports `xyzBar(λ) → [x, y, z]`.

## Absolute radiance scale (`lut.js`)

Everything is expressed as spectral radiance in SI units (W·sr⁻¹·m⁻³) and then divided by one constant `K`:
- **Planck.** `B_λ(λ, T)` with SI constants.
- **Sun irradiance on a surface facing the sun**, per band centre: `E_i = π·B_λ(mu_i, 5778 K)·(R_sun/1 AU)²`, where (R_sun/1 AU)² = 2.16e-5.
- **Reflected radiance** from a Lambertian surface with band albedo `a_i` and lighting factor `lit`: `a_i·E_i·lit/π`. `SUN_BANDS_i = E_i/π = B_λ(mu_i, 5778 K)·2.16e-5`.
- **Thermal emission** of a surface: `ε·B_λ(λ, 290 K)`, with ε = 0.9.
- **`K`** = the luminance Y of white paper (every band albedo 1, lit = 1) under `SUN_BANDS`, computed through the band LUT at S = 1. After dividing by K, sunlit white paper has Y = 1.

With this scale, room-temperature thermal emission is invisible at rest, as in reality: its visible luminance is about 1e-27 of paper. Including the full radiance factor A = D⁵, the forward ground's thermal glow is about 2e-6 at D ≈ 3. It is still far below the reflected sunlight, which itself brightens as the ground's near-IR bands blueshift into view (Y ≈ 26 for sand at β = 0.9). Thermal overtakes reflected light near β ≈ 0.95 (D ≈ 6, about 1800 K, red-orange). At D ≈ 14 (0.99c) it is a roughly 4000 K glow with Y ≈ 5×10³. That value stays below the half-float maximum (65,504) after exposure, and the fragment shader also clamps at 6e4.

**Stylised sources** (decision 10): the fireball emission scale `EMIT_FIREBALL` is chosen so that a 3000 K fireball at rest has Y ≈ 4. `EMIT_BURST` makes 2500 K particles Y ≈ 2. The sun disk has Y ≈ 20. Each scale is computed at startup from the blackbody LUT so that it hits these targets exactly.

## LUTs
- **Band LUT.** For each band i and each of 256 samples of `s = log₂S` over [−4, 4]: `XYZ_i(S) = Σ_{λ=360..830 nm, step 1} G_i(S·λ)·xyzBar(λ)·Δλ`, then divided by K. Stored as an RGBA32F texture of 256 × 12 texels (x = S sample, y = band). Float32 textures aren't filterable by default, so the shader interpolates manually along x (render.md).
- **Blackbody band LUT** (`bbBands`, used for fireball lighting). For 256 samples of log₂T over the same range: `B_λ(mu_i, T)` for each of the 12 band centres, divided by K. Stored as RGBA32F 256 × 3 (12 values per T).
- **Blackbody LUT.** For 256 samples of `log₂T` over [log₂100, log₂100000] K: `XYZ_bb(T) = Σ B_λ(λ, T)·xyzBar(λ)·Δλ`, then divided by K. Stored as RGBA32F 256 × 1.

Because the band basis uses unit-height Gaussians, a band weight of `a_i·SUN_BANDS_i` is itself in radiance units. The band LUT integrates the band shape, so the factor Δλ appears there and not in the weights.

## rgbToBands(rgb, {uv, ir})
1. Linearise the sRGB input to get `rgb_lin`.
2. The UV bands (0–2) are all set to `uv`, and the IR bands (9–11) to `ir`. The palette supplies both, because RGB carries no information about them.
3. Compute `tail_lin`: the linear sRGB of the UV and IR bands alone under the sun at S = 1. This matters because bands 2 (360 nm) and 9 (800 nm) have small visible tails.
4. Visible bands (3–8): there are three fixed basis vectors, B_b = [1, 1, .2, 0, 0, 0], B_g = [0, .3, 1, 1, .3, 0] and B_r = [0, 0, 0, .3, 1, 1]. M is the 3×3 matrix whose columns are the linear sRGB of each basis vector under the sun at S = 1. Then `w = [B_r B_g B_b]·M⁻¹·(rgb_lin − tail_lin)`, with negative entries clamped to 0.

## Sky spectrum (`skyBands()`)
- Weights `SUN_BANDS_i·(550/mu_i)⁴·SKY_K`, with bands 0 and 1 set to 0 (ozone absorbs sunlight below about 300 nm).
- `SKY_K` is chosen so that the zenith sky has Y = 0.6 at rest.
- `render` multiplies the result by `(0.5 + 0.5·max(d.y, 0))`, making the sky brighter overhead.

## Tests (`test/spectral/*.test.js`)
- `xyzBar`: ȳ(555) ≈ 1.0 within 2%; x̄ has two lobes (peaks near 442 and 599 nm).
- **Band LUT.** At S = 1 it equals direct numeric integration to 1e-6 relative. At 10 other S values it equals the direct integration of `G_i(Sλ)`.
- **Blackbody LUT chromaticity.** At 6500 K it lies within 0.002 of the Planckian locus point (0.3135, 0.3236). As T increases, x decreases monotonically.
- **Shift identity.** `D⁵·B_λ(Dλ, T) == B_λ(λ, D·T)` to 1e-12 relative (this guards the shader's shortcut).
- **rgbToBands round trip.** bands → XYZ → sRGB for every palette colour has ΔE2000 < 3.
- **Scale sanity** (full pipeline with A = D⁵, forward direction).
  - White paper at rest has Y = 1.
  - 290 K thermal emission at D = 1 has Y < 1e-20. At D = 14 it has Y between 2e3 and 2e4.
  - For sand, reflected Y exceeds thermal Y at β = 0.9, and thermal exceeds reflected at β = 0.96 (the heat-glow crossover of criterion 6c). The stylised emitters hit their target Y within 1%.
- **Foliage (criterion 6b).** Using the JS colour reference from render.md, canopy (ir .85) at D = 1.25 has more linear red than at D = 1. The same visible colour with ir = 0 has less red.
