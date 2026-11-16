// DUSTLINE look plan, in one place. Six base values, one accent, and one colour per
// team; the lighting makes every shade the game needs, so no other colour appears
// in the code. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#10141a',
  surface: '#1b2129',
  hairline: '#2e3742',
  ink: '#ece8de',
  muted: '#93a0ad',
  accent: '#f0a830',
  vanguard: '#3fa7ff',
  ember: '#ff5a3c',
};

export function shade(name) {
  return PALETTE[name];
}
