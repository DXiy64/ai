// Points are in Plotly's centered scene coordinates (a cube has side length 1).
export function fitCamera(points, initial, width, height) {
  if (!points.length) return structuredClone(initial);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normalize = (v) => v.map((n) => n / Math.hypot(...v));
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const back = normalize([
    initial.eye.x - initial.center.x,
    initial.eye.y - initial.center.y,
    initial.eye.z - initial.center.z,
  ]);
  const right = normalize(
    cross([initial.up.x, initial.up.y, initial.up.z], back),
  );
  const up = cross(back, right);
  const center = [0, 1, 2].map(
    (i) =>
      (Math.min(...points.map((p) => p[i])) +
        Math.max(...points.map((p) => p[i]))) /
      2,
  );
  // gl3d uses a 45 degree vertical field of view. Leave pixel padding for markers.
  const padding = 28;
  const tanY =
    Math.tan(Math.PI / 8) * Math.max(0.4, 1 - (2 * padding) / height);
  const tanX =
    ((Math.tan(Math.PI / 8) * width) / height) *
    Math.max(0.4, 1 - (2 * padding) / width);
  let distance = 0.5; // Keep a finite, usable view for a single/coincident point.
  for (const point of points) {
    const offset = point.map((v, i) => v - center[i]);
    distance = Math.max(
      distance,
      dot(offset, back) +
        Math.max(
          Math.abs(dot(offset, right)) / tanX,
          Math.abs(dot(offset, up)) / tanY,
        ) *
          1.15 +
        0.02,
    );
  }
  return {
    ...structuredClone(initial),
    center: Object.fromEntries(["x", "y", "z"].map((k, i) => [k, center[i]])),
    eye: Object.fromEntries(
      ["x", "y", "z"].map((k, i) => [k, center[i] + back[i] * distance]),
    ),
  };
}
