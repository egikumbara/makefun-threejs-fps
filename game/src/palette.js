// EMBERLINE look plan, in one place. A dusk rail yard: deep indigo dusk, warm amber
// work-lights, rusted steel and pale concrete. Six values only; lighting makes the rest.
// The same six names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#171420',
  surface: '#232030',
  hairline: '#353148',
  ink: '#efe9dc',
  muted: '#9a94a8',
  accent: '#f59a2e',
  ember: '#e4572e',
};

export function shade(name) {
  return PALETTE[name];
}
