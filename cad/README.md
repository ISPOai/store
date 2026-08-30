# CAD

Generate, inspect, and preview STEP-first parametric CAD models inside ISPO.

CAD stores model and generation metadata as project entities, publishes durable
artifacts through Files, and renders STEP-derived GLB previews in its embedded
viewer. Generation and inspection commands dispatch bounded Codex workers that
use the reviewed local CAD runtime.

## Runtime and access

The app requests access to its CAD entity types, agent dispatch, Files picking
and publication, notifications, and host navigation. Its reviewed runtime plan
creates a Python 3.13 virtual environment, installs the attributed build123d
toolchain, and starts a sealed same-origin Node API helper.

Generated models, validation reports, and snapshots are user data. They are not
included in this Store source package and every installation starts empty.
