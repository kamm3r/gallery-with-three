# pmndrs/math adoption benchmark

[pmndrs/math](https://github.com/pmndrs/math) 0.1.0 (npm package `math`) is pinned
in the project. Only free-camera flight uses it: `freeCameraMovement` writes into a
caller-owned `Vec3` tuple, and `FreeCamera` reuses that tuple and one Three.js vector
every frame. It normalizes and scales in one pass with cached trigonometry.

Scalar gameplay helpers (movement turn clamp, terrain smoothstep, dodge falloff,
combat camera easing) keep inline `Math.min`/`Math.max`. Routing them through the
library's `clamp`/`lerp` cost a consistent 3–7% on dodge speed and camera recovery.

## Results

Free camera, isolated A/B: ten alternating processes per version, each taking the
median of 30 timed samples after 10 warmups, 200,000 calls per sample.

| Version                      | Median (ms) | Range (ms)    |
| ---------------------------- | ----------: | ------------- |
| Before (Three.js `Vector3`)  |      13.232 | 12.946–14.043 |
| After (math tuple, one pass) |      12.712 | 12.411–13.259 |

That is 3.9% less time. The remaining cost is mostly key lookups and trigonometry,
and the function runs once per frame, so this does not change frame rate.

`compareGameplayMath.ts` measures all gameplay workloads together. It showed +1% to
+3% on the scalar workloads even though their code is identical to the baseline, so
treat differences of that size from it as harness bias, not real changes.

## Reproduce

```sh
vp run benchmark:math:compare            # baseline defaults to HEAD
vp run benchmark:math:compare -- --ref <commit>
```

Raw samples are written to `math-comparison.json`.
