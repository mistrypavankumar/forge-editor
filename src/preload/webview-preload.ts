/// <reference lib="dom" />
import { ipcRenderer } from 'electron';

/**
 * Guest-page preload for the embedded Browser's <webview>. It runs in the guest page's isolated
 * world (node integration off), so it cannot read React's `__reactFiber$` expando properties — those
 * are only visible from the page's main world. So this preload injects a self-contained inspector
 * script into the main world and bridges it to the Forge renderer:
 *
 *   main world  --window.postMessage({__forgeInspect})-->  this preload  --sendToHost-->  BrowserView
 *   BrowserView --webview.send('forge:inspect:mode')-->    this preload  --postMessage-->  main world
 *
 * The inspector draws the hover overlay/tooltip, extracts DOM + React fiber + `data-forge-*`
 * metadata, and (in inspect mode) intercepts clicks. It degrades gracefully: no fiber → DOM + route
 * fallback still flows to Forge. Injecting an inline <script> can be blocked by a strict page CSP;
 * local dev servers rarely set one. This is development-tooling only.
 */

const HOST_TO_GUEST_MODE = 'forge:inspect:mode';
const GUEST_TO_HOST_SELECTION = 'forge:inspect:selection';
const GUEST_TO_HOST_NAV = 'forge:inspect:nav';

