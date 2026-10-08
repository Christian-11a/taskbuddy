/** WCAG 2.x contrast ratio between two opaque `#rrggbb` colors. */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) throw new Error(`contrastRatio expects #rrggbb, got ${hex}`);
    const n = parseInt(match[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
