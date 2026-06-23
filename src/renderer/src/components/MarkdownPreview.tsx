import { useMemo } from 'react';
import { marked } from 'marked';

export function MarkdownPreview({ content }: { content: string }): React.JSX.Element {
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);
  return (
    // Opaque background (not the translucent `bg-bg`) so this overlay fully occludes the
    // always-mounted CodeEditor behind it rather than letting it bleed through window transparency.
    <div className="absolute inset-0 overflow-auto" style={{ background: 'var(--bg)' }}>
      <div
        className="md-body mx-auto max-w-3xl px-10 py-8"
        // Local file content rendered by the user; trusted within the editor.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
