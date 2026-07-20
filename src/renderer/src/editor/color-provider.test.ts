import { describe, it, expect } from 'vitest';
import { colorsOnLine, presentationsFor } from './color-provider';

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

describe('colorsOnLine', () => {
  it('parses a 6-digit hex inside a string, with a 1-based range excluding the quotes', () => {
    const [c] = colorsOnLine("  main: '#FFAB00',", 82);
    expect(c.color).toMatchObject({ alpha: 1 });
    expect(near(c.color.red, 1)).toBe(true);
    expect(near(c.color.green, 0xab / 255)).toBe(true);
    expect(near(c.color.blue, 0)).toBe(true);
    // '#FFAB00' starts at column 10 (1-based) and spans 7 chars → endColumn 17.
    expect(c.range).toMatchObject({ startLineNumber: 82, startColumn: 10, endColumn: 17 });
  });

  it('expands 3- and 4-digit shorthand hex', () => {
    const [three] = colorsOnLine('#0af', 1);
    expect(near(three.color.red, 0)).toBe(true);
    expect(near(three.color.green, 0xaa / 255)).toBe(true);
    expect(near(three.color.blue, 1)).toBe(true);
    const [four] = colorsOnLine('#0af8', 1);
    expect(near(four.color.alpha, 0x88 / 255)).toBe(true);
  });

  it('reads the alpha byte from 8-digit hex', () => {
    const [c] = colorsOnLine('color: #FF000080', 1);
    expect(near(c.color.red, 1)).toBe(true);
    expect(near(c.color.alpha, 0x80 / 255)).toBe(true);
  });

  it('parses rgb() and rgba() with int and fractional alpha', () => {
    const [rgb] = colorsOnLine('rgb(255, 0, 0)', 1);
    expect(near(rgb.color.red, 1)).toBe(true);
    expect(rgb.color.alpha).toBe(1);
    const [rgba] = colorsOnLine('rgba(0, 128, 255, 0.5)', 1);
    expect(near(rgba.color.blue, 1)).toBe(true);
    expect(near(rgba.color.alpha, 0.5)).toBe(true);
  });

  it('parses hsl() (pure red at hue 0) and hsla() alpha', () => {
    const [hsl] = colorsOnLine('hsl(0, 100%, 50%)', 1);
    expect(near(hsl.color.red, 1)).toBe(true);
    expect(near(hsl.color.green, 0)).toBe(true);
    const [hsla] = colorsOnLine('hsla(120, 100%, 50%, 0.25)', 1);
    expect(near(hsla.color.green, 1)).toBe(true);
    expect(near(hsla.color.alpha, 0.25)).toBe(true);
  });

  it('does not treat an HTML numeric entity or a 7-digit id as a color', () => {
    expect(colorsOnLine('&#123; foo #1234567', 1)).toHaveLength(0);
  });

  it('finds multiple colors on one line', () => {
    expect(colorsOnLine('from #fff to rgb(0,0,0)', 1)).toHaveLength(2);
  });
});

describe('presentationsFor', () => {
  const red = { red: 1, green: 0, blue: 0, alpha: 1 };

  it('keeps a hex literal as hex first, preserving uppercase', () => {
    expect(presentationsFor(red, '#FF0000')[0]).toBe('#FF0000');
    expect(presentationsFor(red, '#ff0000')[0]).toBe('#ff0000');
  });

  it('keeps an rgb literal as rgb first', () => {
    expect(presentationsFor(red, 'rgb(255, 0, 0)')[0]).toBe('rgb(255, 0, 0)');
  });

  it('emits 8-digit hex / rgba / hsla when alpha < 1', () => {
    const semi = { red: 1, green: 0, blue: 0, alpha: 0.5 };
    expect(presentationsFor(semi, '#000000')[0]).toBe('#FF000080'.toLowerCase());
    expect(presentationsFor(semi, 'rgb(0,0,0)')[0]).toBe('rgba(255, 0, 0, 0.5)');
  });
});
