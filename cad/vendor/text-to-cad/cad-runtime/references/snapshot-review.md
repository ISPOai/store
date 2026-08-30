# Snapshot review

The CAD app's embedded `cadjs` viewer owns snapshot capture. Workers must not
launch Playwright, a browser, an external viewer, or a snapshot CLI.

## Policy

Every created or visibly updated primary STEP/STP part or assembly needs one
reviewed `snapshot.png`. Deterministic geometry checks do not substitute for
visual review.

The app captures the rendered canvas after the generation publishes a valid
GLB/topology artifact. A worker waits only for the bounded interval stated in
its protocol. If the snapshot does not arrive, keep the generation in
`waiting` and say that visual review remains outstanding.

Skip visual review only when no visible geometry changed, no valid artifact
exists, or the task is a read-only measurement that creates nothing. State the
reason and the deterministic evidence that still ran.

## Diagnostic review

Visual review is diagnostic. Convert every visual concern into an explicit
geometry check before using it as a validation claim:

- apparent asymmetry -> compare measured centers or offsets
- an offset part -> inspect frames and mating deltas
- floating ribs, bosses, or plates -> inspect connectivity and distances
- a suspicious cavity or bore -> measure wall thickness and depth
- an uneven repeated pattern -> measure spacing or occurrence frames

Publish the reviewed `snapshot.png` through Files and record its exact Files
reference on the generation entity.
