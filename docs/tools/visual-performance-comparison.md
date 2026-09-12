# Visual and performance comparison

`visual.compare` verifies two retained screenshot records and decodes supported non-interlaced 8-bit grayscale/RGB/gray-alpha/RGBA PNGs. Images must have identical dimensions. `pixelThreshold` defines the largest channel delta treated as unchanged; `maxChangedPixelRatio` is the pass budget.

The result retains `comparison.json` and deterministic `diff.png`, marking changed pixels red. Source captures remain unchanged. Malformed chunks/filters, unsupported encodings, changed hashes and dimension mismatches fail before evidence is created. This is exact pixel comparison rather than perceptual alignment.

`performance.snapshot` samples owned-runtime FPS, frame time, node count and object count 1–120 times at a 0–1,000 ms interval. `performance.compare` evaluates two snapshots from the active session with caller-provided relative FPS-drop and frame-time/node/object-increase ratios.

Run snapshots under comparable scene, renderer, resolution, warm-up and hardware conditions. A passing comparison under different conditions is weak evidence. Null frame-time samples remain explicit; no hardware-independent absolute threshold is inferred.