/** Source of the main-world inspector, injected as a <script>. Self-contained; no imports. */
const INSPECTOR_SOURCE = `(() => {
  if (window.__forgeInspector) return;
  const HL_ID = '__forge_inspect_overlay__';
  const TIP_ID = '__forge_inspect_tooltip__';
  let enabled = false;
  let overlay = null;
  let tooltip = null;
  let raf = 0;

  function ensureEls() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = HL_ID;
      overlay.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #7c8cff;background:rgba(124,140,255,0.14);border-radius:3px;transition:all 40ms ease;display:none;box-sizing:border-box;';
      tooltip = document.createElement('div');
      tooltip.id = TIP_ID;
      tooltip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#14141b;color:#e6e6ef;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:6px 8px;border-radius:6px;max-width:420px;box-shadow:0 6px 24px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.08);white-space:pre;display:none;';
      const attach = () => { document.body.appendChild(overlay); document.body.appendChild(tooltip); };
      if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach, { once: true });
    }
  }

  function fiberOf(el) {
    const keys = Object.keys(el);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return el[k];
    }
    return null;
  }

  function nameOfType(type) {
    if (!type || typeof type === 'string') return null;
    if (typeof type === 'function') return type.displayName || type.name || null;
    // forwardRef / memo wrappers
    if (type.displayName) return type.displayName;
    if (type.render) return type.render.displayName || type.render.name || null;
    if (type.type) return nameOfType(type.type);
    return null;
  }

  function extractReact(el) {
    let fiber = fiberOf(el);
    if (!fiber) return undefined;
    let source;
    let nearest = null;
    const ownerChain = [];
    let node = fiber;
    let hops = 0;
    while (node && hops < 60) {
      if (!source && node._debugSource) source = node._debugSource;
      const nm = nameOfType(node.type);
      if (nm) {
        if (!nearest) nearest = nm;
        if (ownerChain[ownerChain.length - 1] !== nm) ownerChain.push(nm);
      }
      node = node.return;
      hops++;
    }
    const props = fiber.memoizedProps || {};
    const propsKeys = Object.keys(props).filter((k) => k !== 'children').slice(0, 24);
    const react = { componentName: nearest || undefined, displayName: nearest || undefined, ownerChain: ownerChain.slice(0, 10), propsKeys: propsKeys };
    if (source && source.fileName) react.source = { fileName: source.fileName, lineNumber: source.lineNumber, columnNumber: source.columnNumber };
    return react;
  }

  function forgeMeta(el) {
    const host = el.closest && el.closest('[data-forge-source-file],[data-forge-component]');
    if (!host) return undefined;
    const g = (n) => host.getAttribute(n) || undefined;
    const line = g('data-forge-source-line');
    const col = g('data-forge-source-column');
    return {
      component: g('data-forge-component'),
      sourceFile: g('data-forge-source-file'),
      line: line ? parseInt(line, 10) : undefined,
      column: col ? parseInt(col, 10) : undefined,
    };
  }

  function domInfo(el) {
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    return {
      tagName: (el.tagName || '').toLowerCase(),
      id: el.id || undefined,
      className: cls || undefined,
      text: text || undefined,
      role: (el.getAttribute && el.getAttribute('role')) || undefined,
      ariaLabel: (el.getAttribute && el.getAttribute('aria-label')) || undefined,
      boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  }

  function selectionFor(el, phase) {
    const react = extractReact(el);
    const forgeMetadata = forgeMeta(el);
    let confidence = 'low';
    if ((forgeMetadata && forgeMetadata.sourceFile) || (react && react.source && react.source.fileName)) confidence = 'high';
    else if (react && react.componentName) confidence = 'medium';
    return {
      phase: phase,
      url: location.href,
      routePath: location.pathname,
      dom: domInfo(el),
      react: react,
      forgeMetadata: forgeMetadata,
      confidence: confidence,
    };
  }

  function drawOverlay(el, sel) {
    ensureEls();
    const r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    const comp = (sel.forgeMetadata && sel.forgeMetadata.component) || (sel.react && sel.react.componentName) || 'Unknown';
    const file = (sel.forgeMetadata && sel.forgeMetadata.sourceFile) || (sel.react && sel.react.source && sel.react.source.fileName) || '';
    let label = 'Component: ' + comp;
    if (file) label += '\\nFile: ' + file;
    label += '\\nRoute: ' + sel.routePath + '\\nDOM: ' + sel.dom.tagName + (sel.dom.className ? '.' + String(sel.dom.className).split(' ').filter(Boolean).slice(0, 2).join('.') : '');
    tooltip.textContent = label;
    tooltip.style.display = 'block';
    const tx = Math.min(r.left, window.innerWidth - tooltip.offsetWidth - 8);
    const ty = r.top > 60 ? r.top - tooltip.offsetHeight - 8 : r.bottom + 8;
    tooltip.style.left = Math.max(4, tx) + 'px';
    tooltip.style.top = Math.max(4, ty) + 'px';
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
  }

  function post(kind, payload) {
    window.postMessage({ __forgeInspect: true, kind: kind, payload: payload }, '*');
  }

  function onMove(e) {
    if (!enabled) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.id === HL_ID || el.id === TIP_ID) return;
      const sel = selectionFor(el, 'hover');
      drawOverlay(el, sel);
      post('selection', sel);
    });
  }

  function onClick(e) {
    if (!enabled) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (!el) return;
    post('selection', selectionFor(el, 'click'));
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) {
      document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
    } else {
      document.documentElement.style.removeProperty('cursor');
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      hideOverlay();
    }
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__forgeCmd !== true) return;
    if (d.cmd === 'mode') setEnabled(d.on);
  });

  window.__forgeInspector = { setEnabled: setEnabled };
  post('ready', { url: location.href, routePath: location.pathname });
})();`;

function inject(): void {
  try {
    const script = document.createElement('script');
    script.textContent = INSPECTOR_SOURCE;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch {
    /* CSP or timing — inspector unavailable, host still has route/URL fallbacks */
  }
}

if (document.documentElement) inject();
else document.addEventListener('DOMContentLoaded', inject, { once: true });

// main world -> host
window.addEventListener('message', (e) => {
  const d = e.data as { __forgeInspect?: boolean; kind?: string; payload?: unknown };
  if (!d || d.__forgeInspect !== true) return;
  if (d.kind === 'selection') ipcRenderer.sendToHost(GUEST_TO_HOST_SELECTION, d.payload);
  else if (d.kind === 'ready') ipcRenderer.sendToHost(GUEST_TO_HOST_NAV, d.payload);
});

// host -> main world
ipcRenderer.on(HOST_TO_GUEST_MODE, (_e, on: boolean) => {
  window.postMessage({ __forgeCmd: true, cmd: 'mode', on }, '*');
});
