import { describe, expect, it } from 'vitest';
import { closingTagToInsert } from './auto-close-tag';

describe('closingTagToInsert', () => {
  it('closes a basic tag', () => {
    expect(closingTagToInsert('<html>', '', 'html')).toBe('</html>');
    expect(closingTagToInsert('  <div>', '', 'html')).toBe('</div>');
  });

  it('closes tags with attributes', () => {
    expect(closingTagToInsert('<a href="x">', '', 'html')).toBe('</a>');
  });

  it('supports namespaced and custom-element tag names', () => {
    expect(closingTagToInsert('<my-widget>', '', 'html')).toBe('</my-widget>');
    expect(closingTagToInsert('<svg:rect>', '', 'xml')).toBe('</svg:rect>');
  });

  it('does not close void HTML elements', () => {
    expect(closingTagToInsert('<br>', '', 'html')).toBeNull();
    expect(closingTagToInsert('<img src="x">', '', 'html')).toBeNull();
  });

  it('still closes "void-named" tags in xml (not html semantics)', () => {
    expect(closingTagToInsert('<br>', '', 'xml')).toBe('</br>');
  });

  it('does not close self-closing tags', () => {
    expect(closingTagToInsert('<div />', '', 'html')).toBeNull();
    expect(closingTagToInsert('<Component/>', '', 'xml')).toBeNull();
  });

  it('does not close a closing tag', () => {
    expect(closingTagToInsert('</div>', '', 'html')).toBeNull();
  });

  it('does not double-close when the tag already follows', () => {
    expect(closingTagToInsert('<div>', '</div>', 'html')).toBeNull();
  });

  it('returns null when the cursor is not right after a tag', () => {
    expect(closingTagToInsert('<div> text', '', 'html')).toBeNull();
    expect(closingTagToInsert('plain text', '', 'html')).toBeNull();
  });
});
