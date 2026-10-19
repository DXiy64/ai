# 3D space fitting

This change builds directly on current main and requires no other PR.

The 3D axes fit the visible models with padding; the camera frames the complete
coordinate box for the current window. Hiding or restoring a model refits the
space. Manual rotation, zoom and search positioning preserve the chosen camera
on resize. Press R to return to the default direction and refit while retaining
hidden models. Empty selections use full-data bounds; coincident points retain
finite ranges. Tick labels remain nonnegative and model metrics are unchanged.

The existing plane views, release dates, system theme and search remain in place.
No menus, model picker, language controls, polling or backend changes are added.

Validation:

```sh
node --test tests/space-fit.test.mjs tests/worker.test.mjs
bun run build
```

Browser checks cover the projected coordinate box on desktop and mobile, manual
camera preservation on resize, R reset, fast-model subsets, one point, empty
selection, plane switching, dark mode and release-date search.
