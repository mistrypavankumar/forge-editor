import type { editor, IDisposable } from 'monaco-editor';
import type { DiffHunk } from '../lib/line-diff';
import { hunkAtLine } from './git-gutter';

type Monaco = typeof import('monaco-editor');

interface PeekOptions {
  getHunks: () => DiffHunk[];
  fileName: () => string;
  languageId: () => string;
  onRevert: (hunk: DiffHunk) => void;
}

const HEADER_PX = 30;
const BODY_PAD_PX = 10;
const MAX_ROWS = 14;

/**
 * A VS Code-style inline "dirty diff" peek: clicking a change gutter expands a
 * view zone showing the original (red) vs current (green) lines, with a header
 * toolbar to revert, navigate between changes, and close.
 */
export class DiffPeek {
  private zoneId: string | null = null;
  private index = -1;
  private keyListener: IDisposable | null = null;

  constructor(
    private readonly editor: editor.IStandaloneCodeEditor,
    private readonly monaco: Monaco,
    private readonly opts: PeekOptions,
  ) {}

  get isOpen(): boolean {
    return this.zoneId !== null;
  }

  openAt(line: number): void {
    const hunks = this.opts.getHunks();
    const idx = hunks.findIndex((h) => hunkAtLine(h, line));
    if (idx !== -1) this.open(idx);
  }

  close(): void {
    if (this.zoneId !== null) {
      const id = this.zoneId;
      this.editor.changeViewZones((acc) => acc.removeZone(id));
      this.zoneId = null;
    }
    this.keyListener?.dispose();
    this.keyListener = null;
    this.index = -1;
  }

  dispose(): void {
    this.close();
  }

  private open(idx: number): void {
    this.close();
    const hunks = this.opts.getHunks();
    const hunk = hunks[idx];
    if (!hunk) return;
    this.index = idx;

    const node = this.render(hunk, idx, hunks.length);
    const afterLineNumber = hunk.type === 'del' ? Math.max(1, hunk.modStart) : hunk.modEnd;
    const lineHeight = this.editor.getOption(this.monaco.editor.EditorOption.lineHeight) || 18;
    const rows = hunk.origLines.length + (hunk.modEnd - hunk.modStart);
    const heightInPx = HEADER_PX + BODY_PAD_PX + Math.min(rows, MAX_ROWS) * lineHeight;

    this.editor.changeViewZones((acc) => {
      this.zoneId = acc.addZone({ afterLineNumber, heightInPx, domNode: node });
    });
    this.editor.revealLineInCenterIfOutsideViewport(afterLineNumber);

    this.keyListener = this.editor.onKeyDown((e) => {
      if (e.keyCode === this.monaco.KeyCode.Escape && this.isOpen) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  private revertCurrent(): void {
    const hunk = this.opts.getHunks()[this.index];
    if (!hunk) return;
    this.close();
    this.opts.onRevert(hunk);
  }

  private navigate(delta: number): void {
    const total = this.opts.getHunks().length;
    if (total === 0) return;
    const next = (this.index + delta + total) % total;
    this.open(next);
  }

  private render(hunk: DiffHunk, idx: number, total: number): HTMLElement {
    const lineHeight = this.editor.getOption(this.monaco.editor.EditorOption.lineHeight) || 18;
    const lang = this.opts.languageId();

    const root = document.createElement('div');
    root.className = 'forge-peek';

    // Header: filename + change counter on the left, action buttons on the right.
    const head = document.createElement('div');
    head.className = 'forge-peek-head';
    head.style.height = `${HEADER_PX}px`;

    const title = document.createElement('div');
    title.className = 'forge-peek-title';
    const name = document.createElement('span');
    name.className = 'forge-peek-name';
    name.textContent = this.opts.fileName();
    const sub = document.createElement('span');
    sub.className = 'forge-peek-sub';
    sub.textContent = `Git Local Changes — ${idx + 1} of ${total} change${total === 1 ? '' : 's'}`;
    title.append(name, sub);

    const actions = document.createElement('div');
    actions.className = 'forge-peek-actions';
    actions.append(
      this.button('revert', '↶', 'Revert this change'),
      this.button('prev', '↑', 'Previous change'),
      this.button('next', '↓', 'Next change'),
      this.button('close', '✕', 'Close (Esc)'),
    );
    actions.addEventListener('mousedown', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      if (act === 'revert') this.revertCurrent();
      else if (act === 'prev') this.navigate(-1);
      else if (act === 'next') this.navigate(1);
      else if (act === 'close') this.close();
    });

    head.append(title, actions);

    const body = document.createElement('div');
    body.className = 'forge-peek-body';
    body.style.maxHeight = `${MAX_ROWS * lineHeight}px`;

    const current = this.editor.getModel()?.getLinesContent().slice(hunk.modStart, hunk.modEnd) ?? [];
    this.appendRows(body, hunk.origLines, 'del', hunk.origStart, lineHeight, lang);
    this.appendRows(body, current, 'add', hunk.modStart, lineHeight, lang);

    root.append(head, body);
    return root;
  }

  private appendRows(
    body: HTMLElement,
    lines: string[],
    kind: 'del' | 'add',
    startIndex: number,
    lineHeight: number,
    lang: string,
  ): void {
    if (lines.length === 0) return;
    const model = this.monaco.editor.createModel(lines.join('\n'), lang);
    try {
      for (let i = 0; i < lines.length; i++) {
        const row = document.createElement('div');
        row.className = `forge-peek-row forge-peek-${kind}`;
        row.style.height = `${lineHeight}px`;

        const ln = document.createElement('span');
        ln.className = 'forge-peek-ln';
        ln.textContent = String(startIndex + i + 1);

        const code = document.createElement('span');
        code.className = 'forge-peek-code';
        // colorizeModelLine returns themed HTML (uses the global .mtk* token classes).
        code.innerHTML = this.monaco.editor.colorizeModelLine(model, i + 1);

        row.append(ln, code);
        body.append(row);
      }
    } finally {
      model.dispose();
    }
  }

  private button(act: string, glyph: string, title: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.act = act;
    b.title = title;
    b.textContent = glyph;
    return b;
  }
}
