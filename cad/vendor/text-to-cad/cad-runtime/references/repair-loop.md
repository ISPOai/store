# Repair loop

Read this file when generation, export, inspection, positioning, snapshot review, CAD Viewer setup, or documentation validation fails.

## Loop

1. Read the failing command output.
2. Classify the failure.
3. Make the smallest responsible source or command change.
4. Rerun the failed command.
5. Rerun any dependent validation checks.
6. Report remaining risk or deliberate deviations.

## Failure classes and fixes

### Source import or syntax failure

Likely causes:

- invalid Python syntax
- missing import
- wrong build123d symbol
- function not named `gen_step()`
- executable code outside the intended function has side effects

Fix:

- correct imports and syntax
- ensure `gen_step()` returns the STEP-ready shape or compound
- keep output paths in CLI commands, not inside `gen_step()`

### Invalid or missing geometry

Likely causes:

- open sketch
- subtractive profile outside target
- zero thickness
- boolean operation failed
- construction geometry used as exported geometry

Fix:

- close profiles intended to become faces
- verify dimensions are positive
- make subtractive tools pass through when through-cuts are intended
- simplify the failing feature and rebuild incrementally

### Fillet or chamfer failure

Likely causes:

- radius/length exceeds local geometry
- selected edges include tiny or unintended edges
- boolean operation created complex edge topology

Fix:

- reduce radius/length
- filter selected edges more narrowly
- apply fillets later in the model
- split edge groups by feature intent

### Wrong scale or bounding box

Likely causes:

- units mismatch
- mistaken diameter/radius
- extrusion direction or amount wrong
- part not centered as assumed
- direct imported STEP uses unexpected units

Fix:

- check parameter values
- inspect facts and planes
- measure critical extents
- correct source dimensions or import handling

### Missing feature

Likely causes:

- wrong `Mode.ADD`/`Mode.SUBTRACT`
- feature profile not inside target
- blind cut too shallow
- selector changed after prior operation

Fix:

- confirm feature mode
- increase cut length for through-cuts
- inspect topology or planes
- regenerate and measure/check feature-specific refs

### Selector fragility

Likely causes:

- arbitrary index selection
- topology changed after fillet or boolean
- similar faces/edges are indistinguishable

Fix:

- select by axis, plane, position, normal, or inspected reference
- use `refs --facts --planes --positioning` to rediscover stable references
- add construction datums or simplify operations if needed

### Positioning or joint mismatch

Likely causes: wrong part-local origin or datum, reversed `AssemblyHelper` fixed/moving order, `.connect_to()` moving the wrong part, inverted joint axis, sign errors in symmetric placement, an explicit `Location` not recomputed after a parameter change, or a joint defined in world coordinates when a part-local datum was intended.

Fix:

- inspect `refs --positioning`, then `frame` and `align` on the relevant selectors
- verify the source-level `AssemblyHelper` target order, joint labels, and `joint_location` definitions
- apply the smallest source correction from the list in `positioning.md` (Source-level positioning corrections)
- regenerate the assembly from the Python source and rerun the failed check

### Embedded viewer failure

Likely causes:

- the GLB/topology sidecar is missing or invalid
- the sealed CAD API cannot serve the selected artifact
- the embedded WebGL viewer cannot initialize

Fix:

- regenerate and verify the GLB/topology sidecar for the explicit STEP target
- confirm the CAD API can serve the selected artifact
- if unresolved, report the viewer failure and rely on CLI facts and measurements without claiming visual review

### Embedded snapshot failure

Likely causes:

- the embedded viewer has not loaded the expected GLB/topology artifact
- the rendered canvas is unavailable or empty
- Files publication failed after capture

Fix:

- generate STEP and its GLB/topology sidecars first
- wait only for the worker protocol's bounded snapshot interval
- preserve a truthful `waiting` or `failed` state instead of launching browser automation

## Diff after repair

Use `diff` when the fix might have affected unrelated geometry:

```bash
python scripts/inspect diff path/to/before.step path/to/after.step --planes
```

## Reporting failed repairs

If a check cannot be repaired in the current environment, report:

```text
- what failed
- what was tried
- which artifact is still usable
- which validation claims cannot be made
- what the next source-level correction should be
```
