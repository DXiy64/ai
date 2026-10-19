// Frames contain every selected point. Linear connecting segments stay inside
// the same bounds; screen-space padding also includes marker and stroke size.
export function fitAxis(values, fullRange, pixels, style) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [...fullRange];
  const low = Math.min(...finite),
    high = Math.max(...finite);
  const minimumSpan = (fullRange[1] - fullRange[0]) * 0.02;
  const span = Math.max(high - low, minimumSpan, 1e-9);
  const length = Math.max(40, pixels);
  const padding = Math.min(
    length * 0.2,
    Math.max(18, style.size / 2 + style.width / 2 + 12, length * 0.09),
  );
  const paddedSpan = span / (1 - (2 * padding) / length),
    middle = (low + high) / 2;
  return [middle - paddedSpan / 2, middle + paddedSpan / 2];
}

// Padding may cross zero to keep fast/cheap models away from the plot edge.
// Only nonnegative metric ticks are shown; original model values never change.
export function metricTicks(range) {
  const low = Math.min(...range),
    high = Math.max(...range),
    rough = (high - low) / 7;
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-12)));
  const step = [1, 2, 5, 10].find((n) => n * power >= rough) * power;
  const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(step))));
  const start = Math.ceil(Math.max(0, low) / step - 1e-9),
    end = Math.floor(high / step + 1e-9);
  const values = [];
  for (let i = start; i <= end && values.length < 20; i++)
    values.push(Number((i * step).toPrecision(12)));
  return { values, format: `,.${decimals}f` };
}
