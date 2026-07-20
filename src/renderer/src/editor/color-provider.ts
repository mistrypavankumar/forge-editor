import type * as monacoNs from 'monaco-editor';
import type { editor, languages } from 'monaco-editor';

/**
 * Inline color decorators + a click-to-edit color picker for code/config files.
 *
 * Monaco ships a native document-color provider only through its CSS/HTML/LESS/SCSS workers, so a
 * hex or rgb() literal in a TypeScript theme file, a JSON config, or a `.env` gets no swatch. This
 * registers a `DocumentColorProvider` for the languages those workers don't cover: it finds color
 * literals (hex, `rgb()/rgba()`, `hsl()/hsla()`), and Monaco renders a swatch before each one and
 * opens its built-in color picker on click. `provideColorPresentations` maps a picked color back to
 * text, preferring the literal's original format (and hex letter-case) so editing a `#FFAB00` keeps
 * it uppercase hex rather than rewriting it to `rgb(...)`.
 *
 * CSS/SCSS/LESS/HTML are intentionally excluded — their workers already draw swatches, and
 * double-registering would stack two on the same literal.
 */

/** Color channels normalized to 0..1, matching Monaco's `IColor`. */
type Color = languages.IColor;

// Languages the built-in CSS/HTML workers don't serve a color provider for. Registering against a
// language with no open models is harmless, so the list is generous rather than exhaustive.
const COLOR_SELECTOR = [
  'typescript', 'javascript', 'json', 'jsonc', 'plaintext', 'dotenv', 'makefile',
  'python', 'java', 'yaml', 'markdown', 'xml', 'shell', 'go', 'rust', 'cpp', 'c',
  'csharp', 'php', 'ruby', 'kotlin', 'swift', 'dart', 'lua', 'toml', 'ini',
];

// Hex: #RGB, #RGBA, #RRGGBB, #RRGGBBAA. Longest alternatives first so `#RRGGBBAA` wins over a
// 6-digit prefix. `\b` after rejects a 7-digit run (an id, not a color). The lookbehind skips a `#`
// glued to a word char (a fragment id) or preceded by `&` (an HTML numeric entity like `&#123;`).
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
// rgb()/rgba(): integer 0-255 or percentage channels; optional alpha (0-1 or percentage).
const RGB =
  /rgba?\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)/gi;
// hsl()/hsla(): hue in degrees, saturation/lightness as percentages; optional alpha.
const HSL =
  /hsla?\(\s*(\d*\.?\d+)(?:deg)?\s*,\s*(\d*\.?\d+)%\s*,\s*(\d*\.?\d+)%\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)/gi;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Parse a `#…` literal (no length assumptions beyond the 3/4/6/8 the regex guarantees). */
function parseHex(hex: string): Color {
  const h = hex.slice(1);
  const dup = (c: string): number => parseInt(c + c, 16) / 255;
  const byte = (s: string): number => parseInt(s, 16) / 255;
  if (h.length <= 4) {
    return {
      red: dup(h[0]),
      green: dup(h[1]),
      blue: dup(h[2]),
      alpha: h.length === 4 ? dup(h[3]) : 1,
    };
  }
  return {
    red: byte(h.slice(0, 2)),
    green: byte(h.slice(2, 4)),
    blue: byte(h.slice(4, 6)),
    alpha: h.length === 8 ? byte(h.slice(6, 8)) : 1,
  };
}

/** A `rgb()` channel: `50%` → 0..1, `128` → 0..1. */
function channel(raw: string): number {
  return clamp01(raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw) / 255);
}

/** An alpha value: `0.5` stays, `50%` → 0.5. */
function alpha(raw: string | undefined): number {
  if (raw == null) return 1;
  return clamp01(raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw));
}

function hslToColor(h: number, s: number, l: number, a: number): Color {
  const sat = clamp01(s / 100);
  const lit = clamp01(l / 100);
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lit - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];
  return { red: r + m, green: g + m, blue: b + m, alpha: a };
}

/** All color literals on one line, as Monaco color-info with 1-based columns for `lineNumber`. */
export function colorsOnLine(line: string, lineNumber: number): languages.IColorInformation[] {
  const out: languages.IColorInformation[] = [];
  const push = (start: number, end: number, color: Color): void => {
    out.push({ color, range: { startLineNumber: lineNumber, startColumn: start + 1, endLineNumber: lineNumber, endColumn: end + 1 } });
  };
  for (const m of line.matchAll(HEX)) push(m.index, m.index + m[0].length, parseHex(m[0]));
  for (const m of line.matchAll(RGB)) {
    push(m.index, m.index + m[0].length, {
      red: channel(m[1]), green: channel(m[2]), blue: channel(m[3]), alpha: alpha(m[4]),
    });
  }
  for (const m of line.matchAll(HSL)) {
    push(m.index, m.index + m[0].length, hslToColor(+m[1], +m[2], +m[3], alpha(m[4])));
  }
  return out;
}

const to255 = (n: number): number => Math.round(clamp01(n) * 255);

function toHexString(c: Color, upper: boolean): string {
  const hx = (n: number): string => to255(n).toString(16).padStart(2, '0');
  let s = `#${hx(c.red)}${hx(c.green)}${hx(c.blue)}`;
  if (c.alpha < 1) s += hx(c.alpha);
  return upper ? s.toUpperCase() : s.toLowerCase();
}

function toRgbString(c: Color): string {
  const rgb = `${to255(c.red)}, ${to255(c.green)}, ${to255(c.blue)}`;
  return c.alpha < 1 ? `rgba(${rgb}, ${+c.alpha.toFixed(3)})` : `rgb(${rgb})`;
}

function toHslString(c: Color): string {
  const r = clamp01(c.red), g = clamp01(c.green), b = clamp01(c.blue);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const hsl = `${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
  return c.alpha < 1 ? `hsla(${hsl}, ${+c.alpha.toFixed(3)})` : `hsl(${hsl})`;
}

/**
 * Format a picked color as text, ordered so the presentation the picker applies while dragging (the
 * first) matches `originalText`'s format and hex letter-case. Falls back to hex-first.
 */
export function presentationsFor(color: Color, originalText: string): string[] {
  const isHex = originalText.startsWith('#');
  const upperHex = isHex && /[A-F]/.test(originalText) && !/[a-f]/.test(originalText);
  const hex = toHexString(color, isHex ? upperHex : false);
  const rgb = toRgbString(color);
  const hsl = toHslString(color);
  if (/^rgba?\(/i.test(originalText)) return [rgb, hex, hsl];
  if (/^hsla?\(/i.test(originalText)) return [hsl, hex, rgb];
  return [hex, rgb, hsl];
}

/**
 * Register the document-color provider. Idempotent guard lives with the language providers, so this
 * is only called once from there.
 */
export function registerColorProvider(monaco: typeof monacoNs): void {
  monaco.languages.registerColorProvider(COLOR_SELECTOR, {
    provideDocumentColors(model: editor.ITextModel) {
      const colors: languages.IColorInformation[] = [];
      const lineCount = model.getLineCount();
      for (let line = 1; line <= lineCount; line++) {
        const found = colorsOnLine(model.getLineContent(line), line);
        if (found.length) colors.push(...found);
      }
      return colors;
    },
    provideColorPresentations(model: editor.ITextModel, info: languages.IColorInformation) {
      // Detect the literal's current format (and hex case) so the first presentation — the one the
      // picker applies as you drag — round-trips in the same style the user wrote.
      const original = model.getValueInRange(info.range);
      return presentationsFor(info.color, original).map((label) => ({
        label,
        textEdit: { range: info.range, text: label },
      }));
    },
  });
}
