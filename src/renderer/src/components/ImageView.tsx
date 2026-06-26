import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { imageMime } from '../lib/is-image';
import { EmptyState } from './ui/EmptyState';

interface Dims {
  width: number;
  height: number;
}

/** Renders an image file (PNG/JPEG/GIF/WEBP/ICO/SVG/…) from its raw bytes, loaded as a data URL. */
export function ImageView({ path, name }: { path: string; name: string }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);
  const [dims, setDims] = useState<Dims | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setDims(null);
    setError(false);
    const mime = imageMime(name) ?? 'application/octet-stream';
    void window.forge.readFileBase64(path).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(true);
        return;
      }
      // base64 length → decoded byte count (4 chars encode 3 bytes, minus '=' padding).
      setBytes(Math.floor((res.data.length * 3) / 4) - (res.data.endsWith('==') ? 2 : res.data.endsWith('=') ? 1 : 0));
      setSrc(`data:${mime};base64,${res.data}`);
    });
    return () => {
      cancelled = true;
    };
  }, [path, name]);

  if (error) {
    return (
      <div className="absolute inset-0 bg-bg">
        <EmptyState icon={ImageOff} title={`${name} can't be shown`} hint="The image couldn't be read." />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {src ? (
          // Checkerboard backdrop so transparent areas are visible against the editor background.
          <div
            className="max-h-full max-w-full"
            style={{
              backgroundColor: '#1e1e22',
              backgroundImage:
                'linear-gradient(45deg, #2a2a30 25%, transparent 25%), linear-gradient(-45deg, #2a2a30 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a30 75%), linear-gradient(-45deg, transparent 75%, #2a2a30 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            }}
          >
            <img
              src={src}
              alt={name}
              className="block max-h-full max-w-full object-contain"
              onLoad={(e) =>
                setDims({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
              }
              onError={() => setError(true)}
            />
          </div>
        ) : (
          <p className="text-[12px] text-faint">Loading…</p>
        )}
      </div>
      {src ? (
        <div className="flex items-center justify-center gap-3 border-t border-line py-1.5 text-[11px] text-faint">
          {dims ? <span>{dims.width} × {dims.height}</span> : null}
          <span>{formatBytes(bytes)}</span>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
